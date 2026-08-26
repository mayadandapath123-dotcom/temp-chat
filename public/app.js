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

/* Server-relayed call audio (no WebRTC/TURN needed) */
let audioCtx = null;
let micSource = null;
let scriptNode = null;
let mutedFlag = false;
let micSentFirst = false;


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
   (audio relayed through the server — no WebRTC/TURN)
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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });


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


/*
  Sets up mic capture + playback.
  Mic: raw PCM chunks are sent to the server, which relays them
  to the other people in the call. Playback: incoming chunks are
  scheduled in sequence with a small pre-roll (jitter buffer).
*/

function startAudioGraph() {

  if (!localStream) return;


  try {

    audioCtx =
      new AudioContext();

  } catch (error) {

    audioCtx =
      null;

    return;

  }


  micSource =
    audioCtx.createMediaStreamSource(localStream);


  scriptNode =
    audioCtx.createScriptProcessor(2048, 1, 1);


  scriptNode.onaudioprocess =
    (event) => {

      const input =
        event.inputBuffer.getChannelData(0);


      if (!inCall || mutedFlag) return;


      // Float32 -> Int16 PCM
      const pcm =
        new Int16Array(input.length);


      for (let i = 0; i < input.length; i++) {

        const s =
          Math.max(-1, Math.min(1, input[i]));


        pcm[i] =
          s < 0
            ? s * 32768
            : s * 32767;

      }


      if (!micSentFirst) {

        micSentFirst =
          true;

        markSelfConnected();

      }


      socket.emit(
        "audio-chunk",
        pcm.buffer
      );

    };


  micSource.connect(scriptNode);
  scriptNode.connect(audioCtx.destination);


  if (audioCtx.state === "suspended") {

    audioCtx.resume().catch(
      () => { /* resumed on tap */ }
    );

  }

}


function stopAudioGraph() {

  if (scriptNode) {

    try { scriptNode.disconnect(); }
    catch (error) { /* noop */ }

    scriptNode = null;

  }


  if (micSource) {

    try { micSource.disconnect(); }
    catch (error) { /* noop */ }

    micSource = null;

  }


  if (audioCtx) {

    audioCtx.close().catch(
      () => { /* already closed */ }
    );

    audioCtx =
      null;

  }

}


function enterCallUI() {

  inCall = true;

  mutedFlag = false;

  micSentFirst = false;

  callStartedAt = Date.now();

  callTimer.textContent = "0:00";

  callPeople.innerHTML = "";

  addCallRow(
    "me",
    `${currentUsername} (You)`,
    true,
    "Connecting…"
  );

  callScreen.classList.remove("hidden");

  incomingCall.classList.add("hidden");

  callRoomLabel.textContent =
    `Room ${currentRoom}`;


  startAudioGraph();


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


  stopAudioGraph();


  callPeers.clear();

  callPeople.innerHTML = "";

  callScreen.classList.add("hidden");

  incomingCall.classList.add("hidden");

  inCall = false;

  mutedFlag = false;

  micSentFirst = false;


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


    peer = {
      username: username || "Guest",
      row,
      nextTime: 0
    };


    callPeers.set(id, peer);

  } else if (username && username !== peer.username) {

    peer.username =
      username;

    const nameEl =
      peer.row.querySelector(
        ".call-person-name"
      );


    if (nameEl) {

      nameEl.textContent =
        username;

    }

  }


  return peer;

}


function removePeer(id) {

  const peer =
    callPeers.get(id);


  if (!peer) return;


  if (peer.row) {

    peer.row.remove();

  }


  callPeers.delete(id);

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


function markSelfConnected() {

  const selfRow =
    callPeople.querySelector(
      '[data-peer-id="me"]'
    );


  if (!selfRow) return;


  selfRow.classList.add("connected");

  selfRow.classList.remove("connecting");


  const status =
    selfRow.querySelector(
      ".call-person-status"
    );


  if (status) {

    status.textContent =
      "Connected";

  }

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


/* Someone joined the call */

socket.on(
  "call-peer-joined",
  ({ id, username }) => {

    if (!inCall) return;

    ensurePeer(id, username);

  }
);


/* Incoming audio chunks from the server relay */

socket.on(
  "audio-chunk",
  ({ id, audio }) => {

    if (!inCall) return;

    if (!audioCtx) return;

    const peer =
      ensurePeer(id);


    const i16 =
      new Int16Array(audio);


    const samples =
      new Float32Array(i16.length);


    for (let i = 0; i < i16.length; i++) {

      samples[i] =
        i16[i] / 32768;

    }


    const buffer =
      audioCtx.createBuffer(
        1,
        samples.length,
        audioCtx.sampleRate
      );


    buffer.copyToChannel(samples, 0);


    /*
      Small pre-roll so bursts of chunks play smoothly
      instead of stuttering.
    */

    if (
      !peer.nextTime ||
      peer.nextTime < audioCtx.currentTime + 0.05
    ) {

      peer.nextTime =
        audioCtx.currentTime + 0.18;

    }


    const source =
      audioCtx.createBufferSource();


    source.buffer =
      buffer;


    source.connect(audioCtx.destination);


    source.start(peer.nextTime);


    peer.nextTime +=
      buffer.duration;


    setPeerStatus(id, "Connected", true);

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

    mutedFlag =
      !mutedFlag;


    const track =
      localStream.getAudioTracks()[0];


    if (track) {

      track.enabled =
        !mutedFlag;

    }


    muteButton.classList.toggle(
      "muted",
      mutedFlag
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

      /* If the other side is alone now, the server
         will tell them the call ended. */

    }

  }
);


/*
  Some browsers (iOS) freeze playback until a tap —
  resume the audio context on any tap.
*/

document.addEventListener(
  "pointerdown",
  () => {

    if (audioCtx && audioCtx.state === "suspended") {

      audioCtx.resume().catch(
        () => { /* still blocked — keep trying */ }
      );

    }

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
