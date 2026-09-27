(function () {
  'use strict';
  const controls = new Map();
  function make(kind, parent) {
    const box = document.createElement('div'); box.className = `tc-zoom-controls tc-zoom-${kind}`;
    box.setAttribute('aria-label', kind === 'call' ? 'Video call camera zoom' : 'Photo camera zoom');
    const row = document.createElement('div'); row.className = 'tc-zoom-buttons';
    const label = document.createElement('small'); label.className = 'tc-zoom-label'; label.setAttribute('aria-live', 'polite');
    box.append(row, label);
    if (kind === 'call') parent.before(box); else parent.append(box);
    const c = { box, row, label, video: null, track: null, busy: false, pending: null, generation: 0 };
    for (const factor of [1, 2, 3, 10]) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = `${factor}×`; b.dataset.zoom = factor;
      b.setAttribute('aria-label', `${factor} times zoom`); row.append(b);
      b.onclick = () => apply(c, factor);
    }
    controls.set(kind, c); return c;
  }
  function paint(c) {
    const s = window.TempChatZoom.state(c.track);
    const shown = c.pending || s.factor;
    for (const b of c.row.children) { b.disabled = !c.track || c.track.readyState === 'ended'; b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.zoom) - shown) < .06)); }
    c.label.textContent = c.busy ? 'Adjusting zoom…' : s.mode === 'digital' ? `${s.factor.toFixed(1)}× digital · quality reduces at high zoom` : s.mode === 'camera' && s.factor > 1 ? `${s.factor.toFixed(1)}× device zoom · not guaranteed optical` : '1× · choose camera zoom';
    if (c.video) { c.video.classList.add('tc-zoom-preview'); c.video.style.setProperty('--tc-digital-zoom', s.digital || 1); }
  }
  // The preview follows every animation frame of the glide, not just the end.
  window.TempChatZoom.onChange?.(track => {
    for (const c of controls.values()) if (c.track === track && c.video) c.video.style.setProperty('--tc-digital-zoom', window.TempChatZoom.state(track).digital || 1);
  });
  async function apply(c, factor) {
    if (!c.track || c.track.readyState === 'ended') return;
    const generation = c.generation; c.busy = true; c.pending = factor; paint(c); // pressed state responds instantly; taps during a glide are queued, never ignored
    try { await window.TempChatZoom.set(c.track, factor); lastSentFrameLength = 0; staticFrameSkips = 0; }
    catch (e) { if (generation === c.generation) showToast(e.message); }
    finally { if (generation === c.generation && c.pending === factor) { c.busy = false; c.pending = null; paint(c); } }
  }
  function sync() {
    const callVideo = document.querySelector('.self-tile video');
    const dock = document.querySelector('.call-controls');
    const modal = document.getElementById('camera-modal');
    if (dock && !controls.has('call')) make('call', dock);
    if (modal && (!controls.has('photo') || !controls.get('photo').box.isConnected)) make('photo', modal);
    for (const [kind, c] of controls) {
      const v = kind === 'call' ? callVideo : document.getElementById('camera-stream');
      const track = v?.srcObject?.getVideoTracks?.()[0] || null;
      const disabled = kind === 'call' && (!inCall || isCameraOff || window.__isScreenSharing);
      c.box.classList.toggle('hidden', Boolean(disabled || !track || track.readyState === 'ended'));
      if (c.track !== track || c.video !== v) {
        c.generation++; c.video = v; c.track = track; c.busy = false; paint(c);
        if (track && track.readyState === 'live' && !disabled) apply(c, 1);
      }
    }
  }
  const guide = document.querySelector('.guide-sections');
  if (guide) {
    const entry = document.createElement('div'); entry.className = 'guide-section-item';
    const heading = document.createElement('h5'); heading.textContent = '⌕ Camera zoom';
    const body = document.createElement('p'); body.textContent = 'Photo and call cameras have 1×, 2×, 3× and 10× presets that glide smoothly between levels. Supported device zoom is used where available; other levels use a digital crop. Optical zoom cannot be guaranteed through browser APIs. Zoom affects the photo you send or the video your call partners see. In a call the presets sit on your own tile.';
    entry.append(heading, body); guide.prepend(entry);
  }
  setInterval(sync, 300); sync();
})();
