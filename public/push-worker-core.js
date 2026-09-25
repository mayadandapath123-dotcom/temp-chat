'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.TempChatSessionNotificationCore = factory;
})(typeof self !== 'undefined' ? self : globalThis, function ({ registration, clients, confirmSession }) {
  const states = new Map();
  function state(id) {
    if (!states.has(id)) states.set(id, { revision: 0, stopped: new Set() });
    while (states.size > 256) states.delete(states.keys().next().value);
    return states.get(id);
  }
  async function closeFor(clientId, epoch) {
    for (const n of await registration.getNotifications()) {
      if (n.data?.clientId === clientId && (!epoch || n.data?.epoch === epoch)) n.close();
    }
  }
  async function isEligible(clientId, msg) {
    const live = await clients.get(clientId);
    if (!live || live.type !== 'window') return false;
    const check = await confirmSession(live, msg.epoch, msg.room);
    return Boolean(check && check.joined && check.connected && check.enabled && check.epoch === msg.epoch && check.room === msg.room && (msg.test || !check.foreground));
  }
  async function message(msg, source) {
    if (msg.type === 'session-status') return { ok: true, version: 8, mode: 'joined-page-only' };
    if (!source?.id) return { error: 'A live chat page is required.' };
    const s = state(source.id);
    if (msg.type === 'session-stop') {
      s.revision++; if (typeof msg.epoch === 'string') s.stopped.add(msg.epoch);
      while (s.stopped.size > 32) s.stopped.delete(s.stopped.values().next().value);
      await closeFor(source.id); return { ok: true };
    }
    if (msg.type === 'session-close-alerts') { await closeFor(source.id); return { ok: true }; }
    if (msg.type !== 'session-notify') return { error: 'This old notification mode is disabled. Reopen TempChat.' };
    if (typeof msg.epoch !== 'string' || msg.epoch.length > 100 || typeof msg.room !== 'string' || !msg.room || msg.room.length > 24) return { error: 'Invalid room session.' };
    const revision = s.revision;
    if (s.stopped.has(msg.epoch) || !await isEligible(source.id, msg)) return { ok: true, shown: false };
    if (s.revision !== revision || s.stopped.has(msg.epoch)) return { ok: true, shown: false };
    await registration.showNotification(String(msg.title || 'TempChat').slice(0, 120), {
      body: String(msg.body || '').slice(0, 1500),
      tag: `tempchat-session-${source.id}`, renotify: true,
      icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', vibrate: [150, 60, 150],
      data: { clientId: source.id, room: msg.room, epoch: msg.epoch },
    });
    // Exit may race a slow OS notification request. Close a late completion.
    if (s.revision !== revision || !await isEligible(source.id, msg)) {
      await closeFor(source.id, msg.epoch); return { ok: true, shown: false };
    }
    return { ok: true, shown: true };
  }
  async function click(data) {
    if (!data || typeof data !== 'object') return;
    const s = state(data.clientId);
    if (!data?.epoch || s.stopped.has(data.epoch)) return;
    const client = await clients.get(data.clientId);
    if (!client) return;
    const check = await confirmSession(client, data.epoch, data.room);
    if (!check?.joined || !check.connected || check.epoch !== data.epoch || check.room !== data.room) return;
    await client.focus(); client.postMessage({ type: 'notification-click', room: data.room });
    // Never opens a closed/exited room in a fresh tab.
  }
  return { message, click, push: async () => false };
});
