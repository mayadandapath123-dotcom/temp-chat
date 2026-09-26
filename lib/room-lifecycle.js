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
module.exports = function roomLifecycle(io, { now = Date.now } = {}) {
  const BAN_MS = 60 * 60 * 1000, VOTE_MS = 60 * 1000, MAX_HISTORY = 300, MAX_PENDING = 200;
  const rooms = new Map();
  const validDevice = id => typeof id === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(id);
  const validName = n => String(n || '').trim().slice(0, 40);
  const membersOf = code => [...(io.sockets.adapter.rooms.get(code) || [])]
    .map(id => io.sockets.sockets.get(id)).filter(s => s && s.room === code && s.username);

  function ensure(code, opts = {}) {
    if (!rooms.has(code)) {
      rooms.set(code, {
        code, name: validName(opts.name) || code, visibility: opts.visibility === 'private' ? 'private' : 'public',
        inviteToken: crypto.randomBytes(24).toString('base64url'), createdAt: now(),
        history: [], banned: new Map(), pendingJoins: new Map(), pendingEvictions: new Map(),
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
  function clearHistory(code) { const s = rooms.get(code); if (s) s.history = []; }

  function roomInfo(code) {
    const s = rooms.get(code); if (!s) return null;
    return { code: s.code, name: s.name, visibility: s.visibility, inviteToken: s.inviteToken, memberCount: membersOf(code).length };
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
    if (members.some(m => m.deviceId && deviceId && m.deviceId === deviceId)) return { admit: true, note: 'Same device already present.' };
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
    broadcastVote(entry, 'join-request', true);
    return { pending: true };
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
    const target = membersOf(code).find(m => m.id === entry.targetId);
    const allApproved = membersOf(code).filter(m => m.id !== entry.targetId).every(m => entry.votes.get(m.id) === true);
    if (allApproved) {
      finishPending(entry);
      if (target?.deviceId) ban(code, target.deviceId);
      return { evict: true, targetId: entry.targetId, targetName: entry.targetName, deviceId: target?.deviceId || null, reason: entry.reason };
    }
    broadcastVote(entry, 'evict-request', true);
    return { pending: true };
  }
  function cancelRequester(code, requesterId) {
    const s = rooms.get(code); if (!s) return;
    for (const e of [...s.pendingJoins.values(), ...s.pendingEvictions.values()]) if (e.requesterId === requesterId) finishPending(e);
  }

  // ---- Room close / reset ---------------------------------------------------------
  function left(code, socketId) {
    const s = rooms.get(code); if (!s) return;
    if (s.pendingEvictions.size || s.pendingJoins.size) {
      for (const e of [...s.pendingEvictions.values(), ...s.pendingJoins.values()]) {
        if (e.kind === 'evict' && e.targetId === socketId) { /* target left; resolve */ finishPending(e); io.to(code).emit('system-message', { text: `${e.targetName} left the room before the vote finished.` }); }
        else if (e.requesterId === socketId) finishPending(e);
      }
    }
    if (!membersOf(code).length) { for (const e of rooms.get(code)?.pendingEvictions.values() || []) clearTimeout(e.timer); rooms.delete(code); return true; }
    return false;
  }
  function reset(code) { const s = rooms.get(code); if (s) { s.history = []; s.banned = new Map(); for (const e of s.pendingEvictions.values()) clearTimeout(e.timer); s.pendingEvictions = new Map(); for (const e of s.pendingJoins.values()) clearTimeout(e.timer); s.pendingJoins = new Map(); } }
  function close() { for (const s of rooms.values()) for (const e of [...s.pendingJoins.values(), ...s.pendingEvictions.values()]) clearTimeout(e.timer); rooms.clear(); }

  return {
    ensure, exists, roomInfo, inviteToken, history, record, clearHistory, reset, left, close,
    ban, unban, banState,
    requestJoin, voteJoin, cancelRequester, requestEvict, voteEvict,
  };
};
