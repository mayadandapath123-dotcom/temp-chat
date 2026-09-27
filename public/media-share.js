/* Share a photo or a video from the device as your call picture.
   Used where a browser cannot capture the screen (Android Chrome, iPhone, iPad).
   The picked file is drawn onto a canvas and streamed through the normal
   call pipeline; nothing is uploaded anywhere else. */
(function () {
  'use strict';
  const MAX_DIM = 1280, VIDEO_FPS = 10;
  let input = null;

  function pickFile() {
    return new Promise(resolve => {
      if (!input) { input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,video/*'; input.style.display = 'none'; document.body.append(input); }
      input.value = '';
      let done = false;
      const finish = file => { if (done) return; done = true; input.onchange = null; input.oncancel = null; window.removeEventListener('focus', focusCheck); resolve(file || null); };
      const focusCheck = () => setTimeout(() => { if (!done && !input.files.length) finish(null); }, 2500);
      input.onchange = () => finish(input.files && input.files[0]);
      input.oncancel = () => finish(null);
      window.addEventListener('focus', focusCheck);
      input.click();
    });
  }

  function fit(w, h) {
    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    return { w: Math.max(2, Math.round(w * scale)), h: Math.max(2, Math.round(h * scale)) };
  }

  async function fromImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
      const { w, h } = fit(img.naturalWidth || img.width, img.naturalHeight || img.height);
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false });
      const paint = () => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h); };
      paint();
      const stream = canvas.captureStream(2);
      const track = stream.getVideoTracks()[0];
      // A still image never changes: repaint so browsers keep emitting frames.
      const timer = setInterval(() => { paint(); if (track && typeof track.requestFrame === 'function') track.requestFrame(); }, 500);
      return { kind: 'photo', stream, stop() { clearInterval(timer); stream.getTracks().forEach(t => t.stop()); } };
    } finally { URL.revokeObjectURL(url); }
  }

  async function fromVideo(file) {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url; video.loop = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.preload = 'auto'; video.volume = 1;
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px';
    document.body.append(video);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('This video could not be opened.')), 15000);
      video.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error('This video format is not supported here.')); };
    });
    // The video's own sound: captured into the share stream and also played here so you can follow along.
    let actx = null, audioTracks = [];
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      try {
        actx = new AC(); if (actx.state === 'suspended') await actx.resume();
        const src = actx.createMediaElementSource(video), dest = actx.createMediaStreamDestination();
        src.connect(dest); src.connect(actx.destination); audioTracks = dest.stream.getAudioTracks();
      } catch (_) { try { actx && actx.close(); } catch (__) {} actx = null; video.muted = true; }
    } else video.muted = true;
    try { await video.play(); } catch (_) { try { actx && actx.close(); } catch (__) {} video.remove(); URL.revokeObjectURL(url); throw new Error('Tap Share again to allow the video to play.'); }
    const { w, h } = fit(video.videoWidth || 640, video.videoHeight || 360);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    const stream = canvas.captureStream(VIDEO_FPS);
    for (const t of audioTracks) stream.addTrack(t);
    const timer = setInterval(() => { if (!video.paused && !video.ended) ctx.drawImage(video, 0, 0, w, h); }, Math.round(1000 / VIDEO_FPS));
    return { kind: 'video', stream, stop() { clearInterval(timer); stream.getTracks().forEach(t => t.stop()); try { video.pause(); } catch (_) {} video.remove(); URL.revokeObjectURL(url); try { actx && actx.close(); } catch (_) {} } };
  }

  async function pick() {
    const file = await pickFile();
    if (!file) return null;
    if (typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) { window.showToast?.('This browser cannot share media in calls.'); return null; }
    try {
      if (file.type.startsWith('video/')) return await fromVideo(file);
      if (file.type.startsWith('image/')) return await fromImage(file);
      window.showToast?.('Choose a photo or a video.');
    } catch (e) { window.showToast?.(e.message || 'Could not share that file.'); }
    return null;
  }

  window.TempChatMediaShare = { pick };
})();
