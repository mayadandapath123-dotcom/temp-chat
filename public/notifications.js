/* On-device notifications while this page receives room events.
   No Push subscription/backend: closed or OS-suspended pages cannot receive new chats. */
(function () {
  'use strict';
  const read = (k, fallback) => { try { const v = localStorage.getItem(k); return v === null ? fallback : v === 'true'; } catch (_) { return fallback; } };
  const save = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (_) {} };
  let enabled = read('tempchat_notifications', true), previews = read('tempchat_notification_previews', false);
  let registration = null, registrationTask = null, lastError = '';
  const capable = () => window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator;
  const timeout = (p, ms, text) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(text)), ms);
    Promise.resolve(p).then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
  async function worker() {
    if (!capable()) throw new Error('System notifications require HTTPS, browser support and permission.');
    if (!registrationTask) registrationTask = (async () => {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      registration = reg.active ? reg : await timeout(navigator.serviceWorker.ready, 8000, 'Notification worker could not start. Reload and try again.');
      return registration;
    })().catch(e => { registrationTask = null; throw e; });
    return timeout(registrationTask, 10000, 'Notification setup timed out. Check connection and reload.');
  }
  async function enable() {
    if (!capable()) return 'unsupported';
    // This call must happen directly in the user's tap, before waiting on worker setup.
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission === 'granted') { enabled = true; save('tempchat_notifications', true); await worker(); }
    return permission;
  }
  async function deliver(title, body, options = {}) {
    if (!enabled || !capable() || Notification.permission !== 'granted') return false;
    const reg = await worker();
    const safeTitle = options.test || previews ? title : 'TempChat';
    const safeBody = options.test || previews ? body : 'New activity in your TempChat room. Tap to open.';
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Notification worker did not confirm delivery to the browser.')); }, 7000);
      channel.port1.onmessage = ({ data }) => {
        clearTimeout(timer); channel.port1.close();
        if (data?.ok) resolve(true); else reject(new Error(data?.error || 'Browser rejected the notification.'));
      };
      try {
        if (!reg.active) throw new Error('Notification worker is not active yet.');
        reg.active.postMessage({ type: 'show-notification', title: safeTitle, body: safeBody,
          tag: options.tag || `tempchat-room-${options.room || 'chat'}`,
          room: options.room || '', action: options.action || 'open-chat' }, [channel.port2]);
      } catch (e) { clearTimeout(timer); channel.port1.close(); reject(e); }
    });
  }
  async function show(title, body, options = {}) {
    try { return await deliver(title, body, options); }
    catch (e) { lastError = e.message; throw e; }
  }
  async function test() {
    const permission = await enable();
    if (permission !== 'granted') return permission;
    const result = await show('TempChat test', 'Your browser accepted this test notification. Check your notification shade.', { test: true, tag: 'tempchat-test', room: typeof currentRoom === 'string' ? currentRoom : '' });
    if (!result) throw new Error('Notifications are turned off for this device.');
    return 'granted';
  }
  function mount() {
    const old = document.getElementById('sheet-notify-btn'); if (!old) return;
    const button = old.cloneNode(true); old.replaceWith(button); button.disabled = false;
    button.innerHTML = '<span>🔔 Notification settings & test</span>';
    const dialog = document.createElement('dialog'); dialog.className = 'tc-device-dialog'; dialog.setAttribute('aria-labelledby', 'tc-notify-title');
    dialog.innerHTML = '<header><h2 id="tc-notify-title">Mobile notifications</h2><button type="button" class="tc-close" aria-label="Close notifications">✕</button></header><div class="tc-device-body"><p id="tc-notify-status" role="status"></p><div class="tc-device-actions"><button type="button" id="tc-notify-test">Enable & send test</button><button type="button" id="tc-notify-off">Turn off for this device</button></div><label class="tc-notify-preview"><input type="checkbox" id="tc-notify-previews"> Show sender names and message previews</label><p id="tc-notify-result" role="status"></p><h3>Android</h3><p>Allow notifications in this site’s browser settings and in Android Settings → Apps → your browser → Notifications. Check Do Not Disturb and battery restrictions if alerts are silent or delayed.</p><h3>iPhone / iPad</h3><p>On iOS/iPadOS 16.4+, open this site in Safari, use Share → Add to Home Screen, then launch it from that icon. Availability still depends on Safari/WebKit support; this app has no Web Push backend.</p><p class="tc-device-warning"><strong>Keep TempChat open.</strong> These alerts depend on the page receiving messages. They are not reliable after the phone suspends the browser, and do not work after closing the app/tab. A successful test does not prove lock-screen delivery. Server Web Push is not configured.</p><p>Browser permission does not override phone notification settings. If you moved TempChat to a new Render URL, allow notifications again for that new address.</p></div>';
    document.body.append(dialog);
    const $ = id => dialog.querySelector('#' + id);
    function refresh() {
      const permission = 'Notification' in window ? Notification.permission : 'unsupported';
      const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      $('tc-notify-status').textContent = !window.isSecureContext ? 'Unavailable: open TempChat over HTTPS.' : !capable() ? 'Not supported in this browser context. On iPhone, try the Home Screen app.' : permission === 'denied' ? 'Blocked by the browser. Change this site’s notification permission, then reopen the page.' : permission === 'granted' ? (enabled ? 'Browser permission: allowed · app alerts on.' : 'Browser permission: allowed · app alerts off.') : 'Browser permission has not been granted yet.';
      $('tc-notify-status').textContent += installed ? ' Running as a Home Screen app.' : '';
      $('tc-notify-previews').checked = previews;
      $('tc-notify-result').textContent = lastError;
      $('tc-notify-test').disabled = !capable();
    }
    dialog.querySelector('.tc-close').onclick = () => dialog.close();
    button.onclick = () => { document.getElementById('more-sheet')?.classList.add('hidden'); refresh(); dialog.showModal(); };
    $('tc-notify-off').onclick = () => { enabled = false; save('tempchat_notifications', false); lastError = 'App alerts disabled on this device. Browser permission is unchanged.'; refresh(); };
    $('tc-notify-previews').onchange = e => { previews = e.target.checked; save('tempchat_notification_previews', previews); };
    $('tc-notify-test').onclick = async () => {
      $('tc-notify-test').disabled = true; $('tc-notify-result').textContent = 'Checking permission and sending a test…';
      try {
        const permission = await test();
        lastError = permission === 'granted' ? 'Test accepted by the browser. Check your notification shade; OS settings may still hide it.' : permission === 'denied' ? 'Permission blocked. Use browser/site settings to allow it.' : permission === 'default' ? 'Permission prompt was dismissed. Tap Enable & send test again when ready.' : 'Not supported here. See the phone-specific steps below.';
      } catch (e) { lastError = e.message; }
      finally { refresh(); }
    };
    navigator.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type === 'notification-click') { window.focus(); document.getElementById('message-input')?.focus({ preventScroll: true }); }
    });
    window.addEventListener('focus', () => { if (dialog.open) refresh(); });
  }
  window.TempChatNotifications = { enable, show, mount };
  if (capable()) worker().catch(e => { lastError = e.message; });
})();
