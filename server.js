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

// Socket.IO Server Configuration with WebSocket & Polling Fallbacks
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

// Serve frontend files from the 'public' folder
app.use(express.static(path.join(__dirname, "public")));

// Route fallback: send public/index.html for any room URL or page route
app.use((req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).send("File not found");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/*
  TEMP CHAT & CALL ARCHITECTURE
  -----------------------------
  All chat messages, view-once photos, voice notes, and calls
  are strictly EPHEMERAL and in-memory only.
*/

const PRESENCE_TIMEOUT = 12000;
const calls = new Map();

async function broadcastPresence(room) {
  if (!room) return;
  const sockets = await io.in(room).fetchSockets();
  const people = sockets
    .filter((socket) => socket.username)
    .map((socket) => ({
      username: socket.username,
      status: socket.presenceStatus || "away",
    }));

  io.to(room).emit("presence-update", people);
}

function startPresenceTimeout(socket) {
  clearTimeout(socket.presenceTimeout);
  socket.presenceTimeout = setTimeout(() => {
    if (!socket.room || !socket.username) return;
    if (socket.presenceStatus !== "away") {
      socket.presenceStatus = "away";
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
  } else if (roomCall.size === 1) {
    // Keep 1 person in call in case peer reconnects, but notify
  }
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // Join Room
  socket.on("join-room", ({ username, room }) => {
    username = String(username || "").trim().slice(0, 24);
    room = String(room || "").trim().toUpperCase().slice(0, 24);
    if (!username || !room) return;

    if (socket.room) {
      const oldRoom = socket.room;
      removeFromCall(socket);
      socket.leave(oldRoom);
      socket.to(oldRoom).emit("system-message", {
        text: `${socket.username} left the room.`,
      });
      broadcastPresence(oldRoom);
    }

    socket.join(room);
    socket.username = username;
    socket.room = room;
    socket.presenceStatus = "active";

    socket.to(room).emit("system-message", {
      text: `${username} entered the room.`,
    });

    broadcastPresence(room);
    startPresenceTimeout(socket);
  });

  // Text Message
  socket.on("send-message", (message) => {
    if (!socket.room || !socket.username) return;
    message = String(message || "").trim().slice(0, 1500);
    if (!message) return;

    io.to(socket.room).emit("chat-message", {
      id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      username: socket.username,
      message,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  });

  // Voice Note (Ephemeral Audio)
  socket.on("voice-message", (data) => {
    if (!socket.room || !socket.username || !data || !data.audio) return;
    io.to(socket.room).emit("voice-message", {
      id: "vn_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      username: socket.username,
      audio: data.audio,
      mime: data.mime || "audio/webm",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  });

  // Single-Time View-Once Photo
  socket.on("single-photo", (data) => {
    if (!socket.room || !socket.username || !data || !data.image) return;
    io.to(socket.room).emit("single-photo", {
      id: data.id || "photo_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      username: socket.username,
      image: data.image,
      caption: String(data.caption || "").slice(0, 200),
      isViewOnce: data.isViewOnce !== false,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  });

  // Photo Opened Notification
  socket.on("photo-opened", (data) => {
    if (!socket.room || !socket.username || !data || !data.photoId) return;
    io.to(socket.room).emit("photo-opened", {
      photoId: data.photoId,
      openedBy: socket.username,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  });

  /* =========================================
     WEBRTC CALL SIGNALING PIPELINE
  ========================================= */

  // 1. Caller starts the call -> Alert others in the room
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
      audioEnabled: true
    });

    // Notify other members in the room that a call was initiated
    socket.to(socket.room).emit("call-start", {
      by: socket.username,
      id: socket.id,
      callType,
    });
  });

  // 2. Peer accepts and joins the call with their media tracks ready
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
      audioEnabled: data.audioEnabled !== false
    });

    const existingPeers = [...roomCall.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([id, info]) => ({
        id,
        username: info.username,
        callType: info.callType,
        videoEnabled: info.videoEnabled,
        audioEnabled: info.audioEnabled
      }));

    // Send existing peers list to the newly joined peer
    io.to(socket.id).emit("call-peers", existingPeers);

    // Notify all existing peers in call about the newly joined peer
    existingPeers.forEach(({ id }) => {
      io.to(id).emit("call-peer-joined", {
        id: socket.id,
        username: socket.username,
        callType,
        videoEnabled: data.videoEnabled !== false && callType === "video",
        audioEnabled: data.audioEnabled !== false
      });
    });
  });

  // 3. P2P Signal Relay (SDP Offers, Answers, and ICE Candidates)
  socket.on("call-signal", (data) => {
    if (!socket.room || !data || !data.to || !data.signal) return;
    const roomCall = calls.get(socket.room);
    if (!roomCall || !roomCall.has(socket.id)) return;

    io.to(data.to).emit("call-signal", {
      from: socket.id,
      signal: data.signal,
    });
  });

  // 4. Peer Media State Updates (Camera on/off, Mute/unmute)
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

  // 5. Leave Call
  socket.on("call-leave", () => {
    removeFromCall(socket);
  });

  // Reset Chat
  socket.on("reset-chat", () => {
    if (!socket.room) return;
    io.to(socket.room).emit("clear-chat");
  });

  // Presence
  socket.on("presence-update", (status) => {
    if (!socket.room || !socket.username) return;
    if (status !== "active" && status !== "away") return;
    socket.presenceStatus = status;
    startPresenceTimeout(socket);
    broadcastPresence(socket.room);
  });

  socket.on("presence-heartbeat", () => {
    if (!socket.room || !socket.username) return;
    if (socket.presenceStatus !== "active") {
      socket.presenceStatus = "active";
      broadcastPresence(socket.room);
    }
    startPresenceTimeout(socket);
  });

  socket.on("disconnect", () => {
    clearTimeout(socket.presenceTimeout);
    removeFromCall(socket);
    if (socket.room && socket.username) {
      const room = socket.room;
      socket.to(room).emit("system-message", {
        text: `${socket.username} disconnected.`,
      });
      setTimeout(() => broadcastPresence(room), 50);
    }
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Temp Chat running on http://localhost:${PORT}`);
});

