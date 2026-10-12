'use strict';
// DHURANDHAR UNO — a dependency-free, LAN-friendly multiplayer card game server.
// Node.js 18+ required. For private play, do not expose the server publicly without HTTPS.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, randomInt } = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PLAYERS = 10;
const BOT_TURN_DELAY = 650;
const COLORS = ['red', 'blue', 'green', 'yellow'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();
const sendJson = (res, status, body) => { if (res.writableEnded) return; res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'same-origin'}); res.end(JSON.stringify(body)); };
const makeId = () => randomBytes(18).toString('hex');
const makeCode = () => Array.from({length: 6}, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const shuffle = (cards) => { for (let i = cards.length - 1; i > 0; i--) { const j = randomInt(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; } return cards; };
const log = (room, msg) => { room.events.unshift({id: ++room.eventSeq, message: msg}); room.events.length = Math.min(20, room.events.length); };
function createDeck() {
  const deck = [];
  const add = (color, kind, count) => { for (let i = 0; i < count; i++) deck.push({id: makeId(), color, kind}); };
  for (const color of COLORS) {
    for (let n = 0; n <= 9; n++) add(color, String(n), 2);
    for (const type of ['skip', 'reverse', 'draw2', 'discard']) add(color, type, 3);
    for (const type of ['draw4', 'skipall']) add(color, type, 2);
  }
  add('wild', 'reverse4', 8);
  add('wild', 'roulette', 8);
  add('wild', 'draw6', 4);
  add('wild', 'draw10', 4);
  if (deck.length !== 168) throw new Error('Invalid deck');
  return shuffle(deck);
}
const alive = room => room.players.filter(p => p.active);
const playerById = (room, id) => room.players.find(p => p.id === id);
function nextAlive(room, fromId, steps = 1) {
  if (!alive(room).length) return null;
  let index = room.players.findIndex(p => p.id === fromId);
  for (let count = 0; count < steps; count++) {
    for (let attempts = 0; attempts < room.players.length; attempts++) {
      index = (index + room.direction + room.players.length) % room.players.length;
      if (room.players[index].active) break;
    }
  }
  return room.players[index].id;
}
function pull(room) {
  if (!room.deck.length) {
    if (room.discard.length <= 1 && !room.exiled.length) return null;
    // Never shuffle the face-up card back into the draw pile.
    const top = room.discard[room.discard.length - 1];
    room.deck = shuffle([...room.discard.slice(0, -1), ...room.exiled]);
    room.discard = [top]; room.exiled = [];
    log(room, 'The draw pile was reshuffled.');
  }
  return room.deck.pop() || null;
}
function drawMany(room, player, count) {
  let drew = 0;
  for (let n = 0; n < count; n++) { const card = pull(room); if (!card) break; player.hand.push(card); drew++; }
  return drew;
}
const penaltyOf = card => ({draw2:2,draw4:4,draw6:6,draw10:10,reverse4:4})[card.kind] || 0;
function isLegal(room, player, card) {
  if (room.turn !== player.id || room.status !== 'playing' || !player.active || room.choice) return false;
  if (room.roulette && room.roulette.targetId === player.id) return false;
  if (room.mustPlayId && room.mustPlayId !== card.id) return false;
  if (room.pending) return penaltyOf(card) >= room.pending.minimum;
  const top = room.discard[room.discard.length - 1];
  return card.color === 'wild' || card.color === room.color || card.kind === top.kind;
}
function markWinner(room, player) {
  room.status = 'finished'; room.winnerId = player.id; room.choice = null; room.roulette = null; room.pending = null; room.mustPlayId = null; room.unoWindow = null;
  player.wins = (player.wins || 0) + 1;
  log(room, `${player.name} wins the round!`);
}
function checkKnockouts(room) {
  for (const p of room.players) {
    if (p.active && p.hand.length >= room.mercyLimit) {
      p.active = false; p.knockedOut = true;
      room.exiled.push(...p.hand); p.hand = [];
      if (room.unoWindow?.playerId === p.id) room.unoWindow = null;
      log(room, `${p.name} was eliminated (${room.mercyLimit}+ cards).`);
    }
  }
  if (room.status === 'playing' && alive(room).length === 1) markWinner(room, alive(room)[0]);
}
function noteUno(room, player) { room.unoWindow = player.active && player.hand.length === 1 ? {playerId: player.id} : null; }
function startRound(room) {
  room.players = room.players.filter(p => !p.departed);
  if (room.players.length < 2) throw new Error('At least 2 players are required.');
  if (room.players.length > MAX_PLAYERS) throw new Error(`At most ${MAX_PLAYERS} players are allowed.`);
  room.deck = createDeck(); room.discard = []; room.exiled = [];
  room.status = 'playing'; room.winnerId = null; room.direction = 1;
  room.pending = null; room.choice = null; room.roulette = null; room.unoWindow = null; room.mustPlayId = null;
  for (const p of room.players) { p.hand = []; p.active = true; p.knockedOut = false; drawMany(room, p, 7); }
  // Place a numbered card face-up. Reinsert initial action cards into the draw deck.
  const skipped = [];
  while (room.deck.length) {
    const card = room.deck.pop();
    if (/^\d$/.test(card.kind)) { room.discard.push(card); room.color = card.color; break; }
    skipped.push(card);
  }
  room.deck = shuffle(room.deck.concat(skipped));
  // First player in join order acts first, as if the host were the dealer.
  room.turn = room.players[1].id;
  log(room, 'Round started. Seven cards each. Good luck!');
}
function getPublicState(room, self) {
  const hand = self.hand.map(c => ({...c, playable: isLegal(room, self, c)}));
  return {
    code: room.code, status: room.status, isHost: room.hostId === self.id,
    selfId: self.id, hostId: room.hostId, maxPlayers: MAX_PLAYERS, mercyLimit: room.mercyLimit,
    players: room.players.filter(p => !p.departed).map(p => ({id:p.id,name:p.name,bot:!!p.bot,cardCount:p.active ? p.hand.length : 0,active:p.active, connected:!!p.bot || p.clients.size > 0,wins:p.wins||0})),
    hand, turn: room.turn, direction: room.direction,
    top: room.discard.at(-1) || null, color: room.color || null,
    drawCount: room.deck.length,
    pending: room.pending ? {...room.pending} : null,
    choice: room.choice && (room.choice.actorId === self.id || room.choice.type === 'swap') ? {type:room.choice.type,actorId:room.choice.actorId} : null,
    roulette: room.roulette ? {...room.roulette} : null,
    canDraw: room.status === 'playing' && room.turn === self.id && !room.pending && !room.roulette && !room.choice && !room.mustPlayId && !hand.some(c => c.playable),
    canTakePenalty: room.status === 'playing' && room.turn === self.id && !!room.pending,
    mustPlayId: room.mustPlayId,
    unoWindow: room.unoWindow && {...room.unoWindow},
    winnerId: room.winnerId,
    events: room.events.slice(0, 9)
  };
}
function broadcast(room) {
  room.touched = Date.now();
  for (const client of [...room.clients]) {
    if (client.res.destroyed || client.res.writableEnded) { room.clients.delete(client); continue; }
    const player = playerById(room, client.playerId); if (!player) continue;
    try {client.res.write(`event: state\ndata: ${JSON.stringify(getPublicState(room, player))}\n\n`);} catch {room.clients.delete(client);}
  }
  scheduleBotTurn(room);
}
function act(room, player, type, data = {}) {
  if (type === 'add-bot' || type === 'remove-bot') {
    if (room.hostId !== player.id || player.bot) throw new Error('Only the host can manage bots.');
    if (!['waiting', 'finished'].includes(room.status)) throw new Error('Manage bots between rounds.');
    if (type === 'add-bot') {
      if (room.players.filter(p => !p.departed).length >= MAX_PLAYERS) throw new Error('This room is full.');
      let number = 1;
      while (room.players.some(p => !p.departed && p.name.toLowerCase() === `bot ${number}`)) number++;
      const bot = {id:makeId(),token:makeId(),name:`Bot ${number}`,bot:true,hand:[],active:true,knockedOut:false,wins:0,clients:new Set()};
      room.players.push(bot);
      log(room, `${bot.name} joined the table.`);
    } else {
      const bot = playerById(room, String(data.targetId || ''));
      if (!bot?.bot || bot.departed) throw new Error('Choose a bot to remove.');
      room.players = room.players.filter(p => p.id !== bot.id);
      log(room, `${bot.name} was removed from the table.`);
    }
    return;
  }
  if (type === 'react') {
    const allowed = ['🔥','😂','😈','😭','👏','🎉'];
    if (!allowed.includes(data.emoji)) throw new Error('Invalid reaction.');
    if (Date.now() - (player.lastReact || 0) < 1500) throw new Error('Wait a moment before reacting again.');
    player.lastReact = Date.now(); log(room, `${player.name}: ${data.emoji}`); return;
  }
  if (type === 'leave') {
    if (room.status === 'playing') {
      player.departed = true;
      if (room.hostId === player.id) room.hostId = room.players.find(p => p.id !== player.id && !p.departed && !p.bot)?.id || null;
      if (player.active) {
        player.active = false; room.exiled.push(...player.hand); player.hand = [];
        if (room.turn === player.id) {
          room.pending = null; room.choice = null; room.roulette = null; room.mustPlayId = null; room.unoWindow = null;
        } else if (room.unoWindow?.playerId === player.id) room.unoWindow = null;
        log(room, `${player.name} left the game.`);
        checkKnockouts(room);
        if (room.status === 'playing' && room.turn === player.id) room.turn = nextAlive(room,player.id);
      }
    } else {
      room.players = room.players.filter(p => p.id !== player.id);
      if (room.hostId === player.id) room.hostId = room.players.find(p => !p.bot)?.id || null;
      if (!room.players.length) rooms.delete(room.code);
      else log(room, `${player.name} left the room.`);
    }
    for (const client of [...player.clients]) { client.res.end(); room.clients.delete(client); }
    player.clients.clear();
    if (!room.players.some(p => !p.bot && !p.departed)) {
      clearTimeout(room.botTimer);
      room.botTimer = null;
      rooms.delete(room.code);
    }
    return;
  }
  if (type === 'start') {
    if (room.hostId !== player.id) throw new Error('Only the host can start the game.');
    if (!['waiting', 'finished'].includes(room.status)) throw new Error('A game is already running.');
    startRound(room); return;
  }
  if (room.status !== 'playing' || !player.active) throw new Error('The game is not active for you.');
  if (type === 'uno') {
    if (room.unoWindow?.playerId !== player.id || player.hand.length !== 1) throw new Error('You do not need to call UNO right now.');
    room.unoWindow = null; log(room, `${player.name} called UNO!`); return;
  }
  if (type === 'catch') {
    const target = playerById(room, room.unoWindow?.playerId);
    if (!target || target.id === player.id || !target.active) throw new Error('Nobody to catch.');
    room.unoWindow = null;
    drawMany(room, target, 2);
    log(room, `${player.name} caught ${target.name} forgetting UNO! +2 cards.`);
    checkKnockouts(room); return;
  }
  if (room.turn !== player.id) throw new Error('Wait for your turn.');
  if (type === 'swap') {
    if (room.choice?.type !== 'swap' || room.choice.actorId !== player.id) throw new Error('No hand swap is pending.');
    const target = playerById(room, String(data.targetId || ''));
    if (!target?.active || target.id === player.id) throw new Error('Choose another active player.');
    [player.hand, target.hand] = [target.hand, player.hand];
    room.choice = null;
    log(room, `${player.name} swapped hands with ${target.name}.`);
    checkKnockouts(room);
    if (room.status !== 'playing') return;
    noteUno(room, player);
    room.turn = nextAlive(room, player.id); return;
  }
  if (type === 'roulette') {
    if (room.roulette?.targetId !== player.id) throw new Error('No color roulette is pending.');
    const color = String(data.color || '');
    if (!COLORS.includes(color)) throw new Error('Choose a valid color.');
    room.color = color;
    let n = 0;
    for (let i = 0; i < 168; i++) {
      const card = pull(room); if (!card) break;
      player.hand.push(card); n++;
      if (card.color === color) break;
    }
    room.roulette = null; room.unoWindow = null;
    log(room, `${player.name} chose ${color} and drew ${n} card${n===1?'':'s'} in roulette.`);
    checkKnockouts(room);
    if (room.status === 'playing') room.turn = nextAlive(room, player.id);
    return;
  }
  if (room.choice || room.roulette) throw new Error('Complete the pending choice first.');
  if (type === 'take') {
    if (!room.pending) throw new Error('No draw penalty to accept.');
    const amount = room.pending.total;
    room.pending = null; room.unoWindow = null;
    const drew = drawMany(room, player, amount);
    log(room, `${player.name} took +${drew} cards.`);
    checkKnockouts(room);
    if (room.status === 'playing') room.turn = nextAlive(room, player.id);
    return;
  }
  if (type === 'draw') {
    if (room.pending || room.mustPlayId) throw new Error('You cannot draw right now.');
    if (player.hand.some(c => isLegal(room, player, c))) throw new Error('Play a matching card from your hand first.');
    room.unoWindow = null;
    let n = 0; let last = null;
    for (let i = 0; i < 168; i++) {
      const card = pull(room); if (!card) break;
      player.hand.push(card); n++; last = card;
      if (card.color === 'wild' || card.color === room.color || card.kind === room.discard.at(-1)?.kind) break;
    }
    log(room, `${player.name} drew ${n} card${n===1?'':'s'}.`);
    checkKnockouts(room);
    if (room.status !== 'playing') return;
    if (!player.active) {
      room.mustPlayId = null;
      room.turn = nextAlive(room, player.id);
      return;
    }
    if (last && (last.color === 'wild' || last.color === room.color || last.kind === room.discard.at(-1)?.kind)) room.mustPlayId = last.id;
    else room.turn = nextAlive(room, player.id);
    return;
  }
  if (type !== 'play') throw new Error('Unknown action.');
  const card = player.hand.find(c => c.id === String(data.cardId || ''));
  if (!card || !isLegal(room, player, card)) throw new Error('That card cannot be played now.');
  const color = data.color;
  if (card.color === 'wild' && card.kind !== 'roulette' && !COLORS.includes(color)) throw new Error('Choose a color for the wild card.');
  const previousPenalty = room.pending?.total || 0;
  player.hand = player.hand.filter(c => c.id !== card.id);
  room.mustPlayId = null; room.unoWindow = null;
  if (card.kind === 'discard') {
    const extras = player.hand.filter(c => c.color === card.color);
    player.hand = player.hand.filter(c => c.color !== card.color);
    room.discard.push(...extras);
    log(room, `${player.name} discarded ${extras.length + 1} ${card.color} cards!`);
  }
  room.discard.push(card);
  if (card.color === 'wild' && card.kind !== 'roulette') room.color = color;
  else if (card.color !== 'wild') room.color = card.color;
  log(room, `${player.name} played ${card.kind.toUpperCase()}${card.color !== 'wild' ? ` (${card.color})` : ''}.`);
  if (player.hand.length === 0) {markWinner(room, player); return;}
  if (card.kind === '0') {
    const live = alive(room);
    const hands = new Map(live.map(p => [p.id, p.hand]));
    // To pass to the next player in the travel direction, each recipient receives from the preceding player.
    for (const p of live) {
      const idx = room.players.findIndex(q => q.id === p.id);
      let pos = idx;
      do { pos = (pos - room.direction + room.players.length) % room.players.length; } while (!room.players[pos].active);
      p.hand = hands.get(room.players[pos].id);
    }
    log(room, 'Everybody passed their hand to the next player!');
  }
  if (card.kind === '7') {
    room.choice = {type: 'swap', actorId: player.id};
    return;
  }
  if (card.kind === 'reverse' || card.kind === 'reverse4') room.direction *= -1;
  if (card.kind === 'roulette') {
    room.roulette = {targetId: nextAlive(room, player.id)};
    room.turn = room.roulette.targetId;
    noteUno(room, player);
    return;
  }
  const amount = penaltyOf(card);
  if (amount) {
    room.pending = {total: previousPenalty + amount, minimum: amount};
    // Two-player Wild Reverse +4 uniquely rebounds to its owner.
    room.turn = card.kind === 'reverse4' && alive(room).length === 2 ? player.id : nextAlive(room, player.id);
    noteUno(room, player);
    return;
  }
  room.pending = null;
  noteUno(room, player);
  if (card.kind === 'skipall' || (card.kind === 'reverse' && alive(room).length === 2)) {
    room.turn = player.id;
  } else if (card.kind === 'skip') {
    room.turn = nextAlive(room, player.id, 2);
  } else {
    room.turn = nextAlive(room, player.id);
  }
}

function preferredBotColor(player, excludedId) {
  const counts = new Map(COLORS.map(color => [color, 0]));
  for (const card of player.hand) {
    if (card.id !== excludedId && counts.has(card.color)) counts.set(card.color, counts.get(card.color) + 1);
  }
  return COLORS.reduce((best, color) => counts.get(color) > counts.get(best) ? color : best, COLORS[0]);
}

// Bots use their own hand and public hand sizes, then submit the same actions as humans.
function playBotTurn(room) {
  if (room.status !== 'playing') return false;
  let changed = false;
  const caller = playerById(room, room.unoWindow?.playerId);
  if (caller?.bot && caller.active && caller.hand.length === 1) {
    act(room, caller, 'uno');
    changed = true;
  }
  const bot = playerById(room, room.turn);
  if (!bot?.bot || !bot.active || bot.departed) return changed;
  if (room.choice) {
    if (room.choice.type !== 'swap' || room.choice.actorId !== bot.id) return changed;
    const target = alive(room).filter(p => p.id !== bot.id).sort((a, b) => a.hand.length - b.hand.length)[0];
    if (!target) return changed;
    act(room, bot, 'swap', {targetId:target.id});
  } else if (room.roulette) {
    if (room.roulette.targetId !== bot.id) return changed;
    act(room, bot, 'roulette', {color:preferredBotColor(bot)});
  } else {
    const legal = bot.hand.filter(card => isLegal(room, bot, card));
    // Prefer discarding multiple cards, then penalties and other special cards.
    const score = card => card.kind === 'discard'
      ? bot.hand.filter(other => other.color === card.color).length * 20
      : penaltyOf(card) * 3 + (card.kind === 'skipall' ? 16 : card.kind === '7' && bot.hand.length > 3 ? 12 : card.color === 'wild' ? -1 : 1);
    legal.sort((a, b) => score(b) - score(a));
    if (legal.length) {
      const card = legal[0];
      act(room, bot, 'play', {cardId:card.id,color:preferredBotColor(bot, card.id)});
    } else if (room.pending) {
      act(room, bot, 'take');
    } else {
      act(room, bot, 'draw');
    }
  }
  const nextCaller = playerById(room, room.unoWindow?.playerId);
  if (room.status === 'playing' && nextCaller?.bot && nextCaller.active && nextCaller.hand.length === 1) act(room, nextCaller, 'uno');
  return true;
}

function scheduleBotTurn(room) {
  const bot = playerById(room, room.turn);
  const caller = playerById(room, room.unoWindow?.playerId);
  const pendingBot = room.status === 'playing' && ((bot?.bot && bot.active && !bot.departed) || caller?.bot);
  if (!pendingBot || rooms.get(room.code) !== room) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
    return;
  }
  if (room.botTimer) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (rooms.get(room.code) !== room) return;
    try {
      if (playBotTurn(room)) broadcast(room);
    } catch (error) {
      console.error(`Bot action failed in room ${room.code}: ${error.message}`);
    }
  }, BOT_TURN_DELAY);
  room.botTimer.unref();
}

function requireAuth(code, token) {
  const room = rooms.get(String(code || '').trim().toUpperCase());
  if (!room) throw new Error('Room not found. Ask your friend for the room code or link.');
  const player = room.players.find(p => !p.bot && p.token === String(token || ''));
  if (!player || player.departed) throw new Error('You are not part of this room. Join using a player name.');
  room.touched = Date.now();
  return {room, player};
}
const files = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/icon.svg':'icon.svg'};
const mime = {'html':'text/html','js':'application/javascript','css':'text/css','svg':'image/svg+xml'};
function ipAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = ''; req.on('data', chunk => {buf += chunk; if (buf.length > 12000) req.destroy();});
    req.on('end', () => {try {resolve(JSON.parse(buf || '{}'));} catch {reject(new Error('Invalid request body.'));}});
    req.on('error', reject);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/info') return sendJson(res, 200, {lanIps: ipAddresses(),port:PORT,online:!!process.env.RENDER});
  if (req.method === 'GET' && url.pathname === '/api/state') {
    try {
      const {room,player} = requireAuth(url.searchParams.get('room'),url.searchParams.get('token'));
      return sendJson(res,200,getPublicState(room,player));
    } catch (e) { return sendJson(res,401,{error:e.message}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/events') {
    try {
      const {room, player} = requireAuth(url.searchParams.get('room'), url.searchParams.get('token'));
      res.writeHead(200, {'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      const client = {playerId:player.id,res}; room.clients.add(client); player.clients.add(client);
      res.write(`event: state\ndata: ${JSON.stringify(getPublicState(room, player))}\n\n`);
      res.on('close', () => {room.clients.delete(client); player.clients.delete(client); broadcast(room);});
      broadcast(room);
    } catch (e) {sendJson(res, 401, {error:e.message});}
    return;
  }
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    try {
      const data = await readBody(req);
      if (url.pathname === '/api/create') {
        const name = String(data.name || '').trim().replace(/[<>]/g,'').slice(0, 18);
        if (name.length < 2) throw new Error('Enter a name with at least 2 characters.');
        if (rooms.size > 2000) throw new Error('Server has too many rooms.');
        let code; do {code = makeCode();} while (rooms.has(code));
        const p = {id:makeId(),token:makeId(),name,hand:[],active:true,knockedOut:false,wins:0,clients:new Set()};
        const room = {code,hostId:p.id,players:[p],status:'waiting',mercyLimit:25,createdAt:Date.now(),touched:Date.now(),
          direction:1,turn:null,deck:[],discard:[],exiled:[],color:null,pending:null,choice:null,roulette:null,unoWindow:null,mustPlayId:null,winnerId:null,events:[],eventSeq:0,clients:new Set()};
        rooms.set(code,room); log(room, `${name} created the room.`);
        return sendJson(res, 200, {code,token:p.token,id:p.id});
      }
      if (url.pathname === '/api/join') {
        const code = String(data.code || '').toUpperCase().trim();
        const room = rooms.get(code); if (!room) throw new Error('Room not found. Check the 6-character code.');
        if (room.status === 'playing') throw new Error('The round is already in progress. Ask the host to start a new room.');
        if (room.players.filter(p => !p.departed).length >= MAX_PLAYERS) throw new Error('This room is full.');
        const name = String(data.name || '').trim().replace(/[<>]/g,'').slice(0,18);
        if (name.length < 2) throw new Error('Enter a name with at least 2 characters.');
        if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is already used in this room.');
        const p = {id:makeId(),token:makeId(),name,hand:[],active:true,knockedOut:false,wins:0,clients:new Set()};
        room.players.push(p); log(room, `${name} joined the table.`); broadcast(room);
        return sendJson(res,200,{code,token:p.token,id:p.id});
      }
      if (url.pathname === '/api/action') {
        const {room,player} = requireAuth(data.code,data.token);
        act(room,player,data.type,data); broadcast(room); return sendJson(res,200,{ok:true});
      }
      return sendJson(res,404,{error:'Not found.'});
    } catch (e) {return sendJson(res,400,{error:e.message || 'Request failed.'});}
  }
  if (req.method === 'GET' && files[url.pathname]) {
    const name = files[url.pathname]; const ext = name.split('.').at(-1);
    try {
      res.writeHead(200,{'Content-Type':`${mime[ext]}; charset=utf-8`,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      fs.createReadStream(path.join(__dirname,'public',name)).pipe(res);
    } catch {sendJson(res,500,{error:'Unable to serve page.'});}
    return;
  }
  sendJson(res,404,{error:'Not found.'});
});
server.listen(PORT,HOST,()=> {
  console.log(`\nDHURANDHAR UNO is ready!\nHost phone: http://localhost:${PORT}`);
  for (const ip of ipAddresses()) console.log(`Players on the same Wi-Fi or hotspot: http://${ip}:${PORT}`);
  console.log('If no address is listed, check the gateway address in your hotspot / Wi-Fi settings.\n');
});
const heartbeats = setInterval(() => {
  for (const room of rooms.values()) for (const client of [...room.clients]) {
    try {client.res.write(': ping\n\n');} catch {room.clients.delete(client);}
  }
  for (const [code,room] of rooms) if (Date.now()-room.touched > 24*60*60*1000 && room.clients.size===0) {
    clearTimeout(room.botTimer);
    rooms.delete(code);
  }
},20000);
heartbeats.unref();
server.on('close', () => { for (const room of rooms.values()) clearTimeout(room.botTimer); });
module.exports = {createDeck,rooms,act,startRound,getPublicState,playBotTurn,server};
