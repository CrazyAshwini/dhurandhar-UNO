/* DHURANDHAR UNO — browser client. No CDNs, dependencies, trackers, or external assets. */
(() => {
  'use strict';
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const modalRoot = document.getElementById('modal-root');
  const COLORS = ['red','blue','green','yellow'];
  const symbol = {skip:'⊘',reverse:'↔',draw2:'+2',draw4:'+4',discard:'▥',skipall:'↻',reverse4:'↶+4',draw6:'+6',draw10:'+10',roulette:'◈'};
  const detail = {skip:'SKIP',reverse:'REVERSE',draw2:'DRAW TWO',draw4:'DRAW FOUR',discard:'DISCARD ALL',skipall:'SKIP ALL',reverse4:'REVERSE DRAW',draw6:'WILD DRAW',draw10:'WILD DRAW',roulette:'COLOR ROULETTE'};
  let session = null;
  let state = null;
  let stream = null;
  let serverInfo = {lanIps:[],port:Number(location.port || (location.protocol === 'https:'?443:80))};
  let manualIp = '';
  let modal = null; // {type:'wild', cardId} or {type:'rules'}
  let lastTurn = null;
  let toastTimer;
  let mute = localStorage.getItem('dhurandhar_uno_mute') === 'true';
  let audio;
  let prefRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initial = s => esc((s || '?').slice(0,1).toUpperCase());
  function toast(message) {
    toastEl.textContent = message; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>toastEl.classList.remove('show'),3500);
  }
  function playSound(frequency=580, duration=.10) {
    if (mute) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audio.createOscillator(); const gain = audio.createGain();
      oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,audio.currentTime);
      gain.gain.setValueAtTime(.065,audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
      oscillator.connect(gain);gain.connect(audio.destination);
      oscillator.start();oscillator.stop(audio.currentTime+duration);
    } catch {}
  }
  const header = () => `<header class="header">
    <div class="brand"><span class="brand-mark">D</span><span><span class="brand-title">DHURANDHAR UNO</span><br><span class="brand-caption">FRIENDS. CARDS. CHAOS.</span></span></div>
    <div class="header-right">${state ? `<span class="chip accent"><span class="status-indicator"></span>${esc(state.code)}</span>` : `<span class="chip">2–10 PLAYERS</span>`}
      <button class="chip-icon" title="${mute ? 'Enable sound':'Mute sound'}" aria-label="${mute ? 'Enable sound':'Mute sound'}" data-act="mute">${mute?'♫̸':'♫'}</button>
      <button class="chip-icon" title="Rules" aria-label="Rules" data-act="rules">?</button>
    </div></header>`;
  const cardText = card => symbol[card.kind] || esc(card.kind);
  const cardName = card => detail[card.kind] || (card.kind === '0' ? 'PASS HANDS' : card.kind === '7' ? 'SWAP HANDS' : '');
  function cardMarkup(card, table=false) {
    const active = card.playable && !table;
    const label = `${card.color} ${detail[card.kind] || card.kind}`;
    return `<button type="button" aria-label="${esc(label)}${active?', playable':''}" title="${esc(label)}" class="game-card ${esc(card.color)} ${table?'table-card':active?'playable':'unplayable'}" ${table?'disabled':`data-act="card" data-id="${esc(card.id)}" ${active?'':'disabled'}`}>
      <span class="corner">${cardText(card)}</span><span class="symbol">${cardText(card)}</span><span class="detail">${cardName(card)}</span><span class="corner bottom">${cardText(card)}</span>
    </button>`;
  }
  function renderHome() {
    app.innerHTML = `<div class="shell">${header()}<div class="home-layout">
      <section class="hero"><div class="eyebrow">THE FRIENDSHIP-TESTING CARD GAME</div><h1>No luck.<br><em>No mercy.</em><br>Just chaos.</h1>
        <p>Play the wildest card battles with friends or practice against bots. Join from another city or connect everyone to one phone's hotspot. No accounts, no downloads required for players.</p>
        <div class="hero-features"><span class="pill">⚡ Up to 10 players</span><span class="pill">⌘ 6-letter room codes</span><span class="pill">◉ Internet-free LAN</span><span class="pill">✦ Practice with bots</span></div>
        <div class="preview-deck" aria-hidden="true"><div class="preview-glow"></div><div class="preview-card a"><span>+6</span></div><div class="preview-card b"><span>7</span></div><div class="preview-card c"><span>+10</span></div></div>
      </section>
      <section class="join-box"><h2>Your next game starts here.</h2><p>Pick a nickname. Create a private table or join your friends with their invite code.</p>
        <label class="form-label" for="nickname">Your nickname</label><input id="nickname" type="text" maxlength="18" autocomplete="nickname" placeholder="e.g. CardMaster" value="${esc(localStorage.getItem('dhurandhar_uno_name') || '')}">
        <label class="form-label" for="roomcode">Invite code</label><div class="room-enter"><input id="roomcode" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="6" placeholder="ABC123" value="${esc(prefRoom)}"><button class="secondary" data-act="join">Join room →</button></div>
        <div class="join-divider">OR BE THE HOST</div>
        <button class="primary full" data-act="create">✦ Create a room</button>
        <div class="legal-note"><b>Online:</b> share a link after deploying the server.<br><b>Offline:</b> one phone runs the server; friends join through its hotspot and local address.</div>
        <div class="join-foot">Private games · 168 cards · No sign-up</div>
      </section></div></div>`;
  }
  const playersList = (isLobby=false) => state.players.map((p,i) => `<div class="member"><div class="avatar c${i%6}">${initial(p.name)}</div><div class="member-info">
    <div class="member-name">${esc(p.name)} ${p.bot?'<span class="bot-tag">BOT</span>':''} ${p.id===state.selfId?'<span class="tiny muted">(you)</span>':''}</div>
    <div class="member-sub">${p.id===state.hostId?'Room host':isLobby?(p.bot?'Computer player · Ready':p.connected?'Ready to play':'Joining…'):`${p.wins} round win${p.wins===1?'':'s'}`}</div>
  </div>${p.bot && state.isHost && state.status!=='playing'?`<button class="ghost small member-control" data-act="remove-bot" data-id="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">Remove</button>`:p.id===state.hostId?'<span class="host-tag">HOST</span>':`<span class="tiny muted member-control">${p.connected?'●':'○'}</span>`}</div>`).join('');
  const botControls = () => state.isHost?`<div class="bot-controls"><button class="secondary small" data-act="add-bot" ${state.players.length>=state.maxPlayers?'disabled':''}>✦ Add bot</button><p class="tiny muted">${state.players.length>=state.maxPlayers?'Table full. Remove a bot to free a seat.':'Practice alone or fill spare seats. Humans and bots share the '+state.maxPlayers+'-player limit.'} Manage bots between rounds.</p></div>`:'';
  function invitationUrl() {
    const ip = (manualIp || serverInfo.lanIps[0] || '').trim();
    const isLoopback = ['localhost','127.0.0.1','::1'].includes(location.hostname);
    let url;
    if (isLoopback && ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) url = `${location.protocol}//${ip}:${serverInfo.port}/`;
    else url = `${location.origin}/`;
    return `${url}?room=${encodeURIComponent(state.code)}`;
  }
  function renderLobby() {
    const shareUrl = invitationUrl();
    app.innerHTML = `<div class="shell">${header()}<div class="lobby">
      <section class="panel"><div class="eyebrow">YOUR PRIVATE TABLE</div><h1>Get the squad together.</h1><p class="muted">Send this code or link to your friends. Everyone opens it in their phone browser.</p>
      <div class="caps">ROOM CODE</div><div class="room-number">${esc(state.code)}</div>
      <div class="inline-actions"><button class="secondary small" data-act="code-copy">Copy code</button><button class="secondary small" data-act="share">Share invite ↗</button></div>
      <div class="connect-box" id="invite-url">${esc(shareUrl)}</div>
      <div class="caps" style="margin-top:27px">PLAYERS AT THE TABLE · ${state.players.length}/${state.maxPlayers}</div>
      <div class="member-list">${playersList(true)}</div>
      ${botControls()}
      ${state.isHost?`<button class="primary full" data-act="start" ${state.players.length<2?'disabled':''}>${state.players.length<2?'Add a bot or invite a friend':'▶ Start the game'}</button>`:`<div class="special" style="text-align:center">Waiting for the host to start…</div>`}
      <button class="ghost small" style="margin-top:13px" data-act="leave">← Leave room</button>
      </section><aside class="panel"><div class="eyebrow">READY WHEN YOU ARE</div><h2 style="margin:12px 0">How to connect</h2>
      <div class="tutorial-steps"><div class="tutorial-step"><span class="step-num">1</span><span><b>Online:</b> open your deployed public link, then share it with your friends.</span></div>
      <div class="tutorial-step"><span class="step-num">2</span><span><b>Offline:</b> turn on the host phone's hotspot and run the included Node server on that phone.</span></div>
      <div class="tutorial-step"><span class="step-num">3</span><span>Connect friends to the same hotspot. They open the local link above. Then press Start.</span></div></div>
      ${state.isHost?`<label class="form-label" for="lan-ip">Host's hotspot / LAN IP (optional)</label><div class="lan-config"><input id="lan-ip" type="text" placeholder="e.g. 192.168.43.1" value="${esc(manualIp)}"><button class="secondary small" data-act="ip-apply">Apply</button></div>
        <p class="tiny muted">If the link shows localhost, enter the phone's hotspot gateway IP here. You can find it in a connected phone's Wi-Fi details.</p>`:''}
      <div class="rules-row"><span class="pill">Stacking ON</span><span class="pill">7–0 rule ON</span><span class="pill">25-card knockout</span></div>
      <div class="caps">Quick reactions</div>${reactions()}
      <div class="caps" style="margin-top:20px">Room activity</div><div class="log-panel">${state.events.slice(0,5).map(x=>`<div class="log-entry">${esc(x.message)}</div>`).join('')}</div>
      </aside></div></div>`;
  }
  const reactions = () => `<div class="quick-reactions">${['🔥','😂','😈','😭','👏','🎉'].map(e=>`<button class="react-btn" title="React ${e}" aria-label="React ${e}" data-act="react" data-emoji="${e}">${e}</button>`).join('')}</div>`;
  function opponentSeats() {
    return state.players.map(p=>`<div class="player-seat ${p.id===state.turn?'turn-seat':''} ${p.active?'':'out'}" title="${esc(p.name)}">
      <div class="p-name">${esc(p.name)} ${p.id===state.selfId?'✦':''}</div><div class="p-count">${p.bot?'<span class="bot-tag">BOT</span> ':''}${p.active?`<strong>${p.cardCount}</strong> cards`:'OUT'} ${p.connected?'':'· offline'}</div></div>`).join('');
  }
  function headline() {
    if (state.status==='finished') return '';
    if (state.choice?.type === 'swap') return state.choice.actorId===state.selfId?'Choose a player to swap hands with.':'A hand swap is happening…';
    if (state.roulette) return state.roulette.targetId===state.selfId?'COLOR ROULETTE — choose a color!':'Color roulette in progress…';
    if (state.turn===state.selfId) {
      if (state.pending) return `⚡ Your move: stack +${state.pending.minimum} or take +${state.pending.total}`;
      if (state.mustPlayId) return 'Play the card you just drew.';
      return 'Your turn! Play a glowing card.';
    }
    const current = state.players.find(p=>p.id===state.turn);
    return `${current?.name || 'Opponent'} is choosing a card…`;
  }
  function renderGame() {
    const handScroll = document.querySelector('.hand-cards')?.scrollLeft || 0;
    const me = state.players.find(p=>p.id===state.selfId);
    const finished = state.status==='finished';
    const winner = state.players.find(p=>p.id===state.winnerId);
    const callUno = state.unoWindow?.playerId === state.selfId;
    const catchUno = state.unoWindow && state.unoWindow.playerId !== state.selfId && me?.active;
    const isMyTurn = state.turn===state.selfId && !finished && me?.active;
    const currentC = state.color || 'wild';
    const backStyle = ({red:'#eb446f',blue:'#5384f7',green:'#24ad9b',yellow:'#edae3d',wild:'#fff'})[currentC];
    app.innerHTML = `<div class="shell">${header()}
      <div class="game-toolbar"><div class="inline-actions"><span class="chip">ROOM ${esc(state.code)}</span><span class="chip">${state.direction===1?'↻ CLOCKWISE':'↺ COUNTERCLOCKWISE'}</span><span class="chip">${state.players.filter(p=>p.active).length} REMAINING</span></div>
      <div class="inline-actions"><button class="ghost small" data-act="share">Invite ↗</button><button class="ghost small" data-act="leave">Leave</button></div></div>
      ${finished?`<div class="result"><div class="eyebrow">ROUND COMPLETE</div><h2>${winner?.id===state.selfId?'You won the round!':`${esc(winner?.name || 'Someone')} wins!`}</h2><p>Every card has consequences. Ready for another round?</p>
        ${state.isHost?`<button class="primary" data-act="start" ${state.players.length<2?'disabled':''}>▶ Play another round</button>`:'<span class="muted">Waiting for the host to start another round…</span>'}</div>`:''}
      <div class="game-grid"><section class="game-area"><div class="table-board">
        <div class="table-topline"><span>THE CHAOS TABLE</span><span>${state.drawCount} cards in draw pile</span></div>
        <div class="table-players">${opponentSeats()}</div>
        <div class="table-middle"><div class="deck-stack" aria-hidden="true"><span>D</span></div>
          ${state.top?cardMarkup(state.top,true):''}<div><div class="table-wild">${state.pending?`+${state.pending.total}`:'↝'}</div>
          <div class="table-color"><i class="color-dot" style="--dot:${backStyle}"></i>${esc(currentC)}</div></div>
        </div><div class="room-alert">${esc(headline())}</div>
      </div>
      <div class="hand-panel"><div class="hand-header"><h2>Your hand <span class="muted">(${state.hand.length})</span></h2><span class="tiny muted">Tap a highlighted card to play</span></div>
        ${state.pending && isMyTurn?`<div class="special">Penalty chain: +${state.pending.total}. Stack an equal or higher draw card to pass it on, or take the cards.</div>`:''}
        <div class="hand-cards">${state.hand.map(c=>cardMarkup(c)).join('') || '<span class="muted">Your hand is empty.</span>'}</div>
        <div class="hand-actions">
          ${state.canDraw?`<button class="secondary" data-act="draw">⇣ Draw until playable</button>`:''}
          ${state.canTakePenalty?`<button class="primary" data-act="take">Take +${state.pending.total} cards</button>`:''}
          ${callUno?`<button class="primary" data-act="uno">📣 Call UNO!</button>`:''}
          ${catchUno?`<button class="primary" data-act="catch">👀 Catch missed UNO (+2)</button>`:''}
          <span class="status">${me?.active?'Stay under 25 cards to survive':'Eliminated. Watch your friends finish the round.'}</span>
        </div>
      </div></section><aside>
      ${finished && state.isHost?`<div class="panel bot-management"><div class="caps">NEXT ROUND · ${state.players.length}/${state.maxPlayers} PLAYERS</div><div class="member-list">${playersList()}</div>${botControls()}</div>`:''}
      <div class="panel log-panel"><h3>⚡ Live play-by-play</h3>${state.events.map(x=>`<div class="log-entry">${esc(x.message)}</div>`).join('')}</div>
      <div class="panel" style="margin-top:12px"><div class="caps">REACTIONS</div>${reactions()}<div class="rules-row"><span class="pill">25-card knockout</span><span class="pill">+2 → +10 stacks</span><span class="pill">7 swap · 0 pass</span></div></div>
      </aside></div></div>`;
    const hand = document.querySelector('.hand-cards');if(hand)hand.scrollLeft=handScroll;
  }
  function renderModal() {
    let content = '';
    if (modal?.type==='rules') {
      content = `<div class="dialog"><div class="eyebrow">HOW TO PLAY</div><h2>Rulebook, the short version.</h2>
        <p style="text-align:left"><b>Match color, number, or symbol.</b> If nothing matches, draw until you find a playable card, and play it.<br><br>
        <b>Stack +2, +4, +6, +10.</b> Only an equal or higher draw penalty can pass the total on.<br><br>
        <b>Play 7:</b> choose someone to swap hands with. <b>Play 0:</b> everyone passes their hand in play order.<br><br>
        <b>At 25 cards:</b> you're out. First to empty their hand, or last player standing, wins.<br><br>
        <b>One card left?</b> Call UNO before someone catches you and gives you +2.<br><br>
        Wild Color Roulette lets the victim choose a color and draw until that color appears.</p>
        <button class="primary full" data-act="close-modal">Got it</button></div>`;
    } else if (modal?.type==='wild') {
      content = `<div class="dialog"><div class="eyebrow">WILD CARD</div><h2>Choose the next color</h2><p>Pick what the next player must match.</p>
        <div class="color-options">${COLORS.map(c=>`<button class="color-button ${c}" data-act="pick-color" data-color="${c}">${c.toUpperCase()}</button>`).join('')}</div>
        <button class="ghost small" data-act="close-modal" style="margin-top:16px">Cancel</button></div>`;
    } else if (state?.status==='playing' && state.roulette?.targetId===state.selfId) {
      content = `<div class="dialog"><div class="eyebrow">◈ COLOR ROULETTE</div><h2>Pick your fate.</h2><p>You'll draw cards until the color you choose shows up. Every card you draw goes into your hand.</p>
        <div class="color-options">${COLORS.map(c=>`<button class="color-button ${c}" data-act="roulette-color" data-color="${c}">${c.toUpperCase()}</button>`).join('')}</div></div>`;
    } else if (state?.status==='playing' && state.choice?.type==='swap' && state.choice.actorId===state.selfId) {
      content = `<div class="dialog"><div class="eyebrow">7 = HAND SWAP</div><h2>Pick your target.</h2><p>You must swap your entire hand with another player.</p><div class="target-list">
        ${state.players.filter(p=>p.active && p.id!==state.selfId).map(p=>`<button data-act="swap" data-id="${esc(p.id)}">${esc(p.name)} · ${p.cardCount} cards →</button>`).join('')}</div></div>`;
    }
    modalRoot.innerHTML = content ? `<div class="dialog-backdrop" role="dialog" aria-modal="true">${content}</div>` : '';
  }
  function render() {
    if (!state) renderHome(); else if (state.status==='waiting') renderLobby(); else renderGame();
    renderModal();
  }
  async function request(url, body) {
    const res = await fetch(url, {method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
    const data = await res.json();if(!res.ok)throw new Error(data.error || `Server error: ${res.status}`);return data;
  }
  function saveSession(s) {session=s;localStorage.setItem('dhurandhar_uno_session',JSON.stringify(s));}
  function clearSession() {
    if(stream){stream.close();stream=null;}
    localStorage.removeItem('dhurandhar_uno_session');session=null;state=null;modal=null;lastTurn=null;
    history.replaceState(null,'',location.pathname);
    render();
  }
  async function connect() {
    if (!session) return;
    const data = await request(`/api/state?room=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`);
    state=data;prefRoom=data.code;
    history.replaceState(null,'',`?room=${encodeURIComponent(data.code)}`);
    if(stream)stream.close();
    stream = new EventSource(`/api/events?room=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`);
    stream.addEventListener('state',evt=>{
      try {
        const incoming=JSON.parse(evt.data);
        if (lastTurn !== null && lastTurn !== session.id && incoming.turn===session.id && incoming.status==='playing') playSound(730,.2);
        lastTurn=incoming.turn;
        state=incoming;
        render();
      } catch(e) {console.error(e);}
    });
    stream.onerror=()=>{ if(state)toast('Connection interrupted. Trying to reconnect…'); };
    render();
  }
  async function createOrJoin(create) {
    const name = document.getElementById('nickname')?.value.trim() || '';
    if(name.length<2){toast('Enter a nickname with at least 2 characters.');return;}
    localStorage.setItem('dhurandhar_uno_name',name);
    const code=document.getElementById('roomcode')?.value.trim().toUpperCase() || '';
    if(!create && !/^[A-Z2-9]{6}$/.test(code)){toast('Enter your six-character room code.');return;}
    const response=await request(create?'/api/create':'/api/join',create?{name}:{name,code});
    saveSession(response);playSound(530,.11);await connect();
  }
  async function action(type, args={}) {
    if(!session)return;
    await request('/api/action',{type,code:session.code,token:session.token,...args});
    if (type !== 'react') playSound(520,.10);
  }
  async function copyText(text) {
    try {
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);toast('Copied!');return;}
      const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();
      const success=document.execCommand('copy');area.remove();if(success){toast('Copied!');return;}
    } catch{}
    window.prompt('Copy this link:',text);
  }
  async function shareInvite() {
    const link = invitationUrl();
    if(navigator.share){try{await navigator.share({title:'Dhurandhar UNO',text:`Join my card game! Room ${state.code}`,url:link});return;}catch(e){if(e.name==='AbortError')return;}}
    await copyText(link);
  }
  async function runClick(button) {
    const type=button.dataset.act;
    if(type==='mute'){mute=!mute;localStorage.setItem('dhurandhar_uno_mute',String(mute));render();return;}
    if(type==='rules'){modal={type:'rules'};renderModal();return;}
    if(type==='close-modal'){modal=null;renderModal();return;}
    if(type==='create' || type==='join'){await createOrJoin(type==='create');return;}
    if(!state)return;
    if(type==='code-copy'){await copyText(state.code);return;}
    if(type==='ip-apply'){
      manualIp=document.getElementById('lan-ip')?.value.trim()||'';
      if(manualIp && !/^\d{1,3}(\.\d{1,3}){3}$/.test(manualIp)){toast('Enter a valid IPv4 hotspot address.');return;}
      render();toast('Invite address updated.');return;
    }
    if(type==='share'){await shareInvite();return;}
    if(type==='leave'){
      if(state.status==='playing' && !window.confirm('Leaving now forfeits the current round. Leave?'))return;
      try{await action('leave');}catch{}clearSession();return;
    }
    if(type==='start'){await action('start');return;}
    if(type==='add-bot'){await action('add-bot');return;}
    if(type==='remove-bot'){await action('remove-bot',{targetId:button.dataset.id});return;}
    if(type==='react'){await action('react',{emoji:button.dataset.emoji});return;}
    if(type==='card'){
      const card=state.hand.find(c=>c.id===button.dataset.id);
      if(!card || !card.playable)return;
      if(card.color==='wild' && card.kind!=='roulette'){modal={type:'wild',cardId:card.id};renderModal();return;}
      await action('play',{cardId:card.id});return;
    }
    if(type==='pick-color'){
      const cardId=modal?.cardId;modal=null;renderModal();await action('play',{cardId,color:button.dataset.color});return;
    }
    if(type==='roulette-color'){await action('roulette',{color:button.dataset.color});return;}
    if(type==='swap'){await action('swap',{targetId:button.dataset.id});return;}
    if(['draw','take','uno','catch'].includes(type)){await action(type);return;}
  }
  document.addEventListener('click', async e=>{
    const button=e.target.closest('[data-act]');if(!button || button.disabled)return;
    button.disabled=true;
    try{await runClick(button);}catch(err){toast(err.message||'Something went wrong.');}
    finally{if(button.isConnected)button.disabled=false;}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Enter' && !state && document.activeElement?.tagName==='INPUT'){
      document.querySelector('[data-act="join"]')?.click();
    }
  });
  async function initialize() {
    try{serverInfo = await request('/api/info');}catch{}
    try{session=JSON.parse(localStorage.getItem('dhurandhar_uno_session')||'null');}catch{session=null;}
    if(session && prefRoom && prefRoom !== session.code){localStorage.removeItem('dhurandhar_uno_session');session=null;}
    if(session && session.code && session.token){try{await connect();}catch(e){clearSession();toast('Previous room unavailable. Join or make a new one.');}}
    else render();
  }
  initialize();
})();
