/* Call screen layout engine: sizes the tiles so every participant is visible on
   phones and desktops, keeps the dock to one row, and moves the small helpers
   (mic status, zoom presets) onto the stage. No call feature is removed. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const screen = $('call-screen'), grid = $('video-grid'), dock = document.querySelector('.call-controls');
  if (!screen || !grid || !dock) return;
  const GAP = 6;
  const touch = matchMedia('(hover: none)').matches;
  if (touch) screen.classList.add('tc-touch');

  // Wrap the grid in a stage so overlays survive the grid being emptied between calls.
  const stage = document.createElement('div'); stage.className = 'tc-stage';
  grid.replaceWith(stage); stage.append(grid);
  const top = document.createElement('div'); top.className = 'tc-stage-top';
  const bottom = document.createElement('div'); bottom.className = 'tc-stage-bottom';
  stage.append(top, bottom);

  // Dock: one consistent order — mic, camera, flip, share, chat, settings, end.
  function orderDock() {
    const ids = ['mute-button', 'camera-button', 'flip-camera-button', 'audio-route-button', 'screen-share-button', 'call-chat-toggle-btn', 'call-settings-button', 'leave-call'];
    const nodes = ids.map($).filter(Boolean);
    if (nodes.length) dock.append(...nodes);
    const labels = { 'mute-button': 'Microphone', 'camera-button': 'Camera', 'flip-camera-button': 'Flip camera', 'audio-route-button': 'Speaker or earpiece', 'screen-share-button': 'Share', 'call-chat-toggle-btn': 'Chat', 'call-settings-button': 'Settings', 'leave-call': 'Leave call' };
    for (const [id, label] of Object.entries(labels)) { const n = $(id); if (n && !n.getAttribute('aria-label')) n.setAttribute('aria-label', label); }
  }

  let zoomBox = null;
  function adoptHelpers() {
    // Mic status becomes the header subtitle; zoom presets sit on your own tile like a camera app.
    const info = screen.querySelector('.call-header-info');
    const chip = $('mic-status-chip'); if (chip && info && chip.parentNode !== info) info.append(chip);
    zoomBox = zoomBox && zoomBox.isConnected ? zoomBox : (document.querySelector('.tc-zoom-call') || zoomBox);
    const self = grid.querySelector('.video-tile.self-tile');
    if (zoomBox) { const home = self || bottom; if (zoomBox.parentNode !== home) home.append(zoomBox); } // re-attaches even after a call teardown removed the self tile
    const share = $('screen-share-button');
    if (share && !share.dataset.tcOrdered) { share.dataset.tcOrdered = '1'; orderDock(); }
  }

  function compactHeader() {
    const narrow = innerWidth <= 760;
    const refresh = screen.querySelector('.call-screen-header .tc-refresh-trigger');
    if (refresh) { refresh.textContent = narrow ? '↻' : '↻ Refresh'; refresh.setAttribute('aria-label', 'Refresh or reconnect'); }
    const exit = screen.querySelector('.call-screen-header .tc-exit-room');
    if (exit) exit.textContent = narrow ? 'Exit' : 'Exit Room';
  }

  const tiles = () => [...grid.querySelectorAll('.video-tile')];
  function sourceAspect(tile) {
    const v = tile.querySelector('video'), img = tile.querySelector('img.remote-frame-feed');
    if (v && v.videoWidth && v.videoHeight) return v.videoWidth / v.videoHeight;
    if (img && img.naturalWidth && img.naturalHeight && img.style.display !== 'none') return img.naturalWidth / img.naturalHeight;
    return 0;
  }
  // ---- per-tile menu: maximize for me · pin for everyone · fit/fill ----
  const peerIdOf = tile => tile.classList.contains('self-tile') ? (typeof socket !== 'undefined' ? socket.id : 'me') : tile.dataset.peerId;
  const tileFor = id => (typeof socket !== 'undefined' && id === socket.id) ? grid.querySelector('.video-tile.self-tile') : grid.querySelector(`[data-peer-id="${window.CSS && CSS.escape ? CSS.escape(id) : id}"]`);
  let spotlightId = null, openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  document.addEventListener('pointerdown', e => { if (openMenu && !openMenu.contains(e.target) && !e.target.closest('.tile-menu-btn')) closeMenu(); });
  function showMenu(tile) {
    closeMenu();
    const menu = document.createElement('div'); menu.className = 'tile-menu'; menu.setAttribute('role', 'menu');
    const name = tile.querySelector('.video-tile-tag span')?.textContent || 'this person';
    const pinned = tile.classList.contains('pinned'), spot = spotlightId && peerIdOf(tile) === spotlightId;
    const item = (label, action) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = label; b.onclick = e => { e.stopPropagation(); closeMenu(); action(); }; menu.append(b); };
    item(pinned ? '⛶ Restore layout' : '⛶ Maximize for me', () => tile.querySelector('.tile-max-btn')?.click());
    item(spot ? '📌 Unpin for everyone' : `📌 Pin ${name} for everyone`, () => { if (typeof socket !== 'undefined') socket.emit('call-spotlight', { id: spot ? null : peerIdOf(tile) }); });
    item(tile.classList.contains('fit-contain') ? '⤢ Fill the tile' : '⤡ Fit whole picture', () => { const fit = !tile.classList.contains('fit-contain'); tile.classList.toggle('fit-contain', fit); tile.dataset.fitLock = fit ? 'contain' : 'cover'; });
    tile.append(menu); openMenu = menu;
  }
  function decorate(tile) {
    if (tile.querySelector('.tile-share-badge')) return;
    const badge = document.createElement('span'); badge.className = 'tile-share-badge'; badge.textContent = 'Sharing';
    const more = document.createElement('button'); more.type = 'button'; more.className = 'tile-menu-btn'; more.title = 'Tile options'; more.setAttribute('aria-label', 'Tile options'); more.textContent = '⋯';
    more.addEventListener('click', e => { e.stopPropagation(); openMenu && openMenu.parentNode === tile ? closeMenu() : showMenu(tile); });
    tile.append(badge, more);
  }
  function applySpotlight(data) {
    const id = data && data.id ? data.id : null;
    const current = grid.querySelector('.video-tile.pinned');
    if (id) {
      const tile = tileFor(id); if (!tile) { spotlightId = id; return; }
      if (!tile.classList.contains('pinned')) tile.querySelector('.tile-max-btn')?.click();
      if (spotlightId !== id && data.by && typeof currentUsername !== 'undefined' && data.by !== currentUsername) showToast(`${data.by} pinned ${data.username || 'someone'} for everyone`);
      spotlightId = id;
    } else {
      if (spotlightId && current && peerIdOf(current) === spotlightId) current.querySelector('.tile-max-btn')?.click();
      spotlightId = null;
    }
  }

  function layout() {
    if (screen.classList.contains('hidden')) return;
    const list = tiles(); const n = list.length; if (!n) return;
    list.forEach(decorate);
    const cs = getComputedStyle(grid);
    const W = Math.max(0, grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2);
    const H = Math.max(0, grid.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2);
    if (!W || !H) return;
    const portrait = W < H;
    const pinned = grid.classList.contains('has-pinned') && grid.querySelector('.video-tile.pinned');
    if (pinned) {
      const others = n - 1;
      const thumbH = others ? Math.round(Math.min(120, Math.max(64, H * 0.17))) : 0;
      const thumbW = Math.round(thumbH * (portrait ? 0.78 : 1.5));
      grid.style.setProperty('--tc-thumb-w', thumbW + 'px'); grid.style.setProperty('--tc-thumb-h', thumbH + 'px');
      grid.style.setProperty('--tc-pinned-h', (H - (others ? thumbH + GAP : 0)) + 'px');
      for (const t of list) if (!t.dataset.fitLock) t.classList.toggle('fit-contain', t === pinned || t.classList.contains('is-sharing'));
      return;
    }
    const target = portrait ? 0.78 : 1.45; // preferred tile shape (w/h)
    let best = null;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const w = (W - GAP * (c - 1)) / c, h = (H - GAP * (r - 1)) / r;
      const area = w / h > target ? h * target * h : w * (w / target);
      if (!best || area > best.area + 1) best = { c, r, w, h, area };
    }
    const w = Math.floor(best.w), h = Math.floor(best.h);
    grid.style.setProperty('--tc-tile-w', w + 'px'); grid.style.setProperty('--tc-tile-h', h + 'px');
    const cell = w / h;
    for (const t of list) {
      const a = sourceAspect(t);
      const mismatch = a ? Math.max(a / cell, cell / a) : 1;
      if (!t.dataset.fitLock) t.classList.toggle('fit-contain', t.classList.contains('is-sharing') || mismatch > 1.75);
      t.classList.toggle('tc-narrow', w < 260);
    }
  }

  // Sharing state from the server (see call-media-state) and from this page.
  function setSharing(id, on) {
    const tile = grid.querySelector(`[data-peer-id="${window.CSS && CSS.escape ? CSS.escape(id) : id}"]`);
    if (tile) { tile.classList.toggle('is-sharing', on === true); layout(); }
  }
  if (typeof socket !== 'undefined' && socket && socket.on) {
    socket.on('call-peer-media-state', d => { if (d && d.id && 'sharing' in d) setSharing(d.id, d.sharing); });
    socket.on('call-peers', peers => setTimeout(() => (peers || []).forEach(p => p && setSharing(p.id, p.sharing)), 0));
    socket.on('call-peer-joined', p => setTimeout(() => p && setSharing(p.id, p.sharing), 0));
    socket.on('call-spotlight-state', d => setTimeout(() => applySpotlight(d), 50));
    socket.on('call-ended', () => { spotlightId = null; closeMenu(); });
  }

  // ---- Speaker ↔ earpiece (each person for themselves; Android Chrome exposes the routes) ----
  (function audioRoute() {
    const supported = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices;
    if (!supported || !touch) return;
    const btn = document.createElement('button'); btn.id = 'audio-route-button'; btn.type = 'button'; btn.className = 'call-ctl glass-ctl'; btn.title = 'Speaker or earpiece'; btn.setAttribute('aria-label', 'Switch between loudspeaker and earpiece');
    const icons = { speaker: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05A4.5 4.5 0 0016.5 12zM14 3.23v2.06a7 7 0 010 13.42v2.06a9 9 0 000-17.54z"/></svg>', earpiece: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 1H7a2 2 0 00-2 2v18a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zm0 18H7V5h10v14zm-5-2.5a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM9 6.5h6v1H9z"/></svg>' };
    let mode = 'speaker', devices = null;
    const paintRoute = () => { btn.innerHTML = icons[mode]; btn.classList.toggle('active', mode === 'earpiece'); btn.title = mode === 'earpiece' ? 'Earpiece — tap for loudspeaker' : 'Loudspeaker — tap for earpiece'; };
    async function routes() {
      const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput');
      const ear = list.find(d => /earpiece|receiver|handset/i.test(d.label)), spk = list.find(d => /speaker/i.test(d.label)) || list.find(d => d.deviceId === 'default') || list[0];
      return { ear, spk, list };
    }
    btn.addEventListener('click', async () => {
      try {
        if (typeof unlockReceiverAudioContext === 'function') unlockReceiverAudioContext();
        const ctx = typeof audioContextReceiver !== 'undefined' ? audioContextReceiver : null;
        if (!ctx || typeof ctx.setSinkId !== 'function') return showToast('Audio routing is not available in this browser.');
        devices = await routes();
        if (!devices.ear) return showToast('This phone does not expose an earpiece route to the browser.');
        mode = mode === 'earpiece' ? 'speaker' : 'earpiece';
        await ctx.setSinkId(mode === 'earpiece' ? devices.ear.deviceId : (devices.spk && devices.spk.deviceId !== 'default' ? devices.spk.deviceId : ''));
        paintRoute(); showToast(mode === 'earpiece' ? 'Playing through the earpiece' : 'Playing through the loudspeaker');
      } catch (e) { mode = 'speaker'; paintRoute(); showToast('Could not switch the audio route.'); }
    });
    paintRoute();
    const flip = $('flip-camera-button'); flip ? flip.after(btn) : dock.prepend(btn);
  })();

  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; layout(); }); };
  new MutationObserver(schedule).observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  new MutationObserver(() => { compactHeader(); schedule(); }).observe(screen, { attributes: true, attributeFilter: ['class'] });
  if (window.ResizeObserver) new ResizeObserver(schedule).observe(stage);
  addEventListener('resize', () => { compactHeader(); schedule(); });
  addEventListener('orientationchange', () => setTimeout(schedule, 250));
  setInterval(() => {
    if (screen.classList.contains('hidden')) return;
    adoptHelpers();
    const self = grid.querySelector('.video-tile.self-tile');
    if (self) self.classList.toggle('is-sharing', window.__isScreenSharing === true);
    layout();
  }, 700);
  orderDock(); adoptHelpers(); compactHeader(); schedule();
})();
