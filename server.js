const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Larger payload limit so voice notes (audio blobs) can get through.
// Socket.IO's default limit is 1 MB — too small for a 30-second voice note.
const io = new Server(server, { maxHttpBufferSize: 5 * 1024 * 1024 });

app.use(express.static("public"));

const PRESENCE_TIMEOUT = 12000;

// Rooms that are currently in a temporary voice call.
// Structure: room code -> Map(socketId -> username)
const calls = new Map();

/*
  Sends the current people/presence information
  to everyone inside a room.
*/
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


/*
  Automatically marks a user as away if their
  browser stops sending presence heartbeats.
*/
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


/*
  Removes a socket from its room's temporary call (if any).
  When fewer than 2 people remain, the call is over for everyone.
*/
function removeFromCall(socket) {
  if (!socket.room) return;

  const roomCall = calls.get(socket.room);
  if (!roomCall || !roomCall.has(socket.id)) return;

  roomCall.delete(socket.id);

  socket.to(socket.room).emit("call-peer-left", { id: socket.id });

  if (roomCall.size < 2) {
    calls.delete(socket.room);
    io.to(socket.room).emit("call-ended");
  }
}


io.on("connection", (socket) => {
  console.log("User connected:", socket.id);


  /*
    JOIN ROOM
  */
  socket.on("join-room", ({ username, room }) => {
    username = String(username || "").trim().slice(0, 20);
    room = String(room || "").trim().toUpperCase().slice(0, 20);

    if (!username || !room) return;


    // Leave any previous room first.
    if (socket.room) {
      const oldRoom = socket.room;

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


  /*
    SEND MESSAGE
  */
  socket.on("send-message", (message) => {
    if (!socket.room || !socket.username) return;

    message = String(message || "").trim();

    if (!message) return;

    // Prevent extremely large messages.
    message = message.slice(0, 1000);

    io.to(socket.room).emit("chat-message", {
      username: socket.username,
      message,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  });


  /*
    VOICE NOTE
  */
  // The browser records a short clip and sends it here as binary audio.
  // We only relay it to the room (same "temporary" philosophy as text:
  // nothing is stored, drop a note and it's gone).
  socket.on("voice-message", (data) => {
    if (!socket.room || !socket.username) return;
    if (!data || !Buffer.isBuffer(data.audio)) return;
    if (data.audio.length > 2 * 1024 * 1024) return; // ~2 MB safety cap

    io.to(socket.room).emit("voice-message", {
      username: socket.username,
      audio: data.audio,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  });


  /*
    TEMP CALL — START
    A user presses the Call button. Everyone else in the room gets a ring.
    The caller is registered as the call's first participant.
  */
  socket.on("call-start", () => {
    if (!socket.room || !socket.username) return;

    let roomCall = calls.get(socket.room);
    if (!roomCall) {
      roomCall = new Map();
      calls.set(socket.room, roomCall);
    }
    if (roomCall.has(socket.id) || roomCall.size >= 6) return;

    // Remember who was already in the call.
    const existing = [...roomCall.keys()];

    roomCall.set(socket.id, socket.username);

    // Ring everyone in the room who isn't already busy in a call.
    socket.to(socket.room).emit("call-start", {
      by: socket.username,
      id: socket.id,
    });

    // People already in the call should connect to the new caller directly.
    existing.forEach((id) => {
      io.to(id).emit("call-peer-joined", {
        id: socket.id,
        username: socket.username,
      });
    });
  });


  /*
    TEMP CALL — JOIN
    A person accepts the ring. We tell the joiner who is already in the
    call, and tell everyone else that a new peer joined.
  */
  socket.on("call-join", () => {
    if (!socket.room || !socket.username) return;

    let roomCall = calls.get(socket.room);
    if (!roomCall) {
      roomCall = new Map();
      calls.set(socket.room, roomCall);
    }
    if (roomCall.has(socket.id) || roomCall.size >= 6) return;

    roomCall.set(socket.id, socket.username);

    const existing = [...roomCall.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([id, username]) => ({ id, username }));

    io.to(socket.id).emit("call-peers", existing);
    existing.forEach(({ id }) => {
      io.to(id).emit("call-peer-joined", {
        id: socket.id,
        username: socket.username,
      });
    });
  });


  /*
    TEMP CALL — WEBRTC SIGNALING
    The browser negotiates the actual audio connections between pairs of
    people (peer-to-peer). The server just passes short messages between
    them — it never carries the audio itself.
  */
  socket.on("call-offer", ({ target, offer }) => {
    if (!socket.room || !target || !offer) return;
    const roomCall = calls.get(socket.room);
    if (!roomCall || !roomCall.has(target)) return;

    io.to(target).emit("call-offer", { from: socket.id, offer });
  });

  socket.on("call-answer", ({ target, answer }) => {
    if (!socket.room || !target || !answer) return;
    const roomCall = calls.get(socket.room);
    if (!roomCall || !roomCall.has(target)) return;

    io.to(target).emit("call-answer", { from: socket.id, answer });
  });

  socket.on("call-ice", ({ target, candidate }) => {
    if (!socket.room || !target || !candidate) return;
    const roomCall = calls.get(socket.room);
    if (!roomCall || !roomCall.has(target)) return;

    io.to(target).emit("call-ice", { from: socket.id, candidate });
  });


  /*
    TEMP CALL — LEAVE
  */
  socket.on("call-leave", () => {
    removeFromCall(socket);
  });


  /*
    RESET CHAT
  */
  socket.on("reset-chat", () => {
    if (!socket.room) return;

    io.to(socket.room).emit("clear-chat");
  });


  /*
    PRESENCE UPDATE
  */
  socket.on("presence-update", (status) => {
    if (!socket.room || !socket.username) return;

    if (status !== "active" && status !== "away") {
      return;
    }

    socket.presenceStatus = status;

    startPresenceTimeout(socket);

    broadcastPresence(socket.room);
  });


  /*
    PRESENCE HEARTBEAT
  */
  socket.on("presence-heartbeat", () => {
    if (!socket.room || !socket.username) return;

    if (socket.presenceStatus !== "active") {
      socket.presenceStatus = "active";
      broadcastPresence(socket.room);
    }

    startPresenceTimeout(socket);
  });


  /*
    DISCONNECT
  */
  socket.on("disconnect", () => {
    clearTimeout(socket.presenceTimeout);

    // If this person was in a voice call, pull them out of it.
    removeFromCall(socket);

    if (socket.room && socket.username) {
      const room = socket.room;

      socket.to(room).emit("system-message", {
        text: `${socket.username} left the chat.`,
      });

      setTimeout(() => {
        broadcastPresence(room);
      }, 50);
    }

    console.log("User disconnected:", socket.id);
  });
});


const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Temp Chat running on port ${PORT}`);
});
