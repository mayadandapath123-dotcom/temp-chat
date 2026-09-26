/* Visible retention notice; no checkbox. The protocol marker indicates only
   which notice this client supports, not consent or proof that it was read. */
(function () {
  'use strict';
  let policy = null;
  const box = document.getElementById('archive-retention-notice');
  function update(value) {
    policy = value;
    box.dataset.enabled = String(Boolean(value.enabled));
    document.getElementById('archive-retention-status').textContent = value.enabled
      ? 'Text, normal photos and voice notes may be kept for admin review for up to 7 days. View-once photos and calls are excluded. Reset clears live chat only.'
      : 'Admin archiving is currently OFF. Live chat remains temporary.';
    document.querySelectorAll('.eyebrow-pill').forEach(n => n.textContent = value.enabled ? 'TEMPORARY ROOMS • 7-DAY ARCHIVE' : 'TEMPORARY CHAT');
  }
  async function load() { try { const r = await fetch('/api/archive/policy', { cache:'no-store' }); if (!r.ok) throw new Error(); update(await r.json()); } catch (_) { document.getElementById('archive-retention-status').textContent = 'Retention policy is not available yet. Wait for the connection or reload before joining.'; } }
  window.TempChatArchive = {
    allowJoin() {
      if (!policy) { showToast('Checking the retention policy. Please wait and try again.'); load(); return false; }
      return true;
    },
    noticeVersion: () => policy?.enabled ? 'archive-v1' : null,
  };
  socket.on('archive-policy', update);
  socket.on('connect', load);
  load();
})();
