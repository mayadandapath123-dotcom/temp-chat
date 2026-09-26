/* Room identity, private-room approval, member removal votes, temporary
   history replay and quick delete. Manual-documented; no extra front-page copy. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text = '', cls = '') => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };

  // ---- Persistent device identifier (used only for the removal block) ----
  function makeDeviceId() {
    const bytes = new Uint8Array(24);
    if (crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') +
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  let deviceId = null;
  try { deviceId = localStorage.getItem('tempchat_device_id'); } catch (_) {}
  if (!deviceId || !/^[A-Za-z0-9_-]{16,100}$/.test(deviceId)) {
    deviceId = makeDeviceId();
    try { localStorage.setItem('tempchat_device_id', deviceId); } catch (_) {}
  }
  window.TempChatDeviceId = deviceId;

  const state = { code: '', roomName: '', visibility: 'public', quickDelete: false, inviteToken: null, memberCount: 0, pending: null, noticeRoom: '' };
  const params = new URLSearchParams(location.search);
  const room = () => (typeof currentRoom === 'string' ? currentRoom : '');
  window.TempChatRoom = {
    create: () => ({
      name: ($('tc-room-name-input')?.value || '').trim().slice(0, 40),
      visibility: $('tc-room-visibility')?.value === 'private' ? 'private' : 'public',
      quickDelete: $('tc-room-quick-delete')?.value === 'on',
    }),
    // Invite link token from the address bar, or this member's own copy of the room key
    // (received after joining) so reconnects never need a fresh approval.
    inviteToken: () => params.get('invite') || (state.inviteToken && state.code && state.code === room() ? state.inviteToken : '') || '',
    deviceId,
  };

  // ---- Inject room-creation options (only used when creating a new room) ----
  function injectCreateOptions() {
    const form = $('join-form'); if (!form || $('tc-room-options')) return;
    const details = document.createElement('details'); details.id = 'tc-room-options'; details.className = 'tc-room-options';
    details.innerHTML = '<summary>⚙️ New-room options (optional)</summary>' +
      '<label class="field-label">Room name <span class="tc-muted">(shown to everyone)</span>' +
      '<input id="tc-room-name-input" type="text" maxlength="40" placeholder="e.g. Weekend Hangout" autocomplete="off"></label>' +
      '<label class="field-label">Who can join by room code' +
      '<select id="tc-room-visibility"><option value="public">Public — anyone with the code</option><option value="private">Private — needs member approval</option></select></label>' +
      '<label class="field-label">Quick delete' +
      '<select id="tc-room-quick-delete"><option value="off">Off — messages stay until Reset or the room closes</option><option value="on">On — each message vanishes shortly after it is seen</option></select></label>' +
      '<p class="tc-note">These apply only when you are the first person creating this room, and stay fixed until the room closes. A private room still lets invite-link holders join without approval.</p>';
    const roomGroup = $('room-input-group');
    roomGroup ? roomGroup.after(details) : form.append(details);
  }

  // ---- Header identity: room name + code in the top bar (phones and desktops) ----
  function renderIdentity() {
    const pill = $('room-name'); if (!pill) return;
    const code = room(); if (!code) return;
    pill.replaceChildren();
    const known = state.code === code;
    const named = known && state.roomName && state.roomName !== code;
    if (named) pill.append(el('span', state.roomName, 'tc-room-title'));
    const line = el('span', '', 'tc-room-line');
    line.append(el('span', `#${code}`, 'tc-room-code'));
    if (known && state.visibility === 'private') line.append(el('span', '🔒', 'tc-room-flag'));
    if (known && state.quickDelete) line.append(el('span', '⏱', 'tc-room-flag'));
    pill.append(line);
    pill.classList.toggle('tc-named', Boolean(named));
    pill.title = (named ? `${state.roomName} · ` : '') + `Room code ${code}` + (known ? ` · ${state.visibility === 'private' ? 'Private' : 'Public'}${state.quickDelete ? ' · Quick delete' : ''}` : '') + ' · tap to share';
    pill.classList.toggle('tc-private-room', known && state.visibility === 'private');
  }

  // ---- Share link: private rooms include their unguessable invite token ----
  function roomShareUrl() {
    if (state.visibility === 'private' && state.inviteToken) {
      return `${location.origin}/?room=${encodeURIComponent(room())}&invite=${encodeURIComponent(state.inviteToken)}`;
    }
    return `${location.origin}/?room=${encodeURIComponent(room())}`;
  }
  function patchShare() {
    try { getRoomShareUrl = roomShareUrl; } catch (_) {}
    if (typeof getRoomShareUrl === 'function') getRoomShareUrl = roomShareUrl;
  }

  // ---- Quick delete (per person) ------------------------------------------------
  // Someone else's message: my copy starts its countdown once it has actually been
  // shown on my screen, then disappears. My own message: the server starts the
  // countdown after everyone present has seen it. Nothing is kept afterwards.
  const qd = new Map(); // id -> { ttl, own, seen, timer }
  const seenBatch = new Set(); let seenTimer = null;
  function bar(node) {
    let b = node.querySelector(':scope > .message-bubble > .tc-qd-bar, :scope > .tc-qd-bar');
    if (!b) { b = el('span', '', 'tc-qd-bar'); b.setAttribute('aria-hidden', 'true'); (node.querySelector('.message-bubble') || node).append(b); }
    return b;
  }
  function nodesFor(id) { try { return [...document.querySelectorAll(`[data-message-id="${CSS.escape(id)}"]`)]; } catch (_) { return []; } }
  function register(id, ttl, own) {
    if (!id || !ttl || qd.has(id)) return;
    qd.set(id, { ttl, own, seen: false, timer: null });
    for (const n of nodesFor(id)) { n.classList.add('tc-qd'); bar(n); }
  }
  function run(node, ms) {
    const b = bar(node);
    b.style.transition = 'none'; b.style.width = '100%'; b.classList.add('tc-run');
    // Next frame: shrink to nothing over the message's time. Silent, no numbers.
    requestAnimationFrame(() => requestAnimationFrame(() => { b.style.transition = `width ${ms}ms linear`; b.style.width = '0%'; }));
  }
  function startCountdown(id, ms) {
    const entry = qd.get(id); if (!entry || entry.timer) return;
    for (const n of nodesFor(id)) run(n, ms);
    entry.timer = setTimeout(() => vanish(id), ms);
  }
  function vanish(id) {
    const entry = qd.get(id);
    if (entry) { clearTimeout(entry.timer); qd.delete(id); }
    const nodes = nodesFor(id); if (!nodes.length) return;
    for (const n of nodes) n.classList.add('tc-qd-gone');
    setTimeout(() => nodes.forEach(n => n.remove()), 420);
  }
  function voiceExtra(id) {
    for (const n of nodesFor(id)) {
      const m = /(\d+):(\d\d)/.exec(n.querySelector('.voice-duration')?.textContent || '');
      if (m) return (Number(m[1]) * 60 + Number(m[2])) * 1000;
    }
    return 0;
  }
  function isVisible(node) {
    if (!node.isConnected || !node.getClientRects().length) return false;
    const r = node.getBoundingClientRect();
    const x = Math.max(0, r.left) + (Math.min(innerWidth, r.right) - Math.max(0, r.left)) / 2;
    const top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
    if (bottom - top < Math.min(24, r.height) || x < 0 || x >= innerWidth) return false;
    const hit = document.elementFromPoint(x, (top + bottom) / 2);
    return Boolean(hit && node.contains(hit));
  }
  function flushSeen() {
    seenTimer = null;
    if (!seenBatch.size || !socket.connected) return;
    const ids = [...seenBatch]; seenBatch.clear();
    socket.emit('qd-seen', { ids });
  }
  function checkSeen() {
    if (document.visibilityState !== 'visible' || !document.hasFocus() || typeof joinedChat !== 'undefined' && !joinedChat) return;
    for (const [id, entry] of qd) {
      const nodes = nodesFor(id);
      if (!nodes.length) { clearTimeout(entry.timer); qd.delete(id); continue; }
      if (entry.own || entry.seen) continue;
      if (!nodes.some(isVisible)) continue;
      entry.seen = true; seenBatch.add(id);
      if (!seenTimer) seenTimer = setTimeout(flushSeen, 150);
      startCountdown(id, Math.max(entry.ttl, voiceExtra(id) ? voiceExtra(id) + 10000 : 0));
    }
  }
  setInterval(checkSeen, 800);
  window.addEventListener('focus', checkSeen);
  document.addEventListener('visibilitychange', checkSeen);
  $('chat-content')?.addEventListener('scroll', checkSeen, { passive: true });
  function registerIncoming(data) {
    if (!data || !data.id || !data.expireAfter) return;
    if (data.isViewOnce === true) return;
    register(data.id, Number(data.expireAfter), data.senderId === socket.id);
  }
  function clearQuickDelete() {
    for (const e of qd.values()) clearTimeout(e.timer);
    qd.clear(); seenBatch.clear();
  }

  // ---- Temporary history replay for late joiners ----
  function timeLabel(at) { try { return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } }
  function renderHistory(entries) {
    if (!messages) return;
    if (!Array.isArray(entries)) return;
    if (entries.length) {
      const divider = el('div', 'Previous messages in this room', 'system-message');
      messages.appendChild(divider);
    }
    for (const entry of entries) {
      let node = null;
      if (entry.type === 'text') node = renderHistoryText(entry);
      else if (entry.type === 'photo') node = renderHistoryPhoto(entry);
      if (node && entry.id) { node.dataset.messageId = entry.id; if (entry.expireAfter) register(entry.id, Number(entry.expireAfter), entry.senderId === socket.id); }
    }
    scrollMessagesToBottom();
  }
  function renderHistoryText(entry) {
    const isOwn = entry.senderId === socket.id;
    const node = el('div', '', `message ${isOwn ? 'own-message' : 'other-message'}`);
    const bubble = el('div', '', 'message-bubble');
    bubble.append(el('strong', isOwn ? 'You' : entry.username));
    if (entry.reply) {
      const q = el('div', '', 'tc-history-quote');
      q.append(el('strong', entry.reply.username), el('span', entry.reply.text));
      bubble.append(q);
    }
    const text = el('span'); window.TempChatLinks.fill(text, entry.text || '');
    bubble.append(text);
    bubble.append(el('small', timeLabel(entry.at)));
    node.append(bubble); messages.append(node);
    return node;
  }
  function renderHistoryPhoto(entry) {
    const isOwn = entry.senderId === socket.id;
    const node = el('div', '', `message ${isOwn ? 'own-message' : 'other-message'}`);
    const bubble = el('div', '', 'message-bubble');
    bubble.append(el('strong', isOwn ? 'You' : entry.username));
    if (entry.image) {
      const img = el('img'); img.src = entry.image; img.className = 'chat-photo-img'; img.alt = 'Photo from ' + entry.username;
      img.addEventListener('click', () => { try { openLightbox(entry.image, entry.caption); } catch (_) {} });
      bubble.append(img);
    } else {
      bubble.append(el('span', 'Photo'));
    }
    if (entry.caption) bubble.append(el('span', entry.caption));
    bubble.append(el('small', timeLabel(entry.at)));
    node.append(bubble); messages.append(node);
    return node;
  }

  // ---- Approval / removal voting modal ----
  let voteDialog = null, voteFor = '';
  function voteModal() {
    if (voteDialog && voteDialog.isConnected) return voteDialog;
    voteDialog = document.createElement('dialog'); voteDialog.className = 'tc-device-dialog tc-vote-dialog';
    voteDialog.innerHTML = '<header><h2 id="tc-vote-title"></h2><button type="button" class="tc-close" aria-label="Close">✕</button></header>' +
      '<div class="tc-device-body"><p id="tc-vote-desc"></p><p id="tc-vote-meta" class="tc-note"></p>' +
      '<div class="tc-device-actions"><button type="button" id="tc-vote-deny" class="secondary">Decline</button><button type="button" id="tc-vote-approve">Approve</button></div></div>';
    document.body.append(voteDialog);
    voteDialog.querySelector('.tc-close').onclick = () => voteDialog.close();
    return voteDialog;
  }
  function askVote({ id, title, desc, meta, onApprove, onDeny }) {
    const d = voteModal(); voteFor = id;
    $('tc-vote-title').textContent = title; $('tc-vote-desc').textContent = desc; $('tc-vote-meta').textContent = meta || '';
    const approve = $('tc-vote-approve'), deny = $('tc-vote-deny');
    approve.onclick = () => { d.close(); onApprove(); }; deny.onclick = () => { d.close(); onDeny(); };
    if (!d.open) d.showModal();
  }
  function progress(votes) {
    const list = Array.isArray(votes) ? votes : [];
    const yes = list.filter(v => v.vote).length;
    return list.length ? ` ${yes} of ${list.length} approved.` : '';
  }
  function myVote(votes) { return (Array.isArray(votes) ? votes : []).find(v => v.id === socket.id)?.vote === true; }

  // ---- Private join: requester-side pending, member-side approval ----
  function showPendingBanner(data) {
    let banner = $('tc-join-pending');
    if (!banner) {
      banner = el('div', '', 'tc-join-pending'); banner.id = 'tc-join-pending';
      $('join-screen')?.append(banner);
    }
    const done = Number(data.approved) || 0, total = Number(data.memberCount) || 0;
    banner.textContent = `Waiting for the members of #${data.room} to approve your request` + (total ? ` (${done} of ${total} approved)` : '') + '. You’ll enter automatically once everyone approves.';
    banner.classList.remove('hidden');
  }
  function enterPending(data) {
    const first = !state.pending?.active;
    state.pending = { active: true, room: data.room };
    showPendingBanner(data);
    if (!first) return;
    joinedChat = false; clearInterval(presenceHeartbeat);
    chatScreen?.classList.add('hidden'); joinScreen?.classList.remove('hidden');
    showToast('This room is private. Your join request was sent to its members.');
  }
  function finalizeJoin() {
    state.pending = null; $('tc-join-pending')?.classList.add('hidden');
    joinedChat = true;
    joinScreen?.classList.add('hidden'); chatScreen?.classList.remove('hidden');
    startPresenceHeartbeat(); sendPresence('active');
    renderIdentity();
    showToast(`Joined Room #${currentRoom} as ${currentUsername}`, 'success');
    try { playSfx('join'); } catch (_) {}
    setTimeout(() => { try { messageInput?.focus(); } catch (_) {} }, 150);
  }

  // ---- Member list removal button (3+ members) ----
  function augmentPeopleList(people) {
    if (!peopleList) return;
    const eligible = people.length >= 3;
    const rows = peopleList.querySelectorAll('.person-row');
    people.forEach((p, i) => {
      const row = rows[i]; if (!row) return;
      if (p.id === socket.id || p.isAdmin || !eligible) return;
      if (row.querySelector('.tc-remove-member')) return;
      const btn = el('button', 'Remove', 'tc-remove-member');
      btn.type = 'button'; btn.title = 'Ask the room to remove this member';
      btn.onclick = () => {
        const reason = prompt(`Ask the room to remove ${p.username}?\n\nExplain briefly why (visible to all members):`);
        if (reason === null) return;
        socket.timeout(6000).emit('evict-request', { targetId: p.id, reason: String(reason || '').slice(0, 160) }, (err, reply) => {
          if (err || reply?.error) showToast(reply?.error || 'Could not send the removal request.');
          else showToast(`Removal request for ${p.username} sent. Everyone must approve.`);
        });
      };
      const status = row.querySelector('.person-status'); status ? status.after(btn) : row.append(btn);
    });
  }

  // ---- Socket wiring ----
  socket.on('room-info', info => {
    state.code = info.code || room(); state.roomName = info.name || ''; state.visibility = info.visibility; state.quickDelete = info.quickDelete === true;
    state.inviteToken = info.inviteToken; state.memberCount = info.memberCount;
    renderIdentity(); patchShare();
    if (state.quickDelete && state.noticeRoom !== state.code && typeof localSystemMessage === 'function') {
      state.noticeRoom = state.code;
      localSystemMessage('Quick delete is on. Messages disappear shortly after they have been seen.');
    }
    if (!state.quickDelete) state.noticeRoom = '';
  });
  socket.on('room-history', data => { if (data?.room === currentRoom) renderHistory(data.entries); });
  socket.on('join-pending', enterPending);
  socket.on('join-error', () => { state.pending = null; $('tc-join-pending')?.classList.add('hidden'); });
  socket.on('room-ready', data => {
    if (state.pending?.active && data?.room === state.pending.room) finalizeJoin();
    else renderIdentity();
  });
  socket.on('join-request', data => {
    if (myVote(data.votes)) { if (voteDialog?.open && voteFor === data.id) $('tc-vote-meta').textContent = `You approved.${progress(data.votes)}`; return; }
    askVote({
      id: data.id,
      title: `${data.requester} wants to join`,
      desc: `Approve this person to enter #${currentRoom}? Everyone must approve before they can join.`,
      meta: `Requested by ${data.requester}.${progress(data.votes)}`,
      onApprove: () => socket.emit('join-vote', { id: data.id, approve: true }),
      onDeny: () => socket.emit('join-vote', { id: data.id, approve: false }),
    });
  });
  socket.on('join-request-cancelled', data => { if (voteDialog?.open && (!data?.id || voteFor === data.id)) voteDialog.close(); });
  socket.on('evict-request', data => {
    if (data.targetId === socket.id) return;
    if (myVote(data.votes)) { if (voteDialog?.open && voteFor === data.id) $('tc-vote-meta').textContent = `You approved.${progress(data.votes)}`; return; }
    askVote({
      id: data.id,
      title: `Remove ${data.targetName}?`,
      desc: `${data.requester} asked to remove ${data.targetName} from this room.${data.reason ? `\n\nReason: ${data.reason}` : ''}`,
      meta: `Everyone (except that person) must approve. Once approved, they are removed and cannot rejoin this room.${progress(data.votes)}`,
      onApprove: () => socket.emit('evict-vote', { id: data.id, approve: true }),
      onDeny: () => socket.emit('evict-vote', { id: data.id, approve: false }),
    });
  });
  socket.on('evict-cancelled', data => { if (voteDialog?.open && (!data?.id || voteFor === data.id)) voteDialog.close(); });
  socket.on('presence-update', people => augmentPeopleList(people));
  socket.on('chat-message', registerIncoming);
  socket.on('voice-message', registerIncoming);
  socket.on('single-photo', registerIncoming);
  socket.on('qd-countdown', data => { if (data?.id && qd.has(data.id)) startCountdown(data.id, Number(data.ms) || 10000); });
  socket.on('message-expired', data => { if (data?.id) vanish(data.id); });
  socket.on('clear-chat', () => { clearQuickDelete(); try { if (messages) messages.replaceChildren(); } catch (_) {} });

  injectCreateOptions();
  renderIdentity();

  // Manual-only documentation (the user manual, not the join screen).
  const guide = document.querySelector('.guide-sections');
  if (guide) {
    const items = [
      ['🏷 Room name, public or private', 'Whoever creates a room can name it and choose Public (anyone with the code joins) or Private (members must approve code-based requests; invite links join directly). These choices stay until the room closes, even if that person leaves. Nobody is marked as the creator. The name and code stay in the top bar; tap them to share.'],
      ['⏱ Quick delete', 'A creation-time choice. Each message disappears from your screen shortly after it has been shown to you (longer for long texts, photos and voice notes); a thin line under the message shows it is on its way out. Your own message goes once everyone present has seen it. View-once photos and calls are never kept.'],
      ['🕘 Late joiners and Reset', 'While a room is open, people who join later see the earlier text and regular photos. Reset clears the chat for everyone and shows who cleared it. Everything is gone when the room closes.'],
      ['🛡 Removing a member', 'In rooms with 3 or more people, open Members and tap Remove next to a name, then give a reason. Everyone else must approve. The removed person is blocked from rejoining that room from their browser; the block lifts quietly after an hour, and a new browser or device is not covered. Screenshots and other people’s devices are outside the website’s control.'],
    ];
    for (const [heading, text] of items.reverse()) {
      const section = document.createElement('div'); section.className = 'guide-section-item';
      section.append(el('h5', heading), el('p', text)); guide.prepend(section);
    }
  }
})();
