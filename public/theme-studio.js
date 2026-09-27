/* Theme studio: true-to-device wallpaper preview, crop, colours taken from the
   photo, and the Liquid glass look. Everything stays room-shared and temporary. */
(function () {
  'use strict';
  const el = (tag, text = '', cls = '') => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const PHONE = 0.62, LAPTOP = 1.8, MAX_BYTES = 220 * 1024;

  // ---- colour helpers ----
  const hexToRgb = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) { const d = max - min; s = l > .5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return { h, s, l };
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  const hsl = (h, s, l) => '#' + hslToRgb(h, s, l).map(v => v.toString(16).padStart(2, '0')).join('');
  const rgba = (hex, a) => { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

  // Two colours in, a complete palette out. Deterministic, so every member builds the same theme.
  const CUSTOM_VARS = ['--bg', '--surface', '--surface-2', '--surface-3', '--text', '--text-dim', '--muted', '--subtle', '--accent', '--accent-light', '--accent-dark', '--accent-gradient', '--accent-subtle', '--accent-border', '--accent-glow', '--bg-gradient', '--glass-bg', '--glass-bg-heavy', '--glass-border', '--glass-border-light'];
  function buildPalette(colors) {
    const base = hexToRgb(colors && colors[0]), accent = hexToRgb(colors && colors[1]);
    if (!base || !accent) return null;
    const b = rgbToHsl(...base), a = rgbToHsl(...accent);
    const bs = clamp(b.s * .65, .1, .42), as = clamp(Math.max(a.s, .5), .5, .88);
    const bg = hsl(b.h, bs, .07), surface = hsl(b.h, bs, .11), acc = hsl(a.h, as, .6);
    return {
      '--bg': bg, '--surface': surface, '--surface-2': hsl(b.h, bs, .15), '--surface-3': hsl(b.h, bs, .21),
      '--text': '#f8f9fc', '--text-dim': '#c9ccd8', '--muted': '#8a8d9c', '--subtle': '#575a68',
      '--accent': acc, '--accent-light': hsl(a.h, as, .8), '--accent-dark': hsl(a.h, as, .45),
      '--accent-gradient': `linear-gradient(135deg,${hsl(a.h, as, .78)},${hsl(a.h, as, .52)})`,
      '--accent-subtle': rgba(acc, .16), '--accent-border': rgba(acc, .45), '--accent-glow': rgba(acc, .35),
      '--bg-gradient': `radial-gradient(at 50% 0%,${hsl(b.h, bs, .17)},${bg} 75%)`,
      '--glass-bg': rgba(surface, .84), '--glass-bg-heavy': rgba(bg, .94),
      '--glass-border': 'rgba(255,255,255,.12)', '--glass-border-light': 'rgba(255,255,255,.22)',
    };
  }
  function applyPalette(target, palette, colors) {
    const vars = palette === 'custom' ? buildPalette(colors) : null;
    target.dataset.roomTheme = vars ? 'custom' : (palette === 'custom' ? 'gold' : palette);
    for (const k of CUSTOM_VARS) { if (vars) target.style.setProperty(k, vars[k]); else target.style.removeProperty(k); }
  }

  // Dominant colour + the most vivid distinct colour of a photo (runs locally, nothing is uploaded).
  async function extractColors(source) {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
      const S = 56, canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, S, S);
      const data = ctx.getImageData(0, 0, S, S).data, bins = new Map();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2], key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
        let bin = bins.get(key); if (!bin) { bin = { n: 0, r: 0, g: 0, b: 0 }; bins.set(key, bin); }
        bin.n++; bin.r += r; bin.g += g; bin.b += b;
      }
      const list = [...bins.values()].map(x => { const r = x.r / x.n, g = x.g / x.n, b = x.b / x.n; return { n: x.n, r, g, b, ...rgbToHsl(r, g, b) }; });
      if (!list.length) return null;
      const byCount = [...list].sort((p, q) => q.n - p.n);
      const base = byCount.find(c => c.l > .05 && c.l < .92) || byCount[0];
      const hueGap = (x, y) => { const d = Math.abs(x - y) % 360; return Math.min(d, 360 - d); };
      let accent = null, best = -1;
      for (const c of list) {
        if (c.s < .28 || c.l < .18 || c.l > .85) continue;
        if (hueGap(c.h, base.h) < 25 && Math.abs(c.l - base.l) < .3) continue; // must read as a different colour than the base
        const score = c.n * (.35 + c.s) * (.5 + .5 * Math.min(1, hueGap(c.h, base.h) / 60));
        if (score > best) { best = score; accent = c; }
      }
      const toHex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
      return [toHex(base), accent ? toHex(accent) : hsl(base.h + 30, .62, .6)];
    } finally { if (typeof source !== 'string') URL.revokeObjectURL(url); }
  }

  // ---- crop tool ----
  function loadImage(file) {
    const url = URL.createObjectURL(file);
    const img = new Image(); img.src = url; img.draggable = false;
    return img.decode().then(() => ({ img, url }), () => { URL.revokeObjectURL(url); throw new Error('Choose a JPEG, PNG, WebP, or AVIF photo.'); });
  }
  function cropper(img, ratio) {
    const wrap = el('div', '', 'tc-crop'), frame = el('div', '', 'tc-crop-frame'), hint = el('p', 'Drag to move · pinch or use the slider to zoom', 'tc-note tc-crop-hint');
    frame.style.aspectRatio = String(ratio); frame.append(img); img.className = 'tc-crop-img';
    const zoomLabel = el('label', '', 'tc-field-label'); const zoomText = el('span', 'Zoom'); const range = el('input'); range.type = 'range'; range.min = '1'; range.max = '3'; range.step = '0.01'; range.value = '1'; range.setAttribute('aria-label', 'Crop zoom');
    zoomLabel.append(zoomText, range); wrap.append(frame, hint, zoomLabel);
    const nw = img.naturalWidth, nh = img.naturalHeight; let fw = 0, fh = 0, cover = 1, scale = 1, tx = 0, ty = 0;
    function paint() {
      const s = cover * scale, w = nw * s, h = nh * s, maxX = Math.max(0, (w - fw) / 2), maxY = Math.max(0, (h - fh) / 2);
      tx = clamp(tx, -maxX, maxX); ty = clamp(ty, -maxY, maxY);
      img.style.width = w + 'px'; img.style.height = h + 'px'; img.style.transform = `translate(${(fw - w) / 2 + tx}px,${(fh - h) / 2 + ty}px)`;
    }
    function measure() { fw = frame.clientWidth; fh = frame.clientHeight; if (fw && fh) { cover = Math.max(fw / nw, fh / nh); paint(); } }
    const pointers = new Map(); let pinchStart = 0, pinchScale = 1;
    frame.addEventListener('pointerdown', e => { frame.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinchStart = Math.hypot(p.x - q.x, p.y - q.y); pinchScale = scale; } e.preventDefault(); });
    frame.addEventListener('pointermove', e => {
      const prev = pointers.get(e.pointerId); if (!prev) return;
      if (pointers.size === 1) { tx += e.clientX - prev.x; ty += e.clientY - prev.y; }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStart) { const [p, q] = [...pointers.values()]; scale = clamp(pinchScale * Math.hypot(p.x - q.x, p.y - q.y) / pinchStart, 1, 3); range.value = String(scale); }
      paint();
    });
    const release = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = 0; };
    frame.addEventListener('pointerup', release); frame.addEventListener('pointercancel', release);
    frame.addEventListener('wheel', e => { e.preventDefault(); scale = clamp(scale * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 1, 3); range.value = String(scale); paint(); }, { passive: false });
    range.oninput = () => { scale = Number(range.value); paint(); };
    if (window.ResizeObserver) new ResizeObserver(measure).observe(frame);
    requestAnimationFrame(measure);
    async function blob() {
      if (!fw || !fh) measure();
      const s = cover * scale, sx = ((nw * s - fw) / 2 - tx) / s, sy = ((nh * s - fh) / 2 - ty) / s, sw = fw / s, sh = fh / s;
      const long = 1280, ow = ratio >= 1 ? long : Math.round(long * ratio), oh = ratio >= 1 ? Math.round(long / ratio) : long;
      const canvas = document.createElement('canvas'); canvas.width = ow; canvas.height = oh;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#141824'; ctx.fillRect(0, 0, ow, oh); ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
      for (let q = .82, tries = 0; tries < 7; tries++, q -= .09) {
        const out = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', Math.max(.3, q)));
        if (out && out.size <= MAX_BYTES) return out;
        if (tries === 3) { canvas.width = Math.round(ow * .75); canvas.height = Math.round(oh * .75); ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height); }
      }
      throw new Error('This photo could not be compressed small enough. Try another photo.');
    }
    return { element: wrap, blob, setRatio(r) { ratio = r; frame.style.aspectRatio = String(r); tx = 0; ty = 0; requestAnimationFrame(measure); } };
  }

  // ---- the dialog ----
  function open(ctx) {
    const { body, request, note, button, palettes, theme, wallpaperURL, onApplied } = ctx;
    const phone = matchMedia('(max-width: 760px)').matches;
    let selected = theme.palette, shade = theme.shade, colors = theme.colors || null, action = 'keep', photo = null, draftURL = null, crop = null, cropImage = null, busy = false, job = 0;
    let previewRatio = phone ? PHONE : LAPTOP, cropRatio = previewRatio;

    // Preview: a small chat drawn with the very same wallpaper rules as the real room.
    const preview = el('div', '', 'tc-theme-preview tc-device-preview');
    const pvHeader = el('div', '', 'tc-pv-header'); pvHeader.append(el('span', '✦'), el('strong', document.querySelector('#room-name .tc-room-title')?.textContent || 'Your room'), el('i', '', 'tc-pv-dot'));
    const pvBody = el('div', '', 'tc-pv-body'); pvBody.style.aspectRatio = String(previewRatio);
    const pvMsgs = el('div', '', 'tc-pv-msgs'); pvMsgs.append(el('div', 'A little more you.', 'tc-preview-bubble'), el('div', 'Shared with everyone ✦', 'tc-preview-own')); pvBody.append(pvMsgs);
    const pvComposer = el('div', '', 'tc-pv-composer'); pvComposer.append(el('span', 'Type a message…'), el('b', '↑'));
    preview.append(pvHeader, pvBody, pvComposer);
    const pvBar = el('div', '', 'tc-pv-bar'); const pvLabel = el('span', 'Preview · how it looks on a', 'tc-note'); const seg = el('div', '', 'tc-seg');
    const segPhone = button(seg, 'Phone', () => setPreview(PHONE), 'tc-seg-btn'), segLaptop = button(seg, 'Laptop', () => setPreview(LAPTOP), 'tc-seg-btn');
    pvBar.append(pvLabel, seg); body.append(pvBar, preview);
    const cropHost = el('div', '', 'tc-crop-host hidden'); body.append(cropHost); // crop tool appears right under the preview
    function setPreview(r) {
      previewRatio = r; pvBody.style.aspectRatio = String(r);
      // Keep the true shape but a sensible size: derive the width from a fixed body height.
      const bodyH = r < 1 ? (phone ? 230 : 300) : (phone ? 170 : 230);
      preview.style.width = `min(100%, ${Math.round(bodyH * r)}px)`;
      segPhone.setAttribute('aria-pressed', String(r === PHONE)); segLaptop.setAttribute('aria-pressed', String(r === LAPTOP));
    }
    function updatePreview() {
      applyPalette(preview, selected, colors);
      const image = action === 'remove' ? null : draftURL || wallpaperURL;
      pvBody.style.backgroundImage = image ? `linear-gradient(rgba(0,0,0,${shade / 100}),rgba(0,0,0,${shade / 100})),url("${image}")` : '';
      pvBody.classList.toggle('tc-has-wallpaper', Boolean(image));
      swatches.replaceChildren(); if (colors) for (const c of colors) { const s = el('i', '', 'tc-swatch'); s.style.background = c; swatches.append(s); }
      fromPhoto.disabled = !(draftURL || wallpaperURL) || busy;
    }
    setPreview(previewRatio);

    // Palettes, including Liquid glass and "from photo".
    const grid = el('div', '', 'tc-theme-grid'); body.append(grid);
    const choices = {};
    for (const [key, title] of Object.entries(palettes)) {
      const b = button(grid, title, () => { selected = key; paintChoices(); updatePreview(); }, 'tc-theme-choice');
      b.dataset.palette = key; b.dataset.roomTheme = key; choices[key] = b;
    }
    const fromPhoto = button(grid, '✨ Colours from photo', () => pickColors(true), 'tc-theme-choice tc-from-photo'); fromPhoto.dataset.palette = 'custom'; choices.custom = fromPhoto;
    const swatches = el('span', '', 'tc-swatches'); fromPhoto.append(swatches);
    function paintChoices() { for (const [k, b] of Object.entries(choices)) b.setAttribute('aria-pressed', String(k === selected)); }
    async function pickColors(select) {
      const source = draftURL || wallpaperURL; if (!source) return;
      const myJob = ++job; busy = true; updatePreview(); info.textContent = 'Reading the photo’s colours…';
      try { const found = await extractColors(photo || source); if (myJob !== job) return; colors = found; if (select) selected = 'custom'; info.textContent = 'Two colours picked from the photo: a base tone and an accent.'; }
      catch (_) { if (myJob === job) info.textContent = 'Could not read colours from this photo.'; }
      finally { if (myJob === job) { busy = false; paintChoices(); updatePreview(); } }
    }

    // Photo → crop → wallpaper.
    const label = el('label', 'Photo wallpaper', 'tc-field-label'); const input = el('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp,image/avif'; label.append(input); body.append(label);
    const info = el('p', 'Crop it the way you want it; the preview above shows the real result. At most 220 KB, visible to everyone.', 'tc-note'); body.append(info);
    const shadeLabel = el('label', '', 'tc-field-label'); const shadeText = el('span', `Wallpaper dark overlay · ${shade}%`); const range = el('input');
    range.type = 'range'; range.min = '20'; range.max = '85'; range.value = shade; range.setAttribute('aria-label', 'Wallpaper dark overlay');
    shadeLabel.append(shadeText, range); body.append(shadeLabel);
    range.oninput = () => { shade = Number(range.value); shadeText.textContent = `Wallpaper dark overlay · ${shade}%`; updatePreview(); };
    const actions = el('div', '', 'tc-actions'); body.append(actions);
    button(actions, 'Remove wallpaper', () => { job++; busy = false; photo = null; action = 'remove'; input.value = ''; closeCrop(); if (draftURL) URL.revokeObjectURL(draftURL); draftURL = null; if (selected === 'custom') { selected = 'gold'; colors = null; paintChoices(); } info.textContent = 'Wallpaper will be removed when you apply.'; updatePreview(); }, 'tc-button tc-secondary');
    const apply = button(actions, 'Apply for everyone', async () => {
      if (busy) return;
      if (selected === 'custom' && !colors) { info.textContent = 'Pick “Colours from photo” first, or choose another theme.'; return; }
      apply.disabled = true;
      try {
        await request('set-room-theme', { palette: selected, shade, wallpaperAction: action, colors: selected === 'custom' ? colors : undefined, ...(photo && action === 'replace' ? { wallpaper: await photo.arrayBuffer() } : {}) });
        onApplied();
      } catch (e) { info.textContent = e.message; } finally { apply.disabled = false; }
    });
    function closeCrop() { cropHost.classList.add('hidden'); cropHost.replaceChildren(); if (cropImage) { URL.revokeObjectURL(cropImage.url); cropImage = null; } crop = null; }
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      if (file.size > 12 * 1024 * 1024) { info.textContent = 'Choose a photo smaller than 12 MB.'; return; }
      closeCrop();
      try { cropImage = await loadImage(file); } catch (e) { info.textContent = e.message; return; }
      cropRatio = previewRatio; crop = cropper(cropImage.img, cropRatio);
      const head = el('div', '', 'tc-pv-bar'); head.append(el('span', 'Crop for a', 'tc-note'));
      const cseg = el('div', '', 'tc-seg'); const cp = button(cseg, 'Phone', () => setCrop(PHONE), 'tc-seg-btn'), cl = button(cseg, 'Laptop', () => setCrop(LAPTOP), 'tc-seg-btn'); head.append(cseg);
      function setCrop(r) { cropRatio = r; crop.setRatio(r); cp.setAttribute('aria-pressed', String(r === PHONE)); cl.setAttribute('aria-pressed', String(r === LAPTOP)); setPreview(r); }
      const use = button(el('div', '', 'tc-actions'), 'Use this crop', async () => {
        if (busy) return; const myJob = ++job; busy = true; use.disabled = true; info.textContent = 'Preparing your wallpaper…';
        try {
          const out = await crop.blob(); if (myJob !== job) return;
          photo = out; action = 'replace'; if (draftURL) URL.revokeObjectURL(draftURL); draftURL = URL.createObjectURL(out);
          info.textContent = `Ready · ${Math.ceil(out.size / 1024)} KB. The preview shows exactly this crop.`; closeCrop(); updatePreview();
          if (selected === 'custom') await pickColors(false);
        } catch (e) { if (myJob === job) info.textContent = e.message; }
        finally { if (myJob === job) { busy = false; updatePreview(); } }
      }, 'tc-button');
      cropHost.replaceChildren(head, crop.element, use.parentNode); cropHost.classList.remove('hidden'); setCrop(cropRatio);
      requestAnimationFrame(() => { try { cropHost.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {} });
    };
    paintChoices(); updatePreview();
    note(body, 'No upload to a photo-hosting service. The room keeps its wallpaper and colours in server memory until everyone leaves, the room is reset, or the server restarts.');
    return () => { job++; closeCrop(); if (draftURL) URL.revokeObjectURL(draftURL); };
  }

  window.TempChatThemeStudio = { open, applyPalette, buildPalette, extractColors };
})();
