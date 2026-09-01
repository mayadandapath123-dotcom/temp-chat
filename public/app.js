const socket = io({
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 25,
  reconnectionDelay: 1000,
});

// Join Screen Elements
const joinScreen = document.getElementById("join-screen");
const chatScreen = document.getElementById("chat-screen");
const joinForm = document.getElementById("join-form");
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room");
const roomInputGroup = document.getElementById("room-input-group");
const joinButton = document.getElementById("join-button");
const joinButtonText = document.getElementById("join-button-text");
const randomizeBtn = document.getElementById("randomize-btn");
const inviteBanner = document.getElementById("invite-banner");
const invitedRoomCode = document.getElementById("invited-room-code");
const changeRoomBtn = document.getElementById("change-room-btn");

// Header & Room Call Banner Elements
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
const activeCallBanner = document.getElementById("active-call-banner");
const callBannerInfo = document.getElementById("call-banner-info");
const joinActiveCallBtn = document.getElementById("join-active-call-btn");

// Chat & Character Elements
const messages = document.getElementById("messages");
const characterArea = document.getElementById("character-area");
const typingIndicator = document.getElementById("typing-indicator");
const typingText = document.getElementById("typing-text");

// Composer Elements
const messageForm = document.getElementById("message-form");
const composerContainer = document.getElementById("composer-container");
const typistStatusBadge = document.getElementById("typist-status-badge");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const micButton = document.getElementById("mic-button");
const cameraSnapButton = document.getElementById("camera-snap-button");
const galleryButton = document.getElementById("gallery-button");
const cameraFileInput = document.getElementById("camera-file-input");
const galleryFileInput = document.getElementById("gallery-file-input");

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

// In-Call Chat & Floating Heads-up Elements
const callChatToggleBtn = document.getElementById("call-chat-toggle-btn");
const callChatBadge = document.getElementById("call-chat-badge");
const callChatDrawer = document.getElementById("call-chat-drawer");
const closeCallChat = document.getElementById("close-call-chat");
const callChatMessages = document.getElementById("call-chat-messages");
const callChatForm = document.getElementById("call-chat-form");
const callChatInput = document.getElementById("call-chat-input");
const callHeadsUpContainer = document.getElementById("call-heads-up-container");
let callChatUnreadCount = 0;
let isCallChatOpen = false;

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

// Guide / Pamphlet Modal Elements
const guideButton = document.getElementById("guide-button");
const openGuideBtnJoin = document.getElementById("open-guide-btn-join");
const guideModal = document.getElementById("guide-modal");
const closeGuideModal = document.getElementById("close-guide-modal");
const guideModalCloseAction = document.getElementById("guide-modal-close-action");

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

// Call State
let inCall = false;
let currentCallType = "video";
let localStream = null;
let isMicMuted = false;
let isCameraOff = false;
let currentFacingMode = "user";
let callStartedAt = 0;
let callTimerInterval = null;
let incomingCallData = null;
let latestRoomCallStatus = { active: false, count: 0, callType: "video" };

// Live Video Frame Pipeline
let videoFrameSenderInterval = null;
let offscreenCanvas = null;
let offscreenCtx = null;
let localVideoElement = null;

/* ---------------------------------------------------------------
   BANDWIDTH TUNING KNOBS  (Render free tier = 5 GB/month)
   ---------------------------------------------------------------
   Video is by far the most expensive stream. These three values
   control almost all of TempChat's data usage. Raise them only if
   you move to a host with more bandwidth.

     VIDEO_FRAME_INTERVAL_MS  125  -> 8 fps   (was 55 = ~18 fps)
     VIDEO_MAX_DIM            400  -> 400px   (was 460)
     VIDEO_JPEG_QUALITY       0.45 -> 45%     (was 0.52)

   Combined effect: roughly a 70% cut in video bandwidth.
--------------------------------------------------------------- */
const VIDEO_FRAME_INTERVAL_MS = 125;
const VIDEO_MAX_DIM = 400;
const VIDEO_JPEG_QUALITY = 0.45;
let lastSentFrameLength = 0;
let staticFrameSkips = 0;


// Live Web Audio PCM Voice Pipeline
let audioContextSender = null;
let audioSourceNode = null;
let audioProcessorNode = null;
let audioSilentGain = null;
let audioContextReceiver = null;
const peerAudioNextTimes = new Map();

// Remote Call Peers Map
const remotePeers = new Map();

// Typing indicator state
let typingTimeout = null;
let isTypingActive = false;
const activeTypers = new Set();

// Background Tab Notifications & Title Flashing
let unreadCount = 0;
let originalDocumentTitle = document.title;
let titleFlashInterval = null;

/* =========================================
   SYNTHESIZED WEB AUDIO SOUND EFFECTS
========================================= */

let sfxAudioCtx = null;

function getSfxContext() {
  if (!sfxAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) sfxAudioCtx = new AudioCtx();
  }
  if (sfxAudioCtx && sfxAudioCtx.state === "suspended") {
    sfxAudioCtx.resume().catch(() => {});
  }
  return sfxAudioCtx;
}

function playSfx(type) {
  try {
    const ctx = getSfxContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === "send") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === "receive") {
      [
        { freq: 587.33, start: 0, dur: 0.1 },
        { freq: 880.0, start: 0.09, dur: 0.16 },
      ].forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(note.freq, now + note.start);
        gain.gain.setValueAtTime(0.16, now + note.start);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur);
      });
    } else if (type === "ring") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === "join") {
      [
        { freq: 440, start: 0 },
        { freq: 659.25, start: 0.08 },
      ].forEach((n) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(n.freq, now + n.start);
        gain.gain.setValueAtTime(0.14, now + n.start);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + n.start);
        osc.stop(now + n.start + 0.15);
      });
    } else if (type === "leave" || type === "reset") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.16);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === "viewOnce") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.exponentialRampToValueAtTime(1300, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (e) {}
}

/* =========================================
   BACKGROUND TAB & NOTIFICATIONS
========================================= */

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function notifyUser(title, body) {
  playSfx("receive");

  if (document.visibilityState !== "visible") {
    unreadCount++;
    startTitleFlashing();

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
          tag: "tempchat-msg",
        });
      } catch (e) {}
    }
  }
}

function startTitleFlashing() {
  if (titleFlashInterval) return;
  let flashState = false;
  titleFlashInterval = setInterval(() => {
    document.title = flashState ? `(${unreadCount}) New Message! — TempChat` : originalDocumentTitle;
    flashState = !flashState;
  }, 1000);
}

function stopTitleFlashing() {
  clearInterval(titleFlashInterval);
  titleFlashInterval = null;
  unreadCount = 0;
  document.title = originalDocumentTitle;
}

window.addEventListener("focus", () => {
  stopTitleFlashing();
  getSfxContext();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    stopTitleFlashing();
    if (joinedChat) sendPresence("active");
  } else {
    if (joinedChat) sendPresence("away");
  }
});

/* =========================================
   RANDOM USERNAME GENERATOR
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
   INITIALIZATION & INVITE LINK JOIN FLOW
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
    if (invitedRoomCode) invitedRoomCode.textContent = `#${cleanRoom}`;
    if (inviteBanner) inviteBanner.classList.remove("hidden");

    if (roomInputGroup) roomInputGroup.classList.add("hidden");
    if (joinButtonText) joinButtonText.textContent = `Enter Room #${cleanRoom}`;

    const autoUsername = generateRandomUsername();
    if (usernameInput) {
      usernameInput.value = autoUsername;
      setTimeout(() => usernameInput.focus(), 150);
    }
  } else {
    if (usernameInput && !usernameInput.value) {
      usernameInput.value = generateRandomUsername();
    }
  }
}

if (changeRoomBtn) {
  changeRoomBtn.addEventListener("click", () => {
    if (roomInputGroup) roomInputGroup.classList.remove("hidden");
    if (inviteBanner) inviteBanner.classList.add("hidden");
    if (joinButtonText) joinButtonText.textContent = "Enter Room";
    if (roomInput) {
      roomInput.focus();
      roomInput.select();
    }
  });
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
    if (roomInputGroup) roomInputGroup.classList.remove("hidden");
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

  requestNotificationPermission();
  getSfxContext();

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

  showToast(`Joined Room #${currentRoom} as ${currentUsername}`, "success");
  playSfx("join");

  setTimeout(() => {
    if (messageInput) messageInput.focus();
  }, 150);
}

/* =========================================
   TYPING INDICATOR & TYPIST VISUAL GLOW
========================================= */

function handleTypingEvent() {
  if (!joinedChat) return;

  if (!isTypingActive) {
    isTypingActive = true;
    socket.emit("typing");
  }

  if (composerContainer) composerContainer.classList.add("is-typing");
  if (typistStatusBadge) typistStatusBadge.classList.remove("hidden");

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTypingActive = false;
    socket.emit("stop-typing");
    if (composerContainer) composerContainer.classList.remove("is-typing");
    if (typistStatusBadge) typistStatusBadge.classList.add("hidden");
  }, 1600);
}

if (messageInput) {
  messageInput.addEventListener("input", handleTypingEvent);
}
if (callChatInput) {
  callChatInput.addEventListener("input", handleTypingEvent);
}

socket.on("user-typing", ({ username }) => {
  if (username === currentUsername) return;
  activeTypers.add(username);
  updateTypingUI();
});

socket.on("user-stop-typing", ({ username }) => {
  activeTypers.delete(username);
  updateTypingUI();
});

function updateTypingUI() {
  if (!typingIndicator || !typingText) return;
  if (activeTypers.size === 0) {
    typingIndicator.classList.add("hidden");
  } else {
    const list = Array.from(activeTypers);
    if (list.length === 1) {
      typingText.textContent = `${list[0]} is typing…`;
    } else if (list.length === 2) {
      typingText.textContent = `${list[0]} & ${list[1]} are typing…`;
    } else {
      typingText.textContent = `Multiple people are typing…`;
    }
    typingIndicator.classList.remove("hidden");
  }
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
    playSfx("send");

    if (messageInput) {
      messageInput.value = "";
      messageInput.focus();
    }
    isTypingActive = false;
    socket.emit("stop-typing");
    if (composerContainer) composerContainer.classList.remove("is-typing");
    if (typistStatusBadge) typistStatusBadge.classList.add("hidden");
  });
}

socket.on("chat-message", (data) => {
  appendChatMessage(data);
  appendInCallMessage(data);

  if (data.username !== currentUsername) {
    notifyUser(data.username, data.message);
    if (inCall && !isCallChatOpen) {
      showInCallHeadsUp(data.username, data.message);
    }
  }
});

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
   IN-CALL CHAT & FLOATING HEADS-UP
========================================= */

function appendInCallMessage(data) {
  if (!callChatMessages) return;
  const isOwn = data.username === currentUsername;
  const msgEl = document.createElement("div");
  msgEl.className = `call-chat-msg ${isOwn ? "own" : "other"}`;
  const strong = document.createElement("strong");
  strong.textContent = isOwn ? "You" : data.username;
  const span = document.createElement("span");
  span.textContent = data.message;
  msgEl.appendChild(strong);
  msgEl.appendChild(span);
  callChatMessages.appendChild(msgEl);
  callChatMessages.scrollTop = callChatMessages.scrollHeight;

  if (inCall && !isCallChatOpen && !isOwn) {
    callChatUnreadCount++;
    if (callChatBadge) {
      callChatBadge.textContent = callChatUnreadCount;
      callChatBadge.classList.remove("hidden");
    }
  }
}

function showInCallHeadsUp(sender, text) {
  if (!callHeadsUpContainer) return;
  const popup = document.createElement("div");
  popup.className = "call-heads-up-popup";

  const avatar = document.createElement("div");
  avatar.className = "heads-up-avatar";
  avatar.textContent = sender.slice(0, 2).toUpperCase();

  const content = document.createElement("div");
  content.className = "heads-up-content";

  const senderLabel = document.createElement("span");
  senderLabel.className = "heads-up-sender";
  senderLabel.textContent = sender;

  const msgLabel = document.createElement("span");
  msgLabel.className = "heads-up-text";
  msgLabel.textContent = text;

  content.appendChild(senderLabel);
  content.appendChild(msgLabel);
  popup.appendChild(avatar);
  popup.appendChild(content);

  popup.addEventListener("click", () => {
    if (callChatToggleBtn) callChatToggleBtn.click();
    popup.remove();
  });

  callHeadsUpContainer.appendChild(popup);

  setTimeout(() => {
    popup.style.opacity = "0";
    popup.style.transform = "translateY(-12px)";
    popup.style.transition = "all 0.3s ease";
    setTimeout(() => popup.remove(), 300);
  }, 4200);
}

if (callChatToggleBtn) {
  callChatToggleBtn.addEventListener("click", () => {
    isCallChatOpen = !isCallChatOpen;
    if (callChatDrawer) callChatDrawer.classList.toggle("hidden", !isCallChatOpen);
    if (isCallChatOpen) {
      callChatUnreadCount = 0;
      if (callChatBadge) callChatBadge.classList.add("hidden");
      if (callChatInput) callChatInput.focus();
      if (callChatMessages) callChatMessages.scrollTop = callChatMessages.scrollHeight;
    }
  });
}

if (closeCallChat) {
  closeCallChat.addEventListener("click", () => {
    isCallChatOpen = false;
    if (callChatDrawer) callChatDrawer.classList.add("hidden");
  });
}

if (callChatForm) {
  callChatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = callChatInput ? callChatInput.value.trim() : "";
    if (!text) return;

    socket.emit("send-message", text.slice(0, 1500));
    playSfx("send");

    if (callChatInput) {
      callChatInput.value = "";
      callChatInput.focus();
    }
    socket.emit("stop-typing");
  });
}

/* =========================================
   CAMERA SNAP & GALLERY SELECTION
========================================= */

if (cameraSnapButton && cameraFileInput) {
  cameraSnapButton.addEventListener("click", () => {
    cameraFileInput.click();
  });
  cameraFileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file && file.type.startsWith("image/")) {
      processAndPreviewPhoto(file);
    }
  });
}

if (galleryButton && galleryFileInput) {
  galleryButton.addEventListener("click", () => {
    galleryFileInput.click();
  });
  galleryFileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file && file.type.startsWith("image/")) {
      processAndPreviewPhoto(file);
    }
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
      const maxDim = 1280;
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

      pendingPhotoDataUrl = canvas.toDataURL("image/jpeg", 0.72);

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
  if (cameraFileInput) cameraFileInput.value = "";
  if (galleryFileInput) galleryFileInput.value = "";
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
    playSfx("send");
    showToast(isViewOnceMode ? "Sent View-Once Photo ①" : "Photo sent");
    clearPhotoPreview();
  });
}

socket.on("single-photo", (data) => {
  if (!data || !data.image) return;
  ephemeralPhotoStore.set(data.id, data);
  appendPhotoMessage(data);

  if (data.username !== currentUsername) {
    notifyUser(data.username, "Sent a View-Once Photo 📷");
  }
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

  playSfx("viewOnce");

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

function openGuideModal() {
  if (guideModal) guideModal.classList.remove("hidden");
}

function closeGuideModalFunc() {
  if (guideModal) guideModal.classList.add("hidden");
}

if (guideButton) guideButton.addEventListener("click", openGuideModal);
if (openGuideBtnJoin) openGuideBtnJoin.addEventListener("click", openGuideModal);
if (closeGuideModal) closeGuideModal.addEventListener("click", closeGuideModalFunc);
if (guideModalCloseAction) guideModalCloseAction.addEventListener("click", closeGuideModalFunc);

/* =========================================
   VOICE NOTES (100% RELIABLE RESTORE)
========================================= */

const VOICE_PLAY_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const VOICE_PAUSE_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

socket.on("voice-message", (data) => {
  if (data && data.audio) {
    appendVoiceMessage(data);
    if (data.username !== currentUsername) {
      notifyUser(data.username, "Sent a voice note 🎙️");
    }
  }
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
    setIsRecording(false);
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
      playSfx("send");
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
  if (!mediaRecorder) {
    setIsRecording(false);
    return;
  }
  recordSendOnStop = Boolean(send);
  try {
    mediaRecorder.stop();
  } catch (e) {
    setIsRecording(false);
  }
}

function setIsRecording(r) {
  if (composerContainer) composerContainer.classList.toggle("hidden", r);
  if (recordBar) recordBar.classList.toggle("hidden", !r);
  if (!r && recordTimer) recordTimer.textContent = "0:00 / 1:00";
}

if (micButton) micButton.addEventListener("click", startVoiceRecording);
if (sendRecord) sendRecord.addEventListener("click", () => stopVoiceRecording(true));
if (cancelRecord) cancelRecord.addEventListener("click", () => stopVoiceRecording(false));

/* =========================================
   PERSISTENT OPEN ROOM CALL
========================================= */

socket.on("room-call-status", (status) => {
  latestRoomCallStatus = status;
  updateActiveCallBanner();
});

function updateActiveCallBanner() {
  if (!activeCallBanner) return;
  if (latestRoomCallStatus.active && !inCall) {
    const count = latestRoomCallStatus.count || 1;
    const typeLabel = latestRoomCallStatus.callType === "video" ? "Video" : "Voice";
    if (callBannerInfo) {
      callBannerInfo.textContent = `📞 Active ${typeLabel} Call in progress (${count} in call)`;
    }
    activeCallBanner.classList.remove("hidden");
  } else {
    activeCallBanner.classList.add("hidden");
  }
}

if (joinActiveCallBtn) {
  joinActiveCallBtn.addEventListener("click", () => {
    const type = latestRoomCallStatus.callType || "video";
    startCall(type);
  });
}

/* =========================================
   LIVE MULTI-PEER VIDEO & WEB AUDIO ENGINE
========================================= */

if (voiceCallButton) {
  voiceCallButton.addEventListener("click", () => {
    if (!inCall) startCall("audio");
  });
}

if (videoCallButton) {
  videoCallButton.addEventListener("click", () => {
    if (!inCall) startCall("video");
  });
}

async function startCall(callType) {
  try {
    showToast("Connecting to call…");
    unlockReceiverAudioContext();
    playSfx("ring");
    await initMediaHardware(callType);
    enterCallUI();

    socket.emit("call-start", {
      callType: currentCallType,
      videoEnabled: !isCameraOff,
      audioEnabled: !isMicMuted,
    });
  } catch (err) {
    console.error("Start call error:", err);
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

  playSfx("ring");
  notifyUser(by, `Incoming ${callType === "video" ? "Video" : "Voice"} Call in Room #${currentRoom}`);

  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200, 100, 300]);
  }
});

if (acceptCall) {
  acceptCall.addEventListener("click", async () => {
    if (!incomingCallData) return;
    if (incomingCall) incomingCall.classList.add("hidden");

    unlockReceiverAudioContext();

    const callType = incomingCallData.callType || "video";
    try {
      showToast("Connecting…");
      await initMediaHardware(callType);
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
    playSfx("leave");
  });
}

async function initMediaHardware(callType) {
  currentCallType = callType;
  const isVideo = callType === "video";

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: isVideo
        ? {
            facingMode: currentFacingMode,
            width: { ideal: 640 },
            height: { ideal: 480 },
          }
        : false,
    });
  } catch (err) {
    if (isVideo) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        currentCallType = "audio";
        showToast("Camera unavailable. Joined as Voice Call.");
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

function unlockReceiverAudioContext() {
  if (!audioContextReceiver) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioContextReceiver = new AudioCtx();
    }
  }
  if (audioContextReceiver && audioContextReceiver.state === "suspended") {
    audioContextReceiver.resume().catch(() => {});
  }
}

function enterCallUI() {
  inCall = true;
  callStartedAt = Date.now();
  if (callTimer) callTimer.textContent = "0:00";
  if (videoGrid) videoGrid.innerHTML = "";

  unlockReceiverAudioContext();
  playSfx("join");
  updateActiveCallBanner();

  if (callTypeIndicator) {
    callTypeIndicator.textContent = currentCallType === "video" ? "📹 VIDEO CALL" : "📞 VOICE CALL";
  }
  if (callRoomLabel) callRoomLabel.textContent = `Room #${currentRoom}`;

  if (muteButton) muteButton.classList.toggle("off", isMicMuted);
  if (cameraButton) cameraButton.classList.toggle("off", isCameraOff);

  const selfTile = createVideoTile("me", `${currentUsername} (You)`, true, !isCameraOff, !isMicMuted);
  if (selfTile.video && localStream) {
    selfTile.video.srcObject = localStream;
    localVideoElement = selfTile.video;
  }
  updateSelfTileMirror();

  if (callScreen) callScreen.classList.remove("hidden");
  if (incomingCall) incomingCall.classList.add("hidden");

  updateVideoGridLayout();

  callChatUnreadCount = 0;
  isCallChatOpen = false;
  if (callChatBadge) callChatBadge.classList.add("hidden");
  if (callChatDrawer) callChatDrawer.classList.add("hidden");

  startLiveStreamingPipes();

  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    if (callTimer) {
      callTimer.textContent = formatDuration(Math.floor((Date.now() - callStartedAt) / 1000));
    }
  }, 1000);
}

function updateSelfTileMirror() {
  const selfTile = videoGrid ? videoGrid.querySelector('[data-peer-id="me"]') : null;
  if (selfTile) {
    if (currentFacingMode === "user") {
      selfTile.classList.add("mirrored");
      selfTile.classList.remove("unmirrored");
    } else {
      selfTile.classList.remove("mirrored");
      selfTile.classList.add("unmirrored");
    }
  }
}

function exitCallUI() {
  clearInterval(callTimerInterval);
  stopLiveStreamingPipes();

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  remotePeers.clear();
  peerAudioNextTimes.clear();
  playSfx("leave");

  if (videoGrid) videoGrid.innerHTML = "";
  if (callScreen) callScreen.classList.add("hidden");
  if (incomingCall) incomingCall.classList.add("hidden");
  inCall = false;
  incomingCallData = null;

  updateActiveCallBanner();
}

function startLiveStreamingPipes() {
  stopLiveStreamingPipes();

  // 1. PROPORTIONAL VIDEO SENDER (bandwidth-throttled)
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement("canvas");
    offscreenCtx = offscreenCanvas.getContext("2d", { alpha: false });
  }

  videoFrameSenderInterval = setInterval(() => {
    if (!inCall || isCameraOff || !localVideoElement || localVideoElement.paused || localVideoElement.ended) {
      return;
    }
    // BANDWIDTH GUARD: nobody else is in the call, so don't upload frames to nobody.
    if (remotePeers.size === 0) return;

    const vw = localVideoElement.videoWidth;
    const vh = localVideoElement.videoHeight;
    if (vw > 0 && vh > 0) {
      try {
        const maxDim = VIDEO_MAX_DIM;
        let targetW = vw;
        let targetH = vh;
        if (vw > vh) {
          targetW = maxDim;
          targetH = Math.round((vh * maxDim) / vw);
        } else {
          targetH = maxDim;
          targetW = Math.round((vw * maxDim) / vh);
        }

        if (offscreenCanvas.width !== targetW || offscreenCanvas.height !== targetH) {
          offscreenCanvas.width = targetW;
          offscreenCanvas.height = targetH;
        }

        offscreenCtx.drawImage(localVideoElement, 0, 0, targetW, targetH);
        const frameData = offscreenCanvas.toDataURL("image/jpeg", VIDEO_JPEG_QUALITY);

        // BANDWIDTH GUARD: skip near-identical frames (static scene / phone on table).
        if (frameData.length === lastSentFrameLength) {
          staticFrameSkips++;
          // still send 1 keyframe every ~2s so late joiners aren't stuck on black
          if (staticFrameSkips < Math.round(2000 / VIDEO_FRAME_INTERVAL_MS)) return;
        }
        staticFrameSkips = 0;
        lastSentFrameLength = frameData.length;

        socket.emit("video-frame", { frame: frameData });
      } catch (e) {}
    }
  }, VIDEO_FRAME_INTERVAL_MS);


  // 2. ULTRA-LEAN MULTI-PEER WEB AUDIO PCM SENDER WITH SENSITIVE VAD
  if (localStream && localStream.getAudioTracks().length > 0) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContextSender = new AudioCtx();
        if (audioContextSender.state === "suspended") {
          audioContextSender.resume().catch(() => {});
        }
        audioSourceNode = audioContextSender.createMediaStreamSource(localStream);

        // Highly sensitive VAD threshold for mobile microphones
        const VAD_THRESHOLD = 0.002;
        let vadHangover = 0;
        const HANGOVER_MAX = 14; // ~600ms hangover to prevent clipping natural pauses

        audioProcessorNode = audioContextSender.createScriptProcessor(2048, 1, 1);
        audioProcessorNode.onaudioprocess = (e) => {
          if (!inCall || isMicMuted) return;
          // BANDWIDTH GUARD: alone in the call -> don't upload audio to nobody.
          if (remotePeers.size === 0) return;

          const inputChannel = e.inputBuffer.getChannelData(0);

          let energySum = 0;
          for (let i = 0; i < inputChannel.length; i++) {
            energySum += inputChannel[i] * inputChannel[i];
          }
          const rms = Math.sqrt(energySum / inputChannel.length);

          if (rms > VAD_THRESHOLD) {
            vadHangover = HANGOVER_MAX;
          } else if (vadHangover > 0) {
            vadHangover--;
          } else {
            // Silence detected: do not transmit
            return;
          }

          // Downsample to 16kHz
          const inputRate = audioContextSender.sampleRate || 48000;
          const downsampleFactor = Math.max(1, Math.round(inputRate / 16000));
          const targetLength = Math.floor(inputChannel.length / downsampleFactor);
          const pcm16 = new Int16Array(targetLength);

          let outIdx = 0;
          for (let i = 0; i < inputChannel.length && outIdx < targetLength; i += downsampleFactor) {
            const s = Math.max(-1, Math.min(1, inputChannel[i]));
            pcm16[outIdx++] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

          socket.emit("audio-pcm", {
            pcm: pcm16.buffer,
            sampleRate: Math.round(inputRate / downsampleFactor),
          });
        };

        audioSourceNode.connect(audioProcessorNode);
        // A ScriptProcessor only fires while connected to a destination, but
        // routing it straight to the speakers risks mic feedback/echo on some
        // browsers. Route through a muted gain node instead: keeps the
        // processor alive, guarantees nothing is played back locally.
        audioSilentGain = audioContextSender.createGain();
        audioSilentGain.gain.value = 0;
        audioProcessorNode.connect(audioSilentGain);
        audioSilentGain.connect(audioContextSender.destination);

      }
    } catch (e) {
      console.warn("PCM voice sender error:", e);
    }
  }
}

function stopLiveStreamingPipes() {
  if (videoFrameSenderInterval) {
    clearInterval(videoFrameSenderInterval);
    videoFrameSenderInterval = null;
  }
  lastSentFrameLength = 0;
  staticFrameSkips = 0;
  if (audioProcessorNode) {
    try {
      audioProcessorNode.onaudioprocess = null;
      audioProcessorNode.disconnect();
      if (audioSilentGain) audioSilentGain.disconnect();
      if (audioSourceNode) audioSourceNode.disconnect();
      if (audioContextSender) audioContextSender.close();
    } catch (e) {}
    audioProcessorNode = null;
    audioSilentGain = null;
    audioSourceNode = null;
    audioContextSender = null;
  }
}

// RECEIVE AND RENDER REMOTE VIDEO FRAMES
socket.on("video-frame", ({ from, frame }) => {
  if (!inCall) return;
  let peer = remotePeers.get(from);
  if (!peer) {
    peer = createVideoTile(from, "Guest", false, true, true);
    remotePeers.set(from, peer);
  }
  if (peer.imgFeed) {
    peer.imgFeed.src = frame;
    peer.imgFeed.style.display = "block";
    if (peer.avatar) peer.avatar.classList.add("hidden");
  }
});

// RECEIVE AND PLAY REAL-TIME PCM AUDIO
socket.on("audio-pcm", ({ from, pcm, sampleRate }) => {
  // NOTE: isMicMuted must NOT be checked here. Muting your own microphone
  // should stop you SENDING, never stop you HEARING other people.
  if (!inCall || !pcm) return;
  try {
    unlockReceiverAudioContext();
    if (!audioContextReceiver) return;

    const int16 = new Int16Array(pcm);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }

    const rate = sampleRate || 16000;
    const audioBuffer = audioContextReceiver.createBuffer(1, float32.length, rate);
    audioBuffer.copyToChannel(float32, 0);

    const source = audioContextReceiver.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextReceiver.destination);

    const currentTime = audioContextReceiver.currentTime;
    let peerNext = peerAudioNextTimes.get(from) || 0;
    if (peerNext < currentTime) {
      peerNext = currentTime + 0.02;
    }
    source.start(peerNext);
    peerAudioNextTimes.set(from, peerNext + audioBuffer.duration);
  } catch (e) {
    console.warn("PCM audio decode error:", e);
  }
});

function createVideoTile(id, label, isSelf, videoEnabled, audioEnabled) {
  removeVideoTile(id);

  const tile = document.createElement("div");
  tile.className = `video-tile ${isSelf ? "self-tile mirrored" : ""}`;
  tile.dataset.peerId = id;
  tile.style.setProperty("--tile-hue", getUsernameHue(label));

  let video = null;
  let imgFeed = null;

  if (isSelf) {
    video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    tile.appendChild(video);
  } else {
    // Remote peer: Clean <img> element for frame rendering (NO blank <video> blocking it!)
    imgFeed = document.createElement("img");
    imgFeed.className = "remote-frame-feed";
    imgFeed.style.width = "100%";
    imgFeed.style.height = "100%";
    imgFeed.style.objectFit = "contain";
    imgFeed.style.display = "block";
    tile.appendChild(imgFeed);
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

  tile.appendChild(avatar);
  tile.appendChild(tag);

  if (videoGrid) {
    videoGrid.appendChild(tile);
    updateVideoGridLayout();
  }

  tile.addEventListener("click", () => {
    unlockReceiverAudioContext();
  });

  const peerObj = { tile, video, imgFeed, avatar, tag, micIcon, nameSpan, username: label };
  if (!isSelf) {
    remotePeers.set(id, peerObj);
  }

  return peerObj;
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

socket.on("call-peers", (peers) => {
  if (!inCall) return;
  peers.forEach((p) => {
    createVideoTile(p.id, p.username, false, p.videoEnabled, p.audioEnabled);
  });
});

socket.on("call-peer-joined", ({ id, username, videoEnabled, audioEnabled }) => {
  if (!inCall) return;
  createVideoTile(id, username, false, videoEnabled, audioEnabled);
  playSfx("join");
});

socket.on("call-peer-media-state", ({ id, video, audio }) => {
  const peer = remotePeers.get(id);
  if (!peer) return;
  if (typeof video === "boolean") {
    peer.avatar.classList.toggle("hidden", video);
    if (!video && peer.imgFeed) peer.imgFeed.style.display = "none";
  }
  if (typeof audio === "boolean") {
    peer.micIcon.className = `video-tag-icon ${!audio ? "muted" : ""}`;
    peer.micIcon.textContent = audio ? "🎙️" : "🔇";
  }
});

socket.on("call-peer-left", ({ id }) => {
  remotePeers.delete(id);
  peerAudioNextTimes.delete(id);
  removeVideoTile(id);
  playSfx("leave");
});

socket.on("call-ended", () => {
  if (inCall) {
    localSystemMessage("Call ended.");
    exitCallUI();
  }
});

/* =========================================
   CALL CONTROLS
========================================= */

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
          video: { facingMode: currentFacingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        });
        const newTrack = camStream.getVideoTracks()[0];
        localStream.addTrack(newTrack);
        if (localVideoElement) localVideoElement.srcObject = localStream;
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
    const targetMode = currentFacingMode === "user" ? "environment" : "user";
    const oldTrack = localStream.getVideoTracks()[0];

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetMode, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      const newTrack = newStream.getVideoTracks()[0];

      if (oldTrack) {
        localStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      localStream.addTrack(newTrack);

      currentFacingMode = targetMode;

      if (localVideoElement) {
        localVideoElement.srcObject = localStream;
      }

      updateSelfTileMirror();
      showToast(currentFacingMode === "user" ? "Front Camera" : "Back Camera");
    } catch (err) {
      console.warn("Camera flip error:", err);
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
  if (callChatMessages) callChatMessages.innerHTML = "";
  playSfx("reset");
  showToast("Chat cleared for room.", "danger");
});

if (resetButton) {
  resetButton.addEventListener("click", () => {
    if (confirm("Reset and clear all messages in this room?")) {
      socket.emit("reset-chat");
      playSfx("reset");
    }
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
  toast.className = `toast ${type === "success" ? "toast-success" : type === "danger" ? "toast-danger" : ""}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-12px) scale(0.95)";
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


