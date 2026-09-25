/* Web Push notifications. No message cache, auto-join or automatic camera access. */
importScripts('/push-store.js?v=7', '/push-worker-core.js?v=7');
const core = self.TempChatPushCore({ store: self.TempChatPushStore, registration: self.registration, clients: self.clients });
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  event.waitUntil((async () => {
    try { event.ports[0]?.postMessage(await core.message(event.data || {}, event.source)); }
    catch (e) { event.ports[0]?.postMessage({ error: e.message || 'Notification permission storage failed.' }); }
  })());
});
self.addEventListener('push', event => {
  event.waitUntil((async () => { let payload; try { payload = event.data?.json(); } catch (_) { return; } await core.push(payload); })());
});
self.addEventListener('notificationclick', event => {
  const data = event.notification.data || {}; event.notification.close();
  event.waitUntil(core.click(data));
});
self.addEventListener('pushsubscriptionchange', event => {
  // Rebinding requires an explicit active room and current browser permission.
  // Do not invent an offline room or silently persist a new subscription.
  event.waitUntil((async () => {
    await self.TempChatPushStore.clear();
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ type: 'push-expired' });
  })());
});
