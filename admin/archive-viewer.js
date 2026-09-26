(function () {
  'use strict';
  let api, onUnauthorized, authenticated = false, epoch = 0, selected = null, cursor = null, busy = false, requestId = 0, roomOffset = 0;
  const urls = new Set(), $ = id => document.getElementById(id);
  const el = (tag, text = '', cls = '') => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
  const size = value => { const n = Number(value || 0); return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(2)} MiB`; };
  const date = s => new Date(s).toLocaleString();
  function clearMedia() { document.querySelectorAll('#archive-messages audio').forEach(a => a.pause()); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); $('archive-messages')?.replaceChildren(); }
  function close() { epoch++; requestId++; busy = false; selected = null; cursor = null; clearMedia(); if ($('archive-viewer')?.open) $('archive-viewer').close(); }
  function setAuthenticated(value) { authenticated = value; if (!value) { close(); $('archive-rooms')?.replaceChildren(); if ($('archive-status')) $('archive-status').textContent = 'Sign in to view archives.'; } }
  async function load(reset = true) {
    if (!authenticated) return;
    const generation = epoch; $('archive-load').disabled = true; $('archive-status').textContent = 'Checking encrypted archive storage…';
    try {
      const status = await api('archive/status'); if (!authenticated || generation !== epoch) return;
      $('archive-storage').replaceChildren();
      const text = !status.enabled ? status.error : !status.ready ? status.error || 'Archive database is not ready.' : `Archive ON · ${status.events} retained events · ${status.chunks} encrypted batches.`;
      $('archive-status').textContent = text + (status.ready && status.error ? ' Warning: ' + status.error : '');
      if (!status.ready) { $('archive-rooms').replaceChildren(); return; }
      $('archive-storage').append(el('p', `${size(status.stored_bytes)} encrypted payload / ${size(status.budgetBytes)} safety budget · Original JSON ${size(status.raw_bytes)} · Database size ${size(status.database_bytes)}`, 'fine'));
      $('archive-storage').append(el('p', `Last expiry cleanup: ${status.lastCleanup ? date(status.lastCleanup) : 'not yet recorded'} · Pending ${size(status.pendingBytes)} · Dropped/failed events since restart: ${status.metrics?.droppedEvents || 0}`, 'fine'));
      const offset = reset ? 0 : roomOffset;
      $('archive-storage').append(el('p', `External cleanup check: ${status.lastExternalCleanup ? date(status.lastExternalCleanup) : 'not verified — configure and run the hourly GitHub workflow'}`, 'fine'));
      const data = await api('archive/rooms?offset=' + offset); if (!authenticated || generation !== epoch) return;
      if (reset) $('archive-rooms').replaceChildren();
      roomOffset = data.nextOffset || 0; $('archive-more-rooms').classList.toggle('hidden', data.nextOffset === null);
      if (reset && !data.rooms.length) $('archive-rooms').append(el('p', 'No unexpired archives yet. New eligible messages will appear after a short batch flush.', 'fine'));
      for (const room of data.rooms) {
        const row = el('div', '', 'archive-session-row'), label = el('div'); label.append(el('strong', '#' + room.room), el('small', `${date(room.started_at)} · ${room.events} events · ${size(room.bytes)}`), el('small', `Next batch expires ${date(room.next_expiry)}`));
        const actions = el('div', '', 'archive-actions'), view = el('button', 'View chat', 'secondary compact'), remove = el('button', 'Delete', 'secondary compact danger-text');
        view.onclick = () => open(room); remove.onclick = async () => {
          if (prompt(`Delete retained history for #${room.room}, session starting ${date(room.started_at)}? New messages may still be archived. Type DELETE to confirm.`) !== 'DELETE') return;
          remove.disabled = true;
          try { await api('archive/delete', { instance: room.instance, confirmation: 'DELETE' }); if (selected?.instance === room.instance) close(); await load(); }
          catch (e) { handle(e); } finally { remove.disabled = false; }
        };
        actions.append(view, remove); row.append(label, actions); $('archive-rooms').append(row);
      }
    } catch (e) { if (generation === epoch) handle(e); } finally { $('archive-load').disabled = false; }
  }
  function handle(error) { if (error.status === 401) { onUnauthorized?.(); return; } $('archive-status').textContent = error.name === 'AbortError' ? 'Archive request timed out. Try again on a stable connection.' : error.message; }
  async function open(room) {
    close(); selected = room; cursor = null; $('archive-title').textContent = '#' + room.room;
    $('archive-view-status').textContent = ''; $('archive-viewer').showModal(); await page();
  }
  async function page() {
    if (!selected || busy || !authenticated) return;
    busy = true; $('archive-older').disabled = true; $('archive-view-status').textContent = 'Decrypting the requested batches…';
    const generation = epoch, session = selected, request = ++requestId;
    try {
      const query = 'archive/messages?instance=' + encodeURIComponent(session.instance) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
      const data = await api(query); if (!authenticated || epoch !== generation || selected !== session) return;
      const fragment = document.createDocumentFragment();
      for (const message of data.events) fragment.append(renderMessage(message, generation));
      $('archive-messages').prepend(fragment); cursor = data.next;
      $('archive-older').classList.toggle('hidden', !cursor || !data.events.length);
      $('archive-view-status').textContent = data.events.length ? 'Only this page was decoded. Load individual media below when needed.' : 'No more unexpired messages. Deleted/expired archives cannot be reopened.';
    } catch (e) { if (generation !== epoch) return; if (e.status === 401) onUnauthorized?.(); else $('archive-view-status').textContent = e.message; }
    finally { if (request === requestId) { busy = false; $('archive-older').disabled = false; } }
  }
  function renderMessage(message, generation) {
    const bubble = el('article', '', 'archive-message' + (message.isAdmin ? ' from-admin' : ''));
    bubble.dataset.expires = String(new Date(message.expiresAt).getTime());
    bubble.append(el('strong', message.username + (message.isAdmin ? ' · ADMIN' : ''), 'archive-author'));
    if (message.reply) { const q = el('div', '', 'archive-quote'); q.append(el('strong', message.reply.username), el('span', message.reply.text)); bubble.append(q); }
    if (message.type === 'text') { const text = el('p'); window.TempChatLinks.fill(text, message.text); bubble.append(text); }
    else {
      bubble.classList.add('archive-media-message');
      bubble.append(el('p', message.type === 'photo' ? 'Photo' : 'Voice note', 'archive-media-label'));
      if (message.caption) { const caption = el('p'); window.TempChatLinks.fill(caption, message.caption); bubble.append(caption); }
      const button = el('button', message.type === 'photo' ? 'Load photo' : 'Load voice note', 'secondary compact');
      button.onclick = async () => {
        button.disabled = true;
        try {
          const response = await fetch('/api/admin/archive/media?chunk=' + encodeURIComponent(message.chunkId) + '&event=' + encodeURIComponent(message.id), { credentials: 'same-origin', cache:'no-store' });
          if (generation !== epoch || !authenticated) return;
          if (response.status === 401) { onUnauthorized?.(); return; }
          if (!response.ok) throw new Error('Media expired, was deleted or could not load.');
          const blob = await response.blob();
          if (!authenticated || generation !== epoch || !bubble.isConnected || Number(bubble.dataset.expires) <= Date.now()) return;
          const url = URL.createObjectURL(blob); urls.add(url);
          if (message.type === 'photo') { const image = document.createElement('img'); image.alt = 'Archived photo from ' + message.username; image.src = url; image.className = 'archive-photo'; button.replaceWith(image); }
          else { const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = url; button.replaceWith(audio); }
        } catch (e) { button.textContent = e.message; button.disabled = false; }
      };
      bubble.append(button);
    }
    bubble.append(el('small', date(message.at), 'archive-time')); return bubble;
  }
  function mount(options) {
    api = options.api; onUnauthorized = options.onUnauthorized;
    $('archive-load').onclick = () => load(true); $('archive-more-rooms').onclick = () => load(false); $('archive-close').onclick = close; $('archive-older').onclick = page;
    $('archive-viewer').addEventListener('cancel', event => { event.preventDefault(); close(); });
    $('archive-purge').onclick = async () => { if (!authenticated) return; try { await api('archive/cleanup', {}); await load(); } catch (e) { handle(e); } };
    setInterval(() => {
      if (!$('archive-viewer').open) return;
      for (const row of document.querySelectorAll('#archive-messages [data-expires]')) if (Number(row.dataset.expires) <= Date.now()) { row.querySelectorAll('audio').forEach(a => a.pause()); row.querySelectorAll('img,audio').forEach(n => { if (n.src.startsWith('blob:')) { URL.revokeObjectURL(n.src); urls.delete(n.src); } }); row.replaceChildren(el('p', 'This archived batch has expired.')); }
    }, 30000);
  }
  window.TempChatArchiveViewer = { mount, setAuthenticated };
})();
