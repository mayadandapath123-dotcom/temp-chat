/* Call quality: Auto (shrinks as the call grows) or a fixed cap you choose.
   The server tells everyone the lowest cap in the call and every sender uses it,
   so the person on the weakest connection saves data in both directions. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const PRESETS = [{ dim: 0, label: 'Auto' }, { dim: 256, label: '144p' }, { dim: 426, label: '240p' }, { dim: 640, label: '360p' }, { dim: 854, label: '480p' }, { dim: 1280, label: '720p' }];
  const quality = dim => dim <= 200 ? .38 : dim <= 256 ? .4 : dim <= 320 ? .42 : dim <= 400 ? .45 : dim <= 426 ? .48 : dim <= 640 ? .52 : dim <= 854 ? .55 : .6;
  const labelFor = dim => dim <= 256 ? '144p' : dim <= 426 ? '240p' : dim <= 640 ? '360p' : dim <= 854 ? '480p' : '720p';
  const autoDim = count => count <= 2 ? 400 : count <= 4 ? 320 : count <= 6 ? 256 : 200;
  let choice = 0; try { choice = Number(localStorage.getItem('tempchat_call_quality') || 0); } catch (_) {}
  if (!PRESETS.some(p => p.dim === choice)) choice = 0;
  let state = null, wasIn = false;
  const peopleNow = () => 1 + (typeof remotePeers !== 'undefined' ? remotePeers.size : 0);

  function apply() {
    if (typeof inCall === 'undefined' || !inCall || window.__isScreenSharing) return;
    const dim = state ? state.effective : Math.min(choice || Infinity, autoDim(peopleNow()));
    window.__activeVideoMaxDim = dim; window.__activeVideoQuality = quality(dim);
  }
  function statusText() {
    if (!state) return choice ? `${labelFor(choice)} chosen` : 'Auto';
    const eff = labelFor(state.effective);
    if (state.limitedBy && state.limitedBy.length) {
      const me = typeof currentUsername !== 'undefined' && state.limitedBy.includes(currentUsername);
      return `${eff} · ${me ? 'your choice' : 'limited by ' + state.limitedBy.slice(0, 2).join(', ')}`;
    }
    return `${eff} · Auto for ${state.participants} ${state.participants === 1 ? 'person' : 'people'}`;
  }
  // Settings block (lives in the ⋯ settings sheet, reachable from the call's gear button)
  function ensureBlock() {
    if ($('tc-quality-block')) return;
    const host = document.querySelector('#more-sheet .more-sheet-toggles'); if (!host) return;
    const block = document.createElement('div'); block.id = 'tc-quality-block'; block.className = 'sens-block tc-quality-block';
    block.innerHTML = '<div class="sens-head"><strong>📶 Call quality</strong><span id="tc-quality-status"></span></div><div class="tc-seg tc-quality-seg" role="radiogroup" aria-label="Call quality"></div>' +
      '<div class="sens-hint">Auto lowers quality as more people join to save data. Everyone sends at the lowest choice in the call, so your pick also sets what you receive.</div>';
    const seg = block.querySelector('.tc-quality-seg');
    for (const p of PRESETS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tc-seg-btn'; b.textContent = p.label; b.dataset.dim = String(p.dim); b.setAttribute('role', 'radio');
      b.onclick = () => { choice = p.dim; try { localStorage.setItem('tempchat_call_quality', String(choice)); } catch (_) {} paint(); announce(); if (p.dim >= 854) showToast('High quality uses a lot of data for everyone in the call.'); };
      seg.append(b);
    }
    host.prepend(block);
  }
  function ensurePill() {
    if ($('tc-quality-pill')) return;
    const right = document.querySelector('.call-header-right'); if (!right) return;
    const pill = document.createElement('button'); pill.id = 'tc-quality-pill'; pill.type = 'button'; pill.className = 'call-timer tc-quality-pill'; pill.title = 'Call quality — tap to change';
    pill.onclick = e => { e.stopPropagation(); $('more-sheet')?.classList.remove('hidden'); $('tc-quality-block')?.scrollIntoView({ block: 'nearest' }); };
    right.prepend(pill);
  }
  function paint() {
    ensureBlock(); ensurePill();
    for (const b of document.querySelectorAll('.tc-quality-seg .tc-seg-btn')) b.setAttribute('aria-pressed', String(Number(b.dataset.dim) === choice)), b.setAttribute('aria-checked', String(Number(b.dataset.dim) === choice));
    const status = $('tc-quality-status'); if (status) status.textContent = statusText();
    const pill = $('tc-quality-pill'); if (pill) { const on = typeof inCall !== 'undefined' && inCall; pill.classList.toggle('hidden', !on); pill.textContent = state ? labelFor(state.effective) : (choice ? labelFor(choice) : 'Auto'); pill.title = 'Call quality: ' + statusText() + ' — tap to change'; }
  }
  function announce() { if (typeof inCall !== 'undefined' && inCall && socket.connected) socket.emit('call-quality', { maxDim: choice }); }
  if (typeof socket !== 'undefined' && socket && socket.on) {
    socket.on('call-quality-state', s => { if (s && Number.isFinite(s.effective)) { state = s; apply(); paint(); } });
    socket.on('call-ended', () => { state = null; paint(); });
  }
  setInterval(() => {
    const on = typeof inCall !== 'undefined' && inCall;
    if (on && !wasIn) setTimeout(announce, 400);
    if (!on && wasIn) state = null;
    wasIn = on; apply(); paint();
  }, 400);
  window.TempChatCallQuality = { presets: PRESETS, get choice() { return choice; }, get state() { return state; }, labelFor };
  paint();
})();
