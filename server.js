const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// In-memory buffer limit for voice notes & view-once photos (15 MB)
const io = new Server(server, {
  maxHttpBufferSize: 15 * 1024 * 1024,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, "public")));

// Fallback to index.html for invite links (e.g. /?room=BLUE123)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

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

  if (roomCall.size < 2) {
    if (roomCall.size === 0) {
      calls.delete(socket.room);
    }
    io.to(socket.room).emit("call-ended");
  }
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

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
        text: `${socket.username} left the chat.`,
      });
      broadcastPresence(oldRoom);
    }

    socket.join(room);
    socket.username = username;
    socket.room = room;
    socket.presenceStatus = "active";

    socket.to(room).emit("system-message", {
      text: `${username} joined the chat.`,
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

  // Voice Note
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

  // Single-Time View-Once Photo (Never saved to disk/DB)
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

  // Video / Voice Call Signaling
  socket.on("call-start", (data = {}) => {
    if (!socket.room || !socket.username) return;
    const callType = data.callType === "audio" ? "audio" : "video";

    let roomCall = calls.get(socket.room);
    if (!roomCall) {
      roomCall = new Map();
      calls.set(socket.room, roomCall);
    }
    if (roomCall.has(socket.id) || roomCall.size >= 8) return;

    const existing = [...roomCall.entries()].map(([id, info]) => ({
      id,
      username: info.username,
      callType: info.callType,
      videoEnabled: info.videoEnabled,
      audioEnabled: info.audioEnabled
    }));

    roomCall.set(socket.id, {
      username: socket.username,
      callType,
      videoEnabled: callType === "video",
      audioEnabled: true
    });

    socket.to(socket.room).emit("call-start", {
      by: socket.username,
      id: socket.id,
      callType,
    });

    existing.forEach((peer) => {
      io.to(peer.id).emit("call-peer-joined", {
        id: socket.id,
        username: socket.username,
        callType,
        videoEnabled: callType === "video",
        audioEnabled: true
      });
    });
  });

  socket.on("call-join", (data = {}) => {
    if (!socket.room || !socket.username) return;
    const callType = data.callType === "audio" ? "audio" : "video";

    let roomCall = calls.get(socket.room);
    if (!roomCall) {
      roomCall = new Map();
      calls.set(socket.room, roomCall);
    }
    if (roomCall.has(socket.id) || roomCall.size >= 8) return;

    roomCall.set(socket.id, {
      username: socket.username,
      callType,
      videoEnabled: data.videoEnabled !== false && callType === "video",
      audioEnabled: data.audioEnabled !== false
    });

    const existing = [...roomCall.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([id, info]) => ({
        id,
        username: info.username,
        callType: info.callType,
        videoEnabled: info.videoEnabled,
        audioEnabled: info.audioEnabled
      }));

    io.to(socket.id).emit("call-peers", existing);

    existing.forEach(({ id }) => {
      io.to(id).emit("call-peer-joined", {
        id: socket.id,
        username: socket.username,
        callType,
        videoEnabled: data.videoEnabled !== false && callType === "video",
        audioEnabled: data.audioEnabled !== false
      });
    });
  });

  socket.on("call-signal", (data) => {
    if (!socket.room || !data || !data.to || !data.signal) return;
    const roomCall = calls.get(socket.room);
    if (!roomCall || !roomCall.has(socket.id)) return;

    io.to(data.to).emit("call-signal", {
      from: socket.id,
      signal: data.signal,
    });
  });

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

  socket.on("call-leave", () => {
    removeFromCall(socket);
  });

  socket.on("reset-chat", () => {
    if (!socket.room) return;
    io.to(socket.room).emit("clear-chat");
  });

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
        text: `${socket.username} left the chat.`,
      });
      setTimeout(() => broadcastPresence(room), 50);
    }
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Temp Chat running on port ${PORT}`);
});
