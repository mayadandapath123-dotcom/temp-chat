const socket = io();


/* =========================
   ELEMENTS
========================= */

const joinScreen = document.getElementById("join-screen");
const chatScreen = document.getElementById("chat-screen");

const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");

const joinButton = document.getElementById("join-button");

const roomName = document.getElementById("room-name");

const messages = document.getElementById("messages");

const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

const resetButton = document.getElementById("reset-button");

const peopleButton = document.getElementById("people-button");
const peopleCount = document.getElementById("people-count");

const peoplePanel = document.getElementById("people-panel");
const closePeople = document.getElementById("close-people");
const peopleList = document.getElementById("people-list");

const characterArea = document.getElementById("character-area");


/* =========================
   STATE
========================= */

let currentUsername = "";
let currentRoom = "";

let joinedChat = false;

let presenceHeartbeat = null;


/* =========================
   JOIN CHAT
========================= */

joinButton.addEventListener("click", joinChat);


usernameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    roomInput.focus();
  }
});


roomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinChat();
  }
});


function joinChat() {

  const username = usernameInput.value.trim();

  const room = roomInput.value
    .trim()
    .toUpperCase();


  if (!username || !room) {

    alert(
      "Please enter both a username and room code."
    );

    return;
  }


  currentUsername = username.slice(0, 20);
  currentRoom = room.slice(0, 20);


  socket.emit("join-room", {
    username: currentUsername,
    room: currentRoom,
  });


  roomName.textContent = `Room ${currentRoom}`;


  joinScreen.classList.add("hidden");

  chatScreen.classList.remove("hidden");


  joinedChat = true;


  startPresenceHeartbeat();

  sendPresence("active");


  setTimeout(() => {
    messageInput.focus();
  }, 100);
}


/* =========================
   SEND MESSAGE
========================= */

messageForm.addEventListener(
  "submit",
  (event) => {

    event.preventDefault();


    const message =
      messageInput.value.trim();


    if (!message) return;


    socket.emit(
      "send-message",
      message.slice(0, 1000)
    );


    messageInput.value = "";


    messageInput.focus();
  }
);


/* =========================
   CHAT MESSAGE
========================= */

socket.on(
  "chat-message",
  (data) => {

    const messageElement =
      document.createElement("div");


    const isOwnMessage =
      data.username === currentUsername;


    messageElement.className =
      `message ${isOwnMessage ? "own-message" : "other-message"}`;


    const bubble = document.createElement("div");

    bubble.className = "message-bubble";


    const name = document.createElement("strong");

    name.textContent =
      isOwnMessage ? "You" : data.username;


    const text = document.createElement("span");

    text.textContent = data.message;


    const time = document.createElement("small");

    time.textContent = data.time;


    bubble.appendChild(name);
    bubble.appendChild(text);
    bubble.appendChild(time);


    messageElement.appendChild(bubble);

    messages.appendChild(messageElement);


    scrollMessagesToBottom();
  }
);


/* =========================
   SYSTEM MESSAGE
========================= */

socket.on(
  "system-message",
  (data) => {

    const messageElement =
      document.createElement("div");


    messageElement.className =
      "system-message";


    messageElement.textContent =
      data.text;


    messages.appendChild(
      messageElement
    );


    scrollMessagesToBottom();
  }
);


/* =========================
   RESET CHAT
========================= */

socket.on(
  "clear-chat",
  () => {

    messages.innerHTML = "";

  }
);


resetButton.addEventListener(
  "click",
  () => {

    const confirmed = confirm(
      "This will clear the chat for everyone in this room. Continue?"
    );


    if (confirmed) {

      socket.emit("reset-chat");

    }
  }
);


/* =========================
   PRESENCE
========================= */

socket.on(
  "presence-update",
  (people) => {

    updatePeopleUI(people);

    updateCharacters(people);

  }
);


/*
  Tell server whether the user is active
  or away.
*/

function sendPresence(status) {

  if (!joinedChat) return;

  socket.emit(
    "presence-update",
    status
  );
}


/*
  Browser tab visibility.
*/

document.addEventListener(
  "visibilitychange",
  () => {

    if (!joinedChat) return;


    if (document.visibilityState === "visible") {

      sendPresence("active");

    } else {

      sendPresence("away");

    }
  }
);


/*
  Window focus / blur gives us an additional
  signal on desktop.
*/

window.addEventListener(
  "focus",
  () => {

    if (joinedChat) {
      sendPresence("active");
    }

  }
);


window.addEventListener(
  "blur",
  () => {

    if (joinedChat) {
      sendPresence("away");
    }

  }
);


/*
  Heartbeat keeps the server aware that
  the browser is still alive.
*/

function startPresenceHeartbeat() {

  if (presenceHeartbeat) {
    clearInterval(presenceHeartbeat);
  }


  presenceHeartbeat = setInterval(
    () => {

      if (
        joinedChat &&
        document.visibilityState === "visible"
      ) {

        socket.emit(
          "presence-heartbeat"
        );

      }

    },
    5000
  );
}


/* =========================
   PEOPLE UI
========================= */

function updatePeopleUI(people) {

  peopleCount.textContent =
    people.length;


  peopleList.innerHTML = "";


  people.forEach((person) => {

    const row =
      document.createElement("div");


    row.className =
      "person-row";


    const left =
      document.createElement("div");


    left.className =
      "person-left";


    const dot =
      document.createElement("span");


    dot.className =
      `status-dot ${person.status}`;


    const name =
      document.createElement("span");


    name.textContent =
      person.username;


    left.appendChild(dot);
    left.appendChild(name);


    const status =
      document.createElement("span");


    status.className =
      `person-status ${person.status}`;


    status.textContent =
      person.status === "active"
        ? "Active"
        : "Away";


    row.appendChild(left);
    row.appendChild(status);


    peopleList.appendChild(row);

  });
}


/* =========================
   PEOPLE PANEL
========================= */

peopleButton.addEventListener(
  "click",
  () => {

    peoplePanel.classList.toggle(
      "hidden"
    );

  }
);


closePeople.addEventListener(
  "click",
  () => {

    peoplePanel.classList.add(
      "hidden"
    );

  }
);


/* =========================
   CHARACTER SYSTEM
========================= */

function updateCharacters(people) {

  characterArea.innerHTML = "";


  /*
    Only show active people.

    Away users disappear from the
    character area.
  */

  const activePeople =
    people.filter(
      (person) =>
        person.status === "active"
    );


  activePeople.forEach(
    (person, index) => {

      const character =
        createCharacter(
          person,
          index,
          activePeople.length
        );


      characterArea.appendChild(
        character
      );

    }
  );
}


function createCharacter(
  person,
  index,
  total
) {

  const wrapper =
    document.createElement("div");


  wrapper.className =
    "character-wrapper";


  wrapper.dataset.username =
    person.username;


  /*
    Spread characters across
    the bottom of the screen.
  */

  const position =
    total === 1
      ? 50
      : 20 + (
          index / (total - 1)
        ) * 60;


  wrapper.style.left =
    `${position}%`;


  /*
    Generate a stable visual
    identity from the username.
  */

  const hue =
    getUsernameHue(
      person.username
    );


  wrapper.style.setProperty(
    "--character-hue",
    hue
  );


  const character =
    document.createElement("div");


  character.className =
    "character";


  /*
    Head
  */

  const head =
    document.createElement("div");


  head.className =
    "character-head";


  /*
    Eyes
  */

  const face =
    document.createElement("div");


  face.className =
    "character-face";


  face.innerHTML = `
    <span></span>
    <span></span>
  `;


  head.appendChild(face);


  /*
    Curved body
  */

  const body =
    document.createElement("div");


  body.className =
    "character-body";


  character.appendChild(head);

  character.appendChild(body);


  /*
    Name bubble
  */

  const name =
    document.createElement("div");


  name.className =
    "character-name";


  name.textContent =
    person.username;


  wrapper.appendChild(character);

  wrapper.appendChild(name);


  return wrapper;
}


/*
  Create a stable hue from
  the username.
*/

function getUsernameHue(username) {

  let hash = 0;


  for (
    let i = 0;
    i < username.length;
    i++
  ) {

    hash =
      username.charCodeAt(i) +
      ((hash << 5) - hash);

  }


  return Math.abs(hash) % 360;
}


/* =========================
   SCROLL
========================= */

function scrollMessagesToBottom() {

  requestAnimationFrame(
    () => {

      messages.scrollTop =
        messages.scrollHeight;

    }
  );
}


/* =========================
   HTML ESCAPING
========================= */

function escapeHTML(text) {

  const div =
    document.createElement("div");


  div.textContent =
    text;


  return div.innerHTML;
}
