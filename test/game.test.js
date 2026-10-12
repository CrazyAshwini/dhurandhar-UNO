'use strict';
const assert=require('node:assert/strict');
const TEST_PORT = 30000 + (process.pid % 20000);
process.env.PORT = String(TEST_PORT);
const {createDeck,rooms,act,startRound,getPublicState,playBotTurn,server} = require('../server');
const card=(color,kind,id=Math.random().toString(36).slice(2))=>({id,color,kind});
function makeRoom(n=3) {
 const players=Array.from({length:n},(_,i)=>({id:`p${i}`,name:`Player ${i+1}`,token:`t${i}`,active:true,hand:[],wins:0,clients:new Set()}));
 return {code:'TEST1',hostId:'p0',players,status:'playing',mercyLimit:25,createdAt:Date.now(),touched:Date.now(),direction:1,turn:'p0',deck:createDeck(),discard:[card('red','5')],exiled:[],color:'red',pending:null,choice:null,roulette:null,unoWindow:null,mustPlayId:null,winnerId:null,events:[],eventSeq:0,clients:new Set()};
}
function botRoom(n=2) {
 const room=makeRoom(n);
 room.players[0].bot=true;
 for (const player of room.players) player.hand=[card('blue','2'),card('green','3')];
 return room;
}
const base=`http://127.0.0.1:${TEST_PORT}`;
async function post(endpoint,data) {
 const response=await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 return {status:response.status,body:await response.json()};
}
const action=(session,type,data={})=>post('/api/action',{code:session.code,token:session.token,type,...data});
async function roomState(session) {
 const response=await fetch(base+`/api/state?room=${session.code}&token=${session.token}`);
 assert.equal(response.status,200);
 return response.json();
}
async function waitFor(check,message,timeout=4000) {
 const deadline=Date.now()+timeout;
 while (Date.now()<deadline) {
  if (await check()) return;
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 assert.fail(message);
}
(async function(){
 try {
  assert.equal(createDeck().length,168,'official-size deck');
  let r=makeRoom();r.players[0].hand=[card('red','7'),card('blue','2')];r.players[1].hand=[card('green','9'),card('yellow','5'),card('red','3')];r.players[2].hand=[card('yellow','8'),card('green','4')];
  act(r,r.players[0],'play',{cardId:r.players[0].hand[0].id});
  assert.equal(r.choice.type,'swap');
  act(r,r.players[0],'swap',{targetId:'p1'});
  assert.equal(r.players[0].hand.length,3);assert.equal(r.players[1].hand.length,1);assert.equal(r.turn,'p1');

  r=makeRoom();r.players[0].hand=[card('red','0'),card('yellow','4')];r.players[1].hand=[card('blue','6')];r.players[2].hand=[card('green','9')];
  act(r,r.players[0],'play',{cardId:r.players[0].hand[0].id});
  assert.equal(r.players[0].hand[0].kind,'9');assert.equal(r.players[1].hand[0].kind,'4');assert.equal(r.players[2].hand[0].kind,'6');

  r=makeRoom();r.players[0].hand=[card('red','draw2'),card('yellow','1')];r.players[1].hand=[card('blue','draw6'),card('green','2')];r.players[2].hand=[card('yellow','draw10'),card('red','1')];
  act(r,r.players[0],'play',{cardId:r.players[0].hand[0].id});assert.equal(r.pending.total,2);assert.equal(r.turn,'p1');
  act(r,r.players[1],'play',{cardId:r.players[1].hand[0].id,color:'blue'});assert.equal(r.pending.total,8);
  assert.equal(getPublicState(r,r.players[2]).hand.find(c=>c.kind==='draw10').playable,true);
  act(r,r.players[2],'take');assert.equal(r.pending,null);assert.equal(r.turn,'p0');assert.equal(r.players[2].hand.length,10);

  r=makeRoom(2);r.players[0].hand=[card('wild','reverse4'),card('red','2')];r.players[1].hand=[card('red','1')];
  act(r,r.players[0],'play',{cardId:r.players[0].hand[0].id,color:'green'});assert.equal(r.turn,'p0','reverse 4 rebounds to actor in 2p');
  act(r,r.players[0],'take');assert.equal(r.turn,'p1');assert.equal(r.players[0].hand.length,5);

  r=makeRoom();r.players[0].hand=[card('red','skip'),card('green','3')];r.players[1].hand=[card('blue','5')];r.players[2].hand=[card('yellow','9')];
  act(r,r.players[0],'play',{cardId:r.players[0].hand[0].id});assert.equal(r.turn,'p2');

  r=makeRoom();r.players[0].hand=[card('red','discard'),card('red','9'),card('blue','5')];r.players[1].hand=[card('blue','2')];r.players[2].hand=[card('yellow','9')];
  act(r,r.players[0],'play',{cardId:r.players[0].hand[0].id});assert.equal(r.players[0].hand.length,1);assert.equal(r.discard.at(-1).kind,'discard');

  r=makeRoom();r.players[0].hand=[card('red','4'),card('blue','1')];r.players[1].hand=[card('blue','2')];r.players[2].hand=[card('green','2')];
  act(r,r.players[0],'play',{cardId:r.players[0].hand[0].id});assert.equal(r.unoWindow.playerId,'p0');
  act(r,r.players[2],'catch');assert.equal(r.players[0].hand.length,3);assert.equal(r.unoWindow,null);

  r=makeRoom();r.players[0].hand=[card('red','4')];r.players[1].hand=[card('blue','2')];r.players[2].hand=[card('green','2')];
  act(r,r.players[0],'play',{cardId:r.players[0].hand[0].id});assert.equal(r.status,'finished');assert.equal(r.winnerId,'p0');

  r=makeRoom();r.players[0].hand=[card('blue','1')];r.players[1].hand=[card('green','1')];r.players[2].hand=[card('yellow','2')];
  r.players[0].hand.push(...Array.from({length:24},(_,i)=>card('yellow',String(i%10))));
  const state=getPublicState(r,r.players[1]);assert.equal(state.hand.length,1);assert.equal(state.players[0].cardCount,25);assert.equal(state.hand.find(c=>c.kind==='1').playable,false);

  r=makeRoom();r.players[0].hand=[card('wild','roulette'),card('green','2')];r.players[1].hand=[card('blue','3')];r.players[2].hand=[card('yellow','3')];
  act(r,r.players[0],'play',{cardId:r.players[0].hand[0].id});assert.equal(r.roulette.targetId,'p1');
  act(r,r.players[1],'roulette',{color:'red'});assert.equal(r.turn,'p2');assert.equal(r.roulette,null);

  r=makeRoom();startRound(r);assert.equal(r.players[0].hand.length,7);assert.equal(r.discard.length,1);assert.ok(/^\d$/.test(r.discard[0].kind));assert.equal(r.turn,'p1');

  r=botRoom();r.players[0].hand=[card('red','4'),card('blue','1')];
  assert.equal(playBotTurn(r),true,'bot plays a legal matching card');
  assert.equal(r.discard.at(-1).kind,'4');assert.equal(r.turn,'p1');assert.equal(r.players[0].hand.length,1);
  assert.equal(r.unoWindow,null,'bot immediately calls UNO');assert.ok(r.events.some(e=>e.message.includes('called UNO')));
  assert.equal(playBotTurn(r),false,'human turns are not played by bots');

  r=botRoom();r.players[0].hand=[card('blue','1')];r.deck=[card('red','3'),card('green','6'),card('blue','9')];
  assert.equal(playBotTurn(r),true,'bot draws until a legal card appears');
  assert.equal(r.players[0].hand.length,4);assert.equal(r.mustPlayId,r.players[0].hand.at(-1).id);assert.equal(r.turn,'p0');
  assert.equal(playBotTurn(r),true,'bot follows the required drawn card');
  assert.equal(r.discard.at(-1).kind,'3');assert.equal(r.mustPlayId,null);assert.equal(r.turn,'p1');

  r=botRoom(3);r.players[0].hand=Array.from({length:24},()=>card('blue','2'));r.deck=[card('red','4')];
  assert.equal(playBotTurn(r),true,'a draw can eliminate a bot at the mercy limit');
  assert.equal(r.players[0].active,false);assert.equal(r.players[0].hand.length,0);assert.equal(r.exiled.length,25);
  assert.equal(r.status,'playing');assert.equal(r.turn,'p1','play advances after the drawing bot is eliminated');
  assert.equal(r.mustPlayId,null,'a matching knockout draw must not leave an impossible required play');

  r=botRoom(3);r.pending={total:4,minimum:4};r.players[0].hand=[card('red','draw2'),card('wild','draw6'),card('blue','2')];
  assert.equal(playBotTurn(r),true,'bot stacks a large enough draw card');
  assert.equal(r.discard.at(-1).kind,'draw6');assert.equal(r.pending.total,10);assert.equal(r.pending.minimum,6);assert.equal(r.turn,'p1');
  assert.ok(['red','blue','green','yellow'].includes(r.color),'wild stack has a valid chosen color');

  r=botRoom();r.pending={total:8,minimum:6};r.players[0].hand=[card('red','draw2'),card('green','3')];
  assert.equal(playBotTurn(r),true,'bot accepts a penalty when no legal stack exists');
  assert.equal(r.pending,null);assert.equal(r.players[0].hand.length,10);assert.equal(r.turn,'p1');

  r=botRoom();r.players[0].hand=[card('wild','draw10'),card('green','2'),card('green','3'),card('blue','1')];
  assert.equal(playBotTurn(r),true,'bot supplies a wild color');
  assert.equal(r.discard.at(-1).kind,'draw10');assert.ok(['red','blue','green','yellow'].includes(r.color));

  r=botRoom();r.players[0].hand=[card('red','7'),card('blue','1')];r.players[1].hand=[card('green','9')];
  assert.equal(playBotTurn(r),true);assert.equal(r.choice.type,'swap');
  assert.equal(playBotTurn(r),true,'bot completes a required hand swap');
  assert.equal(r.choice,null);assert.equal(r.players[0].hand[0].kind,'9');assert.equal(r.players[1].hand[0].kind,'1');assert.equal(r.turn,'p1');assert.equal(r.unoWindow,null);

  r=botRoom();r.roulette={targetId:'p0'};r.discard=[card('wild','roulette')];
  r.deck=['red','blue','green','yellow'].map(color=>card(color,'8'));
  assert.equal(playBotTurn(r),true,'bot chooses a roulette color and draws');
  assert.equal(r.roulette,null);assert.equal(r.turn,'p1');assert.ok(r.players[0].hand.length>2);assert.equal(r.players[0].hand.at(-1).color,r.color);

  r=botRoom();r.players[0].hand=[card('red','4')];
  assert.equal(playBotTurn(r),true);assert.equal(r.status,'finished');assert.equal(r.winnerId,'p0');assert.equal(playBotTurn(r),false);
  r=botRoom();r.players[0].active=false;assert.equal(playBotTurn(r),false,'eliminated bots do not act');

  for (const status of ['waiting','playing']) {
   r=makeRoom(3);r.status=status;r.players[1].bot=true;
   act(r,r.players[0],'leave');assert.equal(r.hostId,'p2','host transfer skips bots');
  }

  let created=await post('/api/create',{name:'Bot host'});assert.equal(created.status,200);const host=created.body;
  let joined=await post('/api/join',{code:host.code,name:'Guest'});assert.equal(joined.status,200);const guest=joined.body;
  assert.equal((await action(guest,'add-bot')).status,400,'only the host adds bots');
  assert.equal((await action(host,'add-bot')).status,200);
  let lobby=await roomState(host);const firstBot=lobby.players.find(player=>player.bot);
  assert.ok(firstBot);assert.equal(firstBot.connected,true);assert.equal(lobby.maxPlayers,10);assert.notEqual(lobby.hostId,firstBot.id);
  assert.equal(firstBot.cardCount,0);assert.equal(firstBot.token,undefined);assert.equal(firstBot.hand,undefined);
  assert.equal((await action(guest,'remove-bot',{targetId:firstBot.id})).status,400,'only the host removes bots');
  assert.equal((await action(host,'remove-bot',{targetId:guest.id})).status,400,'bot controls cannot remove a human');
  assert.equal((await action(host,'remove-bot',{targetId:firstBot.id})).status,200);
  assert.equal((await roomState(host)).players.length,2);
  assert.equal((await action(host,'add-bot')).status,200);
  lobby=await roomState(host);const playingBot=lobby.players.find(player=>player.bot);
  assert.equal((await action(host,'start')).status,200);
  assert.equal((await action(host,'add-bot')).status,400,'bots cannot be added mid-round');
  assert.equal((await action(host,'remove-bot',{targetId:playingBot.id})).status,400,'bots cannot be removed mid-round');
  const managementRoom=rooms.get(host.code);managementRoom.status='finished';managementRoom.turn=null;
  assert.equal((await action(host,'remove-bot',{targetId:playingBot.id})).status,200,'bots can be removed after a round');
  assert.equal((await action(host,'add-bot')).status,200,'bots can be added after a round');

  created=await post('/api/create',{name:'Capacity host'});assert.equal(created.status,200);const capacityHost=created.body;
  for (let i=1;i<=4;i++) assert.equal((await post('/api/join',{code:capacityHost.code,name:`Human ${i}`})).status,200);
  for (let i=0;i<5;i++) assert.equal((await action(capacityHost,'add-bot')).status,200);
  const fullRoom=await roomState(capacityHost);assert.equal(fullRoom.players.length,10);assert.equal(fullRoom.players.filter(player=>player.bot).length,5);
  assert.equal((await action(capacityHost,'add-bot')).status,400,'an eleventh bot is rejected');
  assert.equal((await post('/api/join',{code:capacityHost.code,name:'Eleventh human'})).status,400,'an eleventh human is rejected');
  assert.equal((await action(capacityHost,'remove-bot',{targetId:fullRoom.players.find(player=>player.bot).id})).status,200);
  assert.equal((await post('/api/join',{code:capacityHost.code,name:'Replacement human'})).status,200,'removing a bot opens a human seat');
  assert.equal((await roomState(capacityHost)).players.length,10);

  created=await post('/api/create',{name:'Solo tester'});assert.equal(created.status,200);const solo=created.body;
  assert.equal((await action(solo,'add-bot')).status,200);
  assert.equal((await action(solo,'start')).status,200,'one human plus one bot can start');
  const autoRoom=rooms.get(solo.code);const human=autoRoom.players.find(player=>!player.bot);const autoBot=autoRoom.players.find(player=>player.bot);
  assert.equal(autoRoom.players.length,2);assert.equal(human.hand.length,7);assert.equal(autoBot.hand.length,7);
  // Give the scheduler a controlled legal move, so this check does not depend on the random deal.
  autoRoom.turn=human.id;autoRoom.pending=null;autoRoom.choice=null;autoRoom.roulette=null;autoRoom.mustPlayId=null;autoRoom.unoWindow=null;
  autoRoom.discard=[card('red','2')];autoRoom.color='red';
  human.hand=[card('red','5'),card('blue','1')];autoBot.hand=[card('red','4'),card('green','1')];
  assert.equal((await action(solo,'play',{cardId:human.hand[0].id})).status,200);
  await waitFor(()=>autoRoom.turn===human.id && autoRoom.discard.at(-1).kind==='4','bot did not take its scheduled turn after the human move');
  assert.equal(autoBot.hand.length,1);assert.equal(autoRoom.unoWindow,null);assert.ok(autoRoom.events.some(e=>e.message.includes('called UNO')));
  const soloState=await roomState(solo);assert.equal(soloState.players.find(player=>player.bot).cardCount,1);assert.equal(soloState.hand.length,1);

  created=await post('/api/create',{name:'Departing tester'});assert.equal(created.status,200);const departing=created.body;
  assert.equal((await action(departing,'add-bot')).status,200);assert.equal((await action(departing,'add-bot')).status,200);
  assert.equal((await action(departing,'start')).status,200);
  const departingRoom=rooms.get(departing.code);const departingHuman=departingRoom.players.find(player=>!player.bot);
  departingRoom.turn=departingHuman.id;departingRoom.pending=null;departingRoom.choice=null;departingRoom.roulette=null;departingRoom.mustPlayId=null;departingRoom.unoWindow=null;
  departingRoom.discard=[card('red','2')];departingRoom.color='red';departingHuman.hand=[card('red','5'),card('blue','1')];
  for (const bot of departingRoom.players.filter(player=>player.bot)) bot.hand=[card('red','4'),card('green','1')];
  assert.equal((await action(departing,'play',{cardId:departingHuman.hand[0].id})).status,200);
  assert.ok(departingRoom.botTimer,'a bot action is scheduled before the last human leaves');
  assert.equal((await action(departing,'leave')).status,200);
  assert.equal(rooms.has(departing.code),false,'a room with only bots is removed');
  assert.equal(departingRoom.botTimer,null,'last human departure clears the scheduled bot action');
  assert.equal((await fetch(base+`/api/state?room=${departing.code}&token=${departing.token}`)).status,401,'the abandoned room cannot be accessed');

  let a=await fetch(base+'/api/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Alice'})});assert.equal(a.status,200);a=await a.json();
  let b=await fetch(base+'/api/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:a.code,name:'Bob'})});assert.equal(b.status,200);b=await b.json();
  let s=await(await fetch(base+`/api/state?room=${a.code}&token=${a.token}`)).json();assert.equal(s.players.length,2);
  const abortA = new AbortController(), abortB = new AbortController();
  const eventsA = await fetch(base+`/api/events?room=${a.code}&token=${a.token}`,{signal:abortA.signal});
  const eventsB = await fetch(base+`/api/events?room=${b.code}&token=${b.token}`,{signal:abortB.signal});
  assert.match(eventsA.headers.get('content-type'),/text\/event-stream/);
  assert.match(eventsB.headers.get('content-type'),/text\/event-stream/);
  const readA = eventsA.body.getReader(), readB = eventsB.body.getReader();
  const firstA = await readA.read(), firstB = await readB.read();
  assert.match(new TextDecoder().decode(firstA.value),/event: state/);
  assert.match(new TextDecoder().decode(firstB.value),/event: state/);
  let start=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:a.code,token:a.token,type:'start'})});assert.equal(start.status,200);
  const sa=await(await fetch(base+`/api/state?room=${a.code}&token=${a.token}`)).json();
  const sb=await(await fetch(base+`/api/state?room=${b.code}&token=${b.token}`)).json();
  assert.equal(sa.hand.length,7);assert.equal(sb.hand.length,7);assert.notDeepEqual(sa.hand.map(c=>c.id),sb.hand.map(c=>c.id),'hands are private');
  assert.equal(sa.players[1].cardCount,7);
  const realtimeEvent = await Promise.race([readA.read(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Real-time event timeout')),2000))]);
  assert.match(new TextDecoder().decode(realtimeEvent.value),/\"status\":\"playing\"|event: state/);
  abortA.abort();abortB.abort();
  console.log('Game rules, bots, ten-player capacity, private hands, real-time updates, and room API tests passed.');
 }catch(e){console.error(e);process.exitCode=1;}finally{await new Promise(resolve=>server.close(resolve));}
})();
