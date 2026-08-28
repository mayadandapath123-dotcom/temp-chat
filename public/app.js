const socket = io();

/* =========================================
   ELEMENTS
========================================= */

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

// Chat & Character Area
const messages = document.getElementById("messages");
const characterArea = document.getElementById("character-area");

// Composer
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const micButton = document.getElementById("mic-button");
const photoButton = document.getElementById("photo-button");
const photoFileInput = document.getElementById("photo-file-input");

// Photo Preview Bar
const photoPreviewBar = document.getElementById("photo-preview-bar");
const previewImg = document.getElementById("preview-img");
const removePhotoBtn = document.getElementById("remove-photo-btn");
const viewOnceToggle = document.getElementById("view-once-toggle");
const photoCaptionInput = document.getElementById("photo-caption-input");
const sendPhotoBtn = document.getElementById("send-photo-btn");

// Voice Recording Bar
const recordBar = document.getElementById("record-bar");
const recordTimer = document.getElementById("record-timer");
const cancelRecord = document.getElementById("cancel-record");
const sendRecord = document.getElementById("send-record");

// Incoming Call Overlay
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

// Toast
const toastContainer = document.getElementById("toast-container");


/* =========================================
   STATE
========================================= */

let currentUsername = "";
let currentRoom = "";
let joinedChat = false;
let presenceHeartbeat = null;

// Photo state
let pendingPhotoDataUrl = null;
let isViewOnceMode = true;
const ephemeralPhotoStore = new Map(); // photoId -> photoPayload
let activeViewOnceId = null;
let viewOnceCountdownInterval = null;

// Voice note state
let mediaRecorder = null;
let recordedChunks = [];
let recordTimerInterval = null;
let recordStartedAt = 0;
let recordSendOnStop = false;
let currentVoiceAudio = null;
let currentVoicePlayButton = null;

// Call & WebRTC state
let inCall = false;
let currentCallType = "video"; // "video" or "audio"
let localStream = null;
let isMicMuted = false;
let isCameraOff = false;
let currentFacingMode = "user"; // 'user' or 'environment'
let callStartedAt = 0;
let callTimerInterval = null;
let incomingCallData = null;

// Peer connections map: peerId -> { pc, tile, videoEl, username, isVideoOn, isAudioOn }
const peerConnections = new Map();

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};


/* =========================================
   RANDOM USERNAME GENERATOR
========================================= */

const ADJECTIVES = [
  "Swift", "Cosmic", "Neon", "Shadow", "Mystic", "Golden", "Cyber",
  "Silent", "Solar", "Lunar", "Frost", "Hyper", "Pixel", "Echo",
  "Electric", "Brave", "Quiet", "Nova", "Vivid", "Turbo", "Velvet",
  "Zen", "Sonic", "Crystal", "Pulse", "Quantum", "Apex", "Astro"
];

const NOUNS = [
  "Fox", "Falcon", "Wolf", "Hawk", "Otter", "Panda", "Tiger",
  "Lynx", "Viper", "Raven", "Eagle", "Cheetah", "Dolphin", "Phoenix",
  "Owl", "Cipher", "Badger", "Koala", "Jaguar", "Puma", "Falcon",
  "Drift", "Ghost", "Shade", "Vortex", "Rider", "Blaze", "Spark"
];

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


/* =========================================
   SEAMLESS INVITE LINK DETECTION & AUTO-JOIN
========================================= */

window.addEventListener("DOMContentLoaded", () => {
  // Check URL parameters for ?room=... or ?join=... or hash #...
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

    // Automatically assign a friendly random username for seamless entry
    const autoUsername = generateRandomUsername();
    usernameInput.value = autoUsername;

    // Direct seamless join without delay
    setTimeout(() => {
      joinChat();
      showToast(`Joined Room ${cleanRoom} as ${autoUsername}!`, "success");
    }, 400);
  } else {
    // Generate a default random username on join screen
    usernameInput.value = generateRandomUsername();
  }
});


/* =========================================
   JOIN CHAT
========================================= */

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
  const room = roomInput.value.trim().toUpperCase();

  if (!username || !room) {
    showToast("Please enter both a username and room code.");
    return;
  }

  currentUsername = username.slice(0, 20);
  currentRoom = room.slice(0, 20);

  socket.emit("join-room", {
    username: currentUsername,
    room: currentRoom,
  });

  roomName.textContent = `#${currentRoom}`;
  roomName.setAttribute("title", `Room ${currentRoom} • Click to share`);

  joinScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  joinedChat = true;
  startPresenceHeartbeat();
  sendPresence("active");

  setTimeout(() => {
    messageInput.focus();
  }, 150);
}


/* =========================================
   SEND TEXT MESSAGE
========================================= */

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();
  if (!message) return;

  socket.emit("send-message", message.slice(0, 1500));
  messageInput.value = "";
  messageInput.focus();
});

socket.on("chat-message", (data) => {
  appendChatMessage(data);
});

function appendChatMessage(data) {
  const isOwnMessage = data.username === currentUsername;
  const messageElement = document.createElement("div");
  messageElement.className = `message ${isOwnMessage ? "own-message" : "other-message"}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const name = document.createElement("strong");
  name.textContent = isOwnMessage ? "You" : data.username;

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


/* =========================================
   SINGLE-TIME / VIEW-ONCE PHOTO FEATURE
========================================= */

// Trigger file input
photoButton.addEventListener("click", () => {
  photoFileInput.click();
});

// Photo selected from file picker
photoFileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Please select a valid image file.");
    return;
  }

  processAndPreviewPhoto(file);
});

// Support paste (Ctrl+V) from clipboard
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

// Compress photo on canvas to keep bandwidth fast & lightweight
function processAndPreviewPhoto(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      let width = img.width;
      let height = img.height;

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
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      pendingPhotoDataUrl = canvas.toDataURL("image/jpeg", 0.82);

      // Show preview bar
      previewImg.src = pendingPhotoDataUrl;
      photoPreviewBar.classList.remove("hidden");
      photoCaptionInput.focus();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// Toggle View-Once ON / OFF
viewOnceToggle.addEventListener("click", () => {
  isViewOnceMode = !isViewOnceMode;
  viewOnceToggle.classList.toggle("active", isViewOnceMode);
  viewOnceToggle.querySelector(".view-once-text").innerHTML =
    `View Once: <strong>${isViewOnceMode ? "ON" : "OFF"}</strong>`;
});

// Remove / Cancel photo preview
removePhotoBtn.addEventListener("click", clearPhotoPreview);

function clearPhotoPreview() {
  pendingPhotoDataUrl = null;
  previewImg.src = "";
  photoCaptionInput.value = "";
  photoPreviewBar.classList.add("hidden");
  photoFileInput.value = "";
}

// Send photo
sendPhotoBtn.addEventListener("click", () => {
  if (!pendingPhotoDataUrl) return;

  const caption = photoCaptionInput.value.trim();
  const photoId = "photo_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

  socket.emit("single-photo", {
    id: photoId,
    image: pendingPhotoDataUrl,
    caption,
    isViewOnce: isViewOnceMode,
  });

  clearPhotoPreview();
});

// Incoming photo received
socket.on("single-photo", (data) => {
  if (!data || !data.image) return;

  // Store in ephemeral memory
  ephemeralPhotoStore.set(data.id, data);

  appendPhotoMessage(data);
});

// Photo opened notification
socket.on("photo-opened", ({ photoId, openedBy, time }) => {
  const bubble = document.querySelector(`[data-photo-id="${photoId}"]`);
  if (bubble) {
    bubble.classList.add("opened");
    const hint = bubble.querySelector(".view-once-hint");
    if (hint) {
      hint.textContent = `Opened by ${openedBy} at ${time}`;
    }
  }
});

function appendPhotoMessage(data) {
  const isOwnMessage = data.username === currentUsername;
  const messageElement = document.createElement("div");
  messageElement.className = `message ${isOwnMessage ? "own-message" : "other-message"}`;

  const bubble = document.createElement("div");
  bubble.dataset.photoId = data.id;

  const name = document.createElement("strong");
  name.textContent = isOwnMessage ? "You" : data.username;

  if (data.isViewOnce) {
    // Single-Time View-Once Card
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
    hint.textContent = isOwnMessage ? "Sent • View once" : "Tap to view • Self-destructs";

    details.appendChild(title);
    details.appendChild(hint);

    if (data.caption) {
      const captionEl = document.createElement("span");
      captionEl.className = "view-once-caption-text";
      captionEl.textContent = data.caption;
      details.appendChild(captionEl);
    }

    card.appendChild(iconWrap);
    card.appendChild(details);

    const time = document.createElement("small");
    time.textContent = data.time;

    bubble.appendChild(name);
    bubble.appendChild(card);
    bubble.appendChild(time);

    // Clicking View-Once Photo
    bubble.addEventListener("click", () => {
      if (bubble.classList.contains("opened")) {
        showToast("This view-once photo has already expired.");
        return;
      }
      openViewOnceModal(data.id);
    });

  } else {
    // Regular ephemeral photo
    bubble.className = "message-bubble";

    const img = document.createElement("img");
    img.src = data.image;
    img.alt = "Chat photo";
    img.className = "chat-photo-img";

    img.addEventListener("click", () => {
      openLightbox(data.image, data.caption);
    });

    bubble.appendChild(name);
    bubble.appendChild(img);

    if (data.caption) {
      const caption = document.createElement("span");
      caption.textContent = data.caption;
      bubble.appendChild(caption);
    }

    const time = document.createElement("small");
    time.textContent = data.time;
    bubble.appendChild(time);
  }

  messageElement.appendChild(bubble);
  messages.appendChild(messageElement);
  scrollMessagesToBottom();
}

function openViewOnceModal(photoId) {
  const photo = ephemeralPhotoStore.get(photoId);
  if (!photo) {
    showToast("Photo is no longer available.");
    return;
  }

  activeViewOnceId = photoId;
  viewOnceImage.src = photo.image;

  if (photo.caption) {
    viewOnceCaption.textContent = photo.caption;
    viewOnceCaption.classList.remove("hidden");
  } else {
    viewOnceCaption.classList.add("hidden");
  }

  viewOnceModal.classList.remove("hidden");

  // Start 15s self-destruct countdown
  let timeLeft = 15;
  viewOnceTimer.textContent = `${timeLeft}s`;

  clearInterval(viewOnceCountdownInterval);
  viewOnceCountdownInterval = setInterval(() => {
    timeLeft--;
    viewOnceTimer.textContent = `${timeLeft}s`;
    if (timeLeft <= 0) {
      closeAndViewOnceDestroy();
    }
  }, 1000);
}

closeViewOnceBtn.addEventListener("click", closeAndViewOnceDestroy);

function closeAndViewOnceDestroy() {
  clearInterval(viewOnceCountdownInterval);
  viewOnceModal.classList.add("hidden");

  if (activeViewOnceId) {
    const photoId = activeViewOnceId;
    activeViewOnceId = null;

    // Securely wipe image data from memory
    viewOnceImage.src = "";
    ephemeralPhotoStore.delete(photoId);

    // Mark bubble as expired
    const bubble = document.querySelector(`[data-photo-id="${photoId}"]`);
    if (bubble) {
      bubble.classList.add("opened");
      const hint = bubble.querySelector(".view-once-hint");
      if (hint) {
        hint.textContent = "Expired • Photo deleted";
      }
    }

    // Notify others
    socket.emit("photo-opened", { photoId });
    showToast("Photo self-destructed & purged from memory.");
  }
}

function openLightbox(imageUrl, caption) {
  viewOnceImage.src = imageUrl;
  viewOnceTimer.textContent = "Temporary";
  if (caption) {
    viewOnceCaption.textContent = caption;
    viewOnceCaption.classList.remove("hidden");
  } else {
    viewOnceCaption.classList.add("hidden");
  }
  viewOnceModal.classList.remove("hidden");
}


/* =========================================
   ROOM SHARE FEATURE (Direct link + QR + Copy)
========================================= */

function getRoomShareUrl() {
  const origin = window.location.origin;
  const path = window.location.pathname;
  return `${origin}${path}?room=${encodeURIComponent(currentRoom)}`;
}

function openShareModal() {
  if (!joinedChat) return;

  const shareUrl = getRoomShareUrl();
  shareRoomCodeDisplay.textContent = currentRoom;
  shareLinkInput.value = shareUrl;
  shareModal.classList.remove("hidden");
}

shareButton.addEventListener("click", () => {
  // If native share is supported on mobile, offer direct share sheet
  if (navigator.share) {
    navigator.share({
      title: "Join my TempChat Room",
      text: `Join my private ephemeral room ${currentRoom} on TempChat!`,
      url: getRoomShareUrl(),
    }).catch(() => {
      openShareModal();
    });
  } else {
    openShareModal();
  }
});

roomName.addEventListener("click", openShareModal);
panelShareBtn.addEventListener("click", openShareModal);

closeShareModal.addEventListener("click", () => {
  shareModal.classList.add("hidden");
});

copyShareLinkBtn.addEventListener("click", () => {
  const shareUrl = getRoomShareUrl();
  navigator.clipboard.writeText(shareUrl).then(() => {
    copyShareLinkBtn.textContent = "Copied! ✓";
    showToast("Room invite link copied to clipboard!", "success");
    setTimeout(() => {
      copyShareLinkBtn.textContent = "Copy Link";
    }, 2000);
  }).catch(() => {
    shareLinkInput.select();
    document.execCommand("copy");
    showToast("Room link copied!");
  });
});

shareWhatsappBtn.addEventListener("click", () => {
  const text = `Join my ephemeral room ${currentRoom} on TempChat: ${getRoomShareUrl()}`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
});

shareTelegramBtn.addEventListener("click", () => {
  const text = `Join my ephemeral room ${currentRoom} on TempChat!`;
  window.open(`https://t.me/share/url?url=${encodeURIComponent(getRoomShareUrl())}&text=${encodeURIComponent(text)}`, "_blank");
});

shareNativeBtn.addEventListener("click", () => {
  if (navigator.share) {
    navigator.share({
      title: "Join my TempChat Room",
      text: `Join my private room ${currentRoom} on TempChat!`,
      url: getRoomShareUrl(),
    }).catch(() => {});
  } else {
    copyShareLinkBtn.click();
  }
});


/* =========================================
   VOICE NOTES (Up to 60 seconds)
========================================= */

const VOICE_PLAY_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const VOICE_PAUSE_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

if (!window.MediaRecorder) {
  micButton.classList.add("hidden");
}

socket.on("voice-message", (data) => {
  if (!data || !data.audio) return;
  appendVoiceMessage(data);
});

function appendVoiceMessage(data) {
  const isOwnMessage = data.username === currentUsername;
  const messageElement = document.createElement("div");
  messageElement.className = `message ${isOwnMessage ? "own-message" : "other-message"}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble voice-bubble";

  const name = document.createElement("strong");
  name.textContent = isOwnMessage ? "You" : data.username;

  const player = buildVoicePlayer(data);

  const time = document.createElement("small");
  time.textContent = data.time;

  bubble.appendChild(name);
  bubble.appendChild(player);
  bubble.appendChild(time);

  messageElement.appendChild(bubble);
  messages.appendChild(messageElement);
  scrollMessagesToBottom();
}

function buildVoicePlayer(data) {
  const mime = typeof data.mime === "string" ? data.mime : "audio/webm";
  const blob = new Blob([data.audio], { type: mime });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  const player = document.createElement("div");
  player.className = "voice-player";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "voice-play";
  playButton.setAttribute("aria-label", "Play voice note");
  playButton.innerHTML = VOICE_PLAY_SVG;

  const bar = document.createElement("div");
  bar.className = "voice-bar";

  const progress = document.createElement("div");
  progress.className = "voice-progress";
  bar.appendChild(progress);

  const duration = document.createElement("span");
  duration.className = "voice-duration";
  duration.textContent = "0:00";

  player.appendChild(playButton);
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
    playButton.innerHTML = VOICE_PLAY_SVG;
    progress.style.width = "0%";
    duration.textContent = formatDuration(audio.duration);
  });

  playButton.addEventListener("click", () => {
    if (audio.paused) {
      if (currentVoiceAudio && currentVoiceAudio !== audio) {
        currentVoiceAudio.pause();
        if (currentVoicePlayButton) currentVoicePlayButton.innerHTML = VOICE_PLAY_SVG;
      }
      audio.play();
      playButton.innerHTML = VOICE_PAUSE_SVG;
      currentVoiceAudio = audio;
      currentVoicePlayButton = playButton;
    } else {
      audio.pause();
      playButton.innerHTML = VOICE_PLAY_SVG;
    }
  });

  bar.addEventListener("click", (event) => {
    if (!audio.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * audio.duration;
  });

  return player;
}

function pickMimeType() {
  const options = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of options) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

async function startVoiceRecording() {
  if (mediaRecorder) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    showToast("Voice notes are not supported in this browser.");
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    showToast("Microphone access was denied.");
    return;
  }

  recordedChunks = [];
  recordSendOnStop = false;
  let mimeType = pickMimeType();

  try {
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    mediaRecorder = null;
    showToast("Could not start recording.");
    return;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const usedMime = mediaRecorder.mimeType || mimeType || "audio/webm";
    mediaRecorder = null;
    clearInterval(recordTimerInterval);
    recordTimerInterval = null;
    stream.getTracks().forEach((t) => t.stop());
    setIsRecording(false);

    if (recordSendOnStop && recordedChunks.length) {
      const blob = new Blob(recordedChunks, { type: usedMime });
      socket.emit("voice-message", {
        audio: blob,
        mime: usedMime,
      });
    }
    recordedChunks = [];
  };

  mediaRecorder.start();
  recordStartedAt = Date.now();
  setIsRecording(true);
  messageInput.blur();

  recordTimerInterval = setInterval(() => {
    const seconds = Math.floor((Date.now() - recordStartedAt) / 1000);
    recordTimer.textContent = `${formatDuration(seconds)} / 1:00`;
    if (seconds >= 60) {
      stopVoiceRecording(true);
    }
  }, 250);
}

function stopVoiceRecording(send) {
  if (!mediaRecorder) return;
  recordSendOnStop = Boolean(send);
  try {
    mediaRecorder.stop();
  } catch (e) {}
}

function setIsRecording(recording) {
  messageForm.classList.toggle("recording", recording);
  recordBar.classList.toggle("hidden", !recording);
}

micButton.addEventListener("click", startVoiceRecording);
sendRecord.addEventListener("click", () => stopVoiceRecording(true));
cancelRecord.addEventListener("click", () => stopVoiceRecording(false));


/* =========================================
   VIDEO & VOICE CALL (WebRTC + Mesh)
========================================= */

voiceCallButton.addEventListener("click", () => {
  if (inCall) return;
  startCall("audio");
});

videoCallButton.addEventListener("click", () => {
  if (inCall) return;
  startCall("video");
});

async function startCall(callType) {
  currentCallType = callType;
  const isVideo = callType === "video";

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: isVideo ? { facingMode: currentFacingMode } : false,
    });
  } catch (err) {
    if (isVideo) {
      // Fallback to audio if camera failed
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        currentCallType = "audio";
        showToast("Camera unavailable, starting as voice call.");
      } catch (audioErr) {
        showToast("Microphone & camera access denied.");
        return;
      }
    } else {
      showToast("Microphone access denied.");
      return;
    }
  }

  isMicMuted = false;
  isCameraOff = currentCallType === "audio";
  enterCallUI();

  socket.emit("call-start", { callType: currentCallType });
}

// Incoming Call Notification
socket.on("call-start", ({ by, id, callType }) => {
  if (inCall) return;
  incomingCallData = { by, id, callType };

  incomingName.textContent = by;
  incomingRoom.textContent = currentRoom;
  incomingCallTypeText.textContent = callType === "video" ? "is video calling…" : "is voice calling…";
  incomingCallBadge.textContent = callType === "video" ? "VIDEO CALL" : "VOICE CALL";

  incomingCall.classList.remove("hidden");

  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200, 100, 300]);
  }
});

// Callee Accepts Call
acceptCall.addEventListener("click", async () => {
  if (!incomingCallData) return;
  incomingCall.classList.add("hidden");

  const callType = incomingCallData.callType || "video";
  currentCallType = callType;
  const isVideo = callType === "video";

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: isVideo ? { facingMode: currentFacingMode } : false,
    });
  } catch (err) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      currentCallType = "audio";
      showToast("Joining as voice call.");
    } catch (e) {
      showToast("Permission denied to join call.");
      return;
    }
  }

  isMicMuted = false;
  isCameraOff = currentCallType === "audio";
  enterCallUI();

  socket.emit("call-join", {
    callType: currentCallType,
    videoEnabled: !isCameraOff,
    audioEnabled: true,
  });
});

declineCall.addEventListener("click", () => {
  incomingCall.classList.add("hidden");
  incomingCallData = null;
});

// Setup Call Screen UI
function enterCallUI() {
  inCall = true;
  callStartedAt = Date.now();
  callTimer.textContent = "0:00";
  videoGrid.innerHTML = "";

  callTypeIndicator.textContent = currentCallType === "video" ? "📹 VIDEO CALL" : "📞 VOICE CALL";
  callRoomLabel.textContent = `Room ${currentRoom}`;

  muteButton.classList.toggle("off", isMicMuted);
  cameraButton.classList.toggle("off", isCameraOff);

  // Render Self Tile
  createVideoTile("me", `${currentUsername} (You)`, localStream, true, !isCameraOff, !isMicMuted);

  callScreen.classList.remove("hidden");
  incomingCall.classList.add("hidden");

  updateVideoGridLayout();

  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    const seconds = Math.floor((Date.now() - callStartedAt) / 1000);
    callTimer.textContent = formatDuration(seconds);
  }, 1000);
}

function exitCallUI() {
  clearInterval(callTimerInterval);
  callTimerInterval = null;

  // Stop local stream tracks
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  // Close all peer connections
  peerConnections.forEach(({ pc }) => {
    if (pc) pc.close();
  });
  peerConnections.clear();

  videoGrid.innerHTML = "";
  callScreen.classList.add("hidden");
  incomingCall.classList.add("hidden");
  inCall = false;
  incomingCallData = null;
}

// Create a Video Tile in Grid
function createVideoTile(id, label, stream, isSelf, videoEnabled, audioEnabled) {
  removeVideoTile(id);

  const tile = document.createElement("div");
  tile.className = `video-tile ${isSelf ? "self-tile" : ""}`;
  tile.dataset.peerId = id;

  const hue = getUsernameHue(label);
  tile.style.setProperty("--tile-hue", hue);

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  if (isSelf) video.muted = true;
  if (stream) video.srcObject = stream;

  // Avatar Placeholder (when camera is off)
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

  // Name Tag
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

  videoGrid.appendChild(tile);
  updateVideoGridLayout();

  return { tile, video, avatar, tag, micIcon };
}

function removeVideoTile(id) {
  const existing = videoGrid.querySelector(`[data-peer-id="${id}"]`);
  if (existing) {
    existing.remove();
    updateVideoGridLayout();
  }
}

function updateVideoGridLayout() {
  const count = videoGrid.children.length;
  videoGrid.classList.toggle("single-peer", count === 1);
  videoGrid.classList.toggle("two-peers", count === 2);
}

// WebRTC Signaling Handlers

// Existing participants send list of peers to new joiner
socket.on("call-peers", (peers) => {
  if (!inCall) return;
  peers.forEach((peer) => {
    initiatePeerConnection(peer.id, peer.username, false, peer.videoEnabled, peer.audioEnabled);
  });
});

// A new peer joined the call
socket.on("call-peer-joined", ({ id, username, videoEnabled, audioEnabled }) => {
  if (!inCall) return;
  initiatePeerConnection(id, username, true, videoEnabled, audioEnabled);
});

// WebRTC Signal Received (Offer / Answer / ICE)
socket.on("call-signal", async ({ from, signal }) => {
  if (!inCall) return;

  let peerObj = peerConnections.get(from);
  if (!peerObj) {
    peerObj = initiatePeerConnection(from, "Guest", false, true, true);
  }

  const { pc } = peerObj;

  try {
    if (signal.type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call-signal", { to: from, signal: answer });
    } else if (signal.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  } catch (err) {
    console.warn("WebRTC signal error:", err);
  }
});

// Remote peer toggled camera or mic
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

// Peer left the call
socket.on("call-peer-left", ({ id }) => {
  const peerObj = peerConnections.get(id);
  if (peerObj) {
    if (peerObj.pc) peerObj.pc.close();
    peerConnections.delete(id);
  }
  removeVideoTile(id);
});

// Call ended
socket.on("call-ended", () => {
  if (inCall) {
    localSystemMessage("Call ended.");
    exitCallUI();
  }
});

// Helper: Setup WebRTC PeerConnection
function initiatePeerConnection(peerId, username, isInitiator, videoEnabled, audioEnabled) {
  if (peerConnections.has(peerId)) {
    return peerConnections.get(peerId);
  }

  const pc = new RTCPeerConnection(RTC_CONFIG);
  const { tile, video, avatar, tag, micIcon } = createVideoTile(
    peerId,
    username,
    null,
    false,
    videoEnabled,
    audioEnabled
  );

  const remoteStream = new MediaStream();
  video.srcObject = remoteStream;

  // Add local stream tracks to connection
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  // Handle incoming remote tracks
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
        remoteStream.addTrack(track);
      }
    });
  };

  // ICE Candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("call-signal", {
        to: peerId,
        signal: { candidate: event.candidate },
      });
    }
  };

  const peerObj = { pc, tile, video, avatar, tag, micIcon, username };
  peerConnections.set(peerId, peerObj);

  // If initiator, create and send Offer
  if (isInitiator) {
    pc.createOffer()
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

// Media Controls: Mic Mute / Unmute
muteButton.addEventListener("click", () => {
  if (!localStream) return;
  isMicMuted = !isMicMuted;

  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) audioTrack.enabled = !isMicMuted;

  muteButton.classList.toggle("off", isMicMuted);

  const selfTile = videoGrid.querySelector('[data-peer-id="me"]');
  if (selfTile) {
    const icon = selfTile.querySelector(".video-tag-icon");
    if (icon) {
      icon.className = `video-tag-icon ${isMicMuted ? "muted" : ""}`;
      icon.textContent = !isMicMuted ? "🎙️" : "🔇";
    }
  }

  socket.emit("call-media-state", {
    audio: !isMicMuted,
    video: !isCameraOff,
  });

  showToast(isMicMuted ? "Microphone muted" : "Microphone active");
});

// Media Controls: Camera Toggle
cameraButton.addEventListener("click", async () => {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];

  if (!videoTrack) {
    // Enable camera if previously audio-only
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode },
      });
      const newTrack = camStream.getVideoTracks()[0];
      localStream.addTrack(newTrack);

      // Add track to active peer connections
      peerConnections.forEach(({ pc }) => {
        pc.addTrack(newTrack, localStream);
      });

      isCameraOff = false;
    } catch (e) {
      showToast("Cannot access camera.");
      return;
    }
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

  socket.emit("call-media-state", {
    video: !isCameraOff,
    audio: !isMicMuted,
  });
});

// Flip Camera (Mobile front/back)
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

    // Replace track on peer connections
    peerConnections.forEach(({ pc }) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(newTrack);
    });

    const selfVideo = videoGrid.querySelector('[data-peer-id="me"] video');
    if (selfVideo) selfVideo.srcObject = localStream;

    showToast(`Switched camera to ${currentFacingMode}`);
  } catch (err) {
    showToast("Could not flip camera.");
  }
});

// Fullscreen Call Toggle
callFullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    callScreen.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// Leave / End Call
leaveCall.addEventListener("click", () => {
  socket.emit("call-leave");
  exitCallUI();
  localSystemMessage("You left the call.");
});


/* =========================================
   SYSTEM MESSAGE & CHAT RESET
========================================= */

socket.on("system-message", (data) => {
  localSystemMessage(data.text);
});

function localSystemMessage(text) {
  const messageElement = document.createElement("div");
  messageElement.className = "system-message";
  messageElement.textContent = text;
  messages.appendChild(messageElement);
  scrollMessagesToBottom();
}

socket.on("clear-chat", () => {
  messages.innerHTML = "";
  showToast("Chat was reset.");
});

resetButton.addEventListener("click", () => {
  if (confirm("Clear chat for everyone in this room?")) {
    socket.emit("reset-chat");
  }
});


/* =========================================
   PRESENCE & CHARACTER AREA
========================================= */

socket.on("presence-update", (people) => {
  updatePeopleUI(people);
  updateCharacters(people);
});

function sendPresence(status) {
  if (!joinedChat) return;
  socket.emit("presence-update", status);
}

document.addEventListener("visibilitychange", () => {
  if (!joinedChat) return;
  sendPresence(document.visibilityState === "visible" ? "active" : "away");
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
  peopleCount.textContent = people.length;
  peopleList.innerHTML = "";

  people.forEach((person) => {
    const row = document.createElement("div");
    row.className = "person-row";

    const left = document.createElement("div");
    left.className = "person-left";

    const dot = document.createElement("span");
    dot.className = `status-dot ${person.status}`;

    const name = document.createElement("span");
    name.textContent = person.username === currentUsername ? `${person.username} (You)` : person.username;

    left.appendChild(dot);
    left.appendChild(name);

    const status = document.createElement("span");
    status.className = `person-status ${person.status}`;
    status.textContent = person.status === "active" ? "Active" : "Away";

    row.appendChild(left);
    row.appendChild(status);

    peopleList.appendChild(row);
  });
}

peopleButton.addEventListener("click", () => {
  peoplePanel.classList.toggle("hidden");
});

closePeople.addEventListener("click", () => {
  peoplePanel.classList.add("hidden");
});


/* =========================================
   ANIMATED AVATAR CHARACTERS
========================================= */

function updateCharacters(people) {
  characterArea.innerHTML = "";
  const activePeople = people.filter((p) => p.status === "active");

  activePeople.forEach((person, index) => {
    const character = createCharacter(person, index, activePeople.length);
    characterArea.appendChild(character);
  });
}

function createCharacter(person, index, total) {
  const wrapper = document.createElement("div");
  wrapper.className = "character-wrapper";
  wrapper.dataset.username = person.username;

  const position = total === 1 ? 50 : 20 + (index / (total - 1)) * 60;
  wrapper.style.left = `${position}%`;

  const hue = getUsernameHue(person.username);
  wrapper.style.setProperty("--character-hue", hue);

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
  return Math.abs(hash) % 360;
}


/* =========================================
   HELPERS & TOAST
========================================= */

function scrollMessagesToBottom() {
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}

function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "success" ? "toast-success" : ""}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    toast.style.transition = "all 0.25s ease";
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// Window unload cleanup
window.addEventListener("beforeunload", () => {
  if (inCall) socket.emit("call-leave");
});

socket.on("disconnect", () => {
  if (inCall) {
    localSystemMessage("Connection lost. Call ended.");
    exitCallUI();
  }
});

