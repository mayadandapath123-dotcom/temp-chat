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
async function joinFull(room, username, opts = {}) {
  const s = io(base, { transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(s);
  await event(s, 'connect');
  const readyP = event(s, 'room-ready'), historyP = event(s, 'room-history'), infoP = event(s, 'room-info');
  s.emit('join-room', { room, username, ...opts });
  return { s, ready: await readyP, history: (await historyP).entries, info: await infoP };
}
const sendText = async (s, text) => { const p = event(s, 'chat-message'); s.emit('send-message', { message: text, clientId: 'x' }); return p; };
const ack = (s, name, data) => new Promise((resolve, reject) => s.timeout(4000).emit(name, data, (err, reply) => err ? reject(err) : resolve(reply)));

before(async () => {
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, ARCHIVE_DATABASE_URL: "", ARCHIVE_ENCRYPTION_KEY: "", ARCHIVE_CLEANUP_TOKEN: "", PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    server.stdout.on('data', data => { const m = String(data).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve(`http://127.0.0.1:${m[1]}`); } });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
});
after(async () => { sockets.forEach(s => s.disconnect()); if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); } });

test('first joiner creates a named public room; late joiner gets history and identity', async () => {
  const a = await joinFull('HISTORY', 'Alpha', { name: 'Weekend Hangout', visibility: 'public' });
  assert.equal(a.ready.room, 'HISTORY'); assert.equal(a.info.name, 'Weekend Hangout'); assert.equal(a.info.visibility, 'public');
  await sendText(a.s, 'Earlier topic for latecomers');

  const b = await joinFull('HISTORY', 'Beta');
  assert.ok(b.history.some(e => e.type === 'text' && e.text === 'Earlier topic for latecomers'));
});

test('private room requires unanimous approval by code, but an invite token bypasses it', async () => {
  const a = await joinFull('PRIVATE', 'Host', { name: 'Private Room', visibility: 'private' });
  const token = a.info.inviteToken;
  const b = await joinFull('PRIVATE', 'Member', { inviteToken: token }); // invite link bypasses approval

  // Code-based join needs approval from every member.
  const c = io(base, { transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(c); await event(c, 'connect');
  const reqAP = event(a.s, 'join-request', d => d.requester === 'Stranger');
  const reqBP = event(b.s, 'join-request', d => d.requester === 'Stranger');
  const pendingP = event(c, 'join-pending');
  c.emit('join-room', { room: 'PRIVATE', username: 'Stranger' });
  await pendingP;
  const reqA = await reqAP, reqB = await reqBP;
  assert.equal(reqA.id, reqB.id);

  const denyP = event(c, 'join-error');
  a.s.emit('join-vote', { id: reqA.id, approve: false });
  assert.match((await denyP).error, /declined/i);

  // Second attempt: unanimous approval admits.
  const d = io(base, { transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(d); await event(d, 'connect');
  const req2P = event(a.s, 'join-request', d => d.requester === 'Stranger2');
  const req2bP = event(b.s, 'join-request', d => d.requester === 'Stranger2');
  const pending2P = event(d, 'join-pending');
  d.emit('join-room', { room: 'PRIVATE', username: 'Stranger2' });
  await pending2P;
  const req2 = await req2P, req2b = await req2bP;
  a.s.emit('join-vote', { id: req2.id, approve: true });
  b.s.emit('join-vote', { id: req2b.id, approve: true });
  await event(d, 'room-ready');
});

test('removal vote needs 3+ members, unanimous approval evicts and bans the device for one hour', async () => {
  const a = await joinFull('EVICT', 'A', { deviceId: 'device-aaaaaaaaaaaaaaaaaaaa' });
  const b = await joinFull('EVICT', 'B', { deviceId: 'device-bbbbbbbbbbbbbbbbbbb' });

  // Two members: removal refused.
  const refuse = await ack(a.s, 'evict-request', { targetId: b.s.id, reason: 'spam' });
  assert.match(refuse.error, /at least 3/i);

  const c = await joinFull('EVICT', 'C', { deviceId: 'device-cccccccccccccccccccc' });
  const reqBP = event(b.s, 'evict-request', d => d.targetId === c.s.id);
  const reqAP = event(a.s, 'evict-request', d => d.targetId === c.s.id);
  assert.equal((await ack(a.s, 'evict-request', { targetId: c.s.id, reason: 'spam' })).ok, true);
  const reqB = await reqBP; await reqAP;

  const removed = event(c.s, 'moderation-exit');
  a.s.emit('evict-vote', { id: reqB.id, approve: true });
  b.s.emit('evict-vote', { id: reqB.id, approve: true });
  await removed;

  const banned = io(base, { transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(banned); await event(banned, 'connect');
  const errP = event(banned, 'join-error');
  banned.emit('join-room', { room: 'EVICT', username: 'C-again', deviceId: 'device-cccccccccccccccccccc' });
  assert.match((await errP).error, /one hour/i);

  await joinFull('EVICT', 'C2', { deviceId: 'device-ddddddddddddddddddd' });
});

test('history is cleared on reset and the room closes when the last member leaves', async () => {
  const a = await joinFull('LIFECYCLE', 'Only', { name: 'Temporary', visibility: 'public' });
  await sendText(a.s, 'will be wiped');

  const cleared = event(a.s, 'clear-chat');
  a.s.emit('reset-chat'); await cleared;

  // Fresh member joins the still-open (but empty-history) room.
  const b = await joinFull('LIFECYCLE', 'Second');
  assert.equal(b.history.length, 0);

  // Both leave; room closes; same code becomes a fresh public room.
  await ack(a.s, 'leave-room', {}); await ack(b.s, 'leave-room', {});
  const c = await joinFull('LIFECYCLE', 'Fresh');
  assert.equal(c.info.visibility, 'public'); assert.equal(c.info.name, 'LIFECYCLE');
});
