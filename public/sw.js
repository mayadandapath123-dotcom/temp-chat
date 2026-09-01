/* TempChat Service Worker
   -----------------------
   Exists for ONE reason: mobile notifications.

   On Android Chrome, `new Notification(...)` throws
   "Illegal constructor" and silently does nothing. Mobile browsers only
   allow notifications via ServiceWorkerRegistration.showNotification().
   That is why notifications worked on desktop but not on phones.

   TempChat stores nothing, so this worker deliberately does NOT cache
   any app files -- it must never serve a stale app.js or index.html.
*/

const SW_VERSION = "tempchat-sw-v1";

self.addEventListener("install", (event) => {
  // Activate immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Defensive: wipe any cache a previous version may have left behind.
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {}
      await self.clients.claim();
    })()
  );
});

// No fetch handler on purpose -> every request goes straight to the network.

// Tapping a notification should focus the existing tab, not open a new one.
self.addEventListener("notificationclick", (event) => {
  const data = (event.notification && event.notification.data) || {};
  event.notification.close();

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if ("focus" in client) {
          try {
            await client.focus();
            if (data.action) client.postMessage({ type: "notification-click", action: data.action });
            return;
          } catch (e) {}
        }
      }

      if (self.clients.openWindow) {
        const url = data.room ? `/?room=${encodeURIComponent(data.room)}` : "/";
        await self.clients.openWindow(url);
      }
    })()
  );
});

// Allow the page to trigger a notification through the worker.
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type !== "show-notification") return;

  const { title, body, tag, room, renotify, silent } = msg;
  self.registration
    .showNotification(title || "TempChat", {
      body: body || "",
      tag: tag || "tempchat-message",
      renotify: renotify !== false,
      silent: Boolean(silent),
      badge: "/icon-badge.png",
      icon: "/icon-192.png",
      vibrate: msg.vibrate || [180, 80, 180],
      data: { room: room || null, action: msg.action || null },
    })
    .catch(() => {});
});
