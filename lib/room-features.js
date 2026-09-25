'use strict';

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
    if (!rooms.has(room)) rooms.set(room, { messages: new Map(), theme: { palette: 'gold', shade: 60, wallpaper: null } });
    return rooms.get(room);
  };
  const ok = (ack, value) => { if (typeof ack === 'function') ack(value); };
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
    // Packet order: the message is emitted synchronously before its initial status.
    r.timer = setTimeout(() => { r.timer = null; sendReceipt(r); }, 0);
    return { senderId: socket.id, recipientCount: recipients.size };
  }
  function left(room) {
    if (!room) return;
    if (!members(room).length) {
      const s = rooms.get(room);
      if (s) { for (const r of s.messages.values()) clearTimeout(r.timer); }
      rooms.delete(room);
    }
  }
  function reset(room) {
    const s = rooms.get(room);
    if (s) { for (const r of s.messages.values()) clearTimeout(r.timer); }
    rooms.delete(room);
    io.to(room).emit('room-theme', { palette: 'gold', shade: 60, wallpaper: null });
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
      ok(ack, { ok: true });
    });
  }

  return {
    attach, record, left, reset,
    joined(socket) {
      socket.emit('room-theme', { ...state(socket.room).theme });
      socket.emit('room-ready', { room: socket.room, selfId: socket.id });
    }
  };
};
