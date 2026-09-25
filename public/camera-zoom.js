/* Native camera zoom when exposed; explicit digital crop otherwise.
   Browser zoom capabilities do NOT identify optical versus sensor/digital zoom. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TempChatZoom = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const states = new WeakMap();
  function state(track) {
    if (!track) return { factor: 1, digital: 1, mode: 'none' };
    if (!states.has(track)) {
      let cap = null; try { cap = track.getCapabilities?.().zoom; } catch (_) {}
      const native = cap && Number.isFinite(track.getSettings?.().zoom) && Number.isFinite(cap.min) && Number.isFinite(cap.max) && cap.min > 0 && cap.max >= cap.min && typeof track.applyConstraints === 'function';
      states.set(track, { factor: 1, digital: 1, mode: 'none', cap: native ? cap : null, nativeUsed: false, chain: Promise.resolve() });
    }
    return states.get(track);
  }
  function set(track, factor) {
    if (!track || track.readyState === 'ended') return Promise.reject(new Error('Turn the camera on first.'));
    if (!Number.isFinite(factor) || factor < 1 || factor > 10) return Promise.reject(new Error('Choose zoom from 1× to 10×.'));
    const s = state(track);
    const work = async () => {
      if (track.readyState === 'ended') throw new Error('Camera changed. Select zoom again.');
      if (s.cap) {
        const raw = s.cap.min * factor;
        const value = Math.min(s.cap.max, s.cap.min + Math.round((raw - s.cap.min) / (s.cap.step || .01)) * (s.cap.step || .01));
        if (raw <= s.cap.max) {
          try {
            await track.applyConstraints({ advanced: [{ zoom: value }] });
            const actual = track.getSettings?.().zoom;
            // Some browsers silently ignore unsupported advanced constraints.
            if (!Number.isFinite(actual) || Math.abs(actual - value) > Math.max(.05, (s.cap.step || .01) * 1.1)) throw new Error('Device ignored zoom.');
            s.factor = actual / s.cap.min; s.digital = 1; s.mode = 'camera'; s.nativeUsed = true;
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
      s.factor = factor; s.digital = factor; s.mode = factor === 1 ? 'none' : 'digital'; s.nativeUsed = false;
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
  return { state, set, draw };
});
