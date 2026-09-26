'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const digest = value => crypto.createHash('sha256').update(String(value)).digest();
const equal = (a, b) => crypto.timingSafeEqual(digest(a || ''), digest(b || ''));
const IDLE_LOCK_MS = 60 * 60 * 1000;
const SESSION_MS = 8 * 60 * 60 * 1000;

module.exports = function createAdmin({ app, io, calls, controls, archive, env = process.env, now = Date.now }) {
  const key = env.ADMIN_KEY || '';
  const configured = /^[A-Za-z0-9_-]{32,128}$/.test(key);
  const sessions = new Map(), attempts = new Map(), roomStats = new Map(), members = new Map(), audit = [];
  const startedAt = now(), attemptSalt = crypto.randomBytes(32);
  const totals = { joins: 0, text: 0, photo: 0, voice: 0, audioFrames: 0, videoFrames: 0, relayBytes: 0, moderationActions: 0 };
  let globalFailures = { at: now(), count: 0 };
  const membersIn = room => [...io.sockets.sockets.values()].filter(s => s.room === room && s.username);
  function log(action, room = '', detail = '') {
    audit.unshift({ id: crypto.randomUUID(), at: now(), action, room, detail: String(detail).slice(0, 180) });
    if (audit.length > 200) audit.pop();
  }
  function info(room) {
    if (!roomStats.has(room)) roomStats.set(room, { room, instanceId: crypto.randomUUID(), createdAt: now(), lastActivityAt: now(), lockedUntil: 0, text: 0, photo: 0, voice: 0, audioFrames: 0, videoFrames: 0, relayBytes: 0 });
    const r = roomStats.get(room);
    if (r.lockedUntil && r.lockedUntil <= now()) {
      r.lockedUntil = 0; io.to(room).emit('system-message', { text: 'The temporary admin entry lock expired.' });
      log('lock_expired', room);
    }
    return r;
  }
  function pruneRoom(room) {
    const r = roomStats.get(room);
    if (r && !membersIn(room).length && (!r.lockedUntil || r.lockedUntil <= now())) roomStats.delete(room);
  }
  function presence(socket, status, signal = true) {
    const m = members.get(socket.id); if (!m) return;
    if (m.state !== status) {
      m[m.state === 'active' ? 'activeMs' : 'awayMs'] += Math.max(0, now() - m.stateSince);
      m.state = status; m.stateSince = now();
    }
    if (signal) m.lastSignalAt = now();
  }
  function joined(socket) {
    const r = info(socket.room); r.lastActivityAt = now(); totals.joins++;
    members.set(socket.id, { id: socket.id, room: socket.room, username: socket.username, isAdmin: Boolean(socket.isAdmin), joinedAt: now(), stateSince: now(), state: 'active', activeMs: 0, awayMs: 0, lastSignalAt: now(), lastActionAt: now(), messages: 0 });
    log(socket.isAdmin ? 'admin_joined' : 'member_joined', socket.room, socket.username);
  }
  function left(socket, room = socket.room) {
    const m = members.get(socket.id);
    if (m) log(m.isAdmin ? 'admin_left' : 'member_left', room, m.username);
    members.delete(socket.id); pruneRoom(room);
  }
  function activity(socket, type, bytes = 0, recipientCount = 0) {
    if (!socket.room) return;
    const r = info(socket.room); r.lastActivityAt = now();
    if (Object.hasOwn(r, type) && typeof r[type] === 'number') { r[type]++; totals[type]++; }
    const out = Math.max(0, Number(bytes) || 0) * Math.max(0, recipientCount);
    r.relayBytes += out; totals.relayBytes += out;
    const m = members.get(socket.id);
    if (m && ['text', 'photo', 'voice'].includes(type)) { m.messages++; m.lastActionAt = now(); }
  }
  function size(data) { return typeof data === 'string' ? Buffer.byteLength(data) : Buffer.isBuffer(data) ? data.length : (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) ? data.byteLength : 0; }
  function secure(req) { return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || Boolean(req.socket?.encrypted); }
  function local(req) { const host = String(req.headers.host || '').split(':')[0]; return ['localhost', '127.0.0.1'].includes(host) && env.RENDER !== 'true' && env.NODE_ENV !== 'production'; }
  function cookieName(req) { return secure(req) ? '__Host-tempchat_admin' : 'tempchat_admin_local'; }
  function sessionFrom(req) {
    if (!configured || (!secure(req) && !local(req))) return null;
    const name = cookieName(req); let value = '';
    for (const part of String(req.headers.cookie || '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) value = v.join('='); }
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
    const id = digest(value).toString('hex'), s = sessions.get(id);
    if (!s || s.expiresAt <= now()) { if (s) revoke(id); return null; }
    return { id, ...s };
  }
  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return false;
    try { return new URL(origin).origin === `${secure(req) ? 'https' : 'http'}://${req.headers.host}`; } catch (_) { return false; }
  }
  function revoke(id) {
    const s = sessions.get(id); if (!s) return;
    clearTimeout(s.timer); sessions.delete(id);
    for (const socket of io.sockets.sockets.values()) if (socket.isAdmin && socket.adminSessionId === id) controls.eject(socket, 'Admin login ended or expired. Sign in again to moderate.');
  }
  function setCookie(req, res, token, seconds) {
    res.setHeader('Set-Cookie', `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure(req) ? '; Secure' : ''}`);
  }
  function headers(_req, res, next) {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'" }); next();
  }
  function requireAuth(req, res, next) {
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site access denied.' });
    const session = sessionFrom(req);
    if (!session) return res.status(401).json({ error: 'Admin login required.' });
    req.admin = session; next();
  }
  function requireWrite(req, res, next) {
    if (!sameOrigin(req) || !equal(req.headers['x-csrf-token'], req.admin.csrf)) return res.status(403).json({ error: 'Invalid origin or request token. Reload the admin panel.' });
    next();
  }
  const router = express.Router(); router.use(headers); router.use(express.json({ limit: '4kb' }));
  router.get('/session', (req, res) => {
    const s = sessionFrom(req);
    res.json(s ? { authenticated: true, csrf: s.csrf, expiresAt: s.expiresAt } : { authenticated: false, configured });
  });
  router.post('/login', (req, res) => {
    if (!sameOrigin(req) || (!secure(req) && !local(req))) return res.status(403).json({ error: 'Use the same-origin HTTPS admin page.' });
    if (!configured) return res.status(503).json({ error: 'Admin access is not configured. Set a generated ADMIN_KEY in the TempChat service environment.' });
    const ipKey = crypto.createHmac('sha256', attemptSalt).update(String(req.socket.remoteAddress || 'unknown')).digest('hex');
    let a = attempts.get(ipKey);
    if (!a || now() - a.at > 10 * 60 * 1000) {
      a = { at: now(), count: 0 };
      if (attempts.size >= 2048) attempts.delete(attempts.keys().next().value);
      attempts.set(ipKey, a);
    }
    if (now() - globalFailures.at > 10 * 60 * 1000) globalFailures = { at: now(), count: 0 };
    if (a.count >= 10 || globalFailures.count >= 100) { res.set('Retry-After', '600'); return res.status(429).json({ error: 'Too many failed attempts. Wait 10 minutes before trying again.' }); }
    const supplied = req.body?.key;
    if (typeof supplied !== 'string' || supplied.length > 256 || !equal(supplied, key)) {
      a.count++; globalFailures.count++; return res.status(401).json({ error: 'Invalid admin key.' });
    }
    attempts.delete(ipKey);
    const previous = sessionFrom(req); if (previous) revoke(previous.id);
    if (sessions.size >= 20) revoke(sessions.keys().next().value);
    const token = crypto.randomBytes(32).toString('base64url'), id = digest(token).toString('hex');
    const session = { csrf: crypto.randomBytes(24).toString('base64url'), expiresAt: now() + SESSION_MS };
    session.timer = setTimeout(() => revoke(id), SESSION_MS); session.timer.unref?.(); sessions.set(id, session);
    setCookie(req, res, token, SESSION_MS / 1000); log('admin_login');
    res.json({ ok: true, csrf: session.csrf, expiresAt: session.expiresAt });
  });
  router.post('/logout', requireAuth, requireWrite, (req, res) => { revoke(req.admin.id); setCookie(req, res, '', 0); log('admin_logout'); res.json({ ok: true }); });
  router.get('/snapshot', requireAuth, (req, res) => {
    const current = now();
    for (const room of roomStats.keys()) { info(room); pruneRoom(room); }
    const live = [...roomStats.values()].map(r => {
      const people = membersIn(r.room).map(s => {
        const m = members.get(s.id); const peer = calls.get(r.room)?.get(s.id);
        return { id: s.id, username: s.username, isAdmin: Boolean(s.isAdmin), state: m?.state || s.presenceStatus || 'away', joinedAt: m?.joinedAt || current,
          activeMs: (m?.activeMs || 0) + (m?.state === 'active' ? current - m.stateSince : 0),
          awayMs: (m?.awayMs || 0) + (m?.state === 'away' ? current - m.stateSince : 0),
          lastSignalAt: m?.lastSignalAt || null, lastActionAt: m?.lastActionAt || null, messages: m?.messages || 0,
          inCall: Boolean(peer), camera: Boolean(peer?.videoEnabled), mic: Boolean(peer?.audioEnabled) };
      });
      return { ...r, members: people, callCount: calls.get(r.room)?.size || 0, locked: r.lockedUntil > current };
    }).sort((a, b) => b.members.length - a.members.length || b.lastActivityAt - a.lastActivityAt);
    const people = live.flatMap(r => r.members);
    res.json({ serverNow: current, startedAt, uptimeSeconds: Math.floor(process.uptime()), memoryMB: Math.round(process.memoryUsage().rss / 1048576),
      totals: { ...totals }, live: { rooms: live.length, members: people.length, active: people.filter(p => p.state === 'active').length, away: people.filter(p => p.state !== 'active').length, callRooms: live.filter(r => r.callCount).length, admins: people.filter(p => p.isAdmin).length },
      rooms: live.slice(0, 500), truncated: live.length > 500, audit: audit.slice(0, 100), sessionExpiresAt: req.admin.expiresAt, notificationMode: 'joined-page-only' });
  });
  router.post('/action', requireAuth, requireWrite, (req, res) => {
    const { action, socketId, confirmation } = req.body || {};
    const room = typeof req.body?.room === 'string' ? req.body.room.trim().toUpperCase().slice(0, 24) : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 160) : '';
    if (!room || !roomStats.has(room)) return res.status(404).json({ error: 'Room no longer exists. Refresh the panel.' });
    if (!['lock', 'unlock', 'kick', 'clear', 'end-call', 'close-room'].includes(action)) return res.status(400).json({ error: 'Unsupported moderation action.' });
    if (['clear', 'end-call', 'close-room'].includes(action) && confirmation !== room) return res.status(400).json({ error: 'Type the exact room code to confirm this action.' });
    const r = info(room);
    if (req.body?.roomInstanceId !== r.instanceId) return res.status(409).json({ error: 'This room instance changed. Refresh before moderating it.' });
    if (action === 'lock' || action === 'unlock') {
      r.lockedUntil = action === 'lock' ? now() + IDLE_LOCK_MS : 0;
      io.to(room).emit('system-message', { text: (action === 'lock' ? 'Admin locked new room entry for up to one hour. Existing members can continue.' : 'Admin unlocked room entry.') + (reason ? ' Reason: ' + reason : '') });
    } else if (action === 'kick') {
      const target = io.sockets.sockets.get(socketId);
      if (!target || target.room !== room) return res.status(404).json({ error: 'This session already left the room.' });
      const name = target.username;
      controls.eject(target, reason || 'Your session was removed by Admin.');
      io.to(room).emit('system-message', { text: `Admin removed ${name} from the room.${reason ? ' Reason: ' + reason : ''}` });
      log('session_removed', room, `${name} · ${reason || 'No reason provided'}`);
    } else if (action === 'clear') {
      controls.clear(room); io.to(room).emit('system-message', { text: 'Admin cleared the room chat and shared appearance.' + (reason ? ' Reason: ' + reason : '') });
    } else if (action === 'end-call') {
      controls.endCall(room); io.to(room).emit('system-message', { text: 'Admin ended this room’s call.' + (reason ? ' Reason: ' + reason : '') });
    } else if (action === 'close-room') {
      r.lockedUntil = now() + IDLE_LOCK_MS; controls.clear(room); controls.endCall(room);
      for (const s of membersIn(room)) controls.eject(s, 'Admin closed this room. Entry is locked for up to one hour.' + (reason ? ' Reason: ' + reason : ''));
    }
    totals.moderationActions++;
    if (action !== 'kick') log(action.replace(/-/g, '_'), room, reason);
    res.json({ ok: true });
  });
  if (archive) require('./archive-routes')(router, archive, requireAuth, requireWrite, req => Boolean(sessionFrom(req)));
  router.use((_req, res) => res.status(404).json({ error: 'Unknown admin endpoint.' }));
  router.use((error, _req, res, _next) => res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Invalid admin request.' }));
  app.use('/api/admin', router);
  app.get(['/admin', '/admin/'], headers, (_req, res) => res.sendFile(path.join(__dirname, '..', 'admin', 'index.html')));
  for (const file of ['admin.js', 'admin.css', 'archive-viewer.js', 'archive-viewer.css']) app.get('/admin-assets/' + file, headers, (_req, res) => res.sendFile(path.join(__dirname, '..', 'admin', file)));
  const cleanup = setInterval(() => {
    for (const [id, s] of sessions) if (s.expiresAt <= now()) revoke(id);
    for (const [id, a] of attempts) if (now() - a.at > 600000) attempts.delete(id);
    for (const room of roomStats.keys()) { info(room); pruneRoom(room); }
  }, 30000); cleanup.unref?.();
  return {
    joined, left, presence, activity, size,
    roomInstance(room) { return info(room).instanceId; },
    canJoin(room) { const r = roomStats.get(room); return !r || info(room).lockedUntil <= now(); },
    authorizeSocket(socket) {
      const req = { headers: socket.handshake.headers, socket: socket.request?.socket || socket.conn?.request?.socket || {} };
      if (req.headers.origin ? !sameOrigin(req) : req.headers['sec-fetch-site'] !== 'same-origin') return null;
      return sessionFrom(req);
    },
    close() { clearInterval(cleanup); for (const s of sessions.values()) clearTimeout(s.timer); },
  };
};
