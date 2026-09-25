'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const { once } = require('node:events');
let server, base, sockets = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
function event(s, name, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { s.off(name, listener); reject(new Error(`Timeout: ${name}`)); }, 5000);
    const listener = d => { if (predicate(d)) { clearTimeout(timeout); s.off(name, listener); resolve(d); } };
    s.on(name, listener);
  });
}
async function connect(room, username) {
  const s = io(base, { transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(s);
  await event(s, 'connect');
  const ready = event(s, 'room-ready'); s.emit('join-room', { room, username }); await ready; return s;
}
const ack = (s, name, data) => new Promise((resolve, reject) => s.timeout(4000).emit(name, data, (err, reply) => err ? reject(err) : resolve(reply)));
async function message(s, text = 'hello') { const p = event(s, 'chat-message'); s.emit('send-message', { message: text, clientId: 'test-id' }); return p; }
before(async () => {
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    server.stdout.on('data', data => { const m = String(data).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve(`http://127.0.0.1:${m[1]}`); } });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
});
after(async () => { sockets.forEach(s => s.disconnect()); if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); } });

test('group receipts use socket identity, exclude late arrivals and isolate rooms', async () => {
  const a = await connect('RECEIPTS', 'SameName'), b = await connect('RECEIPTS', 'SameName'), c = await connect('ELSEWHERE', 'Outsider');
  let leaked = false; c.on('chat-message', () => leaked = true);
  const received = event(b, 'chat-message'); const msg = await message(a); await received;
  assert.equal(msg.recipientCount, 1); assert.equal(msg.senderId, a.id);
  const late = await connect('RECEIPTS', 'Late');
  const statuses = []; a.on('message-status', d => statuses.push(d));
  const delivered = event(a, 'message-status', d => d.id === msg.id && d.recipients[0].delivered);
  b.emit('message-receipts', { ids: [msg.id], kind: 'delivered' }); await delivered;
  c.emit('message-receipts', { ids: [msg.id], kind: 'seen' }); late.emit('message-receipts', { ids: [msg.id], kind: 'seen' });
  await wait(250); assert.equal(statuses.at(-1).recipients[0].seen, false);
  const seen = event(a, 'message-status', d => d.id === msg.id && d.recipients[0].seen);
  b.emit('message-receipts', { ids: [msg.id], kind: 'seen' }); const result = await seen;
  assert.equal(result.recipients.length, 1); assert.equal(result.recipients[0].id, b.id); assert.equal(leaked, false);
});
test('photos and voice notes have independent receipt IDs', async () => {
  const a = await connect('MEDIA', 'A'), b = await connect('MEDIA', 'B');
  for (const [name, data] of [['voice-message', { audio: Buffer.from([1,2,3]) }], ['single-photo', { id: 'untrusted-id', image: 'data:image/jpeg;base64,/9j/2Q==' }]]) {
    const p = event(b, name); a.emit(name, data); const m = await p;
    assert.equal(m.senderId, a.id); assert.equal(m.recipientCount, 1); assert.notEqual(m.id, 'untrusted-id');
    const r = event(a, 'message-status', d => d.id === m.id && d.recipients[0].seen);
    b.emit('message-receipts', { ids: [m.id], kind: 'seen' }); await r;
  }
});
test('shared theme: binary wallpaper, validation, throttling, late join, empty room cleanup', async () => {
  const a = await connect('THEMES', 'A'), b = await connect('THEMES', 'B');
  let reply = await ack(a, 'set-room-theme', { palette: 'evil', shade: 60, wallpaperAction: 'keep' }); assert.ok(reply.error);
  reply = await ack(a, 'set-room-theme', { palette: 'ocean', shade: 60, wallpaperAction: 'replace', wallpaper: Buffer.alloc(230*1024) }); assert.ok(reply.error);
  const jpeg = Buffer.from([255,216,255,217]); const p = event(b, 'room-theme');
  assert.equal((await ack(a, 'set-room-theme', { palette: 'ocean', shade: 55, wallpaperAction: 'replace', wallpaper: jpeg })).ok, true);
  const shared = await p; assert.equal(shared.palette, 'ocean'); assert.deepEqual(Buffer.from(shared.wallpaper), jpeg);
  assert.ok((await ack(a, 'set-room-theme', { palette: 'rose', shade: 55, wallpaperAction: 'keep' })).error);
  const c = io(base, { transports: ['websocket'], forceNew: true }); sockets.push(c); await event(c, 'connect');
  const inherited = event(c, 'room-theme'); c.emit('join-room', { room: 'THEMES', username: 'C' }); assert.equal((await inherited).palette, 'ocean');
  const change = event(a, 'room-theme'); await ack(b, 'set-room-theme', { palette: 'forest', shade: 40, wallpaperAction: 'keep' });
  assert.equal(Object.hasOwn(await change, 'wallpaper'), false, 'do not retransmit wallpaper for palette-only changes');
  const ids = [a.id,b.id,c.id]; [a,b,c].forEach(s => s.disconnect()); await wait(100);
  const d = io(base, { transports: ['websocket'], forceNew: true }); sockets.push(d); await event(d, 'connect');
  const fresh = event(d, 'room-theme'); d.emit('join-room', { room: 'THEMES', username: 'D' }); const reset = await fresh;
  assert.equal(reset.palette, 'gold'); assert.equal(reset.wallpaper, null);
});
test('reset clears receipts and shared wallpaper', async () => {
  const a = await connect('RESET', 'A'), b = await connect('RESET', 'B'); const msg = await message(a); await wait(50);
  await ack(a, 'set-room-theme', { palette:'rose', shade:60, wallpaperAction:'keep' });
  const theme = event(b, 'room-theme', d => d.palette === 'gold'), cleared = event(b, 'clear-chat');
  a.emit('reset-chat'); assert.equal((await theme).palette, 'gold'); await cleared;
  let updated = false; a.on('message-status', () => updated = true); b.emit('message-receipts', { ids:[msg.id], kind:'seen' }); await wait(300); assert.equal(updated,false);
});
test('existing calls relay media only to active participants; presence and typing still work', async () => {
  const a = await connect('CALLS','A'), b = await connect('CALLS','B'), watcher = await connect('CALLS','Watcher');
  const presence = event(a,'presence-update', people => people.length === 3); a.emit('presence-update','active'); await presence;
  const typing = event(b,'user-typing'); a.emit('typing'); assert.equal((await typing).username,'A');
  a.emit('call-start',{callType:'audio'}); b.emit('call-join',{callType:'audio'}); await wait(80);
  let leaked = false; watcher.on('audio-pcm', () => leaked = true);
  const audio = event(b,'audio-pcm'); a.emit('audio-pcm',{pcm:Buffer.from([0,0,1,0]),sampleRate:16000}); assert.equal((await audio).from,a.id);
  await wait(80); assert.equal(leaked,false);
});

test('reply quotes are canonical, room-scoped and cannot impersonate original author',async()=>{
 const a=await connect('REPLIES','Alpha'),b=await connect('REPLIES','Beta'),x=await connect('OTHERREPLY','X');
 const original=await message(a,'Original text');
 const response=event(a,'chat-message',d=>d.message==='Reply text');
 b.emit('send-message',{message:'Reply text',replyTo:original.id,reply:{username:'Fake',text:'Forged'}});
 const m=await response;assert.equal(m.reply.username,'Alpha');assert.equal(m.reply.text,'Original text');assert.equal(m.reply.id,original.id);
 const rejected=event(x,'message-rejected');x.emit('send-message',{clientId:'bad',message:'Cross-room attempt',replyTo:original.id});assert.equal((await rejected).clientId,'bad');
 const late=await connect('REPLIES','Late');const denied=event(late,'message-rejected');late.emit('send-message',{message:'guess',replyTo:original.id});assert.ok((await denied).error);
});
test('reply summaries are bounded; view-once photos do not copy hidden image/caption',async()=>{
 const a=await connect('REPLYMEDIA','A'),b=await connect('REPLYMEDIA','B');
 const original=await message(a,'x'.repeat(300));
 const reply=event(a,'chat-message',d=>d.message==='short');b.emit('send-message',{message:'short',replyTo:original.id});assert.equal((await reply).reply.text.length,180);
 const photo=event(b,'single-photo');a.emit('single-photo',{image:'secret-image-data',caption:'secret caption',isViewOnce:true});const p=await photo;
 const quoted=event(a,'chat-message',d=>d.message==='photo reply');b.emit('send-message',{message:'photo reply',replyTo:p.id});const r=(await quoted).reply;
 assert.equal(r.text,'View-once photo');assert.equal(r.kind,'photo');assert.ok(!JSON.stringify(r).includes('secret'));
 const reset=event(a,'clear-chat');a.emit('reset-chat');await reset;
 const rejected=event(b,'message-rejected');b.emit('send-message',{message:'stale',replyTo:p.id});assert.ok((await rejected).error);
});

test('explicit Exit leaves only one member and never clears the other chat',async()=>{
 const a=await connect('EXITROOM','A'),b=await connect('EXITROOM','B');
 let clearCount=0;b.on('clear-chat',()=>clearCount++);
 const original=await message(a,'Keep this message');
 const leave=event(b,'system-message',d=>d.text==='A left the room.');
 assert.equal((await ack(a,'leave-room',{})).ok,true);await leave;
 const presence=event(b,'presence-update',p=>p.length===1);b.emit('presence-update','active');assert.equal((await presence)[0].username,'B');
 let leaked=false;a.on('chat-message',()=>leaked=true);await message(b,'Still in the room');await wait(80);
 assert.equal(leaked,false);assert.equal(clearCount,0);
 const replied=event(b,'chat-message',d=>d.message==='Reply after A left');b.emit('send-message',{message:'Reply after A left',replyTo:original.id});assert.equal((await replied).reply.text,'Keep this message');
});
test('public push configuration is explicit and no VAPID private key is exposed',async()=>{const res=await fetch(base+'/api/push/config');assert.equal(res.status,200);const cfg=await res.json();assert.equal(typeof cfg.configured,'boolean');assert.equal(Object.hasOwn(cfg,'privateKey'),false);});
