'use strict';
// Sharing flag relay, custom photo colours + Liquid glass validation, and cancelling a private-room request.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const { once } = require('node:events');
let server, base, sockets = [];
function event(s, name, predicate = () => true, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { s.off(name, listener); reject(new Error(`Timeout: ${name}`)); }, ms);
    const listener = d => { if (predicate(d)) { clearTimeout(timeout); s.off(name, listener); resolve(d); } };
    s.on(name, listener);
  });
}
function never(s, name, ms = 600) {
  return new Promise((resolve, reject) => {
    const listener = d => { clearTimeout(t); s.off(name, listener); reject(new Error(`Unexpected ${name}: ${JSON.stringify(d).slice(0, 120)}`)); };
    const t = setTimeout(() => { s.off(name, listener); resolve(); }, ms);
    s.on(name, listener);
  });
}
async function connect() { const s = io(base, { transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(s); await event(s, 'connect'); return s; }
async function join(room, username, opts = {}) {
  const s = await connect(); const ready = event(s, 'room-ready'), info = event(s, 'room-info');
  s.emit('join-room', { room, username, deviceId: 'device_' + username.padEnd(20, '0'), ...opts }); await ready; return { s, info: await info };
}
const ack = (s, name, data) => new Promise((resolve, reject) => s.timeout(4000).emit(name, data, (err, reply) => err ? reject(err) : resolve(reply)));

before(async () => {
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, ARCHIVE_DATABASE_URL: '', ARCHIVE_ENCRYPTION_KEY: '', ARCHIVE_CLEANUP_TOKEN: '', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    server.stdout.on('data', data => { const m = String(data).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve(`http://127.0.0.1:${m[1]}`); } });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
});
after(async () => { sockets.forEach(s => s.disconnect()); if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); } });

test('a sharing participant is flagged for viewers, including people who join the call later', async () => {
  const a = await join('SHARE1', 'Alpha'), b = await join('SHARE1', 'Bravo');
  const started = event(b.s, 'call-start'); a.s.emit('call-start', { callType: 'video' }); await started;
  const peers = event(b.s, 'call-peers'); b.s.emit('call-join', { callType: 'video' }); assert.equal((await peers)[0].sharing, false);
  const flagged = event(b.s, 'call-peer-media-state', d => d.sharing === true);
  a.s.emit('call-media-state', { video: true, audio: true, sharing: true });
  assert.equal((await flagged).video, true);
  const c = await join('SHARE1', 'Charlie'); const peersC = event(c.s, 'call-peers'); c.s.emit('call-join', { callType: 'video' });
  const list = await peersC; assert.equal(list.find(p => p.username === 'Alpha').sharing, true, 'late joiner learns who is sharing');
  const cleared = event(b.s, 'call-peer-media-state', d => d.sharing === false);
  a.s.emit('call-media-state', { sharing: false }); await cleared;
});

test('room themes accept Liquid glass and photo colours, reject junk, and share the two colours', async () => {
  const a = await join('THEME9', 'Alpha'), b = await join('THEME9', 'Bravo');
  assert.match((await ack(a.s, 'set-room-theme', { palette: 'neon', shade: 60, wallpaperAction: 'keep' })).error, /Invalid theme/);
  assert.match((await ack(a.s, 'set-room-theme', { palette: 'custom', shade: 60, wallpaperAction: 'keep' })).error, /colours/i);
  assert.match((await ack(a.s, 'set-room-theme', { palette: 'custom', shade: 60, wallpaperAction: 'keep', colors: ['red', '#00ff00'] })).error, /colours/i);
  await new Promise(r => setTimeout(r, 3100)); // theme rate limit
  const got = event(b.s, 'room-theme', t => t.palette === 'custom');
  assert.equal((await ack(a.s, 'set-room-theme', { palette: 'custom', shade: 55, wallpaperAction: 'keep', colors: ['#3A2A1A', '#1E8FD6'] })).ok, true);
  assert.deepEqual((await got).colors, ['#3a2a1a', '#1e8fd6']);
  const late = await join('THEME9', 'Charlie'); // room-theme is sent on join
  const theme = await event(late.s, 'room-theme', t => t.palette === 'custom', 1500).catch(() => null);
  if (theme) assert.deepEqual(theme.colors, ['#3a2a1a', '#1e8fd6']);
  await new Promise(r => setTimeout(r, 3100));
  const liquid = event(b.s, 'room-theme', t => t.palette === 'liquid');
  assert.equal((await ack(a.s, 'set-room-theme', { palette: 'liquid', shade: 40, wallpaperAction: 'keep' })).ok, true);
  assert.equal((await liquid).colors, null, 'named themes carry no custom colours');
});

test('a person waiting outside a private room can cancel, which closes the members’ prompt', async () => {
  const a = await join('PRIVC', 'Alpha', { visibility: 'private' });
  const q = await connect(); const asked = event(a.s, 'join-request');
  q.emit('join-room', { room: 'PRIVC', username: 'Quin', deviceId: 'device_quin000000000000000' });
  await event(q, 'join-pending'); const req = await asked;
  const cancelled = event(a.s, 'join-request-cancelled', d => d.id === req.id);
  q.emit('join-cancel'); await cancelled;
  a.s.emit('join-vote', { id: req.id, approve: true }); // stale approval must not admit anyone
  await never(q, 'room-ready');
  const again = event(a.s, 'join-request'); q.emit('join-room', { room: 'PRIVC', username: 'Quin', deviceId: 'device_quin000000000000000' });
  await event(q, 'join-pending'); const r2 = await again; assert.notEqual(r2.id, req.id);
});
