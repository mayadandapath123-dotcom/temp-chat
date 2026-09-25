(function () {
  'use strict';
  let leaving = false;
  async function leave(force = false, reason = "") {
    if (leaving || (!force && !joinedChat)) return;
    if (!force && !confirm(`Exit room #${currentRoom}?\n\nThis ends your call, clears this tab’s chat and stops its room alerts. Other members and their chat are not cleared.`)) return;
    leaving = true; window.__tempChatExiting = true;
    document.querySelectorAll('.tc-exit-room').forEach(b => { b.disabled = true; b.textContent = 'Exiting…'; });
    const token = window.TempChatNotifications.token();
    joinedChat = false; clearInterval(presenceHeartbeat); clearTimeout(typingTimeout);
    recordSendOnStop = false; try { stopVoiceRecording(false); } catch (_) {}
    try { currentVoiceAudio?.pause(); } catch (_) {}
    if (window.__isScreenSharing) document.getElementById('screen-share-button')?.click();
    document.getElementById('camera-close-btn')?.click();
    try { exitCallUI(); } catch (_) {}
    // Also stop all DOM-held preview tracks, including a screen-share stream.
    document.querySelectorAll('video').forEach(v => { try { v.srcObject?.getTracks().forEach(t => t.stop()); v.srcObject = null; } catch (_) {} });
    try { closeAndViewOnceDestroy(); ephemeralPhotoStore.clear(); } catch (_) {}
    window.TempChatReplies?.clear();
    if (messages) messages.replaceChildren(); if (callChatMessages) callChatMessages.replaceChildren();
    if (messageInput) messageInput.value = ''; if (callChatInput) callChatInput.value = '';
    clearPhotoPreview();
    const ack = new Promise(resolve => {
      if (!socket.connected) return resolve();
      socket.timeout(2500).emit('leave-room', { token }, () => resolve());
    });
    const disable = window.TempChatNotifications.stopRoom().catch(() => {});
    await Promise.race([Promise.all([ack, disable]), new Promise(r => setTimeout(r, 6000))]);
    socket.disconnect();
    // A fresh document disposes all timers, media decoders, object URLs and JS
    // message state; replace removes the active-room URL from this history entry.
    if (reason) { try { sessionStorage.setItem('tempchat_exit_notice', reason.slice(0, 180)); } catch (_) {} }
    window.location.replace('/');
  }
  function button(parent) {
    if (!parent) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tc-exit-room'; b.textContent = 'Exit Room'; b.title = 'Leave this room (only your session)'; b.onclick = () => leave(); parent.append(b);
  }
  window.TempChatExit = { force: reason => leave(true, reason) };
  button(document.querySelector('.tc-room-tools'));
  button(document.querySelector('.call-screen-header'));
  const guide = document.querySelector('.guide-sections');
  if (guide) {
    const section = document.createElement('div'); section.className = 'guide-section-item';
    const title = document.createElement('h5'); title.textContent = '↗ Links and Exit Room';
    const description = document.createElement('p'); description.textContent = 'Tap website links to open them in a new tab. Share /?room=CODE or /room/CODE to prefill a room without auto-joining. Exit Room stops your camera, microphone and this tab’s alerts and returns to the join screen; it does not erase other people’s chat.';
    section.append(title, description); guide.prepend(section);
  }
})();
