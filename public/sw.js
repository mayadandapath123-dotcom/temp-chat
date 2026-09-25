/* Notification worker only. No message cache, background connection or Push backend. */
const SW_VERSION = 'tempchat-v6';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Remove only obsolete TempChat caches, not unrelated origin data.
  for (const key of await caches.keys()) if (key.startsWith('tempchat-')) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  const msg = event.data || {};
  if (msg.type !== 'show-notification') return;
  event.waitUntil((async () => {
    try {
      await self.registration.showNotification(String(msg.title || 'TempChat').slice(0, 120), {
        body: String(msg.body || '').slice(0, 250),
        tag: String(msg.tag || 'tempchat-message').slice(0, 100), renotify: true,
        icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', vibrate: [150, 60, 150],
        data: { room: String(msg.room || '').slice(0, 24), clientId: event.source?.id || null, action: 'open-chat' },
      });
      event.ports[0]?.postMessage({ ok: true });
    } catch (e) { event.ports[0]?.postMessage({ ok: false, error: e.message || 'System notification failed.' }); }
  })());
});
self.addEventListener('notificationclick', event => {
  const data = event.notification.data || {}; event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Focus the exact originating tab, not an unrelated room on the same origin.
    const exact = windows.find(c => c.id === data.clientId);
    if (exact) { await exact.focus(); exact.postMessage({ type: 'notification-click', action: 'open-chat' }); return; }
    const room = typeof data.room === 'string' ? data.room : '';
    const url = room ? '/?room=' + encodeURIComponent(room) : '/';
    await self.clients.openWindow(url); // never auto-joins or answers a call
  })());
});
