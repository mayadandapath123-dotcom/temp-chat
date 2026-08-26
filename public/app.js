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

const micButton = document.getElementById("mic-button");
const recordBar = document.getElementById("record-bar");
const recordTimer = document.getElementById("record-timer");
const cancelRecord = document.getElementById("cancel-record");
const sendRecord = document.getElementById("send-record");

const callButton = document.getElementById("call-button");
const incomingCall = document.getElementById("incoming-call");
const incomingName = document.getElementById("incoming-name");
const incomingRoom = document.getElementById("incoming-room");
const acceptCall = document.getElementById("accept-call");
const declineCall = document.getElementById("decline-call");
const callScreen = document.getElementById("call-screen");
const callPeople = document.getElementById("call-people");
const callTimer = document.getElementById("call-timer");
const callRoomLabel = document.getElementById("call-room-label");
const muteButton = document.getElementById("mute-button");
const leaveCall = document.getElementById("leave-call");


/* =========================
   STATE
========================= */

let currentUsername = "";
let currentRoom = "";

let joinedChat = false;

let presenceHeartbeat = null;

/* Voice note state */

let mediaRecorder = null;
let recordedChunks = [];
let recordTimerInterval = null;
let recordStartedAt = 0;
let recordSendOnStop = false;

let currentVoiceAudio = null;
let currentVoicePlayButton = null;

/* Temp call state */

let inCall = false;
let localStream = null;
let callPeers = new Map();
let callStartedAt = 0;
let callTimerInterval = null;


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
   LOCAL SYSTEM MESSAGE
========================= */

/*
  Shows a small centered system-style message
  only on this device (not sent to the room).
*/

function localSystemMessage(text) {

  const messageElement =
    document.createElement("div");


  messageElement.className =
    "system-message";


  messageElement.textContent =
    text;


  messages.appendChild(
    messageElement
  );


  scrollMessagesToBottom();
}


/* =========================
   VOICE NOTES
========================= */

const VOICE_PLAY_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">' +
  '<path d="M8 5v14l11-7z"/></svg>';


const VOICE_PAUSE_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">' +
  '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';


/*
  Hide buttons the browser cannot support.
*/

if (!window.MediaRecorder) {
  micButton.classList.add("hidden");
}


if (
  !navigator.mediaDevices ||
  !navigator.mediaDevices.getUserMedia
) {
  callButton.classList.add("hidden");
}


/*
  Received voice note from the server.
  The server relays the audio — nothing is stored.
*/

socket.on(
  "voice-message",
  (data) => {

    if (!data || !data.audio) return;

    try {

      appendVoiceMessage(data);

    } catch (error) {

      console.warn("Could not render voice note:", error);

    }

  }
);


/*
  Builds a voice note bubble with a small
  play/pause player, matching the chat style.
*/

function appendVoiceMessage(data) {

  const isOwnMessage =
    data.username === currentUsername;


  const messageElement =
    document.createElement("div");


  messageElement.className =
    `message ${isOwnMessage ? "own-message" : "other-message"}`;


  const bubble =
    document.createElement("div");


  bubble.className =
    "message-bubble voice-bubble";


  const name =
    document.createElement("strong");


  name.textContent =
    isOwnMessage ? "You" : data.username;


  const player =
    buildVoicePlayer(data);


  const time =
    document.createElement("small");


  time.textContent =
    data.time;


  bubble.appendChild(name);
  bubble.appendChild(player);
  bubble.appendChild(time);


  messageElement.appendChild(bubble);

  messages.appendChild(messageElement);


  scrollMessagesToBottom();
}


function buildVoicePlayer(data) {

  const mime =
    typeof data.mime === "string"
      ? data.mime
      : "audio/webm";


  const blob =
    new Blob([data.audio], { type: mime });


  const url =
    URL.createObjectURL(blob);


  const audio =
    new Audio(url);


  const player =
    document.createElement("div");


  player.className =
    "voice-player";


  const playButton =
    document.createElement("button");


  playButton.type =
    "button";


  playButton.className =
    "voice-play";


  playButton.setAttribute(
    "aria-label",
    "Play voice note"
  );


  playButton.innerHTML =
    VOICE_PLAY_SVG;


  const bar =
    document.createElement("div");


  bar.className =
    "voice-bar";


  const progress =
    document.createElement("div");


  progress.className =
    "voice-progress";


  bar.appendChild(progress);


  const duration =
    document.createElement("span");


  duration.className =
    "voice-duration";


  duration.textContent =
    "0:00";


  player.appendChild(playButton);
  player.appendChild(bar);
  player.appendChild(duration);


  audio.addEventListener(
    "loadedmetadata",
    () => {

      duration.textContent =
        formatDuration(audio.duration);

    }
  );


  audio.addEventListener(
    "timeupdate",
    () => {

      if (audio.duration) {

        progress.style.width =
          `${(audio.currentTime / audio.duration) * 100}%`;

      }

    }
  );


  audio.addEventListener(
    "ended",
    () => {

      playButton.innerHTML =
        VOICE_PLAY_SVG;

      progress.style.width =
        "0%";

      duration.textContent =
        formatDuration(audio.duration);

    }
  );


  playButton.addEventListener(
    "click",
    () => {

      if (audio.paused) {

        if (
          currentVoiceAudio &&
          currentVoiceAudio !== audio
        ) {

          currentVoiceAudio.pause();

          if (currentVoicePlayButton) {

            currentVoicePlayButton.innerHTML =
              VOICE_PLAY_SVG;

          }

        }

        audio.play();

        playButton.innerHTML =
          VOICE_PAUSE_SVG;

        currentVoiceAudio = audio;
        currentVoicePlayButton = playButton;

      } else {

        audio.pause();

        playButton.innerHTML =
          VOICE_PLAY_SVG;

      }

    }
  );


  bar.addEventListener(
    "click",
    (event) => {

      if (!audio.duration) return;

      const rect =
        bar.getBoundingClientRect();

      const ratio =
        Math.min(
          Math.max(
            (event.clientX - rect.left) / rect.width,
            0
          ),
          1
        );

      audio.currentTime =
        ratio * audio.duration;

    }
  );


  return player;
}


/*
  Chooses the best audio format the browser can record.
*/

function pickMimeType() {

  const options = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];


  for (const type of options) {

    if (MediaRecorder.isTypeSupported(type)) {

      return type;

    }

  }


  return "";
}


/*
  Starts recording a voice note (max 30 seconds).
*/

async function startVoiceRecording() {

  if (mediaRecorder) return;

  if (
    !navigator.mediaDevices ||
    !window.MediaRecorder
  ) {

    localSystemMessage(
      "Voice notes are not supported in this browser."
    );

    return;

  }


  let stream;


  try {

    stream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

  } catch (error) {

    localSystemMessage(
      "Microphone access was denied. Allow the mic to record a voice note."
    );

    return;

  }


  recordedChunks = [];
  recordSendOnStop = false;


  let mimeType = "";

  try {

    mimeType = pickMimeType();

    mediaRecorder =
      new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

  } catch (error) {

    stream.getTracks().forEach(
      (track) => track.stop()
    );

    mediaRecorder = null;

    localSystemMessage(
      "Could not start recording on this browser."
    );

    return;

  }


  mediaRecorder.ondataavailable =
    (event) => {

      if (event.data && event.data.size > 0) {

        recordedChunks.push(event.data);

      }

    };


  mediaRecorder.onstop =
    () => {

      const usedMime =
        mediaRecorder.mimeType || mimeType || "audio/webm";


      mediaRecorder = null;

      clearInterval(recordTimerInterval);

      recordTimerInterval = null;

      stream.getTracks().forEach(
        (track) => track.stop()
      );

      setIsRecording(false);


      if (
        recordSendOnStop &&
        recordedChunks.length
      ) {

        const blob =
          new Blob(recordedChunks, {
            type: usedMime
          });


        socket.emit(
          "voice-message",
          {
            audio: blob,
            mime: usedMime
          }
        );

      }


      recordedChunks = [];

    };


  mediaRecorder.start();

  recordStartedAt = Date.now();

  setIsRecording(true);

  messageInput.blur();


  recordTimerInterval =
    setInterval(
      () => {

        const seconds =
          Math.floor(
            (Date.now() - recordStartedAt) / 1000
          );


        recordTimer.textContent =
          formatDuration(seconds);


        if (seconds >= 30) {

          stopVoiceRecording(true);

        }

      },
      250
    );

}


function stopVoiceRecording(send) {

  if (!mediaRecorder) return;

  recordSendOnStop =
    Boolean(send);

  try {

    mediaRecorder.stop();

  } catch (error) {

    /* Already stopped — nothing to do. */

  }

}


function setIsRecording(recording) {

  messageForm.classList.toggle(
    "recording",
    recording
  );


  recordBar.classList.toggle(
    "hidden",
    !recording
  );

}


function formatDuration(totalSeconds) {

  const safe =
    Math.max(0, Math.floor(totalSeconds));


  const minutes =
    Math.floor(safe / 60);


  const seconds =
    safe % 60;


  return `${minutes}:${String(seconds).padStart(2, "0")}`;

}


micButton.addEventListener(
  "click",
  () => {

    startVoiceRecording();

  }
);


sendRecord.addEventListener(
  "click",
  () => {

    stopVoiceRecording(true);

  }
);


cancelRecord.addEventListener(
  "click",
  () => {

    stopVoiceRecording(false);

  }
);


/* =========================
   TEMP CALL
========================= */

callButton.addEventListener(
  "click",
  () => {

    if (inCall) return;

    startCallAsCaller();

  }
);


async function startCallAsCaller() {

  const stream =
    await requestCallMic();


  if (!stream) return;


  enterCallUI();

  socket.emit("call-start");

}


async function acceptIncomingCall() {

  hideIncomingCall();

  const stream =
    await requestCallMic();


  if (!stream) return;


  enterCallUI();

  socket.emit("call-join");

}


function declineIncomingCall() {

  hideIncomingCall();

}


async function requestCallMic() {

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {

    localSystemMessage(
      "Audio calls are not supported in this browser."
    );

    return null;

  }


  try {

    const stream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });


    // IMPORTANT: keep the stream so we can attach
    // tracks to every peer connection in the call.
    localStream =
      stream;


    return stream;

  } catch (error) {

    localStream =
      null;

    localSystemMessage(
      "Microphone access was denied. Allow the mic to join the call."
    );

    return null;

  }

}


function enterCallUI() {

  inCall = true;

  callStartedAt = Date.now();

  callTimer.textContent = "0:00";

  callPeople.innerHTML = "";

  addCallRow(
    "me",
    `${currentUsername} (You)`,
    true,
    "Connecting…"
  );


  updateSelfStatus();

  callScreen.classList.remove("hidden");

  incomingCall.classList.add("hidden");

  callRoomLabel.textContent =
    `Room ${currentRoom}`;


  callTimerInterval =
    setInterval(
      () => {

        const seconds =
          Math.floor(
            (Date.now() - callStartedAt) / 1000
          );


        callTimer.textContent =
          formatDuration(seconds);

      },
      1000
    );

}


function exitCallUI() {

  if (callTimerInterval) {

    clearInterval(callTimerInterval);

    callTimerInterval = null;

  }


  callPeers.forEach(
    (peer) => {

      if (peer.pc) {

        try { peer.pc.close(); }
        catch (error) { /* noop */ }

      }


      if (peer.audio) {

        peer.audio.srcObject = null;

        peer.audio.remove();

      }

    }
  );


  callPeers.clear();

  callPeople.innerHTML = "";

  callScreen.classList.add("hidden");

  incomingCall.classList.add("hidden");

  inCall = false;


  if (localStream) {

    localStream.getTracks().forEach(
      (track) => track.stop()
    );

    localStream = null;

  }


  muteButton.classList.remove("muted");

}


function addCallRow(id, label, isSelf, statusText) {

  removeCallRow(id);


  const row =
    document.createElement("div");


  row.className =
    `call-person ${statusText === "Connected" ? "connected" : "connecting"}`;


  row.dataset.peerId =
    id;


  const dot =
    document.createElement("span");


  dot.className =
    "call-person-dot";


  const name =
    document.createElement("span");


  name.className =
    "call-person-name";


  name.textContent =
    label;


  const status =
    document.createElement("span");


  status.className =
    "call-person-status";


  status.textContent =
    statusText ||
    (isSelf ? "Active" : "Connecting…");


  row.appendChild(dot);
  row.appendChild(name);
  row.appendChild(status);


  callPeople.appendChild(row);


  return row;

}


function removeCallRow(id) {

  const existing =
    callPeople.querySelector(
      `[data-peer-id="${id}"]`
    );


  if (existing) {

    existing.remove();

  }

}


function ensurePeer(id, username) {

  let peer =
    callPeers.get(id);


  if (!peer) {

    const row =
      addCallRow(
        id,
        username || "Guest",
        false,
        "Connecting…"
      );


    const audio =
      document.createElement("audio");


    audio.autoplay = true;

    document
      .getElementById("call-audio-target")
      .appendChild(audio);


    peer = {
      username: username || "Guest",
      pc: null,
      audio,
      row,
      _pendingIce: []
    };


    callPeers.set(id, peer);

  }


  return peer;

}


function removePeer(id) {

  const peer =
    callPeers.get(id);


  if (!peer) return;


  if (peer.pc) {

    try { peer.pc.close(); }
    catch (error) { /* noop */ }

  }


  if (peer.audio) {

    peer.audio.srcObject = null;

    peer.audio.remove();

  }


  if (peer.row) {

    peer.row.remove();

  }


  callPeers.delete(id);

  updateSelfStatus();

}


function setPeerStatus(id, text, connected) {

  const peer =
    callPeers.get(id);


  if (!peer || !peer.row) return;


  peer.row.classList.toggle(
    "connected",
    Boolean(connected)
  );


  peer.row.classList.toggle(
    "connecting",
    !connected
  );


  const status =
    peer.row.querySelector(
      ".call-person-status"
    );


  if (status) {

    status.textContent =
      text;

  }

}


/*
  Updates my own row: "Connecting…" until at least
  one peer is connected, then "Connected".
*/

function updateSelfStatus() {

  if (!inCall) return;


  const anyConnected =
    [...callPeers.values()].some(
      (peer) =>
        peer.pc &&
        (
          peer.pc.connectionState === "connected" ||
          peer.pc.iceConnectionState === "connected" ||
          peer.pc.iceConnectionState === "completed"
        )
    );


  const selfRow =
    callPeople.querySelector(
      '[data-peer-id="me"]'
    );


  if (!selfRow) return;


  selfRow.classList.toggle(
    "connected",
    anyConnected
  );


  selfRow.classList.toggle(
    "connecting",
    !anyConnected
  );


  const status =
    selfRow.querySelector(
      ".call-person-status"
    );


  if (status) {

    status.textContent =
      anyConnected
        ? "Connected"
        : "Connecting…";

  }

}


/*
  Central handler for a peer's WebRTC connection state.
  Works with both connectionState (modern) and
  iceConnectionState (older browsers) as a fallback.
*/

function handlePeerConnectionState(peerId, pc) {

  const state =
    pc.connectionState ||
    pc.iceConnectionState;


  if (state === "connected" || state === "completed") {

    setPeerStatus(peerId, "Connected", true);

  } else if (state === "disconnected") {

    setPeerStatus(peerId, "Reconnecting…", false);

  } else if (state === "failed") {

    setPeerStatus(peerId, "Connection failed", false);

  } else if (state === "closed") {

    removePeer(peerId);

  }


  updateSelfStatus();

}


function createPC(peerId, username) {

  const peer =
    ensurePeer(peerId, username);


  if (peer.pc) {

    return peer.pc;

  }


  const pc =
    new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });


  peer.pc =
    pc;


  if (localStream) {

    localStream.getTracks().forEach(
      (track) => pc.addTrack(track, localStream)
    );

  }


  pc.onicecandidate =
    (event) => {

      if (event.candidate) {

        socket.emit(
          "call-ice",
          {
            target: peerId,
            candidate: event.candidate
          }
        );

      }

    };


  pc.ontrack =
    (event) => {

      if (event.streams && event.streams[0]) {

        peer.audio.srcObject =
          event.streams[0];

        peer.audio.play().catch(
          () => { /* autoplay blocked — resumed on tap */ }
        );

      }

    };


  pc.onconnectionstatechange =
    () => {

      handlePeerConnectionState(peerId, pc);

    };


  pc.oniceconnectionstatechange =
    () => {

      handlePeerConnectionState(peerId, pc);

    };


  return pc;

}


async function makeOffer(peerId, username) {

  try {

    const pc =
      createPC(peerId, username);


    const offer =
      await pc.createOffer();


    await pc.setLocalDescription(offer);


    socket.emit(
      "call-offer",
      {
        target: peerId,
        offer: pc.localDescription
      }
    );

  } catch (error) {

    console.warn("Call offer failed:", error);

  }

}


function flushPendingIce(peerId) {

  const peer =
    callPeers.get(peerId);


  if (!peer || !peer.pc) return;


  peer._pendingIce.forEach(
    (candidate) => {

      peer.pc.addIceCandidate(candidate).catch(
        () => { /* invalid candidate — ignore */ }
      );

    }
  );


  peer._pendingIce = [];

}


/* Incoming ring */

socket.on(
  "call-start",
  ({ by }) => {

    if (inCall) return;

    if (!by) return;

    incomingName.textContent =
      by;

    incomingRoom.textContent =
      currentRoom;

    incomingCall.classList.remove("hidden");

    if (navigator.vibrate) {

      navigator.vibrate([250, 120, 250]);

    }

  }
);


/* Existing participants send me the list of callers */

socket.on(
  "call-peers",
  (list) => {

    if (!inCall) return;


    (list || []).forEach(
      (person) => {

        ensurePeer(person.id, person.username);

      }
    );

  }
);


/* Someone joined the call — I am the existing participant */

socket.on(
  "call-peer-joined",
  ({ id, username }) => {

    if (!inCall) return;

    makeOffer(id, username);

  }
);


/* They sent me an offer — I answer */

socket.on(
  "call-offer",
  async ({ from, offer }) => {

    if (!inCall) return;

    try {

      const username =
        callPeers.has(from)
          ? callPeers.get(from).username
          : "Guest";


      const pc =
        createPC(from, username);


      await pc.setRemoteDescription(offer);

      flushPendingIce(from);


      const answer =
        await pc.createAnswer();


      await pc.setLocalDescription(answer);


      socket.emit(
        "call-answer",
        {
          target: from,
          answer: pc.localDescription
        }
      );

    } catch (error) {

      console.warn("Call answer failed:", error);

    }

  }
);


/* Answer to my offer */

socket.on(
  "call-answer",
  async ({ from, answer }) => {

    const peer =
      callPeers.get(from);


    if (!peer || !peer.pc) return;

    try {

      await peer.pc.setRemoteDescription(answer);

      flushPendingIce(from);

    } catch (error) {

      console.warn("Could not apply answer:", error);

    }

  }
);


/* ICE candidates between peers */

socket.on(
  "call-ice",
  ({ from, candidate }) => {

    const peer =
      callPeers.get(from);


    if (!peer) return;


    if (
      !peer.pc ||
      !peer.pc.remoteDescription
    ) {

      peer._pendingIce.push(candidate);

      return;

    }


    peer.pc.addIceCandidate(candidate).catch(
      () => { /* invalid candidate — ignore */ }
    );

  }
);


/* Someone left the call */

socket.on(
  "call-peer-left",
  ({ id }) => {

    removePeer(id);

  }
);


/* The call is over */

socket.on(
  "call-ended",
  () => {

    if (!inCall) return;

    localSystemMessage(
      "Call ended."
    );

    exitCallUI();

  }
);


/* Accept / Decline buttons */

acceptCall.addEventListener(
  "click",
  () => {

    acceptIncomingCall();

  }
);


declineCall.addEventListener(
  "click",
  () => {

    declineIncomingCall();

  }
);


function hideIncomingCall() {

  incomingCall.classList.add("hidden");

}


/* Mute toggle */

muteButton.addEventListener(
  "click",
  () => {

    if (!localStream) return;

    const track =
      localStream.getAudioTracks()[0];


    if (!track) return;


    track.enabled =
      !track.enabled;


    muteButton.classList.toggle(
      "muted",
      !track.enabled
    );

  }
);


/* Leave the call */

leaveCall.addEventListener(
  "click",
  () => {

    const wasInCall =
      inCall;


    socket.emit("call-leave");

    exitCallUI();


    if (wasInCall) {

      localSystemMessage(
        "You left the call."
      );

    }

  }
);


/*
  Safari/iOS sometimes blocks audio playing until the
  user taps the screen — resume playback on any tap.
*/

document.addEventListener(
  "pointerdown",
  () => {

    if (!inCall) return;


    callPeers.forEach(
      (peer) => {

        if (peer.audio && peer.audio.srcObject) {

          peer.audio.play().catch(
            () => { /* still blocked — keep trying */ }
          );

        }

      }
    );

  }
);


/* Connection lost while in call / ringing */

socket.on(
  "disconnect",
  () => {

    const ringing =
      !incomingCall.classList.contains("hidden");


    if (inCall || ringing) {

      localSystemMessage(
        "Connection lost. Call ended."
      );

      exitCallUI();

    }

  }
);


/* Tell the server when the tab closes mid-call */

window.addEventListener(
  "beforeunload",
  () => {

    if (inCall) {

      socket.emit("call-leave");

    }

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
