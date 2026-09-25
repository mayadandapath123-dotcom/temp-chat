/* Real room Web Push. Permission is explicit; Exit cancels this tab's binding. */
(function () {
  'use strict';
  const SESSION = 'tempchat_push_session_v7';
  const read = () => { try { return JSON.parse(sessionStorage.getItem(SESSION) || 'null'); } catch (_) { return null; } };
  const write = value => { try { if (value) sessionStorage.setItem(SESSION, JSON.stringify(value)); else sessionStorage.removeItem(SESSION); } catch (_) {} };
  let intent = read(), pendingIntent = null, binding = null, config = null, busy = false, generation = 0, lastStatus = '';
  let regTask = null, refreshUI = () => {};
  let previews = true; try { previews = localStorage.getItem('tempchat_push_previews') !== 'false'; } catch (_) {}
  const capable = () => isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const timeout = (promise, ms, message) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
  async function timedFetch(url, options = {}, ms = 10000) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), ms);
    try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); }
  }
  async function loadConfig() {
    const r = await timedFetch('/api/push/config', { cache: 'no-store' });
    if (!r.ok) throw new Error('Notification server could not be reached.');
    config = await r.json(); refreshUI(); return config;
  }
  async function worker() {
    if (!capable()) throw new Error('Web Push is not supported here. Use HTTPS. On iPhone, open the Home Screen app.');
    if (!regTask) regTask = (async () => {
      const reg = await navigator.serviceWorker.getRegistration('/') || await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      try { await timeout(reg.update(), 3500, 'Notification update timed out.'); } catch (e) { if (!reg.active) throw e; }
      const installing = reg.installing || reg.waiting;
      if (installing && installing.state !== 'activated') await timeout(new Promise((resolve, reject) => {
        const check = () => { if (installing.state === 'activated') resolve(); else if (installing.state === 'redundant') reject(new Error('Notification update failed. Reopen this page.')); };
        installing.addEventListener('statechange', check); check();
      }), 10000, 'Notification update timed out. Reopen all TempChat tabs.');
      if (!reg.active) await timeout(navigator.serviceWorker.ready, 10000, 'Notification worker is not active yet.');
      return reg;
    })().catch(e => { regTask = null; throw e; });
    return regTask;
  }
  async function workerMessage(data) {
    const reg = await worker();
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Notification worker did not respond. Close and reopen all TempChat tabs.')); }, 7000);
      channel.port1.onmessage = ({ data: reply }) => { clearTimeout(timer); channel.port1.close(); reply?.error ? reject(new Error(reply.error)) : resolve(reply); };
      try { reg.active.postMessage(data, [channel.port2]); } catch (e) { clearTimeout(timer); channel.port1.close(); reject(e); }
    });
  }
  function socketRequest(event, data) {
    return new Promise((resolve, reject) => {
      if (!socket.connected || !joinedChat) return reject(new Error('Join a connected room first.'));
      socket.timeout(16000).emit(event, data, (error, reply) => error ? reject(new Error('Notification server timed out. Try again.')) : reply?.error ? reject(new Error(reply.error)) : resolve(reply));
    });
  }
  function keyBytes(key) { const binary = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)); return Uint8Array.from(binary, c => c.charCodeAt(0)); }
  function makeToken() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  async function idFor(token) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
  const foreground = () => document.visibilityState === 'visible' && document.hasFocus();
  function presence() {
    if (binding && binding.expiresAt <= Date.now()) { binding = null; lastStatus = 'Room alerts expired. Turn notifications on to renew.'; refreshUI(); }
    if (binding && intent && socket.connected && joinedChat) socket.emit('push-presence', { token: intent.token, foreground: foreground() }); }
  async function revoke(token, device = false) {
    if (!token) return;
    try { await timedFetch('/api/push/unregister', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, scope: device ? 'device' : 'session' }), keepalive: true }, 3500); } catch (_) {}
  }
  async function register(createSubscription) {
    const myGeneration = generation, room = currentRoom;
    const cfg = await loadConfig();
    if (!cfg.configured) throw new Error(cfg.error);
    if (!joinedChat || !socket.connected || window.__tempChatExiting) throw new Error('Join a connected room first.');
    const reg = await worker();
    await workerMessage({ type: 'push-status' });
    let subscription = await reg.pushManager.getSubscription();
    if (subscription?.options?.applicationServerKey) {
      const oldKey = new Uint8Array(subscription.options.applicationServerKey), newKey = keyBytes(cfg.publicKey);
      if (oldKey.length !== newKey.length || oldKey.some((v, i) => v !== newKey[i])) throw new Error('The site’s push key changed. Turn notifications off on this device, then turn them on again.');
    }
    if (!subscription && !createSubscription) throw new Error('Push subscription expired. Turn notifications on again.');
    if (!subscription) subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.publicKey) });
    if (myGeneration !== generation || window.__tempChatExiting) return;
    const candidate = intent?.room === room && typeof intent.token === 'string' ? intent : { room, token: makeToken() };
    pendingIntent = candidate;
    let result;
    try {
      result = await socketRequest('push-register', { token: candidate.token, subscription: subscription.toJSON(), previews, foreground: foreground() });
      if (generation !== myGeneration || currentRoom !== room || window.__tempChatExiting) { await revoke(candidate.token); return; }
      await workerMessage({ type: 'binding-add', id: result.id, room, expiresAt: result.expiresAt, previews });
      if (generation !== myGeneration || window.__tempChatExiting) { await workerMessage({ type: 'binding-remove', id: result.id }); await revoke(candidate.token); return; }
      intent = candidate; write(intent); binding = result;
      lastStatus = `Background alerts connected for #${room}. This session expires in 24 hours; reopening the room renews it.`;
    } catch (e) {
      if (result?.ok) { await revoke(candidate.token); binding = null; try { await workerMessage({ type: 'binding-remove', id: result.id }); } catch (_) {} }
      throw e;
    }
    finally { pendingIntent = null; refreshUI(); }
  }
  async function enable() {
    if (busy) return;
    if (!capable()) throw new Error('Web Push is unavailable in this browser. On iPhone, add TempChat to your Home Screen and open that app.');
    if (!joinedChat || !socket.connected) throw new Error('Join a room first.');
    busy = true; refreshUI();
    try {
      // Invoked directly by the ON gesture, before awaiting configuration/network work.
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Browser permission is blocked. Allow notifications in this site’s settings, then try again.' : 'Permission was dismissed. Turn notifications on again when ready.');
      await register(true);
      return 'granted';
    } finally { busy = false; refreshUI(); }
  }
  async function stopRoom() {
    const tokens = [...new Set([intent?.token, pendingIntent?.token].filter(Boolean))];
    generation++; intent = null; binding = null; pendingIntent = null; write(null);
    try { if (capable()) for (const token of tokens) await workerMessage({ type: 'binding-remove', id: await idFor(token) }); }
    catch (_) {
      // If local revocation storage fails, prefer privacy over keeping other device bindings.
      try { const sub = await (await worker()).pushManager.getSubscription(); await sub?.unsubscribe(); } catch (_) {}
    }
    await Promise.all(tokens.map(revoke)); refreshUI(); return tokens[0] || null;
  }
  async function offDevice() {
    await revoke(intent?.token || pendingIntent?.token, true);
    await stopRoom();
    if (capable()) {
      await workerMessage({ type: 'bindings-clear' });
      const subscription = await (await worker()).pushManager.getSubscription(); await subscription?.unsubscribe();
    }
    lastStatus = 'Notifications are off on this browser/device. Browser permission is unchanged.'; refreshUI();
  }
  async function test() {
    if (!binding || !intent) throw new Error('Turn notifications on for this room first.');
    const response = await socketRequest('push-test', { token: intent.token });
    lastStatus = response.ok ? 'Test accepted by the push provider. Check your phone’s notification shade; acceptance is not a delivery guarantee.' : 'Push test failed.';
    refreshUI();
  }
  function mount() {
    const old = document.getElementById('sheet-notify-btn'); if (!old) return;
    const button = old.cloneNode(true); old.replaceWith(button); button.disabled = false; button.innerHTML = '<span>🔔 Phone notifications</span>';
    const dialog = document.createElement('dialog'); dialog.className = 'tc-device-dialog'; dialog.setAttribute('aria-labelledby', 'tc-notify-title');
    dialog.innerHTML = '<header><h2 id="tc-notify-title">Phone notifications</h2><button type="button" class="tc-close" aria-label="Close notifications">✕</button></header><div class="tc-device-body"><label class="tc-push-toggle"><span><strong>Background notifications</strong><small>Sender name and message text, even when this page is closed on supported phones.</small></span><input type="checkbox" id="tc-push-on" role="switch" aria-label="Background notifications"></label><p id="tc-notify-status" role="status"></p><label class="tc-notify-preview"><input type="checkbox" id="tc-notify-previews"> Show sender names and message text on the lock screen</label><div class="tc-device-actions"><button type="button" id="tc-notify-test">Send background test</button><button type="button" id="tc-notify-off">Turn off on this device</button></div><p id="tc-notify-result" role="status"></p><p id="tc-push-storage" class="tc-device-warning"></p><h3>iPhone / iPad</h3><p>Requires iOS/iPadOS 16.4 or later: in Safari use Share → Add to Home Screen, launch that Home Screen app, join your room, and switch notifications on.</p><h3>Android</h3><p>Use a browser with Web Push support, such as Chrome. Allow this site’s notifications and allow your browser in Android notification settings. Do Not Disturb, battery restrictions, force-stopping the browser and network conditions can prevent or delay alerts.</p><p>Alerts for this room last up to 24 hours without reopening. Explicit Exit stops this tab’s alerts. Closing a tab does not. Delivered notifications and previews may remain in your phone’s history. Permission must be granted again on a new TempChat URL.</p></div>';
    document.body.append(dialog); const $ = id => dialog.querySelector('#' + id);
    refreshUI = () => {
      const permission = 'Notification' in window ? Notification.permission : 'unsupported';
      $('tc-push-on').checked = Boolean(binding || busy); $('tc-push-on').disabled = busy || !capable();
      $('tc-notify-previews').checked = previews; $('tc-notify-previews').disabled = busy;
      $('tc-notify-test').disabled = busy || !binding;
      $('tc-notify-status').textContent = !capable() ? 'Unavailable in this browser context. Use HTTPS; on iPhone use the Home Screen app.' : permission === 'denied' ? 'Browser notifications are blocked. Change the site permission in your browser.' : config && !config.configured ? config.error : binding ? 'Web Push is ON for this room.' : 'Web Push is OFF. Turn it on to request browser permission and connect this room.';
      $('tc-notify-result').textContent = lastStatus;
      $('tc-push-storage').textContent = config?.storageWarning || (config?.durable ? 'Subscriptions survive server restarts using the configured store. They contain endpoint keys and room membership, not chat history. Your browser’s push service delivers encrypted alert payloads.' : 'This server uses temporary subscription memory. Alerts work while it retains your registration, but a Render restart/redeploy or free-service sleep can clear it. Reopen and join the room to reconnect alerts. Persistent storage is needed to survive restarts.');
    };
    const run = async fn => { try { await fn(); } catch (e) { lastStatus = e.message; } finally { refreshUI(); } };
    button.onclick = () => { document.getElementById('more-sheet')?.classList.add('hidden'); refreshUI(); dialog.showModal(); loadConfig().catch(e => { lastStatus = e.message; refreshUI(); }); };
    dialog.querySelector('.tc-close').onclick = () => dialog.close();
    $('tc-push-on').onchange = event => run(event.target.checked ? enable : offDevice);
    $('tc-notify-off').onclick = () => run(offDevice);
    $('tc-notify-test').onclick = () => run(test);
    $('tc-notify-previews').onchange = event => run(async () => {
      previews = event.target.checked; try { localStorage.setItem('tempchat_push_previews', String(previews)); } catch (_) {}
      if (binding) {
        await workerMessage({ type: 'binding-add', id: binding.id, room: currentRoom, expiresAt: binding.expiresAt, previews });
        busy = true; refreshUI(); try { await register(false); } finally { busy = false; }
      }
    });
    navigator.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type === 'notification-click' && event.data.room === currentRoom) { window.focus(); document.getElementById('message-input')?.focus({ preventScroll: true }); }
      if (['push-disabled', 'push-expired'].includes(event.data?.type)) { generation++; intent = null; binding = null; write(null); lastStatus = 'Push is off or expired. Turn it on again if needed.'; refreshUI(); }
    });
    socket.on('room-ready', () => {
      presence();
      if (intent?.room === currentRoom && capable() && Notification.permission === 'granted' && !busy) {
        busy = true; refreshUI(); run(async () => { try { await register(false); } finally { busy = false; } });
      }
      else if (intent && intent.room !== currentRoom) run(stopRoom);
    });
    socket.on('disconnect', () => { binding = null; lastStatus = 'Room connection lost. Existing background registration may still receive alerts until it expires.'; refreshUI(); });
    socket.on('push-reset', () => run(async () => { await stopRoom(); lastStatus = 'Room was reset. Enable notifications again if you want new alerts.'; }));
    for (const name of ['focus', 'blur']) window.addEventListener(name, presence);
    document.addEventListener('visibilitychange', presence); setInterval(presence, 15000);
    loadConfig().catch(() => {});
  }
  // Server-generated Web Push replaces local message notifications to avoid duplicates.
  window.TempChatNotifications = { enable, show: async () => false, mount, stopRoom, token: () => intent?.token || pendingIntent?.token || null };
})();
