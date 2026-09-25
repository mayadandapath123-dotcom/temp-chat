/* Explicit reload + bounded, read-only wake checks. Never auto-reloads a chat,
   resends messages, enables media, or bypasses room locks/admin authentication. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const DRAFT = 'tempchat_reload_identity_v10';
  let checking = null, lastCheck = 0, hiddenAt = 0, lastPulse = Date.now(), reloading = false;
  function context() {
    try { return { socket: typeof socket !== 'undefined' ? socket : null, joined: Boolean(joinedChat), room: currentRoom || $('room')?.value || '', name: currentUsername || $('username')?.value || '', inCall: Boolean(inCall), admin: window.TempChatAdminMode === true }; }
    catch (_) { return { socket: null, joined: false, room: $('room')?.value || new URLSearchParams(location.search).get('room') || '', name: $('username')?.value || '', inCall: false, admin: new URLSearchParams(location.search).get('admin') === '1' }; }
  }
  function toast(text) { try { showToast(text); } catch (_) {} }
  function status(text, kind = '') {
    const label = $('tc-connection-label'); if (label) { label.textContent = text; label.dataset.state = kind; }
    const detail = $('tc-refresh-status'); if (detail) detail.textContent = text;
  }
  function stopped() { return reloading || window.__tempChatExiting; }
  function waitFor(s, success, failure, start, ms = 12000, predicate = () => true) {
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); s.off(success, done); if (failure) s.off(failure, failed); };
      const done = value => { if (predicate(value)) { cleanup(); resolve(value); } };
      const failed = value => { cleanup(); reject(new Error(value?.error || 'Room connection was refused.')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Connection is taking longer than expected. Try again when the server is ready.')); }, ms);
      s.on(success, done); if (failure) s.on(failure, failed);
      try { start(); } catch (e) { cleanup(); reject(e); }
    });
  }
  function health(s) {
    return new Promise((resolve, reject) => s.timeout(5000).emit('session-health', {}, (err, data) => err ? reject(new Error('The connection is not responding.')) : data?.ok ? resolve(data) : reject(new Error('Server check failed.'))));
  }
  function endOldCall() {
    const c = context();
    if (window.__isScreenSharing) $('screen-share-button')?.click();
    if (c.inCall) {
      if (c.socket?.connected) c.socket.emit('call-leave');
      document.querySelectorAll('#call-screen video').forEach(v => { try { v.srcObject?.getTracks().forEach(t => t.stop()); } catch (_) {} });
      try { exitCallUI(); } catch (_) {}
      toast('The old call ended during recovery. Join the call again when ready.');
    }
  }
  async function reconnect(s) {
    if (stopped()) throw new Error('This room session is ending.');
    endOldCall();
    if (s.connected) s.disconnect();
    await waitFor(s, 'connect', null, () => s.connect());
    if (stopped()) throw new Error('This room session is ending.');
  }
  function check({ manual = false, force = false } = {}) {
    if (stopped()) return Promise.resolve(false);
    if (checking) return checking;
    if (!manual && !force && Date.now() - lastCheck < 10000) return Promise.resolve(false);
    lastCheck = Date.now();
    checking = (async () => {
      const initial = context(), s = initial.socket;
      if (navigator.onLine === false) { status('Offline — reconnect to the internet first.', 'offline'); return false; }
      if (!s) { status('App scripts are unavailable. Use Reload page below.', 'error'); return false; }
      status('Checking connection…', 'checking');
      try {
        let data;
        if (!s.connected) await reconnect(s);
        try { data = await health(s); }
        catch (_) { await reconnect(s); data = await health(s); }
        if (stopped()) return false;
        if (data.removed) throw new Error('This session was removed. Return to the join screen; recovery cannot override moderation.');
        const current = context();
        if (current.joined && data.room !== current.room) {
          endOldCall();
          await waitFor(s, 'room-ready', 'join-error', () => s.emit('join-room', { room: current.room, username: current.name, asAdmin: current.admin }), 10000, value => value?.room === current.room);
          data = await health(s);
        }
        if (stopped()) return false;
        if ((context().inCall || window.__isScreenSharing) && !data.inCall) endOldCall();
        status(context().joined ? 'Connected' : 'Server reachable', 'online');
        if (manual) toast('Connection checked. Use Reload page if the interface is still stuck.');
        return true;
      } catch (e) {
        if (!stopped()) status(e.message, 'error');
        return false;
      }
    })().finally(() => { checking = null; const b = $('tc-reconnect'); if (b) b.disabled = false; });
    const b = $('tc-reconnect'); if (b) b.disabled = true;
    return checking;
  }
  async function reload() {
    if (stopped()) return;
    const c = context();
    const warning = c.joined || c.inCall
      ? 'Reload this page?\n\nYour temporary chat, unsent draft and media in this tab will be cleared, and your call will end. The room link and username will be kept for you to rejoin. Other members are not reset.'
      : 'Reload TempChat? Your room link and typed username will be kept, but unsaved page state will be lost.';
    if (!confirm(warning)) return;
    if (navigator.onLine === false && !confirm('Your device appears offline. The page might not load until your connection returns. Reload anyway?')) return;
    reloading = true; window.__tempChatReloading = true;
    status('Reloading…', 'checking');
    const room = String(c.room || '').trim().toUpperCase().slice(0, 24);
    try { sessionStorage.setItem(DRAFT, JSON.stringify({ room, name: c.name.slice(0, 24), admin: c.admin, savedAt: Date.now() })); } catch (_) {}
    const url = new URL('/', location.origin);
    if (room) url.searchParams.set('room', room);
    if (c.admin) url.searchParams.set('admin', '1');
    url.searchParams.set('_reload', String(Date.now()));
    // No user data besides room/name is saved. No transcript or media recovery.
    try {
      if (window.TempChatExit?.reload) {
        const completed = await Promise.race([window.TempChatExit.reload(url.href).then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 6500))]);
        if (completed) return;
      }
    } catch (_) {}
    location.replace(url.href);
  }
  const dialog = document.createElement('dialog'); dialog.id = 'tc-refresh-dialog'; dialog.className = 'tc-device-dialog'; dialog.setAttribute('aria-labelledby', 'tc-refresh-title');
  dialog.innerHTML = '<header><h2 id="tc-refresh-title">Refresh TempChat</h2><button type="button" class="tc-close" aria-label="Close refresh options">✕</button></header><div class="tc-device-body"><p>Back after a while, or something not responding? Check the room connection first. If the interface is still stuck, reload the page.</p><p id="tc-refresh-status" role="status">Ready to check.</p><div class="tc-device-actions"><button type="button" id="tc-reconnect">Check / reconnect</button><button type="button" id="tc-reload-page">Reload page</button></div><div class="tc-device-warning"><strong>Reload starts a fresh page</strong><p>It clears this tab’s temporary chat, draft and media, and ends its call. Your room link and username stay ready for rejoining; other members are not reset. Reconnection may require joining a call again.</p></div><p>Fully frozen browser? An in-page button may not respond. Close and reopen the tab/app using the browser’s controls.</p></div>';
  document.body.append(dialog);
  function open(event) { event?.preventDefault(); $('more-sheet')?.classList.add('hidden'); if (!dialog.open) dialog.showModal(); }
  dialog.querySelector('.tc-close').onclick = () => dialog.close();
  $('tc-reconnect').onclick = () => check({ manual: true }); $('tc-reload-page').onclick = reload;
  function trigger(parent, prepend = false) {
    if (!parent) return;
    const a = document.createElement('a'); a.href = ''; a.className = 'tc-refresh-trigger'; a.textContent = '↻ Refresh'; a.title = 'Check connection or reload this page'; a.onclick = open;
    if (prepend) parent.prepend(a); else parent.append(a);
  }
  trigger(document.querySelector('.tc-room-tools'), true);
  trigger(document.querySelector('.call-screen-header'));
  const menu = document.querySelector('#more-sheet .more-sheet-actions');
  if (menu) { const b = document.createElement('button'); b.type = 'button'; b.className = 'more-sheet-item'; b.textContent = '↻ Refresh / reconnect'; b.onclick = open; menu.append(b); }
  $('tc-join-refresh')?.addEventListener('click', open);
  function restoreIdentity() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); sessionStorage.removeItem(DRAFT);
      if (!saved || Date.now() - saved.savedAt > 5 * 60000 || saved.room !== ($('room')?.value || '')) return;
      if ($('username') && !window.TempChatAdminMode) $('username').value = saved.name;
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreIdentity); else restoreIdentity();
  const s = context().socket;
  if (s) {
    s.on('connect', () => status(context().joined ? 'Rejoining…' : 'Server reachable', 'online'));
    s.on('room-ready', () => status('Connected', 'online'));
    s.on('disconnect', () => { if (window.__isScreenSharing) $('screen-share-button')?.click(); if (!stopped()) status('Disconnected', 'offline'); });
    s.on('connect_error', () => { if (!stopped()) status('Connection unavailable', 'offline'); });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt >= 60000) { hiddenAt = 0; check(); }
  });
  window.addEventListener('online', () => { if (!document.hidden) check({ force: true }); });
  window.addEventListener('offline', () => status('Offline', 'offline'));
  window.addEventListener('pageshow', e => { if (e.persisted) check({ force: true }); });
  window.addEventListener('focus', () => { if (Date.now() - lastPulse >= 60000) check(); });
  setInterval(() => { if (!document.hidden) { if (Date.now() - lastPulse >= 60000) check(); lastPulse = Date.now(); } }, 5000);
  window.TempChatRefresh = { check, open, reload };
  const guide = document.querySelector('.guide-sections');
  if (guide) { const section = document.createElement('div'); section.className = 'guide-section-item'; const h = document.createElement('h5'); h.textContent = '↻ Refresh & reconnect'; const p = document.createElement('p'); p.textContent = 'Use Refresh beside Exit, in Settings, on the join page or in the call header. Check / reconnect tries to repair the connection without wiping visible chat. Reload page ends your call and clears local temporary chat/media, keeping your room link and username ready to rejoin. The app checks stale connections on return but never automatically reloads your chat.'; section.append(h, p); guide.prepend(section); }
})();
