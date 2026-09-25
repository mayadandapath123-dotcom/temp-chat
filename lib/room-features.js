'use strict';
const { randomUUID } = require('node:crypto');

// Bounded, ephemeral metadata only. Never stores message bodies or media.
module.exports = function roomFeatures(io) {
  const rooms = new Map();
  const palettes = new Set(['gold', 'ocean', 'forest', 'rose', 'violet', 'daylight']);
  const TTL = 60 * 60 * 1000;
  const MAX_RECEIPTS = 1000;
  const MAX_WALLPAPER = 220 * 1024;
  const members = room => [...(io.sockets.adapter.rooms.get(room) || [])]
    .map(id => io.sockets.sockets.get(id)).filter(s => s && s.room === room && s.username);
  const state = room => {
    if (!rooms.has(room)) rooms.set(room, { messages: new Map(), theme: { palette: 'gold', shade: 60, wallpaper: null }, consent: null });
    return rooms.get(room);
  };
  const ok = (ack, value) => { if (typeof ack === 'function') ack(value); };
  function consentPayload(c) {
    if (!c) return null;
    return { id: c.id, requesterId: c.requesterId, requester: c.requester, status: c.status,
      expiresAt: c.expiresAt, reason: c.reason || '', voters: c.voters.map(v => ({ ...v })) };
  }
  function consentBroadcast(room) { io.to(room).emit('capture-consent', consentPayload(state(room).consent)); }
  function finishConsent(room, status, reason) {
    const c = rooms.get(room)?.consent;
    if (!c) return;
    clearTimeout(c.timer);
    c.status = status; c.reason = reason; c.expiresAt = 0;
    consentBroadcast(room);
  }
  function armConsent(room, delay) {
    const c = state(room).consent;
    clearTimeout(c.timer);
    c.expiresAt = Date.now() + delay;
    c.timer = setTimeout(() => finishConsent(room, 'expired', 'Permission window ended. Ask again if needed.'), delay);
    c.timer.unref?.();
  }
  function membershipChanged(room) {
    const c = rooms.get(room)?.consent;
    if (c && ['pending', 'granted'].includes(c.status)) finishConsent(room, 'cancelled', 'Room membership changed. A new request is required.');
  }
  function sendReceipt(record) {
    io.to(record.senderId).emit('message-status', { id: record.id, recipients: [...record.recipients.values()] });
  }
  function trim(s) {
    for (const [id, r] of s.messages) {
      if (Date.now() - r.created > TTL || s.messages.size > MAX_RECEIPTS) { clearTimeout(r.timer); s.messages.delete(id); }
      else break;
    }
  }
  function record(socket, id) {
    const s = state(socket.room);
    const recipients = new Map(members(socket.room).filter(p => p.id !== socket.id)
      .map(p => [p.id, { id: p.id, username: p.username, delivered: false, seen: false }]));
    const r = { id, senderId: socket.id, recipients, created: Date.now() };
    s.messages.set(id, r); trim(s);
    const c = s.consent;
    if (c && c.status === 'granted') finishConsent(socket.room, 'cancelled', 'New content arrived. Request permission again.');
    // Packet order: the message is emitted synchronously before its initial status.
    r.timer = setTimeout(() => { r.timer = null; sendReceipt(r); }, 0);
    return { senderId: socket.id, recipientCount: recipients.size };
  }
  function left(room) {
    if (!room) return;
    membershipChanged(room);
    if (!members(room).length) {
      const s = rooms.get(room);
      if (s) { clearTimeout(s.consent?.timer); for (const r of s.messages.values()) clearTimeout(r.timer); }
      rooms.delete(room);
    }
  }
  function reset(room) {
    const s = rooms.get(room);
    if (s) { clearTimeout(s.consent?.timer); for (const r of s.messages.values()) clearTimeout(r.timer); }
    rooms.delete(room);
    io.to(room).emit('room-theme', { palette: 'gold', shade: 60, wallpaper: null });
    io.to(room).emit('capture-consent', null);
  }
  function attach(socket) {
    socket.on('message-receipts', (data) => {
      if (!socket.room || !data || !Array.isArray(data.ids) || !['delivered', 'seen'].includes(data.kind)) return;
      const s = rooms.get(socket.room); if (!s) return;
      for (const id of data.ids.slice(0, 100)) {
        const r = s.messages.get(id); const p = r?.recipients.get(socket.id);
        if (!p || Date.now() - r.created > TTL) continue;
        if (data.kind === 'seen' ? p.seen : p.delivered) continue;
        p.delivered = true; if (data.kind === 'seen') p.seen = true;
        if (!r.timer) r.timer = setTimeout(() => { r.timer = null; sendReceipt(r); }, 200);
      }
    });
    socket.on('set-room-theme', (data, ack) => {
      if (!socket.room || !socket.username || !data || typeof data !== 'object') return ok(ack, { error: 'Join a room first.' });
      if (socket.lastTheme && Date.now() - socket.lastTheme < 3000) return ok(ack, { error: 'Wait 3 seconds between theme changes.' });
      if (!palettes.has(data.palette) || !Number.isFinite(data.shade) || data.shade < 20 || data.shade > 85)
        return ok(ack, { error: 'Invalid theme.' });
      if (!['keep', 'remove', 'replace'].includes(data.wallpaperAction)) return ok(ack, { error: 'Invalid wallpaper action.' });
      let wallpaper;
      if (data.wallpaperAction === 'replace') {
        wallpaper = data.wallpaper;
        if (!Buffer.isBuffer(wallpaper) || wallpaper.length > MAX_WALLPAPER || wallpaper.length < 4 ||
          wallpaper[0] !== 255 || wallpaper[1] !== 216 || wallpaper[wallpaper.length - 2] !== 255 || wallpaper[wallpaper.length - 1] !== 217)
          return ok(ack, { error: 'Wallpaper must be a JPEG smaller than 220 KB.' });
      }
      socket.lastTheme = Date.now();
      const s = state(socket.room);
      s.theme.palette = data.palette; s.theme.shade = Math.round(data.shade);
      if (data.wallpaperAction !== 'keep') s.theme.wallpaper = data.wallpaperAction === 'remove' ? null : wallpaper;
      const payload = { palette: s.theme.palette, shade: s.theme.shade, changedBy: socket.username };
      // Do not retransmit a photo when only the palette or shade changes.
      if (data.wallpaperAction !== 'keep') payload.wallpaper = s.theme.wallpaper;
      io.to(socket.room).emit('room-theme', payload);
      if (s.consent && ['pending', 'granted'].includes(s.consent.status)) finishConsent(socket.room, 'cancelled', 'Room appearance changed. Request permission again.');
      ok(ack, { ok: true });
    });
    socket.on('capture-request', (_, ack) => {
      if (!socket.room || !socket.username) return ok(ack, { error: 'Join a room first.' });
      const s = state(socket.room);
      if (s.consent && ['pending', 'granted'].includes(s.consent.status)) return ok(ack, { error: 'A request is already active.' });
      if (s.lastRequest && Date.now() - s.lastRequest < 10000) return ok(ack, { error: 'Please wait 10 seconds between requests.' });
      const peers = members(socket.room).filter(p => p.id !== socket.id);
      if (!peers.length) return ok(ack, { error: 'There is nobody else in this room to approve.' });
      s.lastRequest = Date.now(); clearTimeout(s.consent?.timer);
      s.consent = { id: randomUUID(), requesterId: socket.id, requester: socket.username, status: 'pending',
        voters: peers.map(p => ({ id: p.id, username: p.username, vote: 'pending' })) };
      armConsent(socket.room, 60000); consentBroadcast(socket.room); ok(ack, { ok: true });
    });
    socket.on('capture-vote', (data, ack) => {
      const c = rooms.get(socket.room)?.consent;
      const v = c?.voters.find(p => p.id === socket.id);
      if (!data || !c || c.id !== data.id || c.status !== 'pending' || !v || v.vote !== 'pending' || !['approve', 'deny'].includes(data.vote))
        return ok(ack, { error: 'This request is no longer awaiting your vote.' });
      if (Date.now() >= c.expiresAt) { finishConsent(socket.room, 'expired', 'Request expired.'); return ok(ack, { error: 'Request expired.' }); }
      v.vote = data.vote;
      if (data.vote === 'deny') finishConsent(socket.room, 'denied', `${socket.username} declined.`);
      else if (c.voters.every(p => p.vote === 'approve')) { c.status = 'granted'; armConsent(socket.room, 30000); consentBroadcast(socket.room); }
      else consentBroadcast(socket.room);
      ok(ack, { ok: true });
    });
    socket.on('capture-revoke', (data, ack) => {
      const c = rooms.get(socket.room)?.consent;
      if (!data || !c || c.id !== data.id || !['pending', 'granted'].includes(c.status)) return ok(ack, { error: 'No active request.' });
      finishConsent(socket.room, 'revoked', `${socket.username} revoked/cancelled the request.`); ok(ack, { ok: true });
    });
  }
  return {
    attach, record, left, reset,
    joined(socket) {
      membershipChanged(socket.room);
      socket.emit('room-theme', { ...state(socket.room).theme });
      socket.emit('capture-consent', consentPayload(state(socket.room).consent));
      socket.emit('room-ready', { room: socket.room, selfId: socket.id });
    }
  };
};
