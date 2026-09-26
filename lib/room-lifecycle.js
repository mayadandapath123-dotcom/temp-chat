'use strict';
const crypto = require('node:crypto');
/*
  Room lifecycle: identity (name, public/private, invite token), temporary
  member-visible history, private-room join approval, member eviction votes
  and one-hour device bans.

  Everything here is in-memory and disappears when the room closes (last member
  leaves) or is reset. It is NOT an admin archive and it never stores voice
  notes, view-once photos or call streams.
*/
module.exports = function roomLifecycle(io, { now = Date.now, quickDeleteMinMs = 10000 } = {}) {
  const BAN_MS = 60 * 60 * 1000, VOTE_MS = 60 * 1000, MAX_HISTORY = 300, MAX_PENDING = 200, MAX_TRACKED = 500;
  // Quick delete: base 10 s, longer for long text (about 15 characters per second), photos 15 s, voice notes 45 s.
  const QD_MIN = Math.max(50, Number(quickDeleteMinMs) || 10000), QD_MAX = QD_MIN * 9, QD_PHOTO = Math.round(QD_MIN * 1.5), QD_VOICE = Math.round(QD_MIN * 4.5);
  const rooms = new Map();
  const hooks = { admit: null, evict: null };
  const validDevice = id => typeof id === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(id);
  const validName = n => String(n || '').trim().slice(0, 40);
  const membersOf = code => [...(io.sockets.adapter.rooms.get(code) || [])]
    .map(id => io.sockets.sockets.get(id)).filter(s => s && s.room === code && s.username);

  function ensure(code, opts = {}) {
    if (!rooms.has(code)) {
      rooms.set(code, {
        code, name: validName(opts.name) || code, visibility: opts.visibility === 'private' ? 'private' : 'public',
        quickDelete: opts.quickDelete === true,
        inviteToken: crypto.randomBytes(24).toString('base64url'), createdAt: now(),
        history: [], banned: new Map(), pendingJoins: new Map(), pendingEvictions: new Map(), tracked: new Map(),
      });
    }
    return rooms.get(code);
  }
  function exists(code) { return rooms.has(code); }
  function pruneBans(state) { for (const [d, until] of state.banned) if (until <= now()) state.banned.delete(d); }

  function banState(code, deviceId) {
    const state = ensure(code); pruneBans(state);
    return state.banned.get(deviceId) || null;
  }
  function ban(code, deviceId) {
    if (!validDevice(deviceId)) return;
    const state = ensure(code); pruneBans(state); state.banned.set(deviceId, now() + BAN_MS);
  }
  function unban(code, deviceId) { const s = rooms.get(code); if (s && validDevice(deviceId)) s.banned.delete(deviceId); }

  function record(code, entry) {
    const state = rooms.get(code); if (!state) return;
    state.history.push({ ...entry, at: now() });
    while (state.history.length > MAX_HISTORY) state.history.shift();
  }
  function history(code) { const s = rooms.get(code); return s ? s.history.slice() : []; }
  function dropTracked(s) { for (const e of s.tracked.values()) clearTimeout(e.timer); s.tracked = new Map(); }
  function clearHistory(code) { const s = rooms.get(code); if (s) { s.history = []; dropTracked(s); } }

  function roomInfo(code) {
    const s = rooms.get(code); if (!s) return null;
    return { code: s.code, name: s.name, visibility: s.visibility, quickDelete: s.quickDelete, inviteToken: s.inviteToken, memberCount: membersOf(code).length };
  }
  function inviteToken(code) { const s = rooms.get(code); return s ? s.inviteToken : null; }

  function cancelled(code, pendingMap, entry) {
    const s = rooms.get(code);
    if (!s) return 'The room closed.';
    if (entry.kind === 'evict') {
      if (!membersOf(code).some(x => x.id === entry.requesterId)) return 'The requester left the room.';
    } else if (!io.sockets.sockets.has(entry.requesterId)) {
      return 'The requester disconnected.';
    }
    return null;
  }
  function broadcastVote(entry, target, approve) {
    // Send current vote state to every voting member (the target never votes).
    io.to(entry.room).emit(target, {
      id: entry.id, requester: entry.requesterName, requesterId: entry.requesterId,
      targetId: entry.targetId, targetName: entry.targetName, reason: entry.reason,
      approve,
      votes: [...entry.votes.entries()].map(([id, v]) => ({ id, username: entry.names.get(id) || '', vote: v })),
      expiresAt: entry.expiresAt,
    });
  }
  function finishPending(entry) {
    const s = rooms.get(entry.room); if (!s) return;
    s.pendingJoins.delete(entry.id); s.pendingEvictions.delete(entry.id);
    clearTimeout(entry.timer);
    io.to(entry.room).emit(entry.kind === 'join' ? 'join-request-cancelled' : 'evict-cancelled', { id: entry.id, requesterId: entry.requesterId, targetId: entry.targetId, targetName: entry.targetName });
  }

  // ---- Private room join approval -------------------------------------------------
  function requestJoin(code, { socketId, username, deviceId }) {
    const state = rooms.get(code);
    if (!state) return { error: 'This room has not been created yet.' };
    if (!membersOf(code).length) return { admit: true, note: 'Room is empty; it closed and can be recreated.' };
    const members = membersOf(code);
    // No same-device shortcut: every code-based join needs approval. Existing members reconnect with the room's invite token.
    const id = crypto.randomUUID();
    const names = new Map(members.map(m => [m.id, m.username]));
    const entry = { kind: 'join', id, room: code, requesterId: socketId, requesterName: username, deviceId,
      targetId: null, targetName: username, reason: '', names, votes: new Map(), expiresAt: now() + VOTE_MS };
    for (const m of members) entry.votes.set(m.id, false);
    state.pendingJoins.set(id, entry);
    entry.timer = setTimeout(() => { if (rooms.get(code)?.pendingJoins.get(id) === entry) { finishPending(entry); io.to(socketId).emit('join-error', { error: 'Your join request expired before everyone approved.' }); } }, VOTE_MS);
    entry.timer.unref?.();
    for (const m of members) io.to(m.id).emit('join-request', { id, requesterId: socketId, requester: username, votes: [...entry.votes.entries()].map(([mid, v]) => ({ id: mid, username: names.get(mid), vote: v })), expiresAt: entry.expiresAt });
    return { pending: true, id, memberCount: members.length };
  }
  function voteJoin(code, socketId, { id, approve }) {
    const state = rooms.get(code); const entry = state?.pendingJoins.get(id);
    if (!entry || entry.requesterId === socketId) return { error: 'This join request is no longer active.' };
    if (!membersOf(code).some(m => m.id === socketId)) return { error: 'You must be a current member to approve.' };
    const cancel = cancelled(code, state.pendingJoins, entry); if (cancel) { finishPending(entry); return { error: cancel }; }
    if (now() >= entry.expiresAt) { finishPending(entry); return { error: 'Request expired.' }; }
    if (approve === false) { finishPending(entry); io.to(entry.requesterId).emit('join-error', { error: 'Your request to join was declined.' }); return { denied: true }; }
    entry.votes.set(socketId, true);
    if ([...entry.votes.values()].every(Boolean)) { finishPending(entry); return { admit: true, deviceId: entry.deviceId, requesterId: entry.requesterId }; }
    broadcastVote(entry, 'join-request', true); joinProgress(entry);
    return { pending: true };
  }
  function joinProgress(entry) {
    io.to(entry.requesterId).emit('join-pending', { id: entry.id, room: entry.room, memberCount: entry.votes.size, approved: [...entry.votes.values()].filter(Boolean).length });
  }

  // ---- Member eviction ------------------------------------------------------------
  function requestEvict(code, socketId, { targetId, reason }) {
    const state = rooms.get(code);
    if (!state) return { error: 'Room not found.' };
    const members = membersOf(code);
    if (members.length < 3) return { error: 'Removing a member needs at least 3 people in the room.' };
    const requester = members.find(m => m.id === socketId); const target = members.find(m => m.id === targetId);
    if (!requester || !target) return { error: 'That member is no longer in the room.' };
    if (requester === target) return { error: 'You cannot remove yourself.' };
    if (target.isAdmin) return { error: 'A verified Admin cannot be removed this way.' };
    if (target.isAdmin === true) return { error: 'A verified Admin cannot be removed this way.' };
    for (const e of state.pendingEvictions.values()) if (e.targetId === targetId) return { error: 'A removal request for this member is already active.' };
    const id = crypto.randomUUID();
    const names = new Map(members.map(m => [m.id, m.username]));
    const entry = { kind: 'evict', id, room: code, requesterId: socketId, requesterName: requester.username,
      targetId, targetName: target.username, reason: String(reason || '').slice(0, 160),
      names, votes: new Map(), expiresAt: now() + VOTE_MS };
    for (const m of members) entry.votes.set(m.id, m.id === targetId ? false : m.id === socketId); // requester auto-approves; target cannot approve
    state.pendingEvictions.set(id, entry);
    entry.timer = setTimeout(() => { if (rooms.get(code)?.pendingEvictions.get(id) === entry) { finishPending(entry); io.to(code).emit('system-message', { text: `The removal request for ${entry.targetName} expired.` }); } }, VOTE_MS);
    entry.timer.unref?.();
    for (const m of members) if (m.id !== targetId) io.to(m.id).emit('evict-request', { id, requester: requester.username, requesterId: socketId, targetId, targetName: target.username, reason: entry.reason, votes: [...entry.votes.entries()].map(([mid, v]) => ({ id: mid, username: names.get(mid), vote: v })), expiresAt: entry.expiresAt });
    return { pending: true, id };
  }
  function voteEvict(code, socketId, { id, approve }) {
    const state = rooms.get(code); const entry = state?.pendingEvictions.get(id);
    if (!entry) return { error: 'This removal request is no longer active.' };
    if (socketId === entry.targetId) return { error: 'You cannot vote on your own removal.' };
    if (!membersOf(code).some(m => m.id === socketId)) return { error: 'You must be a current member to vote.' };
    const cancel = cancelled(code, state.pendingEvictions, entry); if (cancel) { finishPending(entry); return { error: cancel }; }
    if (now() >= entry.expiresAt) { finishPending(entry); return { error: 'Request expired.' }; }
    if (approve === false) { finishPending(entry); io.to(code).emit('system-message', { text: `The removal request for ${entry.targetName} was declined.` }); return { denied: true }; }
    entry.votes.set(socketId, true);
    const done = evictionOutcome(code, entry);
    if (done) return done;
    broadcastVote(entry, 'evict-request', true);
    return { pending: true };
  }
  function evictionOutcome(code, entry) {
    const target = membersOf(code).find(m => m.id === entry.targetId);
    if (!target) return null;
    const allApproved = membersOf(code).filter(m => m.id !== entry.targetId).every(m => entry.votes.get(m.id) === true);
    if (!allApproved) return null;
    finishPending(entry);
    if (target.deviceId) ban(code, target.deviceId);
    return { evict: true, targetId: entry.targetId, targetName: entry.targetName, deviceId: target.deviceId || null, reason: entry.reason };
  }
  function cancelRequester(code, requesterId) {
    const s = rooms.get(code); if (!s) return;
    for (const e of [...s.pendingJoins.values(), ...s.pendingEvictions.values()]) if (e.requesterId === requesterId) finishPending(e);
  }

  // ---- Room close / reset ---------------------------------------------------------
  function left(code, socketId) {
    const s = rooms.get(code); if (!s) return;
    const remaining = membersOf(code).filter(m => m.id !== socketId);
    if (!remaining.length) {
      // Last member gone: the room closes and everything temporary about it disappears.
      for (const e of s.pendingJoins.values()) { clearTimeout(e.timer); io.to(e.requesterId).emit('join-error', { error: 'Everyone left that room before approving. Try joining again.' }); }
      for (const e of s.pendingEvictions.values()) clearTimeout(e.timer);
      dropTracked(s); rooms.delete(code); return true;
    }
    for (const e of [...s.pendingEvictions.values(), ...s.pendingJoins.values()]) {
      if (e.kind === 'evict' && e.targetId === socketId) { finishPending(e); io.to(code).emit('system-message', { text: `${e.targetName} left the room before the vote finished.` }); continue; }
      if (e.requesterId === socketId) { finishPending(e); continue; }
      if (!e.votes.has(socketId)) continue;
      // A voter left: they no longer need to approve. Re-check whether everyone still present has approved.
      e.votes.delete(socketId); e.names.delete(socketId);
      if (e.kind === 'join') {
        if (e.votes.size && [...e.votes.values()].every(Boolean)) { finishPending(e); hooks.admit?.({ room: code, requesterId: e.requesterId, username: e.requesterName, deviceId: e.deviceId }); }
        else { broadcastVote(e, 'join-request', true); joinProgress(e); }
      } else {
        const done = evictionOutcomeExcluding(code, e, socketId);
        if (done) hooks.evict?.({ room: code, ...done }); else broadcastVote(e, 'evict-request', true);
      }
    }
    for (const e of s.tracked.values()) checkQuickDelete(code, e, socketId);
    return false;
  }
  function evictionOutcomeExcluding(code, entry, leavingId) {
    const target = membersOf(code).find(m => m.id === entry.targetId && m.id !== leavingId);
    if (!target) return null;
    const voters = membersOf(code).filter(m => m.id !== entry.targetId && m.id !== leavingId);
    if (!voters.length || !voters.every(m => entry.votes.get(m.id) === true)) return null;
    finishPending(entry);
    if (target.deviceId) ban(code, target.deviceId);
    return { evict: true, targetId: entry.targetId, targetName: entry.targetName, deviceId: target.deviceId || null, reason: entry.reason };
  }
  function reset(code) { const s = rooms.get(code); if (s) { s.history = []; dropTracked(s); s.banned = new Map(); for (const e of s.pendingEvictions.values()) clearTimeout(e.timer); s.pendingEvictions = new Map(); for (const e of s.pendingJoins.values()) clearTimeout(e.timer); s.pendingJoins = new Map(); } }
  function close() { for (const s of rooms.values()) { for (const e of [...s.pendingJoins.values(), ...s.pendingEvictions.values()]) clearTimeout(e.timer); dropTracked(s); } rooms.clear(); }

  // ---- Quick delete (creator's choice, fixed until the room closes) -------------------
  // Each person's copy is handled by their own page once they have seen the message.
  // The server only decides when the SENDER's copy (and the late-join history entry)
  // goes: after every other current member has seen it, plus the message's time.
  function quickDeleteTtl(kind, chars) {
    if (kind === 'photo') return QD_PHOTO;
    if (kind === 'voice') return QD_VOICE;
    const perChar = QD_MIN / 150; // 150 characters fit in the base time
    return Math.min(QD_MAX, Math.max(QD_MIN, Math.round((Number(chars) || 0) * perChar / 1000) * 1000));
  }
  function trackMessage(code, { id, kind = 'text', chars = 0, senderId }) {
    const s = rooms.get(code); if (!s || !s.quickDelete || !id) return null;
    const entry = { id, kind, senderId, ttl: quickDeleteTtl(kind, chars), seen: new Set(), timer: null, expiresAt: null };
    s.tracked.set(id, entry);
    while (s.tracked.size > MAX_TRACKED) { const oldest = s.tracked.keys().next().value; clearTimeout(s.tracked.get(oldest).timer); s.tracked.delete(oldest); }
    checkQuickDelete(code, entry);
    return entry.ttl;
  }
  function markSeen(code, socketId, ids) {
    const s = rooms.get(code); if (!s || !s.quickDelete || !Array.isArray(ids)) return;
    if (!membersOf(code).some(m => m.id === socketId)) return;
    for (const id of ids.slice(0, 100)) {
      const entry = s.tracked.get(id); if (!entry || entry.senderId === socketId) continue;
      entry.seen.add(socketId); checkQuickDelete(code, entry);
    }
  }
  function checkQuickDelete(code, entry, leavingId = null) {
    if (entry.timer) return;
    const others = membersOf(code).filter(m => m.id !== entry.senderId && m.id !== leavingId);
    if (!others.every(m => entry.seen.has(m.id))) return;
    entry.expiresAt = now() + entry.ttl;
    entry.timer = setTimeout(() => expireMessage(code, entry.id), entry.ttl); entry.timer.unref?.();
    io.to(entry.senderId).emit('qd-countdown', { id: entry.id, ms: entry.ttl, expiresAt: entry.expiresAt });
  }
  function expireMessage(code, id) {
    const s = rooms.get(code); if (!s) return;
    const entry = s.tracked.get(id); if (entry) { clearTimeout(entry.timer); s.tracked.delete(id); }
    s.history = s.history.filter(h => h.id !== id);
    io.to(code).emit('message-expired', { id });
  }
  function on(event, fn) { if (event in hooks) hooks[event] = typeof fn === 'function' ? fn : null; }

  return {
    ensure, exists, roomInfo, inviteToken, history, record, clearHistory, reset, left, close, on,
    ban, unban, banState,
    requestJoin, voteJoin, cancelRequester, requestEvict, voteEvict,
    trackMessage, markSeen, quickDeleteTtl,
  };
};
