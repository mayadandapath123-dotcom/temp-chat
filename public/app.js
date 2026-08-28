const socket = io({
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

// Join Screen Elements
const joinScreen = document.getElementById("join-screen");
const chatScreen = document.getElementById("chat-screen");
const joinForm = document.getElementById("join-form");
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");
const joinButton = document.getElementById("join-button");
const randomizeBtn = document.getElementById("randomize-btn");
const inviteBanner = document.getElementById("invite-banner");
const invitedRoomCode = document.getElementById("invited-room-code");

// Header Elements
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

// Chat & Character Elements
const messages = document.getElementById("messages");
const characterArea = document.getElementById("character-area");

// Composer Elements
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const micButton = document.getElementById("mic-button");
const photoButton = document.getElementById("photo-button");
const photoFileInput = document.getElementById("photo-file-input");

// Photo Preview Elements
const photoPreviewBar = document.getElementById("photo-preview-bar");
const previewImg = document.getElementById("preview-img");
const removePhotoBtn = document.getElementById("remove-photo-btn");
const viewOnceToggle = document.getElementById("view-once-toggle");
const photoCaptionInput = document.getElementById("photo-caption-input");
const sendPhotoBtn = document.getElementById("send-photo-btn");

// Voice Recording Elements
const recordBar = document.getElementById("record-bar");
const recordTimer = document.getElementById("record-timer");
const cancelRecord = document.getElementById("cancel-record");
const sendRecord = document.getElementById("send-record");

// Incoming Call Overlay Elements
const incomingCall = document.getElementById("incoming-call");
const incomingName = document.getElementById("incoming-name");
const incomingRoom = document.getElementById("incoming-room");
const incomingCallTypeText = document.getElementById("incoming-call-type-text");
const incomingCallBadge = document.getElementById("incoming-call-badge");
const acceptCall = document.getElementById("accept-call");
const declineCall = document.getElementById("decline-call");

// Call Screen Elements
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

// View-Once Modal Elements
const viewOnceModal = document.getElementById("view-once-modal");
const viewOnceImage = document.getElementById("view-once-image");
const viewOnceTimer = document.getElementById("view-once-timer");
const viewOnceCaption = document.getElementById("view-once-caption");
const closeViewOnceBtn = document.getElementById("close-view-once-btn");

// Share Modal Elements
const shareModal = document.getElementById("share-modal");
const closeShareModal = document.getElementById("close-share-modal");
const shareRoomCodeDisplay = document.getElementById("share-room-code-display");
const shareLinkInput = document.getElementById("share-link-input");
const copyShareLinkBtn = document.getElementById("copy-share-link-btn");
const shareWhatsappBtn = document.getElementById("share-whatsapp-btn");
const shareTelegramBtn = document.getElementById("share-telegram-btn");
const shareNativeBtn = document.getElementById("share-native-btn");

const toastContainer = document.getElementById("toast-container");

/* =========================================
   APPLICATION STATE
========================================= */

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
let localMediaPromise = null;
let isMicMuted = false;
let isCameraOff = false;
let currentFacingMode = "user";
let callStartedAt = 0;
let callTimerInterval = null;
let incomingCallData = null;

// WebRTC Connections Map: peerId -> { pc, tile, video, avatar, remoteStream, username }
const peerConnections = new Map();
const candidateQueues = new Map();

// Multi-Tier STUN & Free OpenRelay TURN Servers for Cross-Network WebRTC
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:openrelay.metered.ca:80" },
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

/* =========================================
   RANDOM USERNAME GENERATOR (Classy)
========================================= */

const ADJECTIVES = [
  "Titan", "Amber", "Velvet", "Onyx", "Sterling", "Solar", "Aero",
  "Nordic", "Zenith", "Cobalt", "Silver", "Vivid", "Apex", "Noble",
  "Astral", "Sleek", "Eclipse", "Lumen", "Prime", "Quantum", "Shadow"
];

const NOUNS = [
  "Fox", "Falcon", "Wolf", "Hawk", "Otter", "Panda", "Tiger",
  "Lynx", "Viper", "Raven", "Eagle", "Cheetah", "Dolphin", "Phoenix",
  "Cipher", "Orion", "Atlas", "Vega", "Specter", "Puma", "Ghost"
];

function generateRandomUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${adj}${noun}${num}`;
}

if (randomizeBtn) {
  randomizeBtn.addEventListener("click", () => {
    if (usernameInput) {
      usernameInput.value = generateRandomUsername();
      usernameInput.focus();
    }
  });
}

/* =========================================
   INITIALIZATION & AUTO-JOIN LOGIC
========================================= */

function initApp() {
  const urlParams = new URLSearchParams(window.location.search);
  let roomFromUrl = urlParams.get("room") || urlParams.get("join");

  if (!roomFromUrl && window.location.hash) {
    roomFromUrl = window.location.hash.replace("#", "").trim();
  }

  if (roomFromUrl) {
    const cleanRoom = roomFromUrl.trim().toUpperCase().slice(0, 20);
    if (roomInput) roomInput.value = cleanRoom;
    if (invitedRoomCode) invitedRoomCode.textContent = cleanRoom;
    if (inviteBanner) inviteBanner.classList.remove("hidden");

    const autoUsername = generateRandomUsername();
    if (usernameInput) usernameInput.value = autoUsername;

    setTimeout(() => {
      joinChat();
      showToast(`Joined Room #${cleanRoom} as ${autoUsername}`, "success");
    }, 350);
  } else {
    if (usernameInput && !usernameInput.value) {
      usernameInput.value = generateRandomUsername();
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

/* =========================================
   JOIN ROOM
========================================= */

if (joinForm) {
  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    joinChat();
  });
}

if (joinButton) {
  joinButton.addEventListener("click", (e) => {
    e.preventDefault();
    joinChat();
  });
}

function joinChat() {
  const rawUsername = usernameInput ? usernameInput.value.trim() : "";
  const rawRoom = roomInput ? roomInput.value.trim().toUpperCase() : "";

  let finalUsername = rawUsername;
  if (!finalUsername) {
    finalUsername = generateRandomUsername();
    if (usernameInput) usernameInput.value = finalUsername;
  }

  if (!rawRoom) {
    if (roomInput) {
      roomInput.focus();
      roomInput.style.borderColor = "var(--danger)";
      setTimeout(() => { roomInput.style.borderColor = ""; }, 2000);
    }
    showToast("Please enter a room code (e.g. BLUE123)");
    return;
  }

  currentUsername = finalUsername.slice(0, 20);
  currentRoom = rawRoom.slice(0, 20);

  socket.emit("join-room", {
    username: currentUsername,
    room: currentRoom,
  });

  if (roomName) roomName.textContent = `#${currentRoom}`;
  if (joinScreen) joinScreen.classList.add("hidden");
  if (chatScreen) chatScreen.classList.remove("hidden");

  joinedChat = true;
  startPresenceHeartbeat();
  sendPresence("active");

  setTimeout(() => {
    if (messageInput) messageInput.focus();
  }, 150);
}

/* =========================================
   SEND TEXT MESSAGE
========================================= */

if (messageForm) {
  messageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = messageInput ? messageInput.value.trim() : "";
    if (!message) return;

    socket.emit("send-message", message.slice(0, 1500));
    if (messageInput) {
      messageInput.value = "";
      messageInput.focus();
    }
  });
}

socket.on("chat-message", (data) => appendChatMessage(data));

function appendChatMessage(data) {
  if (!messages) return;
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

/* =========================================
   SINGLE-TIME VIEW-ONCE PHOTO
========================================= */

if (photoButton && photoFileInput) {
  photoButton.addEventListener("click", () => photoFileInput.click());
  photoFileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    processAndPreviewPhoto(file);
  });
}

document.addEventListener("paste", (e) => {
  if (!joinedChat) return;
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (const item of items) {
    if (item.type.indexOf("image") === 0) {
      const file = item.getAsFile();
      if (file) {
        processAndPreviewPhoto(file);
        break;
      }
    }
  }
});

function processAndPreviewPhoto(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      let width = img.width, height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);

      pendingPhotoDataUrl = canvas.toDataURL("image/jpeg", 0.82);

      if (previewImg) previewImg.src = pendingPhotoDataUrl;
      if (photoPreviewBar) photoPreviewBar.classList.remove("hidden");
      if (photoCaptionInput) photoCaptionInput.focus();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

if (viewOnceToggle) {
  viewOnceToggle.addEventListener("click", () => {
    isViewOnceMode = !isViewOnceMode;
    viewOnceToggle.classList.toggle("active", isViewOnceMode);
    const textSpan = viewOnceToggle.querySelector(".view-once-text");
    if (textSpan) {
      textSpan.innerHTML = `View Once: <strong>${isViewOnceMode ? "ON" : "OFF"}</strong>`;
    }
  });
}

if (removePhotoBtn) {
  removePhotoBtn.addEventListener("click", clearPhotoPreview);
}

function clearPhotoPreview() {
  pendingPhotoDataUrl = null;
  if (previewImg) previewImg.src = "";
  if (photoCaptionInput) photoCaptionInput.value = "";
  if (photoPreviewBar) photoPreviewBar.classList.add("hidden");
  if (photoFileInput) photoFileInput.value = "";
}

if (sendPhotoBtn) {
  sendPhotoBtn.addEventListener("click", () => {
    if (!pendingPhotoDataUrl) return;
    const caption = photoCaptionInput ? photoCaptionInput.value.trim() : "";
    const photoId = "photo_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

    socket.emit("single-photo", {
      id: photoId,
      image: pendingPhotoDataUrl,
      caption,
      isViewOnce: isViewOnceMode,
    });

    clearPhotoPreview();
  });
}

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
  if (!messages) return;
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
      if (bubble.classList.contains("opened")) return showToast("Photo has expired.");
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
  if (!photo) return showToast("Photo is no longer available.");
  activeViewOnceId = photoId;
  if (viewOnceImage) viewOnceImage.src = photo.image;

  if (photo.caption) {
    if (viewOnceCaption) {
      viewOnceCaption.textContent = photo.caption;
      viewOnceCaption.classList.remove("hidden");
    }
  } else {
    if (viewOnceCaption) viewOnceCaption.classList.add("hidden");
  }

  if (viewOnceModal) viewOnceModal.classList.remove("hidden");

  let timeLeft = 15;
  if (viewOnceTimer) viewOnceTimer.textContent = `${timeLeft}s`;

  clearInterval(viewOnceCountdownInterval);
  viewOnceCountdownInterval = setInterval(() => {
    timeLeft--;
    if (viewOnceTimer) viewOnceTimer.textContent = `${timeLeft}s`;
    if (timeLeft <= 0) closeAndViewOnceDestroy();
  }, 1000);
}

if (closeViewOnceBtn) {
  closeViewOnceBtn.addEventListener("click", closeAndViewOnceDestroy);
}

function closeAndViewOnceDestroy() {
  clearInterval(viewOnceCountdownInterval);
  if (viewOnceModal) viewOnceModal.classList.add("hidden");

  if (activeViewOnceId) {
    const id = activeViewOnceId;
    activeViewOnceId = null;
    if (viewOnceImage) viewOnceImage.src = "";
    ephemeralPhotoStore.delete(id);

    const bubble = document.querySelector(`[data-photo-id="${id}"]`);
    if (bubble) {
      bubble.classList.add("opened");
      const hint = bubble.querySelector(".view-once-hint");
      if (hint) hint.textContent = "Expired • Purged from memory";
    }

    socket.emit("photo-opened", { photoId: id });
    showToast("Photo self-destructed.");
  }
}

function openLightbox(imageUrl, caption) {
  if (viewOnceImage) viewOnceImage.src = imageUrl;
  if (viewOnceTimer) viewOnceTimer.textContent = "Temporary";
  if (caption) {
    if (viewOnceCaption) {
      viewOnceCaption.textContent = caption;
      viewOnceCaption.classList.remove("hidden");
    }
  } else {
    if (viewOnceCaption) viewOnceCaption.classList.add("hidden");
  }
  if (viewOnceModal) viewOnceModal.classList.remove("hidden");
}

/* =========================================
   ROOM SHARE FEATURE
========================================= */

function getRoomShareUrl() {
  return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;
}

function openShareModal() {
  if (!joinedChat) return;
  if (shareRoomCodeDisplay) shareRoomCodeDisplay.textContent = currentRoom;
  if (shareLinkInput) shareLinkInput.value = getRoomShareUrl();
  if (shareModal) shareModal.classList.remove("hidden");
}

if (shareButton) {
  shareButton.addEventListener("click", () => {
    if (navigator.share) {
      navigator.share({
        title: "TempChat",
        text: `Join room #${currentRoom} on TempChat:`,
        url: getRoomShareUrl(),
      }).catch(() => openShareModal());
    } else {
      openShareModal();
    }
  });
}

if (roomName) roomName.addEventListener("click", openShareModal);
if (panelShareBtn) panelShareBtn.addEventListener("click", openShareModal);
if (closeShareModal) closeShareModal.addEventListener("click", () => shareModal.classList.add("hidden"));

if (copyShareLinkBtn) {
  copyShareLinkBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(getRoomShareUrl()).then(() => {
      copyShareLinkBtn.textContent = "Copied! ✓";
      showToast("Invite link copied to clipboard", "success");
      setTimeout(() => copyShareLinkBtn.textContent = "Copy Link", 2000);
    }).catch(() => {
      if (shareLinkInput) {
        shareLinkInput.select();
        document.execCommand("copy");
      }
      showToast("Invite link copied");
    });
  });
}

if (shareWhatsappBtn) {
  shareWhatsappBtn.addEventListener("click", () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`Join my TempChat room #${currentRoom}: ${getRoomShareUrl()}`)}`, "_blank");
  });
}

if (shareTelegramBtn) {
  shareTelegramBtn.addEventListener("click", () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(getRoomShareUrl())}&text=${encodeURIComponent(`Join my TempChat room #${currentRoom}`)}`, "_blank");
  });
}

if (shareNativeBtn) {
  shareNativeBtn.addEventListener("click", () => {
    if (navigator.share) {
      navigator.share({
        title: "TempChat",
        text: `Join room #${currentRoom} on TempChat:`,
        url: getRoomShareUrl(),
      }).catch(() => {});
    } else if (copyShareLinkBtn) {
      copyShareLinkBtn.click();
    }
  });
}

/* =========================================
   VOICE NOTES
========================================= */

const VOICE_PLAY_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const VOICE_PAUSE_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

socket.on("voice-message", (data) => {
  if (data && data.audio) appendVoiceMessage(data);
});

function appendVoiceMessage(data) {
  if (!messages) return;
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

  audio.addEventListener("loadedmetadata", () => {
    duration.textContent = formatDuration(audio.duration);
  });
  audio.addEventListener("timeupdate", () => {
    if (audio.duration) {
      progress.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    }
  });
  audio.addEventListener("ended", () => {
    playBtn.innerHTML = VOICE_PLAY_SVG;
    progress.style.width = "0%";
    duration.textContent = formatDuration(audio.duration);
  });
  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      if (currentVoiceAudio && currentVoiceAudio !== audio) {
        currentVoiceAudio.pause();
        if (currentVoicePlayButton) currentVoicePlayButton.innerHTML = VOICE_PLAY_SVG;
      }
      audio.play();
      playBtn.innerHTML = VOICE_PAUSE_SVG;
      currentVoiceAudio = audio;
      currentVoicePlayButton = playBtn;
    } else {
      audio.pause();
      playBtn.innerHTML = VOICE_PLAY_SVG;
    }
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
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    return showToast("Microphone access was denied.");
  }

  recordedChunks = [];
  recordSendOnStop = false;
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const mime = mediaRecorder.mimeType || "audio/webm";
    mediaRecorder = null;
    clearInterval(recordTimerInterval);
    stream.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
    if (recordSendOnStop && recordedChunks.length) {
      socket.emit("voice-message", {
        audio: new Blob(recordedChunks, { type: mime }),
        mime,
      });
    }
  };

  mediaRecorder.start();
  recordStartedAt = Date.now();
  setIsRecording(true);
  recordTimerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - recordStartedAt) / 1000);
    if (recordTimer) recordTimer.textContent = `${formatDuration(sec)} / 1:00`;
    if (sec >= 60) stopVoiceRecording(true);
  }, 250);
}

function stopVoiceRecording(send) {
  if (!mediaRecorder) return;
  recordSendOnStop = Boolean(send);
  try { mediaRecorder.stop(); } catch (e) {}
}

function setIsRecording(r) {
  if (messageForm) messageForm.classList.toggle("recording", r);
  if (recordBar) recordBar.classList.toggle("hidden", !r);
}

if (micButton) micButton.addEventListener("click", startVoiceRecording);
if (sendRecord) sendRecord.addEventListener("click", () => stopVoiceRecording(true));
if (cancelRecord) cancelRecord.addEventListener("click", () => stopVoiceRecording(false));

/* =========================================================
   ROBUST PRODUCTION WEBRTC ENGINE (Cross-Network / Internet)
========================================================= */

function extractCandidateInit(signal) {
  if (!signal) return null;
  if (signal.candidate && typeof signal.candidate === "object" && signal.candidate.candidate !== undefined) {
    return signal.candidate;
  }
  if (signal.candidate !== undefined && typeof signal.candidate === "string") {
    return signal;
  }
  return null;
}

function queueCandidate(peerId, candidate) {
  if (!candidateQueues.has(peerId)) candidateQueues.set(peerId, []);
  candidateQueues.get(peerId).push(candidate);
}

async function drainCandidateQueue(peerId, pc) {
  const q = candidateQueues.get(peerId);
  if (q && q.length > 0) {
    while (q.length > 0) {
      const raw = q.shift();
      const candInit = extractCandidateInit(raw);
      if (candInit && candInit.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candInit));
        } catch (e) {
          console.warn("Error adding queued ICE candidate:", e);
        }
      }
    }
  }
}

// Ensure local media is completely acquired BEFORE signaling
async function setupLocalMedia(callType) {
  currentCallType = callType;
  const isVideo = callType === "video";

  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: isVideo
      ? {
          facingMode: currentFacingMode,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        }
      : false,
  };

  try {
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    console.warn("Initial getUserMedia failed, retrying with fallback audio:", err);
    if (isVideo) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        currentCallType = "audio";
        showToast("Camera unavailable. Started as Voice Call.");
      } catch (e) {
        showToast("Microphone & camera permissions denied.");
        throw e;
      }
    } else {
      showToast("Microphone permission denied.");
      throw err;
    }
  }

  isMicMuted = false;
  isCameraOff = currentCallType === "audio";
  return localStream;
}

if (voiceCallButton) {
  voiceCallButton.addEventListener("click", () => {
    if (!inCall) handleStartCall("audio");
  });
}

if (videoCallButton) {
  videoCallButton.addEventListener("click", () => {
    if (!inCall) handleStartCall("video");
  });
}

async function handleStartCall(callType) {
  try {
    showToast("Starting call…");
    localMediaPromise = setupLocalMedia(callType);
    await localMediaPromise;

    enterCallUI();
    socket.emit("call-start", {
      callType: currentCallType,
      videoEnabled: !isCameraOff,
      audioEnabled: !isMicMuted,
    });
  } catch (e) {
    console.error("Start call error:", e);
  }
}

socket.on("call-start", ({ by, id, callType }) => {
  if (inCall) return;
  incomingCallData = { by, id, callType };
  if (incomingName) incomingName.textContent = by;
  if (incomingRoom) incomingRoom.textContent = currentRoom;
  if (incomingCallTypeText) {
    incomingCallTypeText.textContent = callType === "video" ? "is video calling…" : "is voice calling…";
  }
  if (incomingCallBadge) {
    incomingCallBadge.textContent = callType === "video" ? "VIDEO" : "VOICE";
  }
  if (incomingCall) incomingCall.classList.remove("hidden");

  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200, 100, 300]);
  }
});

if (acceptCall) {
  acceptCall.addEventListener("click", async () => {
    if (!incomingCallData) return;
    if (incomingCall) incomingCall.classList.add("hidden");

    const callType = incomingCallData.callType || "video";
    try {
      showToast("Connecting…");
      localMediaPromise = setupLocalMedia(callType);
      await localMediaPromise;

      enterCallUI();
      socket.emit("call-join", {
        callType: currentCallType,
        videoEnabled: !isCameraOff,
        audioEnabled: !isMicMuted,
      });
    } catch (err) {
      console.error("Accept call error:", err);
    }
  });
}

if (declineCall) {
  declineCall.addEventListener("click", () => {
    if (incomingCall) incomingCall.classList.add("hidden");
    incomingCallData = null;
  });
}

function enterCallUI() {
  inCall = true;
  callStartedAt = Date.now();
  if (callTimer) callTimer.textContent = "0:00";
  if (videoGrid) videoGrid.innerHTML = "";

  if (callTypeIndicator) {
    callTypeIndicator.textContent = currentCallType === "video" ? "📹 VIDEO CALL" : "📞 VOICE CALL";
  }
  if (callRoomLabel) callRoomLabel.textContent = `Room #${currentRoom}`;

  if (muteButton) muteButton.classList.toggle("off", isMicMuted);
  if (cameraButton) cameraButton.classList.toggle("off", isCameraOff);

  createVideoTile("me", `${currentUsername} (You)`, localStream, true, !isCameraOff, !isMicMuted);

  if (callScreen) callScreen.classList.remove("hidden");
  if (incomingCall) incomingCall.classList.add("hidden");

  updateVideoGridLayout();

  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    if (callTimer) {
      callTimer.textContent = formatDuration(Math.floor((Date.now() - callStartedAt) / 1000));
    }
  }, 1000);
}

function exitCallUI() {
  clearInterval(callTimerInterval);
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  localMediaPromise = null;
  peerConnections.forEach(({ pc }) => {
    if (pc) pc.close();
  });
  peerConnections.clear();
  candidateQueues.clear();

  if (videoGrid) videoGrid.innerHTML = "";
  if (callScreen) callScreen.classList.add("hidden");
  if (incomingCall) incomingCall.classList.add("hidden");
  inCall = false;
  incomingCallData = null;
}

function createVideoTile(id, label, stream, isSelf, videoEnabled, audioEnabled) {
  removeVideoTile(id);

  const tile = document.createElement("div");
  tile.className = `video-tile ${isSelf ? "self-tile" : ""}`;
  tile.dataset.peerId = id;
  tile.style.setProperty("--tile-hue", getUsernameHue(label));

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.muted = isSelf; // Self is muted to prevent acoustic feedback

  if (stream) {
    video.srcObject = stream;
  }

  const avatar = document.createElement("div");
  avatar.className = `video-tile-avatar ${videoEnabled ? "hidden" : ""}`;
  const circle = document.createElement("div");
  circle.className = "avatar-circle";
  circle.textContent = label.slice(0, 2).toUpperCase();
  const hint = document.createElement("span");
  hint.className = "avatar-status-hint";
  hint.textContent = isSelf ? "Your camera is off" : "Camera off";
  avatar.appendChild(circle);
  avatar.appendChild(hint);

  const tag = document.createElement("div");
  tag.className = "video-tile-tag";
  const nameSpan = document.createElement("span");
  nameSpan.textContent = label;
  const micIcon = document.createElement("span");
  micIcon.className = `video-tag-icon ${!audioEnabled ? "muted" : ""}`;
  micIcon.textContent = audioEnabled ? "🎙️" : "🔇";
  tag.appendChild(nameSpan);
  tag.appendChild(micIcon);

  tile.appendChild(video);
  tile.appendChild(avatar);
  tile.appendChild(tag);

  if (videoGrid) {
    videoGrid.appendChild(tile);
    updateVideoGridLayout();
  }

  video.onloadedmetadata = () => {
    video.play().catch((e) => console.log("Video auto-play:", e));
  };

  // Allow one-tap to force play if mobile Safari/Chrome restricted audio
  tile.addEventListener("click", () => {
    if (video.paused) {
      video.play().catch(() => {});
    }
  });

  return { tile, video, avatar, tag, micIcon, nameSpan };
}

function removeVideoTile(id) {
  if (!videoGrid) return;
  const existing = videoGrid.querySelector(`[data-peer-id="${id}"]`);
  if (existing) {
    existing.remove();
    updateVideoGridLayout();
  }
}

function updateVideoGridLayout() {
  if (!videoGrid) return;
  const count = videoGrid.children.length;
  videoGrid.classList.toggle("single-peer", count <= 1);
  videoGrid.classList.toggle("two-peers", count === 2);
  videoGrid.classList.toggle("three-peers", count === 3);
  videoGrid.classList.toggle("four-peers", count >= 4);
}

// 1. Existing peers receive notification that a new peer joined -> They initiate offer
socket.on("call-peer-joined", async ({ id, username, videoEnabled, audioEnabled }) => {
  if (!inCall) return;
  if (localMediaPromise) await localMediaPromise;
  initiatePeerConnection(id, username, true, videoEnabled, audioEnabled);
});

// 2. Newly joined peer receives list of existing peers -> Listens for offers
socket.on("call-peers", async (peers) => {
  if (!inCall) return;
  if (localMediaPromise) await localMediaPromise;
  peers.forEach((p) => {
    initiatePeerConnection(p.id, p.username, false, p.videoEnabled, p.audioEnabled);
  });
});

// 3. Signaling message router
socket.on("call-signal", async ({ from, signal }) => {
  if (!inCall || !signal) return;
  if (localMediaPromise) await localMediaPromise;

  let peerObj = peerConnections.get(from);
  if (!peerObj) {
    peerObj = initiatePeerConnection(from, "Guest", false, true, true);
  }
  const { pc } = peerObj;

  try {
    if (signal.type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
      await drainCandidateQueue(from, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("call-signal", {
        to: from,
        signal: pc.localDescription,
      });
    } else if (signal.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
      await drainCandidateQueue(from, pc);
    } else {
      const candInit = extractCandidateInit(signal);
      if (candInit) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candInit));
          } catch (e) {
            console.warn("ICE candidate add failed:", e);
          }
        } else {
          queueCandidate(from, candInit);
        }
      }
    }
  } catch (err) {
    console.warn("WebRTC signal handling error:", err);
  }
});

socket.on("call-peer-media-state", ({ id, video, audio }) => {
  const peerObj = peerConnections.get(id);
  if (!peerObj) return;
  if (typeof video === "boolean") {
    peerObj.avatar.classList.toggle("hidden", video);
  }
  if (typeof audio === "boolean") {
    peerObj.micIcon.className = `video-tag-icon ${!audio ? "muted" : ""}`;
    peerObj.micIcon.textContent = audio ? "🎙️" : "🔇";
  }
});

socket.on("call-peer-left", ({ id }) => {
  const peerObj = peerConnections.get(id);
  if (peerObj && peerObj.pc) peerObj.pc.close();
  peerConnections.delete(id);
  candidateQueues.delete(id);
  removeVideoTile(id);
});

socket.on("call-ended", () => {
  if (inCall) {
    localSystemMessage("Call ended.");
    exitCallUI();
  }
});

function initiatePeerConnection(peerId, username, isInitiator, videoEnabled, audioEnabled) {
  if (peerConnections.has(peerId)) return peerConnections.get(peerId);

  const pc = new RTCPeerConnection(RTC_CONFIG);
  const remoteStream = new MediaStream();

  const { tile, video, avatar, tag, micIcon, nameSpan } = createVideoTile(
    peerId,
    username,
    remoteStream,
    false,
    videoEnabled,
    audioEnabled
  );

  // Add all local stream tracks to the connection
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  // Explicitly add transceivers to guarantee bi-directional video & audio
  if (pc.getTransceivers().length === 0) {
    pc.addTransceiver("audio", { direction: "sendrecv" });
    pc.addTransceiver("video", { direction: "sendrecv" });
  }

  // Bind incoming tracks to persistent remote stream
  pc.ontrack = (event) => {
    if (event.track) {
      const exists = remoteStream.getTracks().some((t) => t.id === event.track.id);
      if (!exists) {
        remoteStream.addTrack(event.track);
      }
      if (event.track.kind === "video") {
        avatar.classList.add("hidden");
      }
      video.play().catch((e) => console.log("Remote video play:", e));
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("call-signal", {
        to: peerId,
        signal: {
          type: "candidate",
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment,
          },
        },
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`ICE Connection [${peerId}]:`, pc.iceConnectionState);
    if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
      avatar.classList.add("hidden");
      video.play().catch(() => {});
    } else if (pc.iceConnectionState === "failed") {
      try {
        pc.restartIce();
      } catch (e) {}
    }
  };

  const peerObj = { pc, tile, video, avatar, tag, micIcon, nameSpan, username, remoteStream };
  peerConnections.set(peerId, peerObj);

  if (isInitiator) {
    pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    })
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit("call-signal", {
          to: peerId,
          signal: pc.localDescription,
        });
      })
      .catch((err) => console.warn("Error creating offer:", err));
  }

  return peerObj;
}

if (muteButton) {
  muteButton.addEventListener("click", () => {
    if (!localStream) return;
    isMicMuted = !isMicMuted;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = !isMicMuted;
    muteButton.classList.toggle("off", isMicMuted);

    const selfTile = videoGrid ? videoGrid.querySelector('[data-peer-id="me"]') : null;
    if (selfTile) {
      const icon = selfTile.querySelector(".video-tag-icon");
      if (icon) {
        icon.className = `video-tag-icon ${isMicMuted ? "muted" : ""}`;
        icon.textContent = !isMicMuted ? "🎙️" : "🔇";
      }
    }
    socket.emit("call-media-state", { audio: !isMicMuted, video: !isCameraOff });
    showToast(isMicMuted ? "Microphone muted" : "Microphone active");
  });
}

if (cameraButton) {
  cameraButton.addEventListener("click", async () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: currentFacingMode },
        });
        const newTrack = camStream.getVideoTracks()[0];
        localStream.addTrack(newTrack);
        peerConnections.forEach(({ pc }) => pc.addTrack(newTrack, localStream));
        isCameraOff = false;
      } catch (e) {
        return showToast("Cannot access camera.");
      }
    } else {
      isCameraOff = !isCameraOff;
      videoTrack.enabled = !isCameraOff;
    }
    cameraButton.classList.toggle("off", isCameraOff);

    const selfTile = videoGrid ? videoGrid.querySelector('[data-peer-id="me"]') : null;
    if (selfTile) {
      const avatar = selfTile.querySelector(".video-tile-avatar");
      if (avatar) avatar.classList.toggle("hidden", !isCameraOff);
    }
    socket.emit("call-media-state", { video: !isCameraOff, audio: !isMicMuted });
  });
}

if (flipCameraButton) {
  flipCameraButton.addEventListener("click", async () => {
    if (!localStream || isCameraOff) return;
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    const oldTrack = localStream.getVideoTracks()[0];
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode },
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (oldTrack) {
        localStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      localStream.addTrack(newTrack);

      peerConnections.forEach(({ pc }) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) sender.replaceTrack(newTrack);
      });

      const selfVideo = videoGrid ? videoGrid.querySelector('[data-peer-id="me"] video') : null;
      if (selfVideo) selfVideo.srcObject = localStream;
      showToast("Camera switched");
    } catch (err) {
      showToast("Could not flip camera.");
    }
  });
}

if (callFullscreenBtn) {
  callFullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      if (callScreen) callScreen.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });
}

if (leaveCall) {
  leaveCall.addEventListener("click", () => {
    socket.emit("call-leave");
    exitCallUI();
    localSystemMessage("You left the call.");
  });
}

/* =========================================
   SYSTEM MESSAGES & CHAT RESET
========================================= */

socket.on("system-message", (d) => localSystemMessage(d.text));

function localSystemMessage(text) {
  if (!messages) return;
  const el = document.createElement("div");
  el.className = "system-message";
  el.textContent = text;
  messages.appendChild(el);
  scrollMessagesToBottom();
}

socket.on("clear-chat", () => {
  if (messages) messages.innerHTML = "";
  showToast("Chat cleared.");
});

if (resetButton) {
  resetButton.addEventListener("click", () => {
    if (confirm("Clear chat for everyone in room?")) socket.emit("reset-chat");
  });
}

/* =========================================
   PRESENCE & CHARACTERS
========================================= */

socket.on("presence-update", (people) => {
  updatePeopleUI(people);
  updateCharacters(people);
});

function sendPresence(status) {
  if (joinedChat) socket.emit("presence-update", status);
}

document.addEventListener("visibilitychange", () => {
  if (joinedChat) sendPresence(document.visibilityState === "visible" ? "active" : "away");
});

window.addEventListener("focus", () => {
  if (joinedChat) sendPresence("active");
});

window.addEventListener("blur", () => {
  if (joinedChat) sendPresence("away");
});

function startPresenceHeartbeat() {
  if (presenceHeartbeat) clearInterval(presenceHeartbeat);
  presenceHeartbeat = setInterval(() => {
    if (joinedChat && document.visibilityState === "visible") {
      socket.emit("presence-heartbeat");
    }
  }, 5000);
}

function updatePeopleUI(people) {
  if (peopleCount) peopleCount.textContent = people.length;
  if (!peopleList) return;
  peopleList.innerHTML = "";
  people.forEach((p) => {
    const row = document.createElement("div");
    row.className = "person-row";
    const left = document.createElement("div");
    left.className = "person-left";
    const dot = document.createElement("span");
    dot.className = `status-dot ${p.status}`;
    const name = document.createElement("span");
    name.textContent = p.username === currentUsername ? `${p.username} (You)` : p.username;
    left.appendChild(dot);
    left.appendChild(name);
    const status = document.createElement("span");
    status.className = `person-status ${p.status}`;
    status.textContent = p.status === "active" ? "Active" : "Away";
    row.appendChild(left);
    row.appendChild(status);
    peopleList.appendChild(row);
  });
}

if (peopleButton && peoplePanel) {
  peopleButton.addEventListener("click", () => peoplePanel.classList.toggle("hidden"));
}
if (closePeople && peoplePanel) {
  closePeople.addEventListener("click", () => peoplePanel.classList.add("hidden"));
}

function updateCharacters(people) {
  if (!characterArea) return;
  characterArea.innerHTML = "";
  const active = people.filter((p) => p.status === "active");
  active.forEach((p, idx) => characterArea.appendChild(createCharacter(p, idx, active.length)));
}

function createCharacter(person, index, total) {
  const wrapper = document.createElement("div");
  wrapper.className = "character-wrapper";
  wrapper.dataset.username = person.username;
  const position = total === 1 ? 50 : 20 + (index / (total - 1)) * 60;
  wrapper.style.left = `${position}%`;
  wrapper.style.setProperty("--character-hue", getUsernameHue(person.username));
  const character = document.createElement("div");
  character.className = "character";
  const head = document.createElement("div");
  head.className = "character-head";
  const face = document.createElement("div");
  face.className = "character-face";
  face.innerHTML = "<span></span><span></span>";
  head.appendChild(face);
  const body = document.createElement("div");
  body.className = "character-body";
  character.appendChild(head);
  character.appendChild(body);
  const name = document.createElement("div");
  name.className = "character-name";
  name.textContent = person.username;
  wrapper.appendChild(character);
  wrapper.appendChild(name);
  return wrapper;
}

function getUsernameHue(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [42, 48, 55, 38, 210, 220, 160, 25];
  return hues[Math.abs(hash) % hues.length];
}

function scrollMessagesToBottom() {
  if (messages) {
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
    });
  }
}

function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function showToast(message, type = "info") {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "success" ? "toast-success" : ""}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    toast.style.transition = "all 0.25s ease";
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

window.addEventListener("beforeunload", () => {
  if (inCall) socket.emit("call-leave");
});

socket.on("disconnect", () => {
  if (inCall) {
    localSystemMessage("Connection lost. Call ended.");
    exitCallUI();
  }
});

