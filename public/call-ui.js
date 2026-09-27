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
    const ids = ['mute-button', 'camera-button', 'flip-camera-button', 'screen-share-button', 'call-chat-toggle-btn', 'call-settings-button', 'leave-call'];
    const nodes = ids.map($).filter(Boolean);
    if (nodes.length) dock.append(...nodes);
    const labels = { 'mute-button': 'Microphone', 'camera-button': 'Camera', 'flip-camera-button': 'Flip camera', 'screen-share-button': 'Share', 'call-chat-toggle-btn': 'Chat', 'call-settings-button': 'Settings', 'leave-call': 'Leave call' };
    for (const [id, label] of Object.entries(labels)) { const n = $(id); if (n && !n.getAttribute('aria-label')) n.setAttribute('aria-label', label); }
  }

  function adoptHelpers() {
    // Mic status becomes the header subtitle; zoom presets sit on your own tile like a camera app.
    const info = screen.querySelector('.call-header-info');
    const chip = $('mic-status-chip'); if (chip && info && chip.parentNode !== info) info.append(chip);
    const zoom = document.querySelector('.tc-zoom-call'), self = grid.querySelector('.video-tile.self-tile');
    if (zoom) { const home = self || bottom; if (zoom.parentNode !== home) home.append(zoom); }
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
  function decorate(tile) {
    if (tile.querySelector('.tile-share-badge')) return;
    const badge = document.createElement('span'); badge.className = 'tile-share-badge'; badge.textContent = 'Sharing';
    tile.append(badge);
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
      for (const t of list) t.classList.toggle('fit-contain', t === pinned || t.classList.contains('is-sharing'));
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
      t.classList.toggle('fit-contain', t.classList.contains('is-sharing') || mismatch > 1.75);
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
  }

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
