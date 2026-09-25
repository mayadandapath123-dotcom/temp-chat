'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const webpush = require('web-push');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const MAX_AGE = 24 * 60 * 60 * 1000;
function validSubscription(input) {
  if (!input || typeof input.endpoint !== 'string' || input.endpoint.length > 4096) return null;
  let url; try { url = new URL(input.endpoint); } catch (_) { return null; }
  const host = url.hostname.toLowerCase();
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com'].includes(host) || host.endsWith('.notify.windows.com');
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) return null;
  const { p256dh, auth } = input.keys || {};
  if (![p256dh, auth].every(v => typeof v === 'string' && v.length <= 128 && /^[A-Za-z0-9_-]+={0,2}$/.test(v))) return null;
  const key = Buffer.from(p256dh, 'base64url'), secret = Buffer.from(auth, 'base64url');
  if (key.length !== 65 || key[0] !== 4 || secret.length !== 16) return null;
  try { crypto.ECDH.convertKey(key, 'prime256v1'); } catch (_) { return null; }
  return { endpoint: url.href, expirationTime: null, keys: { p256dh: key.toString('base64url'), auth: secret.toString('base64url') } };
}
function clip(text, maxBytes) { let result = '', bytes = 0; for (const ch of String(text)) { bytes += Buffer.byteLength(ch); if (bytes > maxBytes) return result + '…'; result += ch; } return result; }
module.exports = function createPushService({ env = process.env, transport = webpush, now = Date.now } = {}) {
  const records = new Map(); const queue = new Map(); let working = 0, saveTimer, error = '', configured = false;
  const store = env.PUSH_STORE_PATH && path.isAbsolute(env.PUSH_STORE_PATH) ? env.PUSH_STORE_PATH : null;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
    try { transport.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY); configured = true; }
    catch (_) { error = 'Web Push keys/contact are invalid. Ask the site owner to check Render environment variables.'; }
  } else error = 'Web Push is not configured. The site owner must add the three VAPID environment variables in Render.';
  let storeHealthy = true;
  if (store) {
    try {
      if (fs.existsSync(store)) for (const r of JSON.parse(fs.readFileSync(store, 'utf8')).slice(0, 2000)) {
        const subscription = validSubscription(r.subscription);
        if (subscription && /^[a-f0-9]{64}$/.test(r.id) && typeof r.room === 'string' && r.room.length <= 24 && r.expiresAt > now())
          records.set(r.id, { id: r.id, room: r.room, expiresAt: r.expiresAt, previews: r.previews !== false, subscription, socketId: null, foreground: false, lastSeen: 0 });
      }
      fs.mkdirSync(path.dirname(store), { recursive: true, mode: 0o700 });
      fs.accessSync(path.dirname(store), fs.constants.W_OK);
    } catch (_) { storeHealthy = false; }
  }
  function save() {
    if (!store || !storeHealthy) return;
    clearTimeout(saveTimer); saveTimer = setTimeout(() => {
      try {
        const data = [...records.values()].filter(r => r.expiresAt > now()).map(({ id, room, expiresAt, previews, subscription }) => ({ id, room, expiresAt, previews, subscription }));
        fs.writeFileSync(store + '.tmp', JSON.stringify(data), { mode: 0o600 }); fs.renameSync(store + '.tmp', store);
      } catch (_) { storeHealthy = false; }
    }, 150); saveTimer.unref?.();
  }
  function remove(id) { const existed = records.delete(id); if (existed) save(); return existed; }
  function prune() { for (const [id, r] of records) if (r.expiresAt <= now()) remove(id); }
  const cleanup = setInterval(prune, 15 * 60 * 1000); cleanup.unref?.();
  const validToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43,100}$/.test(token);
  function unregister(token) { if (validToken(token)) remove(hash(token)); }
  function config() { return { configured, publicKey: configured ? env.VAPID_PUBLIC_KEY : null, error, retentionHours: 24, durable: Boolean(store && storeHealthy), storageWarning: store && !storeHealthy ? 'Persistent subscription storage is unavailable; ask the site owner to check the disk path.' : '' }; }
  async function send(record, payload) {
    try {
      await transport.sendNotification(record.subscription, JSON.stringify(payload), { TTL: 120, urgency: 'normal', timeout: 10000, topic: hash(record.room).slice(0, 32) });
      return { ok: true };
    } catch (e) {
      if ([404, 410].includes(e.statusCode)) for (const [id, r] of records) if (r.subscription.endpoint === record.subscription.endpoint) remove(id);
      // Never log provider endpoints, encryption keys, tokens or message content.
      return { error: [404, 410].includes(e.statusCode) ? 'This push subscription expired. Turn notifications off and on again.' : 'Push provider rejected or timed out. Check VAPID settings, phone support and connection.' };
    }
  }
  function drain() {
    while (working < 4 && queue.size) {
      const [key, job] = queue.entries().next().value; queue.delete(key);
      if (now() - job.payload.sentAt > 120000) continue;
      const allowed = job.ids.map(id => records.get(id)).filter(r => r && r.expiresAt > now() && r.room === job.room);
      if (!allowed.length) continue;
      working++;
      send(allowed[0], { ...job.payload, bindings: allowed.map(r => r.id) }).finally(() => { working--; drain(); });
    }
  }
  function notify(socket, { id, title, body }) {
    if (!configured) return;
    prune(); const groups = new Map();
    for (const r of records.values()) if (r.room === socket.room) {
      const group = groups.get(r.subscription.endpoint) || []; group.push(r); groups.set(r.subscription.endpoint, group);
    }
    for (const [endpoint, group] of groups) {
      if (group.some(r => r.socketId === socket.id || (r.foreground && r.socketId && now() - r.lastSeen < 30000))) continue;
      const preview = group.some(r => r.previews);
      const payload = { type: 'room-message', eventId: id, room: socket.room, title: preview ? clip(title, 150) : 'TempChat', body: preview ? clip(body, 1800) : 'New activity in your room. Tap to open.', sentAt: now() };
      const key = hash(endpoint + socket.room);
      if (queue.size >= 256 && !queue.has(key)) continue;
      queue.set(key, { ids: group.map(r => r.id), room: socket.room, payload }); // coalesce latest if delivery is backed up
    }
    drain();
  }
  function attach(socket) {
    const ack = (cb, value) => { if (typeof cb === 'function') cb(value); };
    socket.on('push-register', (data, cb) => {
      if (!configured) return ack(cb, { error: config().error });
      if (!socket.room || !socket.username) return ack(cb, { error: 'Join a room before enabling notifications.' });
      if (!data || !validToken(data.token)) return ack(cb, { error: 'Invalid notification session.' });
      if (socket.lastPushRegister && now() - socket.lastPushRegister < 1500) return ack(cb, { error: 'Wait a moment before changing notifications again.' });
      const subscription = validSubscription(data.subscription);
      if (!subscription) return ack(cb, { error: 'Unsupported or invalid browser push subscription.' });
      const id = hash(data.token); const existing = records.get(id);
      if (existing && existing.subscription.endpoint !== subscription.endpoint) return ack(cb, { error: 'Subscription changed. Turn notifications off and on again.' });
      prune();
      if (!existing && records.size >= 2000) return ack(cb, { error: 'Push subscriptions are at capacity. Try later.' });
      if (!existing && [...records.values()].filter(r => r.subscription.endpoint === subscription.endpoint).length >= 8) return ack(cb, { error: 'Too many notification sessions on this device. Turn notifications off to reset them.' });
      socket.lastPushRegister = now();
      // One active binding per socket; closed/background tabs retain their own bindings.
      if (socket.pushId && socket.pushId !== id) remove(socket.pushId);
      records.set(id, { id, subscription, room: socket.room, expiresAt: now() + MAX_AGE, previews: data.previews !== false, socketId: socket.id, foreground: Boolean(data.foreground), lastSeen: now() });
      socket.pushId = id; save();
      ack(cb, { ok: true, id, room: socket.room, expiresAt: records.get(id).expiresAt, ...config() });
    });
    socket.on('push-presence', data => {
      if (!data || !validToken(data.token)) return;
      const r = records.get(hash(data.token));
      if (r && r.socketId === socket.id && r.room === socket.room) { r.foreground = Boolean(data.foreground); r.lastSeen = now(); }
    });
    socket.on('push-unregister', (data, cb) => { if (data && validToken(data.token)) unregister(data.token); ack(cb, { ok: true }); });
    socket.on('push-test', async (data, cb) => {
      const r = data && validToken(data.token) && records.get(hash(data.token));
      if (!r || r.socketId !== socket.id || r.room !== socket.room) return ack(cb, { error: 'Enable notifications for this room first.' });
      if (socket.lastPushTest && now() - socket.lastPushTest < 10000) return ack(cb, { error: 'Wait 10 seconds between notification tests.' });
      socket.lastPushTest = now();
      ack(cb, await send(r, { type: 'room-message', bindings: [r.id], eventId: crypto.randomUUID(), room: r.room, title: 'TempChat test', body: 'Web Push reached your browser. Phone settings may still affect how it appears.', sentAt: now(), test: true }));
    });
  }
  return {
    config, attach, notify, unregister,
    disableDevice(token) {
      const r = validToken(token) && records.get(hash(token));
      if (r) for (const [id, other] of records) if (other.subscription.endpoint === r.subscription.endpoint) remove(id);
    },
    leave(socket) { if (socket.pushId) { remove(socket.pushId); socket.pushId = null; } },
    disconnect(socket) { const r = records.get(socket.pushId); if (r && r.socketId === socket.id) { r.socketId = null; r.foreground = false; } },
    reset(room) { for (const [id, r] of records) if (r.room === room) remove(id); },
    close() { clearInterval(cleanup); clearTimeout(saveTimer); },
  };
};
module.exports.validSubscription = validSubscription;
