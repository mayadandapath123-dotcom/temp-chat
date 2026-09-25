/* Room-scoped quoted replies. No media bytes, DOM HTML, or screenshots in quotes. */
(function () {
  'use strict';
  const originals = new Map();
  let selected = null;
  const bars = [];
  const text = (tag, value, cls) => { const n = document.createElement(tag); n.textContent = value; if (cls) n.className = cls; return n; };
  const summary = d => ({ id: d.id, senderId: d.senderId, username: d.username,
    kind: d.image ? 'photo' : d.audio ? 'voice' : 'text',
    text: (d.image ? d.isViewOnce ? 'View-once photo' : 'Photo' : d.audio ? 'Voice note' : String(d.message || 'Message')).slice(0, 180) });
  for (const id of ['message-form', 'call-chat-form']) {
    const form = document.getElementById(id); if (!form) continue;
    const bar = document.createElement('div'); bar.className = 'tc-reply-composer hidden'; bar.setAttribute('role', 'status');
    const label = document.createElement('button'); label.type = 'button'; label.className = 'tc-reply-composer-text';
    const name = text('strong', ''), excerpt = text('span', ''); label.append(name, excerpt);
    label.onclick = () => { if (selected) jump(selected.id); };
    const cancel = text('button', '✕', 'tc-reply-cancel'); cancel.type = 'button'; cancel.setAttribute('aria-label', 'Cancel reply'); cancel.onclick = clear;
    bar.append(label, cancel); form.before(bar); bars.push({ bar, name, excerpt });
  }
  function render() {
    for (const { bar, name, excerpt } of bars) {
      bar.classList.toggle('hidden', !selected);
      if (selected) { name.textContent = `Replying to ${selected.senderId === socket.id ? 'yourself' : selected.username}`; excerpt.textContent = selected.text; }
    }
  }
  function clear() { selected = null; render(); }
  function choose(d) {
    if (!socket.connected) return showToast('Reconnect before replying.');
    if (mediaRecorder) return showToast('Finish your voice recording before choosing a reply.');
    selected = { ...d }; render();
    const field = inCall ? callChatInput : messageInput;
    if (inCall && !isCallChatOpen) document.getElementById('call-chat-toggle-btn')?.click();
    field?.focus({ preventScroll: true });
  }
  function jump(id) {
    const r = originals.get(id);
    const node = r?.nodes.find(n => n.isConnected && (inCall ? n.classList.contains('call-chat-msg') : n.classList.contains('message')));
    if (!node) return showToast('Original message is not available in this view.');
    node.scrollIntoView({ behavior: 'smooth', block: 'center' }); node.classList.add('tc-reply-highlight');
    setTimeout(() => node.classList.remove('tc-reply-highlight'), 1800);
  }
  function quoteNode(reply) {
    const q = document.createElement('button'); q.type = 'button'; q.className = 'tc-quoted-message';
    q.setAttribute('aria-label', `Go to quoted message by ${reply.username}`);
    q.append(text('strong', reply.senderId === socket.id ? 'You' : reply.username), text('span', reply.text));
    q.onclick = e => { e.stopPropagation(); jump(reply.id); }; return q;
  }
  const baseTrack = window.TempChatPlus.track;
  window.TempChatPlus.track = function (data, node) {
    baseTrack(data, node);
    if (!data?.id) return;
    const content = node.querySelector('.message-bubble') || node;
    if (data.reply) content.prepend(quoteNode(data.reply));
    if (data.pending) return;
    const d = summary(data);
    const old = originals.get(data.id);
    if (old) old.nodes.push(node); else originals.set(data.id, { data: d, nodes: [node] });
    while (originals.size > 1000) originals.delete(originals.keys().next().value);
    const reply = text('button', '↩ Reply', 'tc-reply-action'); reply.type = 'button'; reply.setAttribute('aria-label', `Reply to ${data.username}`);
    reply.onclick = e => { e.stopPropagation(); choose(d); }; content.append(reply);
    // Horizontal swipes anywhere noninteractive in a bubble; vertical scrolling
    // and text selection are kept. Pointer cancellation never triggers a reply.
    let gesture = null, suppressUntil = 0;
    node.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !e.isPrimary || e.target.closest('button,input,a,.voice-bar')) return;
      gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, horizontal: false };
    });
    node.addEventListener('pointermove', e => {
      if (!gesture || e.pointerId !== gesture.id) return;
      const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
      if (!gesture.horizontal && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4) gesture.horizontal = true;
      if (gesture.horizontal) {
        gesture.dx = dx; node.style.translate = `${Math.max(-72, Math.min(72, dx))}px 0`;
        node.classList.toggle('tc-swipe-ready', Math.abs(dx) >= 52);
      }
    });
    function end(e, cancelled) {
      if (!gesture || gesture.id !== e.pointerId) return;
      const commit = !cancelled && gesture.horizontal && Math.abs(gesture.dx) >= 52;
      gesture = null; node.style.translate = ''; node.classList.remove('tc-swipe-ready');
      if (commit) { suppressUntil = Date.now() + 500; choose(d); }
    }
    node.addEventListener('pointerup', e => end(e, false)); node.addEventListener('pointercancel', e => end(e, true));
    // Swiping a view-once tile must never accidentally open it afterwards.
    node.addEventListener('click', e => { if (Date.now() < suppressUntil) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  };
  const guide = document.querySelector('.guide-sections');
  if (guide) {
    const entry = document.createElement('div'); entry.className = 'guide-section-item';
    entry.append(text('h5', '↩ Reply to a message'), text('p', 'Swipe a message sideways or tap Reply, then type your text. The selected message stays above the composer until you send or cancel. Tap a quoted reply to find its original. Photo and voice-note quotes use a label, not a copy of the media.'));
    guide.prepend(entry);
  }
  window.TempChatReplies = { current: () => selected ? { ...selected } : null, clear };
  socket.on('clear-chat', () => { originals.clear(); clear(); });
  socket.on('disconnect', clear);
  // Avoid silently sending a media attachment instead of the requested text reply.
  for (const id of ['send-photo-btn', 'send-record']) document.getElementById(id)?.addEventListener('click', e => {
    if (selected) { e.stopImmediatePropagation(); e.preventDefault(); showToast('Type a text reply, or cancel the reply before sending media.'); }
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && selected) clear(); });
})();
