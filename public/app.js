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
   STATE & WEBRTC CONFIG (STUN + TURN)
========================================= */

let currentUsername = "";
let currentRoom = "";
let joinedChat = false;
let presenceHeartbeat = null;

// Photo state
let pendingPhotoDataUrl = null;
let isViewOnceMode = true;
const ephemeralPhotoStore = new Map();
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

// Call state
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

// Free STUN + OpenRelay TURN servers for 100% mobile connectivity
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


/* =========================================
   RANDOM USERNAME GENERATOR
========================================= */

const ADJECTIVES = [
  "Swift", "Cosmic", "Neon", "Shadow", "Mystic", "Golden", "Cyber",
  "Silent", "Solar", "Lunar", "Frost", "Hyper", "Pixel", "Echo",
  "Electric", "Brave", "Quiet", "Nova", "Vivid", "Turbo", "Velvet"
];

const NOUNS = [
  "Fox", "Falcon", "Wolf", "Hawk", "Otter", "Panda", "Tiger",
  "Lynx", "Viper", "Raven", "Eagle", "Cheetah", "Dolphin", "Phoenix",
  "Owl", "Cipher", "Badger", "Koala", "Jaguar", "Puma", "Ghost"
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
   SEAMLESS INVITE LINK AUTO-JOIN
========================================= */

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


/* =========================================
   JOIN CHAT
========================================= */

joinButton.addEventListener("click", joinChat);

usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") roomInput.focus();
});

roomInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinChat();
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

messageForm.addEventListener("submit", (e) => {
  e.preventDefault();
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
   SINGLE-TIME VIEW-ONCE PHOTO
========================================= */

photoButton.addEventListener("click", () => photoFileInput.click());

photoFileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Please select a valid image file.");
    return;
  }
  processAndPreviewPhoto(file);
});

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
  viewOnceToggle.querySelector(".view-once-text").innerHTML =
    `View Once: <strong>${isViewOnceMode ? "ON" : "OFF"}</strong>`;
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

  socket.emit("single-photo", {
    id: photoId,
    image: pendingPhotoDataUrl,
    caption,
    isViewOnce: isViewOnceMode,
  });
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

    bubble.addEventListener("click", () => {
      if (bubble.classList.contains("opened")) {
        showToast("This view-once photo has already expired.");
        return;
      }
      openViewOnceModal(data.id);
    });
  } else {
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

    viewOnceImage.src = "";
    ephemeralPhotoStore.delete(photoId);

    const bubble = document.querySelector(`[data-photo-id="${photoId}"]`);
    if (bubble) {
      bubble.classList.add("opened");
      const hint = bubble.querySelector(".view-once-hint");
      if (hint) {
        hint.textContent = "Expired • Photo deleted";
      }
    }

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
   ROOM SHARE FEATURE
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
  if (navigator.share) {
    navigator.share({
      title: "Join my TempChat Room",
      text: `Join my private ephemeral room ${currentRoom} on TempChat!`,
      url: getRoomShareUrl(),
    }).catch(() => openShareModal());
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
   VIDEO & VOICE CALL (WebRTC + ICE Queue)
========================================= */

function queueCandidate(peerId, candidate) {
  if (!candidateQueues.has(peerId)) {
    candidateQueues.set(peerId, []);
  }
  candidateQueues.get(peerId).push(candidate);
}

async function drainCandidateQueue(peerId, pc) {
  const queue = candidateQueues.get(peerId);
  if (queue && queue.length) {
    while (queue.length > 0) {
      const cand = queue.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.warn("Error adding queued ICE candidate:", err);
      }
    }
  }
}

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
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        currentCallType = "audio";
        showToast("Camera unavailable, starting as voice call.");
      } catch (audioErr) {
        showToast("Microphone & camera access denied.");
        return;
      }
    } else {
      
