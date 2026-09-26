'use strict';
// Quick delete, private-room approval fixes and named chat clears.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const { once } = require('node:events');
let server, base, sockets = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
function event(s, name, predicate = () => true, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { s.off(name, listener); reject(new Error(`Timeout: ${name}`)); }, ms);
    const listener = d => { if (predicate(d)) { clearTimeout(timeout); s.off(name, listener); resolve(d); } };
    s.on(name, listener);
  });
}
function never(s, name, ms = 700) {
  return new Promise((resolve, reject) => {
    const listener = d => { clearTimeout(t); s.off(name, listener); reject(new Error(`Unexpected ${name}: ${JSON.stringify(d).slice(0, 120)}`)); };
    const t = setTimeout(() => { s.off(name, listener); resolve(); }, ms);
    s.on(name, listener);
  });
}
async function connect() { const s = io(base, { transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(s); await event(s, 'connect'); return s; }
async function joinFull(room, username, opts = {}) {
  const s = await connect();
  const readyP = event(s, 'room-ready'), historyP = event(s, 'room-history'), infoP = event(s, 'room-info');
  s.emit('join-room', { room, username, ...opts });
  return { s, ready: await readyP, history: (await historyP).entries, info: await infoP };
}
const sendText = async (s, text) => { const p = event(s, 'chat-message'); s.emit('send-message', { message: text, clientId: 'x' }); return p; };
const device = n => 'device_' + String(n).padStart(20, '0');

before(async () => {
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, ARCHIVE_DATABASE_URL: '', ARCHIVE_ENCRYPTION_KEY: '', ARCHIVE_CLEANUP_TOKEN: '', PORT: '0', TEMPCHAT_QD_BASE_MS: '300' }, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    server.stdout.on('data', data => { const m = String(data).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve(`http://127.0.0.1:${m[1]}`); } });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
});
after(async () => { sockets.forEach(s => s.disconnect()); if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); } });

test('private room: a second tab on an approved device still needs approval; a member reconnecting with the room key does not', async () => {
  const a = await joinFull('LOCK1', 'Alpha', { visibility: 'private', deviceId: device(1) });
  assert.equal(a.info.visibility, 'private');
  // Bravo joins by code from device 2 and is approved.
  const b = await connect(); const req = event(a.s, 'join-request');
  b.emit('join-room', { room: 'LOCK1', username: 'Bravo', deviceId: device(2) });
  const pending = await event(b, 'join-pending'); assert.equal(pending.memberCount, 1);
  const r = await req; const bReady = event(b, 'room-ready'), bInfoP = event(b, 'room-info', i => i.memberCount === 2);
  a.s.emit('join-vote', { id: r.id, approve: true }); await bReady; const bInfo = await bInfoP;
  // Another tab on Bravo's device (same deviceId) must NOT slip in: everyone present gets asked.
  const c = await connect(); const reqA = event(a.s, 'join-request'), reqB = event(b, 'join-request');
  c.emit('join-room', { room: 'LOCK1', username: 'Charlie', deviceId: device(2) });
  const p2 = await event(c, 'join-pending'); assert.equal(p2.memberCount, 2);
  const [ra, rb] = await Promise.all([reqA, reqB]); assert.equal(ra.id, rb.id);
  await never(c, 'room-ready');
  // The requester sees progress after the first approval, and is not admitted until both approve.
  const progress = event(c, 'join-pending', d => d.approved === 1);
  a.s.emit('join-vote', { id: ra.id, approve: true }); assert.equal((await progress).memberCount, 2);
  await never(c, 'room-ready');
  const cReady = event(c, 'room-ready'); b.emit('join-vote', { id: rb.id, approve: true }); await cReady;
  // Bravo's page reconnects (new socket) carrying its own copy of the room key: admitted without any approval prompt.
  const b2 = await connect(); const noPrompt = never(a.s, 'join-request');
  const ready2 = event(b2, 'room-ready');
  b2.emit('join-room', { room: 'LOCK1', username: 'Bravo', deviceId: device(2), inviteToken: bInfo.inviteToken });
  await ready2; await noPrompt;
  // Nobody is labelled as the creator anywhere in room info.
  for (const key of Object.keys(bInfo)) assert.ok(!/creator|owner|host/i.test(key), key);
});

test('a join approval completes when the only member who had not voted leaves the room', async () => {
  const a = await joinFull('LOCK2', 'Alpha', { visibility: 'private', deviceId: device(3) });
  const b = await joinFull('LOCK2', 'Bravo', { deviceId: device(4), inviteToken: a.info.inviteToken });
  const c = await connect(); const reqA = event(a.s, 'join-request'), reqB = event(b.s, 'join-request');
  c.emit('join-room', { room: 'LOCK2', username: 'Charlie', deviceId: device(5) });
  await event(c, 'join-pending'); const [ra] = await Promise.all([reqA, reqB]);
  a.s.emit('join-vote', { id: ra.id, approve: true });
  await never(c, 'room-ready');
  const cReady = event(c, 'room-ready'), infoP = event(c, 'room-info', i => i.memberCount === 2);
  b.s.emit('leave-room', {}); // Bravo never voted; leaving removes the need for his approval
  assert.equal((await cReady).room, 'LOCK2');
  const info = await infoP;
  assert.equal(info.visibility, 'private', 'the room stays private after the creator-era member left');
});

test('quick delete is a creation choice that survives the creator leaving; public rooms are untouched', async () => {
  const plain = await joinFull('QDOFF', 'Solo', {});
  assert.equal(plain.info.quickDelete, false);
  const m = await sendText(plain.s, 'stays'); assert.equal(m.expireAfter, null);
  const a = await joinFull('QDON', 'Alpha', { name: 'Fast room', quickDelete: true, deviceId: device(6) });
  assert.equal(a.info.quickDelete, true); assert.equal(a.info.name, 'Fast room');
  const b = await joinFull('QDON', 'Bravo', { quickDelete: false, deviceId: device(7) });
  assert.equal(b.info.quickDelete, true, 'a later joiner cannot switch it off');
  a.s.emit('leave-room', {});
  const c = await joinFull('QDON', 'Charlie', { quickDelete: false, deviceId: device(8) });
  assert.equal(c.info.quickDelete, true, 'still on after the person who created the room left');
  assert.equal(c.info.name, 'Fast room');
});

test('quick delete: sender copy and history entry go after everyone present has seen it, timed by length', async () => {
  const a = await joinFull('QD1', 'Alpha', { quickDelete: true, deviceId: device(9) });
  const b = await joinFull('QD1', 'Bravo', { deviceId: device(10) });
  const c = await joinFull('QD1', 'Charlie', { deviceId: device(11) });
  const gotB = event(b.s, 'chat-message'), gotC = event(c.s, 'chat-message');
  const msg = await sendText(a.s, 'short');
  assert.equal(msg.expireAfter, 300, 'base time for a short text');
  const long = await sendText(a.s, 'x'.repeat(1500)); assert.equal(long.expireAfter, 2700, 'longest text gets 9x the base time');
  await Promise.all([gotB, gotC]);
  // Only Bravo has seen it: no countdown yet.
  b.s.emit('qd-seen', { ids: [msg.id] });
  await never(a.s, 'qd-countdown', 400);
  // Late joiner receives it from history while it is alive, and counts as someone who must see it.
  const d = await joinFull('QD1', 'Delta', { deviceId: device(12) });
  assert.ok(d.history.some(h => h.id === msg.id && h.expireAfter === 300));
  c.s.emit('qd-seen', { ids: [msg.id] });
  await never(a.s, 'qd-countdown', 400);
  const countdown = event(a.s, 'qd-countdown', x => x.id === msg.id);
  d.s.emit('qd-seen', { ids: [msg.id] });
  assert.equal((await countdown).ms, 300);
  const expired = await Promise.all([a.s, b.s, c.s, d.s].map(s => event(s, 'message-expired', x => x.id === msg.id)));
  assert.equal(expired.length, 4);
  const e = await joinFull('QD1', 'Echo', { deviceId: device(13) });
  assert.ok(!e.history.some(h => h.id === msg.id), 'expired message is gone from late-join history');
  assert.ok(e.history.some(h => h.id === long.id), 'unseen long message is still there');
  // A recipient who leaves no longer blocks the sender's countdown.
  const cd2 = event(a.s, 'qd-countdown', x => x.id === long.id);
  for (const s of [b.s, c.s, d.s]) s.emit('qd-seen', { ids: [long.id] });
  await never(a.s, 'qd-countdown', 400);
  e.s.emit('leave-room', {});
  assert.equal((await cd2).ms, 2700);
});

test('quick delete covers regular photos and voice notes but not view-once photos; reset stops pending timers', async () => {
  const a = await joinFull('QD2', 'Alpha', { quickDelete: true, deviceId: device(14) });
  const b = await joinFull('QD2', 'Bravo', { deviceId: device(15) });
  const photoP = event(b.s, 'single-photo'); a.s.emit('single-photo', { image: 'data:image/jpeg;base64,AAAA', isViewOnce: false, caption: 'keep' });
  assert.equal((await photoP).expireAfter, 450);
  const onceP = event(b.s, 'single-photo'); a.s.emit('single-photo', { image: 'data:image/jpeg;base64,BBBB', isViewOnce: true });
  assert.equal((await onceP).expireAfter, null);
  const voiceP = event(b.s, 'voice-message'); a.s.emit('voice-message', { audio: Buffer.from('abc'), mime: 'audio/webm' });
  const voice = await voiceP; assert.equal(voice.expireAfter, 1350);
  b.s.emit('qd-seen', { ids: [voice.id] });
  await event(a.s, 'qd-countdown', x => x.id === voice.id);
  const cleared = event(b.s, 'clear-chat'), note = event(b.s, 'system-message', m => /cleared the chat/.test(m.text));
  a.s.emit('reset-chat');
  assert.equal((await cleared).by, 'Alpha');
  assert.match((await note).text, /^Alpha cleared the chat for everyone\.$/);
  await never(b.s, 'message-expired', 1600);
});

test('a member vote that is still waiting on someone completes when that person leaves', async () => {
  const a = await joinFull('EV1', 'Alpha', { deviceId: device(16) });
  const b = await joinFull('EV1', 'Bravo', { deviceId: device(17) });
  const c = await joinFull('EV1', 'Charlie', { deviceId: device(18) });
  const d = await joinFull('EV1', 'Delta', { deviceId: device(19) });
  const reqB = event(b.s, 'evict-request');
  a.s.emit('evict-request', { targetId: d.ready.selfId, reason: 'spam' });
  const r = await reqB;
  b.s.emit('evict-vote', { id: r.id, approve: true });
  await never(d.s, 'moderation-exit', 500);
  const exit = event(d.s, 'moderation-exit');
  c.s.emit('leave-room', {}); // Charlie leaves without voting: Alpha + Bravo are now everyone
  assert.match((await exit).reason, /removed you/); assert.ok(!/hour/i.test((await exit).reason), 'no duration is revealed');
  const again = await connect(); const err = event(again, 'join-error');
  again.emit('join-room', { room: 'EV1', username: 'DeltaAgain', deviceId: device(19) });
  assert.match((await err).error, /cannot rejoin/); assert.ok(!/hour/i.test((await err).error));
});
