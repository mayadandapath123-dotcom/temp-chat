/* TempChat v5.1: room receipts and shared appearance.
   No third-party libraries, no persisted messages/wallpapers, no screenshot-blocking claims. */
(function () {
  'use strict';
  const records = new Map(), pending = new Map();
  const deliveryQueue = new Set(), seenQueue = new Set();
  let receiptTimer, ready = false, theme = { palette: 'gold', shade: 60 }, wallpaperURL = null;
  let detailId = null;
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const palettes = { gold: 'Midnight gold', ocean: 'Ocean', forest: 'Forest', rose: 'Rose', violet: 'Violet', daylight: 'Daylight' };
  const bar = el('div', '', 'tc-room-tools');
  bar.innerHTML = '<button type="button" id="tc-theme-open">◐ <span>Room theme</span></button><span class="tc-shared-label">Shared with everyone</span>';
  document.querySelector('.chat-header')?.after(bar);

  const dialog = el('dialog', '', 'tc-dialog');
  dialog.setAttribute('aria-labelledby', 'tc-dialog-title');
  dialog.innerHTML = '<header><div><span class="tc-eyebrow">TEMPCHAT · ROOM SETTINGS</span><h2 id="tc-dialog-title"></h2></div><button type="button" class="tc-close" aria-label="Close dialog">✕</button></header><div class="tc-dialog-body"></div>';
  document.body.append(dialog);
  dialog.querySelector('.tc-close').onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  let dialogMode = '';
  function open(title, mode) {
    dialogMode = mode; $('tc-dialog-title').textContent = title;
    const body = dialog.querySelector('.tc-dialog-body'); body.replaceChildren();
    if (!dialog.open) dialog.showModal();
    return body;
  }
  function note(parent, text, warning = false) { parent.append(el('p', text, warning ? 'tc-note tc-warning' : 'tc-note')); }
  function button(parent, text, action, cls = 'tc-button') { const b = el('button', text, cls); b.type = 'button'; b.onclick = action; parent.append(b); return b; }
  function request(event, data) {
    return new Promise((resolve, reject) => {
      if (!socket.connected || !ready) return reject(new Error('Not connected to the room. Please wait for reconnection.'));
      socket.timeout(10000).emit(event, data, (err, reply) => {
        if (err) reject(new Error('Server did not confirm. Check your connection.'));
        else if (reply?.error) reject(new Error(reply.error));
        else resolve(reply);
      });
    });
  }

  // Receipt batches contain IDs only. Never send message text again for a receipt.
  function flushReceipts() {
    receiptTimer = null;
    if (!ready || !socket.connected) return;
    for (const [kind, queue] of [['delivered', deliveryQueue], ['seen', seenQueue]]) {
      while (queue.size) {
        const ids = [...queue].slice(0, 100); ids.forEach(id => queue.delete(id));
        socket.emit('message-receipts', { kind, ids });
      }
    }
  }
  function queueReceipt(id, kind) {
    (kind === 'seen' ? seenQueue : deliveryQueue).add(id);
    if (!receiptTimer) receiptTimer = setTimeout(flushReceipts, 150);
  }
  function statusLabel(r) {
    if (r.pending) return r.rejected ? 'Not sent · tap for details' : r.failed ? 'Not confirmed · tap for details' : 'Sending…';
    const peers = r.recipients || [];
    const total = r.total ?? peers.length;
    if (!total) return 'Sent · no other members';
    const seen = peers.filter(p => p.seen).length, delivered = peers.filter(p => p.delivered).length;
    if (seen) return `✓✓ Seen · ${seen}/${total}`;
    if (delivered) return `✓✓ Delivered · ${delivered}/${total}`;
    return `✓ Sent · ${total} recipient${total === 1 ? '' : 's'}`;
  }
  function repaint(r) {
    for (const node of r.nodes) {
      const b = node.querySelector('.tc-message-status');
      if (b) { b.textContent = statusLabel(r); b.classList.toggle('tc-seen', Boolean(r.recipients?.some(p => p.seen))); }
    }
    if (dialog.open && dialogMode === 'receipt' && detailId === r.id) showReceipt(r.id);
  }
  function showReceipt(id) {
    const r = records.get(id); if (!r) return;
    detailId = id;
    const body = open('Message activity', 'receipt');
    body.append(el('div', statusLabel(r), 'tc-summary'));
    if (r.pending) {
      note(body, r.rejected || (r.failed ? 'Delivery was not confirmed. The message may or may not have arrived. Check the connection before resending to avoid a duplicate.' : 'Waiting for the server to accept this message.'));
      if (r.failed) button(body, 'Copy text back to composer', () => { messageInput.value = r.text || ''; dialog.close(); messageInput.focus(); });
      return;
    }
    if (!r.total) note(body, 'Nobody else was in the room when you sent this message. New arrivals do not receive old messages.');
    for (const p of r.recipients || []) {
      const row = el('div', '', 'tc-member-row');
      const identity = el('div'); identity.append(el('strong', p.username)); identity.append(el('small', `Session …${p.id.slice(-5)}`));
      row.append(identity, el('span', p.seen ? 'Seen' : p.delivered ? 'Delivered' : 'Sent', p.seen ? 'tc-seen' : '')); body.append(row);
    }
    note(body, 'Sent = accepted by server. Delivered = received by their app. Seen = the message was visible in an active, focused chat; it is not proof someone read it. For photos and voice notes, Seen refers to the message tile, not opening or playing it.');
    note(body, 'Counts use recipients present at send time. New arrivals are excluded; disconnected recipients stay in the count. Receipt metadata expires after 1 hour, the latest 1,000 messages, a room reset, or when the room empties.');
  }
  function track(data, node) {
    if (!data?.id) return;
    node.dataset.messageId = data.id;
    let r = records.get(data.id);
    if (!r) {
      r = { id: data.id, own: data.senderId === socket.id, total: data.recipientCount, nodes: [], pending: Boolean(data.pending), text: data.pending ? data.message : undefined };
      records.set(data.id, r);
      if (!r.own && !r.pending) queueReceipt(data.id, 'delivered');
    }
    r.nodes.push(node);
    if (r.own) {
      const b = el('button', statusLabel(r), 'tc-message-status'); b.type = 'button';
      b.onclick = e => { e.stopPropagation(); showReceipt(data.id); };
      (node.querySelector('.message-bubble') || node).append(b);
    }
    while (records.size > 1000) {
      const id = records.keys().next().value; const old = records.get(id);
      for (const n of old.nodes) { const b = n.querySelector('.tc-message-status'); if (b) { b.textContent = 'Receipt tracking expired'; b.disabled = true; } }
      records.delete(id);
    }
  }
  function isVisible(node) {
    if (!node.isConnected || !node.getClientRects().length) return false;
    const r = node.getBoundingClientRect();
    const x = Math.max(0, r.left) + (Math.min(innerWidth, r.right) - Math.max(0, r.left)) / 2;
    const top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
    if (bottom - top < Math.min(24, r.height) || x < 0 || x >= innerWidth) return false;
    const hit = document.elementFromPoint(x, (top + bottom) / 2);
    return hit && node.contains(hit);
  }
  function checkSeen() {
    if (!ready || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    for (const r of records.values()) {
      if (r.own || r.seen || r.pending) continue;
      if (r.nodes.some(isVisible)) { r.seen = true; queueReceipt(r.id, 'seen'); }
    }
  }
  // Modest local visibility checks; sends nothing until a new message becomes seen.
  setInterval(checkSeen, 800);
  window.addEventListener('focus', checkSeen);
  document.addEventListener('visibilitychange', checkSeen);
  socket.on('message-status', data => {
    const r = records.get(data.id); if (!r || !r.own) return;
    r.recipients = data.recipients; r.total = data.recipients.length; repaint(r);
  });
  function confirmOutgoing(data) {
    if (data.senderId !== socket.id || !data.clientId) return;
    const p = pending.get(data.clientId); if (!p) return;
    clearTimeout(p.timer);
    records.get(data.clientId)?.nodes.forEach(n => n.remove());
    records.delete(data.clientId); pending.delete(data.clientId);
  }
  function sendText(text) {
    if (!ready || !socket.connected) { showToast('Not connected. Your text has not been sent.'); return false; }
    const clientId = 'local_' + (crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const reply = window.TempChatReplies?.current() || null;
    const data = { reply, id: clientId, senderId: socket.id, username: currentUsername, message: text, pending: true, time: 'Sending…' };
    appendChatMessage(data); appendInCallMessage(data);
    const p = { timer: setTimeout(() => { const r = records.get(clientId); if (r) { r.failed = true; repaint(r); } }, 12000) };
    pending.set(clientId, p);
    socket.emit('send-message', { clientId, message: text, replyTo: reply?.id || null });
    window.TempChatReplies?.clear();
    return true;
  }
  socket.on('message-rejected', ({ clientId, error }) => {
    const r = records.get(clientId); if (!r) return;
    clearTimeout(pending.get(clientId)?.timer);
    r.failed = true; r.rejected = error; repaint(r); showToast(error);
  });
  window.TempChatPlus = { track, confirmOutgoing, sendText };

  // Appearance is shared server state. A wallpaper is sent once per change/join.
  socket.on('room-theme', data => {
    theme = { palette: data.palette, shade: data.shade };
    document.documentElement.dataset.roomTheme = data.palette;
    if (Object.prototype.hasOwnProperty.call(data, 'wallpaper')) {
      if (wallpaperURL) URL.revokeObjectURL(wallpaperURL);
      wallpaperURL = data.wallpaper ? URL.createObjectURL(new Blob([data.wallpaper], { type: 'image/jpeg' })) : null;
    }
    const content = $('chat-content');
    content.style.setProperty('--tc-wallpaper', wallpaperURL ? `url("${wallpaperURL}")` : 'none');
    content.style.setProperty('--tc-shade', String(data.shade / 100));
    content.classList.toggle('tc-has-wallpaper', Boolean(wallpaperURL));
    if (data.changedBy) localSystemMessage(`${data.changedBy} updated the shared room appearance.`);
  });
  async function compressWallpaper(file) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP, or AVIF photo.');
    if (file.size > 12 * 1024 * 1024) throw new Error('Choose a photo smaller than 12 MB.');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const canvas = document.createElement('canvas');
      let scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      for (let attempt = 0; attempt < 5; attempt++) {
        canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#141824'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .72 - attempt * .07));
        if (blob && blob.size <= 220 * 1024) return blob;
        scale *= .8;
      }
      throw new Error('This image could not be compressed small enough. Try another photo.');
    } finally { URL.revokeObjectURL(url); }
  }
  function showThemes() {
    const body = open('Make the room yours', 'theme');
    note(body, 'One room, one look. Any member can update the theme and photo wallpaper for everyone, including new arrivals.');
    let selected = theme.palette, shade = theme.shade, action = 'keep', photo = null, busy = false, job = 0, draftURL = null;
    const preview = el('div', '', 'tc-theme-preview');
    preview.dataset.roomTheme = selected;
    preview.innerHTML = '<span class="tc-eyebrow">LIVE PREVIEW · NOT APPLIED YET</span><div class="tc-preview-bubble">A little more you.</div><div class="tc-preview-own">A shared space for everyone ✦</div>';
    body.append(preview);
    function updatePreview() {
      preview.dataset.roomTheme = selected;
      const image = action === 'remove' ? null : draftURL || wallpaperURL;
      preview.style.backgroundImage = image ? `linear-gradient(rgba(0,0,0,${shade/100}),rgba(0,0,0,${shade/100})),url("${image}")` : '';
    }
    updatePreview();
    const grid = el('div', '', 'tc-theme-grid'); body.append(grid);
    for (const [key, title] of Object.entries(palettes)) {
      const b = button(grid, title, () => {
        selected = key;
        for (const n of grid.children) n.setAttribute('aria-pressed', String(n.dataset.palette === key));
        updatePreview();
      }, 'tc-theme-choice');
      b.dataset.palette = key; b.dataset.roomTheme = key; b.setAttribute('aria-pressed', String(key === selected));
    }
    const label = el('label', 'Photo wallpaper', 'tc-field-label'); const input = el('input');
    input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp,image/avif'; label.append(input); body.append(label);
    const info = el('p', 'Compressed to at most 220 KB. Wallpaper photos are visible to everyone, not view-once.', 'tc-note'); body.append(info);
    const shadeLabel = el('label', '', 'tc-field-label'); const shadeText = el('span', `Wallpaper dark overlay · ${shade}%`); const range = el('input');
    range.type = 'range'; range.min = '20'; range.max = '85'; range.value = shade; range.setAttribute('aria-label', 'Wallpaper dark overlay');
    shadeLabel.append(shadeText, range); body.append(shadeLabel);
    range.oninput = () => { shade = Number(range.value); shadeText.textContent = `Wallpaper dark overlay · ${shade}%`; updatePreview(); };
    const actions = el('div', '', 'tc-actions'); body.append(actions);
    button(actions, 'Remove wallpaper', () => { job++; busy = false; apply.disabled = false; photo = null; action = 'remove'; input.value = ''; if (draftURL) URL.revokeObjectURL(draftURL); draftURL = null; info.textContent = 'Wallpaper will be removed when you apply.'; updatePreview(); }, 'tc-button tc-secondary');
    const apply = button(actions, 'Apply for everyone', async () => {
      if (busy) return;
      apply.disabled = true;
      try {
        await request('set-room-theme', { palette: selected, shade, wallpaperAction: action, ...(photo && action === 'replace' ? { wallpaper: await photo.arrayBuffer() } : {}) });
        if (dialogMode === 'theme') dialog.close(); showToast('Room appearance updated for everyone.');
      } catch (e) { info.textContent = e.message; } finally { apply.disabled = false; }
    });
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      const myJob = ++job; busy = true; apply.disabled = true; info.textContent = 'Compressing your photo…';
      try {
        const blob = await compressWallpaper(file); if (myJob !== job) return;
        photo = blob; action = 'replace'; if (draftURL) URL.revokeObjectURL(draftURL); draftURL = URL.createObjectURL(blob);
        info.textContent = `Ready · ${Math.ceil(blob.size / 1024)} KB. Visible to everyone, not view-once.`; updatePreview();
      } catch (e) { if (myJob === job) { photo = null; action = 'keep'; info.textContent = e.message; } }
      finally { if (myJob === job) { busy = false; apply.disabled = false; } }
    };
    dialog.addEventListener('close', () => { job++; if (draftURL) URL.revokeObjectURL(draftURL); }, { once: true });
    note(body, 'No upload to a photo-hosting service. The room keeps its wallpaper in server memory until everyone leaves, the room is reset, or the server restarts.');
  }

  $('tc-theme-open').onclick = showThemes;
  const menu = document.querySelector('#more-sheet .more-sheet-actions');
  if (menu) {
    button(menu, '◐ Shared themes & wallpaper', () => { $('more-sheet').classList.add('hidden'); showThemes(); }, 'more-sheet-item');
  }
  socket.on('room-ready', () => { ready = true; flushReceipts(); });
  socket.on('connect', () => {
    if (joinedChat && currentRoom && currentUsername) socket.emit('join-room', { room: currentRoom, username: currentUsername });
  });
  socket.on('disconnect', () => {
    ready = false;
    deliveryQueue.clear(); seenQueue.clear();
    for (const [id, p] of pending) { clearTimeout(p.timer); const r = records.get(id); if (r) { r.failed = true; repaint(r); } }
  });
  socket.on('clear-chat', () => {
    records.clear(); for (const p of pending.values()) clearTimeout(p.timer); pending.clear(); deliveryQueue.clear(); seenQueue.clear();
    if (dialog.open) dialog.close();
  });
  const guide = document.querySelector('.guide-sections');
  if (guide) {
    const item = el('div', '', 'guide-section-item'); item.append(el('h5', '✓ Receipts & shared themes'), el('p', 'Tap an outgoing message status for per-person delivery and visibility. Open Room theme for shared colours and a compressed photo wallpaper. The server relays content: this is not end-to-end encrypted. Wallpapers, brief reply summaries and receipt metadata are temporarily kept in memory; nothing is added to a database by these features.'));
    guide.prepend(item);
  }
})();
