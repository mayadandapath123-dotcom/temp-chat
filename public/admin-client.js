/* Verified role indicators and visible moderation. No admin key is ever sent
   in a room URL, public script, localStorage or Socket.IO message. */
(function () {
  'use strict';
  window.TempChatAdminMode = new URLSearchParams(location.search).get('admin') === '1';
  const presence = document.createElement('div'); presence.className = 'tc-admin-presence hidden';
  presence.textContent = '◆ Admin is present · this moderation visit is visible to everyone';
  document.querySelector('.tc-room-tools')?.after(presence);
  socket.on('presence-update', people => presence.classList.toggle('hidden', !people.some(p => p.isAdmin)));
  socket.on('room-ready', data => {
    if (data.username) currentUsername = data.username;
    if (data.isAdmin) showToast('Joined visibly as verified Admin. Only new messages are available.');
  });
  socket.on('join-error', data => {
    joinedChat = false; clearInterval(presenceHeartbeat);
    if (inCall || localStream) { try { exitCallUI(); } catch (_) {} }
    window.TempChatNotifications.stopRoom().catch(() => {});
    chatScreen?.classList.add('hidden'); joinScreen?.classList.remove('hidden');
    showToast(data?.error || 'Could not join this room.');
  });
  socket.on('moderation-exit', data => {
    socket.io.opts.reconnection = false;
    window.TempChatExit.force(data?.reason || 'Your session was ended by Admin.');
  });
  const original = window.TempChatPlus.track;
  window.TempChatPlus.track = function (data, element) {
    original(data, element);
    if (!data?.isAdmin) return;
    const author = element.querySelector('.message-bubble > strong') || element.querySelector(':scope > strong');
    if (author) { const badge = document.createElement('span'); badge.className = 'tc-admin-badge'; badge.textContent = 'ADMIN'; author.append(badge); }
  };
  function setup() {
    if (window.TempChatAdminMode) {
      usernameInput.value = 'Admin'; usernameInput.readOnly = true;
      if (randomizeBtn) randomizeBtn.disabled = true;
      const notice = document.createElement('p'); notice.className = 'tc-admin-entry-note';
      notice.append(document.createTextNode('Verified admin entry. Sign in at '));
      const link = document.createElement('a'); link.href = '/admin'; link.textContent = 'the owner console'; notice.append(link, document.createTextNode(' first. Your visit will be announced.'));
      joinForm?.before(notice);
    }
    try {
      const reason = sessionStorage.getItem('tempchat_exit_notice'); sessionStorage.removeItem('tempchat_exit_notice');
      if (reason) {
        const note = document.createElement('p'); note.className = 'tc-admin-entry-note'; note.textContent = reason; joinForm?.before(note);
      }
    } catch (_) {}

  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();
