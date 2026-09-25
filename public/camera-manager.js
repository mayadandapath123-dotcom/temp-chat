'use strict';
/* Camera-only acquisition. Stop the old lens before opening another on phones.
   Never requests, stops, replaces, or unmutes an audio track. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.TempChatCamera = factory(root.navigator.mediaDevices);
})(typeof window !== 'undefined' ? window : globalThis, function createCameraManager(media, pause = ms => new Promise(r => setTimeout(r, ms))) {
  const stop = stream => stream?.getTracks().forEach(t => t.stop());
  function facingForTrack(track) {
    const mode = track?.getSettings?.().facingMode;
    if (mode === 'user' || mode === 'environment') return mode;
    const label = track?.label || '';
    if (/back|rear|environment|world/i.test(label)) return 'environment';
    if (/front|user|facetime|selfie/i.test(label)) return 'user';
    return null;
  }
  function abort() { const e = new Error('Camera operation cancelled.'); e.name = 'AbortError'; return e; }
  async function open({ facing = 'user', width = 640, height = 480, previousTrack = null, active = () => true } = {}) {
    if (!media?.getUserMedia) throw new Error('Camera access requires HTTPS and a supported browser.');
    if (!active()) throw abort();
    const old = previousTrack?.getSettings?.() || {};
    const oldFacing = facingForTrack(previousTrack);
    let devices = [];
    try { devices = (await media.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId); } catch (_) {}
    if (!active()) throw abort();
    // Single-camera hardware (especially iOS/Android) often rejects acquisition
    // while any previous camera track is still running. Audio is untouched.
    if (previousTrack) { previousTrack.stop(); await pause(180); }
    if (!active()) throw abort();
    const dimensions = { width: { ideal: width }, height: { ideal: height } };
    async function get(constraints, verifySwitch = false) {
      if (!active()) throw abort();
      let stream;
      try {
        stream = await media.getUserMedia({ audio: false, video: { ...dimensions, ...constraints } });
        if (!active()) throw abort();
        const track = stream.getVideoTracks()[0];
        if (!track || track.readyState === 'ended') throw new Error('No live camera track returned.');
        const actual = facingForTrack(track), settings = track.getSettings?.() || {};
        if (verifySwitch && ((actual && actual !== facing) || (old.deviceId && settings.deviceId === old.deviceId && (!actual || actual === oldFacing)))) {
          const error = new Error('The browser returned the same or wrong camera.'); error.name = 'OverconstrainedError'; throw error;
        }
        return { stream, track, facing: actual || facing, verifiedFacing: actual, restored: false };
      } catch (e) { stop(stream); throw e; }
    }
    if (!previousTrack) {
      try { return await get({ facingMode: { ideal: facing } }); }
      catch (e) {
        if (['AbortError', 'NotAllowedError', 'SecurityError'].includes(e.name)) throw e;
        return get({}); // First open: permit a sole desktop camera.
      }
    }
    // Strict facingMode first; unlike an ideal hint, it should not silently
    // select the same lens. Explicit device IDs cover inconsistent browsers.
    const alternate = devices.filter(d => d.deviceId !== old.deviceId);
    const direction = d => facingForTrack({ label: d.label });
    alternate.sort((a, b) => Number(direction(b) === facing) - Number(direction(a) === facing));
    const attempts = [{ facingMode: { exact: facing } }, ...alternate
      .filter(d => !direction(d) || direction(d) === facing).slice(0, 4)
      .map(d => ({ deviceId: { exact: d.deviceId } }))];
    let failure;
    for (const attempt of attempts) {
      try { return await get(attempt, true); }
      catch (e) {
        failure = e;
        if (e.name === 'AbortError') throw e;
        if (['NotAllowedError', 'SecurityError'].includes(e.name)) break;
        await pause(120);
      }
    }
    // Do not leave a black preview when there is no second accessible camera.
    const recovery = [];
    if (old.deviceId) recovery.push({ deviceId: { exact: old.deviceId } });
    recovery.push({ facingMode: { ideal: oldFacing || (facing === 'user' ? 'environment' : 'user') } });
    for (const constraints of recovery) {
      try {
        const result = await get(constraints);
        return { ...result, facing: result.verifiedFacing || oldFacing || (facing === 'user' ? 'environment' : 'user'), restored: true, failure };
      } catch (e) { if (e.name === 'AbortError') throw e; }
    }
    throw failure || new Error('No accessible camera found.');
  }
  return { open, stop, facingForTrack };
});
