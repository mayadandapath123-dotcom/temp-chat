/* Native camera zoom when exposed; explicit digital crop otherwise.
   Browser zoom capabilities do NOT identify optical versus sensor/digital zoom.
   Changes glide between levels (about 380 ms, ease-out) instead of jumping:
   the local preview, the frames sent to the call and the device lens all follow
   the same eased curve. Without an animation frame source (tests) changes are instant. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TempChatZoom = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const states = new WeakMap();
  const RAMP_MS = 380;
  const ease = t => 1 - Math.pow(1 - t, 3); // ease-out cubic, like phone camera apps
  const canAnimate = () => typeof requestAnimationFrame === 'function' && typeof performance !== 'undefined';
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  const listeners = new Set();
  function notify(track) { for (const fn of listeners) { try { fn(track); } catch (_) {} } }

  function state(track) {
    if (!track) return { factor: 1, digital: 1, mode: 'none' };
    if (!states.has(track)) {
      let cap = null; try { cap = track.getCapabilities?.().zoom; } catch (_) {}
      const native = cap && Number.isFinite(track.getSettings?.().zoom) && Number.isFinite(cap.min) && Number.isFinite(cap.max) && cap.min > 0 && cap.max >= cap.min && typeof track.applyConstraints === 'function';
      states.set(track, { factor: 1, digital: 1, mode: 'none', cap: native ? cap : null, nativeUsed: false, chain: Promise.resolve(), target: 1, interrupt: false });
    }
    return states.get(track);
  }
  function snap(s, cap, factor) {
    const raw = cap.min * factor;
    return Math.min(cap.max, cap.min + Math.round((raw - cap.min) / (cap.step || .01)) * (cap.step || .01));
  }
  async function applyNative(track, s, value) {
    await track.applyConstraints({ advanced: [{ zoom: value }] });
    const actual = track.getSettings?.().zoom;
    // Some browsers silently ignore unsupported advanced constraints.
    if (!Number.isFinite(actual) || Math.abs(actual - value) > Math.max(.05, (s.cap.step || .01) * 1.1)) throw new Error('Device ignored zoom.');
    return actual;
  }
  // Glide the digital crop from its current value to `to`.
  async function glideDigital(track, s, to) {
    const from = s.digital || 1;
    if (!canAnimate() || Math.abs(from - to) < .02) { s.digital = to; notify(track); return; }
    const start = performance.now();
    for (;;) {
      await nextFrame();
      if (track.readyState === 'ended') return;
      const t = Math.min(1, (performance.now() - start) / RAMP_MS);
      // Interpolate in log space so 1x→10x feels even, not front-loaded.
      s.digital = from * Math.pow(to / from, s.interrupt ? 1 : ease(t));
      notify(track);
      if (t >= 1 || s.interrupt) { s.digital = to; notify(track); return; }
    }
  }
  // Step the lens/sensor zoom along the same curve (each step waits for the device).
  async function glideNative(track, s, toValue) {
    const from = Number.isFinite(track.getSettings?.().zoom) ? track.getSettings().zoom : s.cap.min;
    if (!canAnimate() || Math.abs(from - toValue) < (s.cap.step || .01) * 1.5) return applyNative(track, s, toValue);
    const start = performance.now();
    let actual = from;
    for (;;) {
      const t = Math.min(1, (performance.now() - start) / RAMP_MS);
      const value = t >= 1 || s.interrupt ? toValue : snap(s, s.cap, (from * Math.pow(toValue / from, ease(t))) / s.cap.min);
      actual = await applyNative(track, s, value);
      s.factor = actual / s.cap.min; notify(track);
      if (t >= 1 || s.interrupt) return actual;
      await nextFrame();
    }
  }
  function set(track, factor) {
    if (!track || track.readyState === 'ended') return Promise.reject(new Error('Turn the camera on first.'));
    if (!Number.isFinite(factor) || factor < 1 || factor > 10) return Promise.reject(new Error('Choose zoom from 1× to 10×.'));
    const s = state(track);
    s.target = factor; s.interrupt = true; // a newer request finishes the running glide quickly
    const work = async () => {
      s.interrupt = false;
      if (track.readyState === 'ended') throw new Error('Camera changed. Select zoom again.');
      if (s.cap) {
        const raw = s.cap.min * factor;
        if (raw <= s.cap.max) {
          try {
            if (s.digital !== 1) await glideDigital(track, s, 1); // hand a digital crop back to the lens smoothly
            const actual = await glideNative(track, s, snap(s, s.cap, factor));
            s.factor = actual / s.cap.min; s.digital = 1; s.mode = 'camera'; s.nativeUsed = true; notify(track);
            return { ...s };
          } catch (_) { /* Revert the lens/sensor zoom before using a digital crop. */ }
        }
        // Reset to baseline even if a partially applied native request failed.
        const beforeReset = track.getSettings?.().zoom;
        if (s.nativeUsed || (Number.isFinite(beforeReset) && Math.abs(beforeReset - s.cap.min) > .05)) {
          await track.applyConstraints({ advanced: [{ zoom: s.cap.min }] });
          const reset = track.getSettings?.().zoom;
          if (!Number.isFinite(reset) || Math.abs(reset - s.cap.min) > .05) throw new Error('Camera zoom could not reset. Try switching the camera.');
        }
      }
      s.mode = factor === 1 ? 'none' : 'digital'; s.nativeUsed = false; s.factor = factor;
      await glideDigital(track, s, factor);
      return { ...s };
    };
    const result = s.chain.then(work, work); s.chain = result.catch(() => {}); return result;
  }
  function draw(ctx, video, width, height) {
    const track = video.srcObject?.getVideoTracks?.()[0];
    const zoom = state(track).digital || 1;
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return;
    const sw = w / zoom, sh = h / zoom;
    ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, width, height);
  }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  return { state, set, draw, onChange };
});
