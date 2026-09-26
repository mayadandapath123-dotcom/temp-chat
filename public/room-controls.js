/* Room identity, private-room approval, member removal votes and temporary
   history replay. Manual-documented; no extra front-page marketing copy. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text = '', cls = '') => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };

  // ---- Persistent device identifier (used only for the 1-hour removal ban) ----
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

  const state = { roomName: '', visibility: 'public', inviteToken: null, memberCount: 0, pending: null, shareLink: '' };
  const params = new URLSearchParams(location.search);
  window.TempChatRoom = {
    create: () => ({
      name: ($('tc-room-name-input')?.value || '').trim().slice(0, 40),
      visibility: $('tc-room-visibility')?.value === 'private' ? 'private' : 'public',
    }),
    inviteToken: () => params.get('invite') || '',
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
      '<p class="tc-note">These apply only when you are the first person creating this room. A private room still lets invite-link holders join without approval.</p>';
    const roomGroup = $('room-input-group');
    roomGroup ? roomGroup.after(details) : form.append(details);
  }

  // ---- Header identity: room name + code, always visible ----
  function renderIdentity() {
    const roomName = $('room-name'); if (!roomName) return;
    if (state.roomName && state.roomName !== currentRoom) {
      roomName.textContent = `${state.roomName} · #${currentRoom}${state.visibility === 'private' ? ' 🔒' : ''}`;
    } else {
      roomName.textContent = `#${currentRoom}${state.visibility === 'private' ? ' 🔒' : ''}`;
    }
    roomName.title = `Room code: ${currentRoom} · ${state.visibility === 'private' ? 'Private' : 'Public'}`;
    roomName.classList.toggle('tc-private-room', state.visibility === 'private');
  }

  // ---- Share link: private rooms include their unguessable invite token ----
  function roomShareUrl() {
    if (state.visibility === 'private' && state.inviteToken) {
      return `${location.origin}/?room=${encodeURIComponent(currentRoom)}&invite=${encodeURIComponent(state.inviteToken)}`;
    }
    return `${location.origin}/?room=${encodeURIComponent(currentRoom)}`;
  }
  function patchShare() {
    try { getRoomShareUrl = roomShareUrl; } catch (_) {}
    if (typeof getRoomShareUrl === 'function') getRoomShareUrl = roomShareUrl;
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
      if (entry.type === 'text') renderHistoryText(entry);
      else if (entry.type === 'photo') renderHistoryPhoto(entry);
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
  }

  // ---- Approval / removal voting modal ----
  let voteDialog = null;
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
  function askVote({ title, desc, meta, onApprove, onDeny }) {
    const d = voteModal(); $('tc-vote-title').textContent = title; $('tc-vote-desc').textContent = desc; $('tc-vote-meta').textContent = meta || '';
    const approve = $('tc-vote-approve'), deny = $('tc-vote-deny');
    approve.onclick = () => { d.close(); onApprove(); }; deny.onclick = () => { d.close(); onDeny(); };
    if (!d.open) d.showModal();
  }

  // ---- Private join: requester-side pending, member-side approval ----
  function showPendingBanner(room) {
    let banner = $('tc-join-pending');
    if (!banner) {
      banner = el('div', '', 'tc-join-pending'); banner.id = 'tc-join-pending';
      $('join-screen')?.append(banner);
    }
    banner.textContent = `Waiting for members of #${room} to approve your request. You’ll enter automatically once everyone approves.`;
    banner.classList.remove('hidden');
  }
  function enterPending(data) {
    state.pending = { active: true, room: data.room };
    showPendingBanner(data.room);
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
    state.roomName = info.name || ''; state.visibility = info.visibility; state.inviteToken = info.inviteToken; state.memberCount = info.memberCount;
    renderIdentity(); patchShare();
  });
  socket.on('room-history', data => { if (data?.room === currentRoom) renderHistory(data.entries); });
  socket.on('join-pending', enterPending);
  socket.on('join-error', () => { state.pending = null; $('tc-join-pending')?.classList.add('hidden'); });
  socket.on('room-ready', data => {
    if (state.pending?.active && data?.room === state.pending.room) finalizeJoin();
    else renderIdentity();
  });
  socket.on('join-request', data => {
    askVote({
      title: `${data.requester} wants to join`,
      desc: `Approve this person to enter #${currentRoom}? Everyone must approve before they can join.`,
      meta: `Requested by ${data.requester}.`,
      onApprove: () => socket.emit('join-vote', { id: data.id, approve: true }),
      onDeny: () => socket.emit('join-vote', { id: data.id, approve: false }),
    });
  });
  socket.on('join-request-cancelled', () => { if (voteDialog?.open) voteDialog.close(); });
  socket.on('evict-request', data => {
    if (data.targetId === socket.id) return;
    const alreadyApproved = (data.votes || []).find(v => v.id === socket.id)?.vote;
    askVote({
      title: `Remove ${data.targetName}?`,
      desc: `${data.requester} asked to remove ${data.targetName} from this room for one hour.${data.reason ? `\n\nReason: ${data.reason}` : ''}`,
      meta: 'Everyone (except that person) must approve. A removal blocks their device from rejoining for one hour.',
      onApprove: () => socket.emit('evict-vote', { id: data.id, approve: true }),
      onDeny: () => socket.emit('evict-vote', { id: data.id, approve: false }),
    });
    if (alreadyApproved) { /* already voted; do not prompt again */ }
  });
  socket.on('evict-cancelled', () => { if (voteDialog?.open) voteDialog.close(); });
  socket.on('presence-update', people => augmentPeopleList(people));
  socket.on('clear-chat', () => { try { if (messages) messages.replaceChildren(); } catch (_) {} });

  injectCreateOptions();
  renderIdentity();

  // Manual-only documentation (the user manual, not the join screen).
  const guide = document.querySelector('.guide-sections');
  if (guide) {
    const section = document.createElement('div'); section.className = 'guide-section-item';
    const title = document.createElement('h5'); title.textContent = '🛡 Rooms, names and removal';
    const body = document.createElement('p');
    body.textContent = 'Name your room and choose public (anyone with the code joins) or private (members must approve code-based requests; invite links join directly). While a room stays open, late joiners see earlier text and regular photos. In rooms with 3 or more people, a member can ask the room to remove someone with a reason; everyone else must approve. A removed person cannot rejoin from that browser for one hour. The room code is always shown in the header. All of this resets when the room closes or is reset.';
    section.append(title, body); guide.prepend(section);
  }
})();
