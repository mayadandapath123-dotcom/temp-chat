const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Force HTTPS in production (Render, Railway, Heroku, etc.)
app.use((req, res, next) => {
  const proto = req.headers["x-forwarded-proto"];
  if (proto && proto !== "https" && req.hostname !== "localhost" && req.hostname !== "127.0.0.1") {
    return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
  }
  next();
});

// Socket.IO Server Configuration
const io = new Server(server, {
  maxHttpBufferSize: 25 * 1024 * 1024,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],
  allowEIO3: true,
  pingTimeout: 20000,
  pingInterval: 10000,
});

const pushService = require("./lib/push-service")();
app.get("/api/push/config", (req, res) => res.set("Cache-Control", "no-store").json(pushService.config()));
app.post("/api/push/unregister", express.json({ limit: "16kb" }), (req, res) => {
  const origin = req.get("origin");
  try { if (origin && new URL(origin).host !== req.get("host")) return res.status(403).json({ error: "Origin mismatch." }); }
  catch (_) { return res.status(403).json({ error: "Invalid origin." }); }
  if (req.body?.scope === "device") pushService.disableDevice(req.body?.token);
  else pushService.unregister(req.body?.token);
  res.set("Cache-Control", "no-store").json({ ok: true });
});

/*
  TEMP CHAT & CALL ARCHITECTURE
  -----------------------------
  Live rooms are temporary. New content is held only in memory until the room
  is reset or closed. A cleanup-only service removes already-expired rows left
  by the retired seven-day archive.
*/

const features = require("./lib/room-features")(io);
const lifecycle = require("./lib/room-lifecycle")(io, { quickDeleteMinMs: Number(process.env.TEMPCHAT_QD_BASE_MS) || 10000 }); // env override exists only for automated tests
const { randomUUID } = require("node:crypto");
const PRESENCE_TIMEOUT = 12000;
const calls = new Map(); // room -> Map(socketId -> { username, callType, videoEnabled, audioEnabled })
const archiveCleanup = require("./lib/retired-archive-cleanup")();
archiveCleanup.start();
const admin = require("./lib/admin-control")({
  app, io, calls,
  controls: {
    eject(socket, reason) { forceLeave(socket, reason); },
    clear(room) { clearRoom(room); },
    endCall(room) { endRoomCall(room); },
  },
});

let lastArchiveCleanupRequest = 0;
app.post("/api/archive/cleanup", async (req, res) => {
  const crypto = require("node:crypto"), secret = process.env.ARCHIVE_CLEANUP_TOKEN || "";
  const supplied = String(req.get("authorization") || "").replace(/^Bearer /, "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return res.status(503).json({ error: "Scheduled cleanup is not configured." });
  if (supplied.length > 200 || !crypto.timingSafeEqual(crypto.createHash('sha256').update(secret).digest(), crypto.createHash('sha256').update(supplied).digest())) return res.status(401).json({ error: "Unauthorized." });
  if (Date.now() - lastArchiveCleanupRequest < 60000) return res.status(429).json({ error: "Wait a minute between cleanup requests." });
  lastArchiveCleanupRequest = Date.now();
  try { res.set("Cache-Control", "no-store").json({ ok: true, ...await archiveCleanup.cleanup() }); }
  catch (_) { res.status(503).json({ error: "Archive cleanup failed. Check database availability." }); }
});

function clearRoom(room, by = null) {
  features.reset(room); pushService.reset(room); lifecycle.clearHistory(room);
  const who = String(by || "Admin").slice(0, 32);
  io.to(room).emit("push-reset"); io.to(room).emit("clear-chat", { by: who });
  // Admin clears announce themselves from the admin console; member resets are named here.
  if (by) io.to(room).emit("system-message", { text: `${who} cleared the chat for everyone.` });
}
function emitRoomInfo(room) {
  const info = lifecycle.roomInfo(room);
  if (!info) return;
  io.to(room).emit("room-info", { code: info.code, name: info.name, visibility: info.visibility, quickDelete: info.quickDelete, memberCount: info.memberCount, inviteToken: info.inviteToken });
}
function endRoomCall(room) {
  calls.delete(room); io.to(room).emit("call-ended"); broadcastCallStatus(room);
}
function forceLeave(socket, reason) {
  const room = socket.room, wasAdmin = Boolean(socket.isAdmin);
  socket.emit("moderation-exit", { reason: String(reason || "This session has ended.").slice(0, 180) });
  clearTimeout(socket.presenceTimeout); removeFromCall(socket); pushService.leave(socket);
  if (room) {
    socket.leave(room); admin.left(socket, room); features.left(room); lifecycle.left(room, socket.id);
    socket.room = null; socket.username = null; socket.isAdmin = false;
    if (wasAdmin) io.to(room).emit("system-message", { text: "Admin left this room." });
    broadcastPresence(room); broadcastCallStatus(room); emitRoomInfo(room);
  }
  socket.moderationRemoved = true;
  const timer = setTimeout(() => socket.disconnect(true), 200); timer.unref?.();
}


async function broadcastPresence(room) {
  if (!room) return;
  const sockets = await io.in(room).fetchSockets();
  const people = sockets
    .filter((socket) => socket.username)
    .map((socket) => ({
      id: socket.id,
      username: socket.username,
      isAdmin: Boolean(socket.isAdmin),
      status: socket.presenceStatus || "away",
    }));

  io.to(room).emit("presence-update", people);
}

function broadcastCallStatus(room) {
  if (!room) return;
  const roomCall = calls.get(room);
  if (!roomCall || roomCall.size === 0) {
    io.to(room).emit("room-call-status", { active: false, count: 0, participants: [] });
  } else {
    const participants = [...roomCall.values()].map((p) => p.username);
    const sampleCallType = [...roomCall.values()][0]?.callType || "video";
    io.to(room).emit("room-call-status", {
      active: true,
      count: roomCall.size,
      callType: sampleCallType,
      participants,
    });
  }
}

function startPresenceTimeout(socket) {
  clearTimeout(socket.presenceTimeout);
  socket.presenceTimeout = setTimeout(() => {
    if (!socket.room || !socket.username) return;
    if (socket.presenceStatus !== "away") {
      socket.presenceStatus = "away";
      admin.presence(socket, "away", false);
      broadcastPresence(socket.room);
    }
  }, PRESENCE_TIMEOUT);
}

function removeFromCall(socket) {
  if (!socket.room) return;
  const roomCall = calls.get(socket.room);
  if (!roomCall || !roomCall.has(socket.id)) return;

  roomCall.delete(socket.id);
  socket.to(socket.room).emit("call-peer-left", { id: socket.id });

  if (roomCall.size === 0) {
    calls.delete(socket.room);
    io.to(socket.room).emit("call-ended");
  }
  broadcastCallStatus(socket.room);
}

function admit(socket, { username, room, moderator = null, deviceId = null }) {
  if (socket.room) {
    const oldRoom = socket.room;
    removeFromCall(socket);
    pushService.leave(socket);
    socket.leave(oldRoom);
    admin.left(socket, oldRoom);
    features.left(oldRoom);
    lifecycle.left(oldRoom, socket.id);
    socket.to(oldRoom).emit("system-message", { text: `${socket.username} left the room.` });
    broadcastPresence(oldRoom);
    broadcastCallStatus(oldRoom);
    emitRoomInfo(oldRoom);
  }
  socket.join(room);
  socket.username = username;
  socket.room = room;
  socket.deviceId = deviceId;
  socket.presenceStatus = "active";
  socket.isAdmin = Boolean(moderator); socket.adminSessionId = moderator?.id || null;
  admin.joined(socket);
  socket.emit("room-history", { room, entries: lifecycle.history(room) });
  features.joined(socket);

  if (socket.isAdmin) io.to(room).emit("system-message", { text: "Admin joined this room visibly for moderation." });
  else socket.to(room).emit("system-message", { text: `${username} entered the room.` });

  broadcastPresence(room);
  broadcastCallStatus(room);
  emitRoomInfo(room);
  startPresenceTimeout(socket);
}
function completeEviction(room, result) {
  const target = io.sockets.sockets.get(result.targetId);
  const reason = result.reason ? ` Reason: ${result.reason}` : "";
  if (target && target.room === room) forceLeave(target, `The room members removed you for one hour.${reason}`);
  io.to(room).emit("system-message", { text: `${result.targetName} was removed from the room by member vote and blocked for one hour.` });
  emitRoomInfo(room);
}
// Votes can also complete when a voter leaves (they no longer need to approve).
lifecycle.on("admit", ({ room, requesterId, username, deviceId }) => {
  const requester = io.sockets.sockets.get(requesterId);
  if (requester && !requester.room && lifecycle.exists(room)) admit(requester, { username: requester.pendingUsername || username || "Guest", room, deviceId: requester.pendingDeviceId || deviceId });
});
lifecycle.on("evict", ({ room, ...result }) => completeEviction(room, result));

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  features.attach(socket);
  pushService.attach(socket);

  // A read-only liveness check: never joins, resets or exposes another room.
  socket.on("session-health", (_data, ack) => {
    if (typeof ack === "function") ack({ ok: true, room: socket.room || null,
      selfId: socket.id, isAdmin: Boolean(socket.isAdmin),
      inCall: Boolean(socket.room && calls.get(socket.room)?.has(socket.id)),
      removed: Boolean(socket.moderationRemoved) });
  });

  // Join Room
  socket.on("join-room", (data = {}) => {
    let { username, room } = data || {};
    username = String(username || "").trim().slice(0, 24);
    room = String(room || "").trim().toUpperCase().slice(0, 24);
    if (!username || !room) return;
    const deviceId = typeof data.deviceId === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(data.deviceId) ? data.deviceId : null;
    if (socket.moderationRemoved) return socket.emit("join-error", { error: "This session was removed. Open a new page to rejoin if room entry is unlocked." });
    let moderator = null;
    if (data.asAdmin === true) {
      moderator = admin.authorizeSocket(socket);
      if (!moderator) return socket.emit("join-error", { error: "Sign in at /admin before entering a room as Admin." });
      username = "Admin";
    }
    if (!moderator && /^(admin|administrator|moderator)$/i.test(username)) username += " (guest)";
    if (!moderator && !admin.canJoin(room)) return socket.emit("join-error", { error: "Admin has temporarily locked entry to this room. Try later." });

    const isNew = !lifecycle.exists(room);
    if (isNew) lifecycle.ensure(room, { name: data.name, visibility: data.visibility, quickDelete: data.quickDelete === true });
    const info = lifecycle.roomInfo(room);

    // One-hour device ban after removal (member-driven eviction).
    if (!moderator && deviceId && lifecycle.banState(room, deviceId)) {
      return socket.emit("join-error", { error: "You were removed from this room and cannot rejoin from this device for one hour." });
    }

    if (!moderator && info.visibility === "private" && data.inviteToken !== info.inviteToken) {
      const result = lifecycle.requestJoin(room, { socketId: socket.id, username, deviceId });
      if (result.error) return socket.emit("join-error", { error: result.error });
      if (result.pending) {
        socket.pendingUsername = username; socket.pendingDeviceId = deviceId; socket.pendingRoom = room;
        return socket.emit("join-pending", { id: result.id, room, memberCount: result.memberCount });
      }
      // result.admit: room was empty and closed, so it can be recreated/joined now
      return admit(socket, { username, room, moderator, deviceId });
    }

    admit(socket, { username, room, moderator, deviceId });
  });

  // Private room join approval
  socket.on("join-vote", (data = {}) => {
    if (!socket.room) return;
    const result = lifecycle.voteJoin(socket.room, socket.id, data);
    if (result.admit) {
      const requester = io.sockets.sockets.get(result.requesterId);
      if (requester && !requester.room) admit(requester, { username: requester.pendingUsername || "Guest", room: socket.room, deviceId: requester.pendingDeviceId || result.deviceId });
    } else if (result.error) socket.emit("system-message", { text: result.error });
  });

  // Member-driven removal (3+ members)
  socket.on("evict-request", (data = {}, ack) => {
    if (!socket.room || !socket.username) return typeof ack === "function" && ack({ error: "Join a room first." });
    const result = lifecycle.requestEvict(socket.room, socket.id, data);
    if (typeof ack === "function") ack(result.error ? { error: result.error } : { ok: true });
  });

  socket.on("evict-vote", (data = {}, ack) => {
    if (!socket.room) return typeof ack === "function" && ack({ error: "Join a room first." });
    const result = lifecycle.voteEvict(socket.room, socket.id, data);
    if (result.evict) {
      completeEviction(socket.room, result);
    } else if (result.error && result.error !== "You cannot vote on your own removal.") {
      socket.emit("system-message", { text: result.error });
    }
    if (typeof ack === "function") ack(result.error ? { error: result.error } : { ok: true });
  });

  // Explicit Exit affects this connection only; it never emits clear-chat.
  socket.on("leave-room", (data, ack) => {
    const room = socket.room, username = socket.username;
    clearTimeout(socket.presenceTimeout);
    removeFromCall(socket);
    pushService.leave(socket);
    if (data?.token) pushService.unregister(data.token);
    if (room) {
      socket.leave(room); admin.left(socket, room);
      socket.room = null; socket.username = null; socket.isAdmin = false; socket.adminSessionId = null; socket.deviceId = null;
      features.left(room); lifecycle.left(room, socket.id);
      io.to(room).emit("user-stop-typing", { username });
      emitRoomInfo(room);
      io.to(room).emit("system-message", { text: `${username} left the room.` });
      broadcastPresence(room); broadcastCallStatus(room);
    }
    if (typeof ack === "function") ack({ ok: true });
  });

  // Typing Indicators
  socket.on("typing", () => {
    if (!socket.room || !socket.username) return;
    socket.to(socket.room).emit("user-typing", { username: socket.username });
  });

  socket.on("stop-typing", () => {
    if (!socket.room || !socket.username) return;
    socket.to(socket.room).emit("user-stop-typing", { username: socket.username });
  });

  // Text Message
  socket.on("send-message", (data, ack) => {
    if (!socket.room || !socket.username) return;
    const message = String(typeof data === "string" ? data : data?.message || "").trim().slice(0, 1500);
    if (!message) return;
    const id = "msg_" + randomUUID();
    const clientId = typeof data?.clientId === "string" ? data.clientId.slice(0, 80) : null;
    const quote = features.reply(socket, data?.replyTo);
    if (quote.error) {
      socket.emit("message-rejected", { clientId, error: quote.error });
      if (typeof ack === "function") ack({ error: quote.error });
      return;
    }
    const expireAfter = lifecycle.trackMessage(socket.room, { id, kind: "text", chars: message.length, senderId: socket.id });
    io.to(socket.room).emit("chat-message", {
      id, clientId, room: socket.room, ...features.record(socket, id, { kind: "text", text: message }), reply: quote.value, username: socket.username, isAdmin: Boolean(socket.isAdmin), message, expireAfter,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
    lifecycle.record(socket.room, { id, type: "text", username: socket.username, senderId: socket.id, isAdmin: Boolean(socket.isAdmin), text: message, reply: quote.value, expireAfter });
    admin.activity(socket, "text", Buffer.byteLength(message), io.sockets.adapter.rooms.get(socket.room)?.size || 0);
    pushService.notify(socket, { id, title: socket.username, body: message });
    if (typeof ack === "function") ack({ ok: true, id });
  });

  // Voice Note (Ephemeral Audio)
  socket.on("voice-message", (data) => {
    if (!socket.room || !socket.username || !data || !data.audio) return;
    const id = "vn_" + randomUUID();
    const expireAfter = lifecycle.trackMessage(socket.room, { id, kind: "voice", senderId: socket.id });
    io.to(socket.room).emit("voice-message", {
      id, room: socket.room, ...features.record(socket, id, { kind: "voice", text: "Voice note" }),
      username: socket.username,
      isAdmin: Boolean(socket.isAdmin),
      audio: data.audio,
      mime: data.mime || "audio/webm", expireAfter,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
    admin.activity(socket, "voice", admin.size(data.audio), io.sockets.adapter.rooms.get(socket.room)?.size || 0);
    pushService.notify(socket, { id, title: socket.username, body: "Sent a voice note" });
  });

  // Single-Time View-Once Photo
  socket.on("single-photo", (data) => {
    if (!socket.room || !socket.username || !data || !data.image) return;
    const id = "photo_" + randomUUID();
    // View-once photos already vanish on their own; quick delete applies to regular photos.
    const expireAfter = data.isViewOnce === false ? lifecycle.trackMessage(socket.room, { id, kind: "photo", senderId: socket.id }) : null;
    io.to(socket.room).emit("single-photo", {
      id, room: socket.room, ...features.record(socket, id, { kind: "photo", text: data.isViewOnce !== false ? "View-once photo" : "Photo" }),
      username: socket.username,
      isAdmin: Boolean(socket.isAdmin),
      image: data.image,
      caption: String(data.caption || "").slice(0, 200),
      isViewOnce: data.isViewOnce !== false, expireAfter,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
    if (data.isViewOnce === false) lifecycle.record(socket.room, { id, type: "photo", username: socket.username, senderId: socket.id, isAdmin: Boolean(socket.isAdmin), image: data.image, caption: String(data.caption || "").slice(0, 200), expireAfter });
    admin.activity(socket, "photo", admin.size(data.image), io.sockets.adapter.rooms.get(socket.room)?.size || 0);
    pushService.notify(socket, { id, title: socket.username, body: data.isViewOnce !== false ? "Sent a view-once photo" : "Sent a photo" });
  });

  // Photo Opened Notification
  socket.on("photo-opened", (data) => {
    if (!socket.room || !socket.username || !data || !data.photoId) return;
    io.to(socket.room).emit("photo-opened", {
      photoId: data.photoId,
      openedBy: socket.username,
      openedById: socket.id,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  });

  /* =========================================================
     LIVE CALL SIGNALING & STREAM RELAY
  ========================================================= */

  // 1. Caller starts call -> Creates or expands room call
  socket.on("call-start", (data = {}) => {
    if (!socket.room || !socket.username) return;
    const callType = data.callType === "audio" ? "audio" : "video";

    let roomCall = calls.get(socket.room);
    if (!roomCall) {
      roomCall = new Map();
      calls.set(socket.room, roomCall);
    }
    if (roomCall.size >= 8) return;

    roomCall.set(socket.id, {
      username: socket.username,
      callType,
      videoEnabled: data.videoEnabled !== false && callType === "video",
      audioEnabled: true,
    });

    socket.to(socket.room).emit("call-start", {
      by: socket.username,
      room: socket.room,
      id: socket.id,
      callType,
    });

    broadcastCallStatus(socket.room);
  });

  // 2. Peer accepts and joins call
  socket.on("call-join", (data = {}) => {
    if (!socket.room || !socket.username) return;
    const callType = data.callType === "audio" ? "audio" : "video";

    let roomCall = calls.get(socket.room);
    if (!roomCall) {
      roomCall = new Map();
      calls.set(socket.room, roomCall);
    }
    if (roomCall.size >= 8) return;

    roomCall.set(socket.id, {
      username: socket.username,
      callType,
      videoEnabled: data.videoEnabled !== false && callType === "video",
      audioEnabled: data.audioEnabled !== false,
    });

    const existingPeers = [...roomCall.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([id, info]) => ({
        id,
        username: info.username,
        callType: info.callType,
        videoEnabled: info.videoEnabled,
        audioEnabled: info.audioEnabled,
      }));

    io.to(socket.id).emit("call-peers", existingPeers);

    existingPeers.forEach(({ id }) => {
      io.to(id).emit("call-peer-joined", {
        id: socket.id,
        username: socket.username,
        callType,
        videoEnabled: data.videoEnabled !== false && callType === "video",
        audioEnabled: data.audioEnabled !== false,
      });
    });

    broadcastCallStatus(socket.room);
  });

  // 3. Live Video Frame Stream Relay
  socket.on("video-frame", (data) => {
    if (!socket.room || !data || !data.frame) return;
    const roomCall = calls.get(socket.room);
    if (!roomCall || !roomCall.has(socket.id)) return;

    // BANDWIDTH CRITICAL: relay ONLY to sockets actually in the call.
    // Using socket.to(room) would also blast every frame at people who are
    // merely in the chat room -- their client discards it, but the host has
    // already been billed for the egress.
    admin.activity(socket, "videoFrames", admin.size(data.frame), roomCall.size - 1);
    for (const peerId of roomCall.keys()) {
      if (peerId === socket.id) continue;
      io.to(peerId).emit("video-frame", {
        from: socket.id,
        frame: data.frame,
      });
    }
  });

  // 4. Live PCM Audio Stream Relay
  socket.on("audio-pcm", (data) => {
    if (!socket.room || !data || !data.pcm) return;
    const roomCall = calls.get(socket.room);
    if (!roomCall || !roomCall.has(socket.id)) return;

    // BANDWIDTH CRITICAL: relay ONLY to sockets actually in the call
    // (see the note on video-frame above).
    admin.activity(socket, "audioFrames", admin.size(data.pcm), roomCall.size - 1);
    for (const peerId of roomCall.keys()) {
      if (peerId === socket.id) continue;
      io.to(peerId).emit("audio-pcm", {
        from: socket.id,
        pcm: data.pcm,
        sampleRate: data.sampleRate,
      });
    }
  });

  // 5. Camera / Mic State Update
  socket.on("call-media-state", (data) => {
    if (!socket.room || !data) return;
    const roomCall = calls.get(socket.room);
    if (!roomCall || !roomCall.has(socket.id)) return;

    const userCallInfo = roomCall.get(socket.id);
    if (typeof data.video === "boolean") userCallInfo.videoEnabled = data.video;
    if (typeof data.audio === "boolean") userCallInfo.audioEnabled = data.audio;

    socket.to(socket.room).emit("call-peer-media-state", {
      id: socket.id,
      video: userCallInfo.videoEnabled,
      audio: userCallInfo.audioEnabled,
    });
  });

  // 6. Leave Call
  socket.on("call-leave", () => {
    removeFromCall(socket);
  });

  // Reset Chat
  // Quick delete: a member's page reports which messages it has actually shown.
  socket.on("qd-seen", (data = {}) => {
    if (!socket.room || !socket.username) return;
    lifecycle.markSeen(socket.room, socket.id, Array.isArray(data.ids) ? data.ids.filter(id => typeof id === "string" && id.length < 80) : []);
  });

  socket.on("reset-chat", () => {
    if (!socket.room || !socket.username) return;
    clearRoom(socket.room, socket.isAdmin ? "Admin" : socket.username);
  });

  // Presence
  socket.on("presence-update", (status) => {
    if (!socket.room || !socket.username) return;
    if (status !== "active" && status !== "away") return;
    socket.presenceStatus = status;
    admin.presence(socket, status);
    startPresenceTimeout(socket);
    broadcastPresence(socket.room);
  });

  socket.on("presence-heartbeat", () => {
    if (!socket.room || !socket.username) return;
    admin.presence(socket, "active");
    if (socket.presenceStatus !== "active") {
      socket.presenceStatus = "active";
      broadcastPresence(socket.room);
    }
    startPresenceTimeout(socket);
  });

  socket.on("disconnect", () => {
    clearTimeout(socket.presenceTimeout);
    pushService.disconnect(socket);
    removeFromCall(socket);
    if (socket.room && socket.username) {
      const room = socket.room;
      admin.left(socket, room);
      features.left(room);
      lifecycle.left(room, socket.id);
      socket.to(room).emit("system-message", {
        text: `${socket.username} disconnected.`,
      });
      emitRoomInfo(room);
      setTimeout(() => {
        broadcastPresence(room);
        broadcastCallStatus(room);
      }, 50);
    }
    console.log("Socket disconnected:", socket.id);
  });
});

// Serve frontend files from the 'public' folder
app.use(express.static(path.join(__dirname, "public")));

// Route fallback: send public/index.html for any room URL or page route
app.use((req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).send("File not found");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Temp Chat running on http://localhost:${server.address().port}`);
});


let shuttingDown = false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, async () => {
  if (shuttingDown) return; shuttingDown = true;
  const deadline = setTimeout(() => process.exit(0), 9000); deadline.unref();
  io.close(); server.close();
  lifecycle.close();
  try { await archiveCleanup.close(); } catch (_) {}
  process.exit(0);
});
