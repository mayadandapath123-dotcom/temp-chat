/* v8: alerts come ONLY from live joined pages, never from server Web Push. */
importScripts('/push-store.js?v=8', '/push-worker-core.js?v=8');
function confirmSession(client, epoch, room) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 2000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    try { client.postMessage({ type: 'verify-notification-session', epoch, room }, [channel.port2]); }
    catch (_) { clearTimeout(timer); channel.port1.close(); resolve(null); }
  });
}
const core = self.TempChatSessionNotificationCore({ registration: self.registration, clients: self.clients, confirmSession });
async function removeLegacyPush() {
  await self.TempChatLegacyPush.clear();
  try { const subscription = await self.registration.pushManager?.getSubscription(); await subscription?.unsubscribe(); } catch (_) {}
  for (const n of await self.registration.getNotifications()) if (n.tag?.startsWith('tempchat-room-') || n.tag === 'tempchat-test') n.close();
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await self.clients.claim();
  await Promise.race([removeLegacyPush(), new Promise(resolve => setTimeout(resolve, 5000))]);
})()));
self.addEventListener('message', event => event.waitUntil((async () => {
  try {
    if (event.data?.type === 'legacy-push-cleanup') { await removeLegacyPush(); event.ports[0]?.postMessage({ ok: true }); return; }
    event.ports[0]?.postMessage(await core.message(event.data || {}, event.source));
  } catch (e) { event.ports[0]?.postMessage({ error: e.message || 'The browser rejected the notification.' }); }
})()));
// Deliberately ignore any already-queued v7 Web Push payload. Do not display it.
self.addEventListener('push', event => event.waitUntil(core.push()));
self.addEventListener('notificationclick', event => {
  const data = event.notification.data || {}; event.notification.close();
  event.waitUntil(core.click(data));
});
