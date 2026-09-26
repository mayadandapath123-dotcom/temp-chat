/* Retention notice + explicit acknowledgement before joining archived rooms. */
(function () {
  'use strict';
  let policy = null;
  const box = document.getElementById('archive-retention-notice');
  const checkbox = document.getElementById('archive-retention-ack');
  function update(value) {
    policy = value;
    box.dataset.enabled = String(Boolean(value.enabled));
    document.getElementById('archive-retention-status').textContent = value.enabled
      ? '7-day admin archive is ON: text, normal photos and voice notes are retained. View-once photos and calls are excluded. Reset only clears live chat.'
      : 'Admin archiving is currently OFF. Live chat remains temporary.';
    document.getElementById('archive-ack-label').classList.toggle('hidden', !value.enabled);
    document.querySelectorAll('.eyebrow-pill').forEach(n => n.textContent = value.enabled ? 'TEMPORARY ROOMS • 7-DAY ARCHIVE' : 'TEMPORARY CHAT');
  }
  async function load() { try { const r = await fetch('/api/archive/policy', { cache:'no-store' }); if (!r.ok) throw new Error(); update(await r.json()); } catch (_) { document.getElementById('archive-retention-status').textContent = 'Retention policy is not available yet. Wait for the connection or reload before joining.'; } }
  window.TempChatArchive = {
    allowJoin() {
      if (!policy) { showToast('Checking the retention policy. Please wait and try again.'); load(); return false; }
      if (policy.enabled && !checkbox.checked) { showToast('Read and acknowledge the 7-day retention notice before joining.'); checkbox.focus(); return false; }
      return true;
    },
    consent: () => policy?.enabled && checkbox.checked ? 'archive-v1' : null,
  };
  socket.on('archive-policy', update);
  socket.on('connect', load);
  load();
})();
