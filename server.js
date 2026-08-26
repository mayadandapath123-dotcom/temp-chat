const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PRESENCE_TIMEOUT = 12000;

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
