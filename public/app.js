const socket = io();

// Join Screen
const joinScreen = document.getElementById("join-screen");
const chatScreen = document.getElementById("chat-screen");
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");
const joinButton = document.getElementById("join-button");
const randomizeBtn = document.getElementById("randomize-btn");
const inviteBanner = document.getElementById("invite-banner");
const invitedRoomCode = document.getElementById("invited-room-code");

// Header
const roomName = document.getElementById("room-name");
const peopleButton = document.getElementById("people-button");
const peopleCount = document.getElementById("people-count");
const peoplePanel = document.getElementById("people-panel");
const closePeople = document.getElementById("close-people");
const peopleList = document.getElementById("people-list");
const panelShareBtn = document.getElementById("panel-share-btn");
const shareButton = document.getElementById("share-button");
const voiceCallButton = document.getElementById("voice-call-button");
const videoCallButton = document.getElementById("video-call-button");
const resetButton = document.getElementById("reset-button");

// Chat & Characters
const messages = document.getElementById("messages");
const characterArea = document.getElementById("character-area");

// Composer
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const micButton = document.getElementById("mic-button");
const photoButton = document.getElementById("photo-button");
const photoFileInput = document.getElementById("photo-file-input");

// Photo Preview
const photoPreviewBar = document.getElementById("photo-preview-bar");
const previewImg = document.getElementById("preview-img");
const removePhotoBtn = document.getElementById("remove-photo-btn");
const viewOnceToggle = document.getElementById("view-once-toggle");
const photoCaptionInput = document.getElementById("photo-caption-input");
const sendPhotoBtn = document.getElementById("send-photo-btn");

// Voice Recording
const recordBar = document.getElementById("record-bar");
const recordTimer = document.getElementById("record-timer");
const cancelRecord = document.getElementById("cancel-record");
const sendRecord = document.getElementById("send-record");

// Incoming Call
const incomingCall = document.getElementById("incoming-call");
const incomingName = document.getElementById("incoming-name");
const incomingRoom = document.getElementById("incoming-room");
const incomingCallTypeText = document.getElementById("incoming-call-type-text");
const incomingCallBadge = document.getElementById("incoming-call-badge");
const acceptCall = document.getElementById("accept-call");
const declineCall = document.getElementById("decline-call");

// Call Screen
const callScreen = document.getElementById("call-screen");
const callTypeIndicator = document.getElementById("call-type-indicator");
const callRoomLabel = document.getElementById("call-room-label");
const callTimer = document.getElementById("call-timer");
const callFullscreenBtn = document.getElementById("call-fullscreen-btn");
const videoGrid = document.getElementById("video-grid");
const muteButton = document.getElementById("mute-button");
const cameraButton = document.getElementById("camera-button");
const flipCameraButton = document.getElementById("flip-camera-button");
const leaveCall = document.getElementById("leave-call");

// View-Once Modal
const viewOnceModal = document.getElementById("view-once-modal");
const viewOnceImage = document.getElementById("view-once-image");
const viewOnceTimer = document.getElementById("view-once-timer");
const viewOnceCaption = document.getElementById("view-once-caption");
const closeViewOnceBtn = document.getElementById("close-view-once-btn");

// Share Modal
const shareModal = document.getElementById("share-modal");
const closeShareModal = document.getElementById("close-share-modal");
const shareRoomCodeDisplay = document.getElementById("share-room-code-display");
const shareLinkInput = document.getElementById("share-link-input");
const copyShareLinkBtn = document.getElementById("copy-share-link-btn");
const shareWhatsappBtn = document.getElementById("share-whatsapp-btn");
const shareTelegramBtn = document.getElementById("share-telegram-btn");
const shareNativeBtn = document.getElementById("share-native-btn");

const toastContainer = document.getElementById("toast-container");

let currentUsername = "";
let currentRoom = "";
let joinedChat = false;
let presenceHeartbeat = null;

let pendingPhotoDataUrl = null;
let isViewOnceMode = true;
const ephemeralPhotoStore = new Map();
let activeViewOnceId = null;
let viewOnceCountdownInterval = null;

let mediaRecorder = null;
let recordedChunks = [];
let recordTimerInterval = null;
let recordStartedAt = 0;
let recordSendOnStop = false;
let currentVoiceAudio = null;
let currentVoicePlayButton = null;

let inCall = false;
let currentCallType = "video";
let localStream = null;
let isMicMuted = false;
let isCameraOff = false;
let currentFacingMode = "user";
let callStartedAt = 0;
let callTimerInterval = null;
let incomingCallData = null;

const peerConnections = new Map();
const candidateQueues = new Map();

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
};

const ADJECTIVES = ["Swift", "Cosmic", "Neon", "Shadow", "Mystic", "Golden", "Cyber", "Silent", "Solar", "Lunar", "Frost", "Hyper", "Pixel", "Echo", "Electric", "Brave", "Quiet", "Nova", "Turbo"];
const NOUNS = ["Fox", "Falcon", "Wolf", "Hawk", "Otter", "Panda", "Tiger", "Lynx", "Viper", "Raven", "Eagle", "Cheetah", "Dolphin", "Phoenix", "Owl", "Cipher", "Badger", "Koala", "Ghost"];

function generateRandomUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${adj}${noun}${num}`;
}

randomizeBtn.addEventListener("click", () => {
  usernameInput.value = generateRandomUsername();
  usernameInput.focus();
});

// Auto-join on ?room=...
window.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  let roomFromUrl = urlParams.get("room") || urlParams.get("join");
  if (!roomFromUrl && window.location.hash) {
    roomFromUrl = window.location.hash.replace("#", "").trim();
  }
  if (roomFromUrl) {
    const cleanRoom = roomFromUrl.trim().toUpperCase().slice(0, 20);
    roomInput.value = cleanRoom;
    invitedRoomCode.textContent = cleanRoom;
    inviteBanner.classList.remove("hidden");
    const autoUsername = generateRandomUsername();
    usernameInput.value = autoUsername;
    setTimeout(() => {
      joinChat();
      showToast(`Joined Room ${cleanRoom} as ${autoUsername}!`, "success");
    }, 400);
  } else {
    usernameInput.value = generateRandomUsername();
  }
});

joinButton.addEventListener("click", joinChat);
usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") roomInput.focus(); });
roomInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinChat(); });

function joinChat() {
  const username = usernameInput.value.trim();
  const room = roomInput.value.trim().toUpperCase();
  if (!username || !room) {
    showToast("Please enter both a username and room code.");
    return;
  }
  currentUsername = username.slice(0, 20);
  currentRoom = room.slice(0, 20);

  socket.emit("join-room", { username: currentUsername, room: currentRoom });
  roomName.textContent = `#${currentRoom}`;
  joinScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  joinedChat = true;
  startPresenceHeartbeat();
  sendPresence("active");
  setTimeout(() => messageInput.focus(), 150);
}

// Text Message
messageForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  socket.emit("send-message", message.slice(0, 1500));
  messageInput.value = "";
  messageInput.focus();
});

socket.on("chat-message", (data) => appendChatMessage(data));

function appendChatMessage(data) {
  const isOwn = data.username === currentUsername;
  const el = document.createElement("div");
  el.className = `message ${isOwn ? "own-message" : "other-message"}`;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  const name = document.createElement("strong");
  name.textContent = isOwn ? "You" : data.username;
  const text = document.createElement("span");
  text.textContent = data.message;
  const time = document.createElement("small");
  time.textContent = data.time;
  bubble.appendChild(name);
  bubble.appendChild(text);
  bubble.appendChild(time);
  el.appendChild(bubble);
  messages.appendChild(el);
  scrollMessagesToBottom();
}

// Single-Time View-Once Photo
photoButton.addEventListener("click", () => photoFileInput.click());
photoFileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file || !file.type.startsWith("image/")) return;
  processAndPreviewPhoto(file);
});

function processAndPreviewPhoto(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      let width = img.width, height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else { width = Math.round((width * maxDim) / height); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      pendingPhotoDataUrl = canvas.toDataURL("image/jpeg", 0.82);
      previewImg.src = pendingPhotoDataUrl;
      photoPreviewBar.classList.remove("hidden");
      photoCaptionInput.focus();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

viewOnceToggle.addEventListener("click", () => {
  isViewOnceMode = !isViewOnceMode;
  viewOnceToggle.classList.toggle("active", isViewOnceMode);
  viewOnceToggle.querySelector(".view-once-text").innerHTML = `View Once: <strong>${isViewOnceMode ? "ON" : "OFF"}</strong>`;
});

removePhotoBtn.addEventListener("click", clearPhotoPreview);
function clearPhotoPreview() {
  pendingPhotoDataUrl = null;
  previewImg.src = "";
  photoCaptionInput.value = "";
  photoPreviewBar.classList.add("hidden");
  photoFileInput.value = "";
}

sendPhotoBtn.addEventListener("click", () => {
  if (!pendingPhotoDataUrl) return;
  const caption = photoCaptionInput.value.trim();
  const photoId = "photo_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  socket.emit("single-photo", { id: photoId, image: pendingPhotoDataUrl, caption, isViewOnce: isViewOnceMode });
  clearPhotoPreview();
});

socket.on("single-photo", (data) => {
  if (!data || !data.image) return;
  ephemeralPhotoStore.set(data.id, data);
  appendPhotoMessage(data);
});

socket.on("photo-opened", ({ photoId, openedBy, time }) => {
  const bubble = document.querySelector(`[data-photo-id="${photoId}"]`);
  if (bubble) {
    bubble.classList.add("opened");
    const hint = bubble.querySelector(".view-once-hint");
    if (hint) hint.textContent = `Opened by ${openedBy} at ${time}`;
  }
});

function appendPhotoMessage(data) {
  const isOwn = data.username === currentUsername;
  const el = document.createElement("div");
  el.className = `message ${isOwn ? "own-message" : "other-message"}`;
  const bubble = document.createElement("div");
  bubble.dataset.photoId = data.id;
  const name = document.createElement("strong");
  name.textContent = isOwn ? "You" : data.username;

  if (data.isViewOnce) {
    bubble.className = "message-bubble view-once-bubble";
    const card = document.createElement("div");
    card.className = "view-once-card";
    const iconWrap = document.createElement("div");
    iconWrap.className = "view-once-icon-wrap";
    iconWrap.textContent = "①";
    const details = document.createElement("div");
    details.className = "view-once-details";
    const title = document.createElement("span");
    title.className = "view-once-title";
    title.textContent = "View Once Photo";
    const hint = document.createElement("span");
    hint.className = "view-once-hint";
    hint.textContent = isOwn ? "Sent • View once" : "Tap to view • Self-destructs";
    details.appendChild(title);
    details.appendChild(hint);
    if (data.caption) {
      const cap = document.createElement("span");
      cap.className = "view-once-caption-text";
      cap.textContent = data.caption;
      details.appendChild(cap);
    }
    card.appendChild(iconWrap);
    card.appendChild(details);
    const time = document.createElement("small");
    time.textContent = data.time;
    bubble.appendChild(name);
    bubble.appendChild(card);
    bubble.appendChild(time);
    bubble.addEventListener("click", () => {
      if (bubble.classList.contains("opened")) return showToast("Photo expired.");
      openViewOnceModal(data.id);
    });
  } else {
    bubble.className = "message-bubble";
    const img = document.createElement("img");
    img.src = data.image;
    img.className = "chat-photo-img";
    img.addEventListener("click", () => openLightbox(data.image, data.caption));
    bubble.appendChild(name);
    bubble.appendChild(img);
    if (data.caption) {
      const cap = document.createElement("span");
      cap.textContent = data.caption;
      bubble.appendChild(cap);
    }
    const time = document.createElement("small");
    time.textContent = data.time;
    bubble.appendChild(time);
  }
  el.appendChild(bubble);
  messages.appendChild(el);
  scrollMessagesToBottom();
}

function openViewOnceModal(photoId) {
  const photo = ephemeralPhotoStore.get(photoId);
  if (!photo) return showToast("Photo no longer available.");
  activeViewOnceId = photoId;
  viewOnceImage.src = photo.image;
  if (photo.caption) { viewOnceCaption.textContent = photo.caption; viewOnceCaption.classList.remove("hidden"); }
  else { viewOnceCaption.classList.add("hidden"); }
  viewOnceModal.classList.remove("hidden");
  let timeLeft = 15;
  viewOnceTimer.textContent = `${timeLeft}s`;
  clearInterval(viewOnceCountdownInterval);
  viewOnceCountdownInterval = setInterval(() => {
    timeLeft--;
    viewOnceTimer.textContent = `${timeLeft}s`;
    if (timeLeft <= 0) closeAndViewOnceDestroy();
  }, 1000);
}

closeViewOnceBtn.addEventListener("click", closeAndViewOnceDestroy);
function closeAndViewOnceDestroy() {
  clearInterval(viewOnceCountdownInterval);
  viewOnceModal.classList.add("hidden");
  if (activeViewOnceId) {
    const id = activeViewOnceId;
    activeViewOnceId = null;
    viewOnceImage.src = "";
    ephemeralPhotoStore.delete(id);
    const bubble = document.querySelector(`[data-photo-id="${id}"]`);
    if (bubble) {
      bubble.classList.add("opened");
      const hint = bubble.querySelector(".view-once-hint");
      if (hint) hint.textContent = "Expired • Photo deleted";
    }
    socket.emit("photo-opened", { photoId: id });
    showToast("Photo self-destructed & purged from memory.");
  }
}

function openLightbox(imageUrl, caption) {
  viewOnceImage.src = imageUrl;
  viewOnceTimer.textContent = "Temporary";
  if (caption) { viewOnceCaption.textContent = caption; viewOnceCaption.classList.remove("hidden"); }
  else { viewOnceCaption.classList.add("hidden"); }
  viewOnceModal.classList.remove("hidden");
}

// Room Share
function getRoomShareUrl() {
  return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;
}
function openShareModal() {
  if (!joinedChat) return;
  shareRoomCodeDisplay.textContent = currentRoom;
  shareLinkInput.value = getRoomShareUrl();
  shareModal.classList.remove("hidden");
}

shareButton.addEventListener("click", () => {
  if (navigator.share) {
    navigator.share({ title: "TempChat", text: `Join room ${currentRoom} on TempChat!`, url: getRoomShareUrl() }).catch(() => openShareModal());
  } else { openShareModal(); }
});
roomName.addEventListener("click", openShareModal);
panelShareBtn.addEventListener("click", openShareModal);
closeShareModal.addEventListener("click", () => shareModal.classList.add("hidden"));

copyShareLinkBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(getRoomShareUrl()).then(() => {
    copyShareLinkBtn.textContent = "Copied! ✓";
    showToast("Invite link copied!", "success");
    setTimeout(() => copyShareLinkBtn.textContent = "Copy Link", 2000);
  });
});

shareWhatsappBtn.addEventListener("click", () => {
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`Join room ${currentRoom}: ${getRoomShareUrl()}`)}`, "_blank");
});
shareTelegramBtn.addEventListener("click", () => {
  window.open(`https://t.me/share/url?url=${encodeURIComponent(getRoomShareUrl())}&text=${encodeURIComponent(`Join room ${currentRoom}`)}`, "_blank");
});
shareNativeBtn.addEventListener("click", () => copyShareLinkBtn.click());

// Voice Notes (up to 60s)
const VOICE_PLAY_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const VOICE_PAUSE_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

socket.on("voice-message", (data) => { if (data && data.audio) appendVoiceMessage(data); });

function appendVoiceMessage(data) {
  const isOwn = data.username === currentUsername;
  const el = document.createElement("div");
  el.className = `message ${isOwn ? "own-message" : "other-message"}`;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble voice-bubble";
  const name = document.createElement("strong");
  name.textContent = isOwn ? "You" : data.username;
  const player = buildVoicePlayer(data);
  const time = document.createElement("small");
  time.textContent = data.time;
  bubble.appendChild(name);
  bubble.appendChild(player);
  bubble.appendChild(time);
  el.appendChild(bubble);
  messages.appendChild(el);
  scrollMessagesToBottom();
}

function buildVoicePlayer(data) {
  const blob = new Blob([data.audio], { type: data.mime || "audio/webm" });
  const audio = new Audio(URL.createObjectURL(blob));
  const player = document.createElement("div");
  player.className = "voice-player";
  const playBtn = document.createElement("button");
  playBtn.className = "voice-play";
  playBtn.innerHTML = VOICE_PLAY_SVG;
  const bar = document.createElement("div");
  bar.className = "voice-bar";
  const progress = document.createElement("div");
  progress.className = "voice-progress";
  bar.appendChild(progress);
  const duration = document.createElement("span");
  duration.className = "voice-duration";
  duration.textContent = "0:00";
  player.appendChild(playBtn);
  player.appendChild(bar);
  player.appendChild(duration);

  audio.addEventListener("loadedmetadata", () => { duration.textContent = formatDuration(audio.duration); });
  audio.addEventListener("timeupdate", () => { if (audio.duration) progress.style.width = `${(audio.currentTime / audio.duration) * 100}%`; });
  audio.addEventListener("ended", () => { playBtn.innerHTML = VOICE_PLAY_SVG; progress.style.width = "0%"; duration.textContent = formatDuration(audio.duration); });
  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      if (currentVoiceAudio && currentVoiceAudio !== audio) { currentVoiceAudio.pause(); if (currentVoicePlayButton) currentVoicePlayButton.innerHTML = VOICE_PLAY_SVG; }
      audio.play(); playBtn.innerHTML = VOICE_PAUSE_SVG; currentVoiceAudio = audio; currentVoicePlayButton = playBtn;
    } else { audio.pause(); playBtn.innerHTML = VOICE_PLAY_SVG; }
  });
  bar.addEventListener("click", (e) => {
    if (!audio.duration) return;
    const rect = bar.getBoundingClientRect();
    audio.currentTime = (Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)) * audio.duration;
  });
  return player;
}

async function startVoiceRecording() {
  if (mediaRecorder) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { return showToast("Microphone access denied."); }
  recordedChunks = []; recordSendOnStop = false;
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const mime = mediaRecorder.mimeType || "audio/webm";
    mediaRecorder = null; clearInterval(recordTimerInterval);
    stream.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
    if (recordSendOnStop && recordedChunks.length) {
      socket.emit("voice-message", { audio: new Blob(recordedChunks, { type: mime }), mime });
    }
  };
  mediaRecorder.start();
  recordStartedAt = Date.now();
  setIsRecording(true);
  recordTimerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - recordStartedAt) / 1000);
    recordTimer.textContent = `${formatDuration(sec)} / 1:00`;
    if (sec >= 60) stopVoiceRecording(true);
  }, 250);
}

function stopVoiceRecording(send) {
  if (!mediaRecorder) return;
  recordSendOnStop = Boolean(send);
  try { mediaRecorder.stop(); } catch (e) {}
}
function setIsRecording(r) { messageForm.classList.toggle("recording", r); recordBar.classList.toggle("hidden", !r); }
micButton.addEventListener("click", startVoiceRecording);
sendRecord.addEventListener("click", () => stopVoiceRecording(true));
cancelRecord.addEventListener("click", () => stopVoiceRecording(false));

// Video & Voice Call (WebRTC)
function queueCandidate(peerId, candidate) {
  if (!candidateQueues.has(peerId)) candidateQueues.set(peerId, []);
  candidateQueues.get(peerId).push(candidate);
}

async function drainCandidateQueue(peerId, pc) {
  const q = candidateQueues.get(peerId);
  if (q && q.length) {
    while (q.length > 0) {
      try { await pc.addIceCandidate(new RTCIceCandidate(q.shift())); } catch (e) {}
    }
  }
}

voiceCallButton.addEventListener("click", () => { if (!inCall) startCall("audio"); });
videoCallButton.addEventListener("click", () => { if (!inCall) startCall("video"); });

async function startCall(callType) {
  currentCallType = callType;
  const isVideo = callType === "video";
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { facingMode: currentFacingMode } : false,
    });
  } catch (err) {
    if (isVideo) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        currentCallType = "audio";
      } catch (e) { return showToast("Mic/Camera permission denied."); }
    } else { return showToast("Mic permission denied."); }
  }
  isMicMuted = false; isCameraOff = currentCallType === "audio";
  enterCallUI();
  socket.emit("call-start", { callType: currentCallType });
}

socket.on("call-start", ({ by, id, callType }) => {
  if (inCall) return;
  incomingCallData = { by, id, callType };
  incomingName.textContent = by;
  incomingRoom.textContent = currentRoom;
  incomingCallTypeText.textContent = callType === "video" ? "is video calling…" : "is voice calling…";
  incomingCallBadge.textContent = callType === "video" ? "VIDEO CALL" : "VOICE CALL";
  incomingCall.classList.remove("hidden");
});

acceptCall.addEventListener("click", async () => {
  if (!incomingCallData) return;
  incomingCall.classList.add("hidden");
  const callType = incomingCallData.callType || "video";
  currentCallType = callType;
  const isVideo = callType === "video";
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { facingMode: currentFacingMode } : false,
    });
  } catch (e) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    currentCallType = "audio";
  }
  isMicMuted = false; isCameraOff = currentCallType === "audio";
  enterCallUI();
  socket.emit("call-join", { callType: currentCallType, videoEnabled: !isCameraOff, audioEnabled: true });
});

declineCall.addEventListener("click", () => { incomingCall.classList.add("hidden"); incomingCallData = null; });

function enterCallUI() {
  inCall = true; callStartedAt = Date.now(); callTimer.textContent = "0:00"; videoGrid.innerHTML = "";
  callTypeIndicator.textContent = currentCallType === "video" ? "📹 VIDEO CALL" : "📞 VOICE CALL";
  callRoomLabel.textContent = `Room ${currentRoom}`;
  muteButton.classList.toggle("off", isMicMuted);
  cameraButton.classList.toggle("off", isCameraOff);
  createVideoTile("me", `${currentUsername} (You)`, localStream, true, !isCameraOff, !isMicMuted);
  callScreen.classList.remove("hidden");
  incomingCall.classList.add("hidden");
  updateVideoGridLayout();
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    callTimer.textContent = formatDuration(Math.floor((Date.now() - callStartedAt) / 1000));
  }, 1000);
}

function exitCallUI() {
  clearInterval(callTimerInterval);
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  peerConnections.forEach(({ pc }) => { if (pc) pc.close(); });
  peerConnections.clear(); candidateQueues.clear();
  videoGrid.innerHTML = ""; callScreen.classList.add("hidden"); incomingCall.classList.add("hidden");
  inCall = false; incomingCallData = null;
}

function createVideoTile(id, label, stream, isSelf, videoEnabled, audioEnabled) {
  removeVideoTile(id);
  const tile = document.createElement("div");
  tile.className = `video-tile ${isSelf ? "self-tile" : ""}`;
  tile.dataset.peerId = id;
  tile.style.setProperty("--tile-hue", getUsernameHue(label));

  const video = document.createElement("video");
  video.autoplay = true; video.playsInline = true;
  video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", "");
  video.muted = isSelf;
  if (stream) video.srcObject = stream;

  const avatar = document.createElement("div");
  avatar.className = `video-tile-avatar ${videoEnabled ? "hidden" : ""}`;
  const circle = document.createElement("div");
  circle.className = "avatar-circle";
  circle.textContent = label.slice(0, 2).toUpperCase();
  const hint = document.createElement("span");
  hint.className = "avatar-status-hint";
  hint.textContent = isSelf ? "Your camera is off" : "Camera off";
  avatar.appendChild(circle); avatar.appendChild(hint);

  const tag = document.createElement("div");
  tag.className = "video-tile-tag";
  const nameSpan = document.createElement("span");
  nameSpan.textContent = label;
  const micIcon = document.createElement("span");
  micIcon.className = `video-tag-icon ${!audioEnabled ? "muted" : ""}`;
  micIcon.textContent = audioEnabled ? "🎙️" : "🔇";
  tag.appendChild(nameSpan); tag.appendChild(micIcon);

  tile.appendChild(video); tile.appendChild(avatar); tile.appendChild(tag);
  videoGrid.appendChild(tile);
  updateVideoGridLayout();
  return { tile, video, avatar, tag, micIcon, nameSpan };
}

function removeVideoTile(id) {
  const existing = videoGrid.querySelector(`[data-peer-id="${id}"]`);
  if (existing) { existing.remove(); updateVideoGridLayout(); }
}

function updateVideoGridLayout() {
  const count = videoGrid.children.length;
  videoGrid.classList.toggle("single-peer", count <= 1);
  videoGrid.classList.toggle("two-peers", count === 2);
  videoGrid.classList.toggle("three-peers", count === 3);
  videoGrid.classList.toggle("four-peers", count >= 4);
}

socket.on("call-peers", (peers) => {
  if (!inCall) return;
  peers.forEach((p) => initiatePeerConnection(p.id, p.username, false, p.videoEnabled, p.audioEnabled));
});

socket.on("call-peer-joined", ({ id, username, videoEnabled, audioEnabled }) => {
  if (!inCall) return;
  initiatePeerConnection(id, username, true, videoEnabled, audioEnabled);
});

socket.on("call-signal", async ({ from, signal }) => {
  if (!inCall) return;
  let peerObj = peerConnections.get(from) || initiatePeerConnection(from, "Guest", false, true, true);
  const { pc, video, avatar } = peerObj;
  try {
    if (signal.type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
      await drainCandidateQueue(from, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call-signal", { to: from, signal: pc.localDescription });
    } else if (signal.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
      await drainCandidateQueue(from, pc);
    } else if (signal.type === "candidate" || signal.candidate) {
      const c = signal.candidate || signal;
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      } else {
        queueCandidate(from, c);
      }
    }
  } catch (err) {}
});

socket.on("call-peer-media-state", ({ id, video, audio }) => {
  const peerObj = peerConnections.get(id);
  if (!peerObj) return;
  if (typeof video === "boolean") peerObj.avatar.classList.toggle("hidden", video);
  if (typeof audio === "boolean") {
    peerObj.micIcon.className = `video-tag-icon ${!audio ? "muted" : ""}`;
    peerObj.micIcon.textContent = audio ? "🎙️" : "🔇";
  }
});

socket.on("call-peer-left", ({ id }) => {
  const peerObj = peerConnections.get(id);
  if (peerObj && peerObj.pc) peerObj.pc.close();
  peerConnections.delete(id); candidateQueues.delete(id);
  removeVideoTile(id);
});

socket.on("call-ended", () => { if (inCall) { localSystemMessage("Call ended."); exitCallUI(); } });

function initiatePeerConnection(peerId, username, isInitiator, videoEnabled, audioEnabled) {
  if (peerConnections.has(peerId)) return peerConnections.get(peerId);
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const { tile, video, avatar, tag, micIcon, nameSpan } = createVideoTile(peerId, username, null, false, videoEnabled, audioEnabled);

  if (localStream) localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) { video.srcObject = event.streams[0]; }
    else {
      let stream = video.srcObject || new MediaStream();
      video.srcObject = stream; stream.addTrack(event.track);
    }
    avatar.classList.add("hidden");
    video.play().catch(() => {});
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("call-signal", { to: peerId, signal: { type: "candidate", candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate } });
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") avatar.classList.add("hidden");
  };

  const peerObj = { pc, tile, video, avatar, tag, micIcon, nameSpan, username };
  peerConnections.set(peerId, peerObj);

  if (isInitiator) {
    pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => socket.emit("call-signal", { to: peerId, signal: pc.localDescription }))
      .catch(() => {});
  }
  return peerObj;
}

muteButton.addEventListener("click", () => {
  if (!localStream) return;
  isMicMuted = !isMicMuted;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) audioTrack.enabled = !isMicMuted;
  muteButton.classList.toggle("off", isMicMuted);
  const selfTile = videoGrid.querySelector('[data-peer-id="me"]');
  if (selfTile) {
    const icon = selfTile.querySelector(".video-tag-icon");
    if (icon) { icon.className = `video-tag-icon ${isMicMuted ? "muted" : ""}`; icon.textContent = !isMicMuted ? "🎙️" : "🔇"; }
  }
  socket.emit("call-media-state", { audio: !isMicMuted, video: !isCameraOff });
  showToast(isMicMuted ? "Microphone muted" : "Microphone active");
});

cameraButton.addEventListener("click", async () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) {
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode } });
      const newTrack = camStream.getVideoTracks()[0];
      localStream.addTrack(newTrack);
      peerConnections.forEach(({ pc }) => pc.addTrack(newTrack, localStream));
      isCameraOff = false;
    } catch (e) { return showToast("Cannot access camera."); }
  } else {
    isCameraOff = !isCameraOff;
    videoTrack.enabled = !isCameraOff;
  }
  cameraButton.classList.toggle("off", isCameraOff);
  const selfTile = videoGrid.querySelector('[data-peer-id="me"]');
  if (selfTile) {
    const avatar = selfTile.querySelector(".video-tile-avatar");
    if (avatar) avatar.classList.toggle("hidden", !isCameraOff);
  }
  socket.emit("call-media-state", { video: !isCameraOff, audio: !isMicMuted });
});

flipCameraButton.addEventListener("click", async () => {
  if (!localStream || isCameraOff) return;
  currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
  const oldTrack = localStream.getVideoTracks()[0];
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode } });
    const newTrack = newStream.getVideoTracks()[0];
    if (oldTrack) { localStream.removeTrack(oldTrack); oldTrack.stop(); }
    localStream.addTrack(newTrack);
    peerConnections.forEach(({ pc }) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(newTrack);
    });
    const selfVideo = videoGrid.querySelector('[data-peer-id="me"] video');
    if (selfVideo) selfVideo.srcObject = localStream;
    showToast(`Switched camera`);
  } catch (err) { showToast("Could not flip camera."); }
});

callFullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) callScreen.requestFullscreen().catch(() => {});
  else document.exitFullscreen().catch(() => {});
});

leaveCall.addEventListener("click", () => { socket.emit("call-leave"); exitCallUI(); localSystemMessage("You left the call."); });

socket.on("system-message", (d) => localSystemMessage(d.text));
function localSystemMessage(text) {
  const el = document.createElement("div"); el.className = "system-message"; el.textContent = text;
  messages.appendChild(el); scrollMessagesToBottom();
}
socket.on("clear-chat", () => { messages.innerHTML = ""; showToast("Chat was reset."); });
resetButton.addEventListener("click", () => { if (confirm("Clear chat for everyone in room?")) socket.emit("reset-chat"); });

// Presence & Characters
socket.on("presence-update", (people) => { updatePeopleUI(people); updateCharacters(people); });
function sendPresence(status) { if (joinedChat) socket.emit("presence-update", status); }
document.addEventListener("visibilitychange", () => { if (joinedChat) sendPresence(document.visibilityState === "visible" ? "active" : "away"); });
window.addEventListener("focus", () => { if (joinedChat) sendPresence("active"); });
window.addEventListener("blur", () => { if (joinedChat) sendPresence("away"); });

function startPresenceHeartbeat() {
  if (presenceHeartbeat) clearInterval(presenceHeartbeat);
  presenceHeartbeat = setInterval(() => {
    if (joinedChat && document.visibilityState === "visible") socket.emit("presence-heartbeat");
  }, 5000);
}

function updatePeopleUI(people) {
  peopleCount.textContent = people.length;
  peopleList.innerHTML = "";
  people.forEach((p) => {
    const row = document.createElement("div"); row.className = "person-row";
    const left = document.createElement("div"); left.className = "person-left";
    const dot = document.createElement("span"); dot.className = `status-dot ${p.status}`;
    const name = document.createElement("span"); name.textContent = p.username === currentUsername ? `${p.username} (You)` : p.username;
    left.appendChild(dot); left.appendChild(name);
    const status = document.createElement("span"); status.className = `person-status ${p.status}`;
    status.textContent = p.status === "active" ? "Active" : "Away";
    row.appendChild(left); row.appendChild(status);
    peopleList.appendChild(row);
  });
}
peopleButton.addEventListener("click", () => peoplePanel.classList.toggle("hidden"));
closePeople.addEventListener("click", () => peoplePanel.classList.add("hidden"));

function updateCharacters(people) {
  characterArea.innerHTML = "";
  const active = people.filter((p) => p.status === "active");
  active.forEach((p, idx) => characterArea.appendChild(createCharacter(p, idx, active.length)));
}

function createCharacter(person, index, total) {
  const wrapper = document.createElement("div");
  wrapper.className = "character-wrapper"; wrapper.dataset.username = person.username;
  const position = total === 1 ? 50 : 20 + (index / (total - 1)) * 60;
  wrapper.style.left = `${position}%`;
  wrapper.style.setProperty("--character-hue", getUsernameHue(person.username));
  const character = document.createElement("div"); character.className = "character";
  const head = document.createElement("div"); head.className = "character-head";
  const face = document.createElement("div"); face.className = "character-face";
  face.innerHTML = "<span></span><span></span>"; head.appendChild(face);
  const body = document.createElement("div"); body.className = "character-body";
  character.appendChild(head); character.appendChild(body);
  const name = document.createElement("div"); name.className = "character-name"; name.textContent = person.username;
  wrapper.appendChild(character); wrapper.appendChild(name);
  return wrapper;
}

function getUsernameHue(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

function scrollMessagesToBottom() { requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; }); }
function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "success" ? "toast-success" : ""}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0"; toast.style.transform = "translateY(-10px)"; toast.style.transition = "all 0.25s ease";
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

window.addEventListener("beforeunload", () => { if (inCall) socket.emit("call-leave"); });
socket.on("disconnect", () => { if (inCall) { localSystemMessage("Connection lost. Call ended."); exitCallUI(); } });
