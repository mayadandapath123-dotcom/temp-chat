'use strict';
/* v8: closed-page Web Push is intentionally disabled.
   Keep this narrow compatibility interface for the existing room server and old
   clients. No subscriptions, VAPID keys, disk registry or provider calls remain. */
module.exports = function sessionOnlyNotifications() {
  const error = 'Closed-page Web Push has been removed. Reopen TempChat to use notifications only while joined to a running chat page.';
  return {
    config: () => ({ configured: false, mode: 'joined-page-only', error }),
    attach(socket) {
      for (const event of ['push-register', 'push-test']) socket.on(event, (_data, ack) => { if (typeof ack === 'function') ack({ error }); });
      socket.on('push-unregister', (_data, ack) => { if (typeof ack === 'function') ack({ ok: true }); });
    },
    notify() {}, unregister() {}, disableDevice() {}, leave() {}, disconnect() {}, reset() {}, close() {},
  };
};
