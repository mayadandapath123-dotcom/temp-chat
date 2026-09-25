'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.TempChatPushCore = factory;
})(typeof self !== 'undefined' ? self : globalThis, function ({ store, registration, clients, now = Date.now }) {
  const validId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
  async function liveBindings() {
    const all = await store.all();
    for (const r of all) if (r.expiresAt <= now()) await store.remove(r.id);
    return all.filter(r => r.expiresAt > now());
  }
  async function closeMatching(id) {
    for (const n of await registration.getNotifications()) if (!id || n.data?.bindings?.includes(id)) n.close();
  }
  async function message(msg, source) {
    if (msg.type === 'push-status') return { ok: true, version: 7 };
    if (msg.type === 'binding-add') {
      if (!source?.id || !validId(msg.id) || typeof msg.room !== 'string' || msg.room.length > 24 || !Number.isFinite(msg.expiresAt) || msg.expiresAt <= now()) throw new Error('Invalid local notification session.');
      await liveBindings();
      await store.put({ id: msg.id, room: msg.room, clientId: source.id, expiresAt: Math.min(msg.expiresAt, now() + 86400000), previews: msg.previews !== false });
    } else if (msg.type === 'binding-remove') {
      if (validId(msg.id)) { await store.remove(msg.id); await closeMatching(msg.id); }
    } else if (msg.type === 'bindings-clear') {
      await store.clear(); await closeMatching();
      for (const c of await clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ type: 'push-disabled' });
    } else throw new Error('Unsupported notification operation.');
    return { ok: true };
  }
  async function push(data) {
    if (!data || data.type !== 'room-message' || !Array.isArray(data.bindings) || typeof data.room !== 'string' || !Number.isFinite(data.sentAt) || now() - data.sentAt > 120000 || data.sentAt > now() + 60000) return;
    const bindings = (await liveBindings()).filter(r => r.room === data.room && r.expiresAt > now() && data.bindings.includes(r.id));
    if (!bindings.length) return; // explicit Exit/Off suppresses queued message content, even offline
    const preview = bindings.some(b => b.previews);
    const title = data.test || preview ? String(data.title || 'TempChat').slice(0, 120) : 'TempChat';
    const body = data.test || preview ? String(data.body || '').slice(0, 1800) : 'New activity in your room. Tap to open.';
    await registration.showNotification(title, {
      body, tag: `tempchat-room-${data.room}`, renotify: true,
      icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', vibrate: [150, 60, 150],
      data: { room: data.room, clientId: bindings[0].clientId, bindings: bindings.map(b => b.id), eventId: data.eventId },
    });
  }
  async function click(data) {
    const valid = (await liveBindings()).some(r => r.room === data.room && r.expiresAt > now() && data.bindings?.includes(r.id));
    if (!valid) return;
    const room = String(data.room || '').slice(0, 24);
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const exact = windows.find(c => {
      if (c.id !== data.clientId) return false;
      try { const u = new URL(c.url); return u.searchParams.get('room') === room || (u.pathname.startsWith('/room/') && decodeURIComponent(u.pathname.slice(6)) === room); } catch (_) { return false; }
    });
    if (exact) { await exact.focus(); exact.postMessage({ type: 'notification-click', room }); }
    else await clients.openWindow('/?room=' + encodeURIComponent(room));
  }
  return { message, push, click };
});
