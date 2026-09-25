/* v8: notification permission is remembered, but room membership is never
   persisted. Alerts originate only in a joined, connected, running page. */
(function () {
  'use strict';
  const PREF = 'tempchat_joined_notifications_v8';
  let enabled = false, previews = true;
  try {
    enabled = localStorage.getItem(PREF) === 'true';
    previews = localStorage.getItem('tempchat_push_previews') !== 'false';
    sessionStorage.removeItem('tempchat_push_session_v7');
  } catch (_) {}
  const makeEpoch = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let epoch = makeEpoch(), roomReady = false, activeRoom = '', busy = false, lastStatus = '';
  let regTask = null, activeWorker = null, refreshUI = () => {};
  const capable = () => isSecureContext && 'Notification' in window && 'serviceWorker' in navigator;
  const foreground = () => document.visibilityState === 'visible' && document.hasFocus();
  function alive(room = activeRoom, expectedEpoch = epoch) {
    return Boolean(!window.__tempChatExiting && joinedChat && socket.connected && roomReady && room && activeRoom === room && currentRoom === room && epoch === expectedEpoch);
  }
  function eligible(room = activeRoom, expectedEpoch = epoch) {
    return Boolean(alive(room, expectedEpoch) && enabled && capable() && Notification.permission === 'granted');
  }
  const timeout = (promise, ms, message) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
  async function worker() {
    if (!capable()) throw new Error('Notifications are unavailable in this browser context. Open the HTTPS site in a supported browser.');
    if (!regTask) regTask = (async () => {
      const reg = await navigator.serviceWorker.getRegistration('/') || await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      try { await timeout(reg.update(), 3500, 'Notification update timed out.'); } catch (e) { if (!reg.active) throw e; }
      const installing = reg.installing || reg.waiting;
      if (installing && installing.state !== 'activated') await timeout(new Promise((resolve, reject) => {
        const check = () => { if (installing.state === 'activated') resolve(); else if (installing.state === 'redundant') reject(new Error('Notification update failed. Close all TempChat tabs and reopen.')); };
        installing.addEventListener('statechange', check); check();
      }), 10000, 'Notification update timed out. Close old TempChat tabs and reopen.');
      if (!reg.active) await timeout(navigator.serviceWorker.ready, 10000, 'Notification worker is not ready.');
      activeWorker = reg.active; return reg;
    })().catch(e => { regTask = null; throw e; });
    return regTask;
  }
  async function workerMessage(data) {
    const reg = await worker(); activeWorker = reg.active;
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Notification check timed out. Keep the chat page running and reopen it if needed.')); }, 6000);
      channel.port1.onmessage = ({ data: reply }) => { clearTimeout(timer); channel.port1.close(); reply?.error ? reject(new Error(reply.error)) : resolve(reply); };
      try { reg.active.postMessage(data, [channel.port2]); } catch (e) { clearTimeout(timer); channel.port1.close(); reject(e); }
    });
  }
  // This listener is installed before any notification is attempted. The worker
  // verifies the actual live page immediately before showing each alert.
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'verify-notification-session') {
      const room = event.data.room, requestedEpoch = event.data.epoch;
      event.ports[0]?.postMessage({ joined: Boolean(alive(room, requestedEpoch)), connected: Boolean(socket.connected && roomReady), enabled: eligible(room, requestedEpoch), room: activeRoom, epoch, foreground: foreground() });
    }
    if (event.data?.type === 'notification-click' && alive(event.data.room)) {
      window.focus(); document.getElementById('message-input')?.focus({ preventScroll: true });
    }
  });
  function invalidate({ leaving = false } = {}) {
    const oldEpoch = epoch; epoch = makeEpoch();
    if (leaving) { roomReady = false; activeRoom = ''; }
    // Send without waiting for a network update: Exit/pagehide must revoke now.
    try { (activeWorker || navigator.serviceWorker?.controller)?.postMessage({ type: 'session-stop', epoch: oldEpoch }); } catch (_) {}
    refreshUI(); return oldEpoch;
  }
  async function stopRoom() {
    const oldEpoch = invalidate({ leaving: true });
    if (!capable()) return null;
    try { await workerMessage({ type: 'session-stop', epoch: oldEpoch }); } catch (_) {}
    return null;
  }
  async function enable() {
    if (busy) return;
    if (!alive()) throw new Error('Join a connected room before enabling notifications.');
    if (!capable()) throw new Error('This browser does not support session notifications here. Use HTTPS and check site permissions.');
    const selectedEpoch = epoch, selectedRoom = activeRoom;
    busy = true; refreshUI();
    try {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Browser notifications are blocked. Allow notifications for this site in browser settings.' : 'Permission was dismissed. Turn notifications on when ready.');
      const reply = await workerMessage({ type: 'session-status' });
      if (reply.version !== 8) throw new Error('An old notification worker is still active. Close all TempChat tabs and reopen.');
      if (!alive(selectedRoom, selectedEpoch)) return;
      enabled = true; try { localStorage.setItem(PREF, 'true'); } catch (_) {}
      lastStatus = 'Notifications are ON while this page is joined and connected. You can use another tab or app without exiting the room.';
    } finally { busy = false; refreshUI(); }
  }
  async function disable() {
    enabled = false; try { localStorage.setItem(PREF, 'false'); } catch (_) {}
    const oldEpoch = invalidate();
    try { await workerMessage({ type: 'session-stop', epoch: oldEpoch }); } catch (_) {}
    lastStatus = 'Room notifications are OFF on this browser. Browser permission is unchanged.'; refreshUI();
  }
  async function show(title, body, options = {}) {
    const requestedEpoch = epoch, room = options.room || activeRoom;
    if (!eligible(room, requestedEpoch) || (!options.test && foreground())) return false;
    try {
      await worker();
      if (!eligible(room, requestedEpoch) || (!options.test && foreground())) return false;
      const reply = await workerMessage({ type: 'session-notify', epoch: requestedEpoch, room,
        title: previews || options.test ? title : 'TempChat',
        body: previews || options.test ? body : 'New activity in your joined room. Tap to return.', test: Boolean(options.test) });
      return Boolean(reply?.shown);
    } catch (e) { lastStatus = e.message; refreshUI(); throw e; }
  }
  async function test() {
    if (!eligible()) throw new Error('Join a room and turn notifications on first.');
    const shown = await show('TempChat test', 'This test came from your currently joined page. Closing or exiting that page stops new alerts.', { test: true });
    lastStatus = shown ? 'Test accepted by the browser. Check your notification shade; phone settings may still hide it.' : 'Test skipped because the room session ended or could not be verified.';
    refreshUI();
  }
  async function cleanupLegacy() {
    if (!capable()) return;
    const reg = await worker();
    // Unsubscribe only; never call PushManager.subscribe or use any VAPID key.
    try { const subscription = await reg.pushManager?.getSubscription(); await subscription?.unsubscribe(); } catch (_) {}
    await workerMessage({ type: 'legacy-push-cleanup' });
  }
  function mount() {
    const old = document.getElementById('sheet-notify-btn'); if (!old) return;
    const button = old.cloneNode(true); old.replaceWith(button); button.disabled = false;
    button.innerHTML = '<span>🔔 Joined-room notifications</span>';
    const dialog = document.createElement('dialog'); dialog.className = 'tc-device-dialog'; dialog.setAttribute('aria-labelledby', 'tc-notify-title');
    dialog.innerHTML = '<header><h2 id="tc-notify-title">Room notifications</h2><button type="button" class="tc-close" aria-label="Close notifications">✕</button></header><div class="tc-device-body"><label class="tc-push-toggle"><span><strong>Notify while I’m in a room</strong><small>Alerts when this joined chat page is running in the background or another tab.</small></span><input type="checkbox" id="tc-push-on" role="switch" aria-label="Joined-room notifications"></label><p id="tc-notify-status" role="status"></p><label class="tc-notify-preview"><input type="checkbox" id="tc-notify-previews"> Show sender names and message text</label><div class="tc-device-actions"><button type="button" id="tc-notify-test">Send test notification</button><button type="button" id="tc-notify-off">Turn notifications off</button></div><p id="tc-notify-result" role="status"></p><div class="tc-device-warning"><strong>Only your live room session</strong><p>Another tab/app: alerts can work while TempChat stays joined and connected. Exit, close the page, or disconnect: no new alerts from that session.</p><p>If the phone fully suspends the browser, notifications can stop. There are no offline notifications, 24-hour subscriptions or server Web Push.</p></div><h3>Phone and browser permissions</h3><p>Allow this site’s notifications and the browser’s notifications in phone settings. Do Not Disturb and battery restrictions can silence or suspend them. Support varies by browser; this site cannot override phone settings.</p><p>The notification preference is remembered, but room membership is not. Opening the join screen alone never enables room alerts. Alerts already shown may remain in the phone’s notification history.</p></div>';
    document.body.append(dialog); const $ = id => dialog.querySelector('#' + id);
    refreshUI = () => {
      const permission = 'Notification' in window ? Notification.permission : 'unsupported';
      $('tc-push-on').checked = Boolean((enabled && capable() && permission === 'granted') || busy); $('tc-push-on').disabled = busy || !capable() || !alive();
      $('tc-notify-previews').checked = previews;
      $('tc-notify-test').disabled = busy || !eligible();
      $('tc-notify-status').textContent = !capable() ? 'System notifications are unavailable in this browser context.' : permission === 'denied' ? 'Notifications are blocked by the browser. Update this site’s permission.' : !alive() ? 'No connected room: notifications are paused.' : enabled && permission === 'granted' ? 'ON for this joined room, only while the page is running in the background.' : 'OFF. Turn on to allow notifications while you stay in this room.';
      $('tc-notify-result').textContent = lastStatus;
    };
    const run = async fn => { try { await fn(); } catch (e) { lastStatus = e.message; } finally { refreshUI(); } };
    button.onclick = () => { document.getElementById('more-sheet')?.classList.add('hidden'); refreshUI(); dialog.showModal(); };
    dialog.querySelector('.tc-close').onclick = () => dialog.close();
    $('tc-push-on').onchange = event => run(event.target.checked ? enable : disable);
    $('tc-notify-off').onclick = () => run(disable);
    $('tc-notify-test').onclick = () => run(test);
    $('tc-notify-previews').onchange = event => {
      previews = event.target.checked; try { localStorage.setItem('tempchat_push_previews', String(previews)); } catch (_) {}
      invalidate(); // invalidate any still-pending alert with the old preview setting
    };
    socket.on('room-ready', ({ room }) => { invalidate(); roomReady = true; activeRoom = room; refreshUI(); });
    socket.on('disconnect', () => { invalidate({ leaving: true }); lastStatus = 'Connection lost. Notifications are paused until the room reconnects.'; refreshUI(); });
    socket.on('clear-chat', () => invalidate());
    window.addEventListener('pagehide', () => invalidate({ leaving: true }));
    window.addEventListener('pageshow', event => {
      // A back/forward-cache restore must rejoin, not reuse a stale session lease.
      if (event.persisted && joinedChat && socket.connected) socket.emit('join-room', { username: currentUsername, room: currentRoom, asAdmin: window.TempChatAdminMode === true });
    });
    window.addEventListener('storage', event => {
      if (event.key === PREF) { enabled = event.newValue === 'true'; invalidate(); }
      if (event.key === 'tempchat_push_previews') { previews = event.newValue !== 'false'; invalidate(); }
    });
    window.addEventListener('focus', () => {
      refreshUI();
      try { (activeWorker || navigator.serviceWorker?.controller)?.postMessage({ type: 'session-close-alerts' }); } catch (_) {}
    });
    cleanupLegacy().catch(() => { lastStatus = 'Close all older TempChat tabs and reopen this page to finish the notification update.'; refreshUI(); });
  }
  window.TempChatNotifications = { enable, show, mount, stopRoom, token: () => null };
})();
