(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const node = (tag, value = '', cls = '') => { const el = document.createElement(tag); el.textContent = value; if (cls) el.className = cls; return el; };
  let authGeneration = 0;
  let csrf = '', snapshot = null, selected = null, pending = null, inFlight = false, pollTimer = null, toastTimer, expiryTimer;
  const duration = ms => { const n = Math.max(0, Math.floor((ms || 0) / 1000)); return n >= 3600 ? `${Math.floor(n / 3600)}h ${Math.floor(n % 3600 / 60)}m` : n >= 60 ? `${Math.floor(n / 60)}m ${n % 60}s` : `${n}s`; };
  const bytes = n => !n ? '0 B' : n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;
  const time = value => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  function toast(message) { $('admin-toast').textContent = message; $('admin-toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('admin-toast').classList.add('hidden'), 4000); }
  async function api(url, data) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/admin/' + url, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: controller.signal });
      const value = await response.json();
      if (!response.ok) { const error = new Error(value.error || 'Request failed.'); error.status = response.status; throw error; }
      return value;
    } finally { clearTimeout(timer); }
  }
  function loggedOut(message = '') {
    authGeneration++; csrf = ''; snapshot = null; selected = null; clearTimeout(pollTimer); clearTimeout(expiryTimer);
    $('console-view').classList.add('hidden'); $('login-view').classList.remove('hidden');
    $('room-list').replaceChildren(); $('room-detail').replaceChildren(); $('audit-list').replaceChildren(); $('login-error').textContent = message;
    if ($('action-dialog').open) $('action-dialog').close();
  }
  function loggedIn(session) {
    authGeneration++; csrf = session.csrf;
    $('login-view').classList.add('hidden'); $('console-view').classList.remove('hidden');
    $('session-expiry').textContent = `Expires ${time(session.expiresAt)}`;
    clearTimeout(expiryTimer); expiryTimer = setTimeout(() => loggedOut('Session expired. Sign in again.'), Math.max(0, Math.min(8 * 3600000, session.expiresAt - Date.now())));
    refresh();
  }
  async function refresh() {
    if (!csrf || inFlight) return; const generation = authGeneration; clearTimeout(pollTimer); inFlight = true; $('refresh-button').disabled = true;
    try {
      const fresh = await api('snapshot');
      if (generation !== authGeneration || !csrf) return;
      snapshot = fresh; $('console-error').textContent = '';
      $('sync-label').replaceChildren(node('i', '', 'live-dot'), document.createTextNode(' Live · ' + time(snapshot.serverNow)));
      render();
    } catch (error) {
      if (generation !== authGeneration) return;
      if (error.status === 401) loggedOut('Session ended. Sign in again.');
      else { $('console-error').textContent = error.name === 'AbortError' ? 'Refresh timed out. Your last snapshot may be stale.' : error.message; $('sync-label').textContent = 'Connection interrupted'; }
    } finally { inFlight = false; $('refresh-button').disabled = false; if (csrf) pollTimer = setTimeout(() => { if (!document.hidden) refresh(); else scheduleHidden(); }, 5000); }
  }
  function scheduleHidden() { pollTimer = setTimeout(() => { if (!document.hidden) refresh(); else scheduleHidden(); }, 10000); }
  function empty(parent, title, description) { const box = node('div', '', 'empty'); box.append(node('span', '◌'), node('h3', title), node('p', description)); parent.append(box); }
  function render() {
    const d = snapshot;
    $('stat-rooms').textContent = d.live.rooms;
    $('stat-locks').textContent = `${d.rooms.filter(r => r.locked).length} entry locks`;
    $('stat-members').textContent = d.live.members; $('stat-presence').textContent = `${d.live.active} active · ${d.live.away} away`;
    $('stat-calls').textContent = d.live.callRooms; $('stat-admins').textContent = `${d.live.admins} admin session${d.live.admins === 1 ? '' : 's'} in rooms`;
    $('stat-bytes').textContent = bytes(d.totals.relayBytes); $('server-uptime').textContent = duration(d.uptimeSeconds * 1000);
    $('server-memory').textContent = `${d.memoryMB} MB process memory · ${d.totals.joins} joins since restart`;
    $('truncation-note').classList.toggle('hidden', !d.truncated);
    renderRooms(); renderDetail(); renderAudit();
  }
  function renderRooms() {
    if (!snapshot) return;
    const query = $('room-search').value.trim().toLowerCase(), filter = $('room-filter').value;
    const rooms = snapshot.rooms.filter(r => (r.room.toLowerCase().includes(query) || r.members.some(m => m.username.toLowerCase().includes(query))) && (filter === 'all' || filter === 'calls' && r.callCount > 0 || filter === 'locked' && r.locked));
    $('room-count').textContent = rooms.length; $('room-list').replaceChildren();
    if (!rooms.length) return empty($('room-list'), query || filter !== 'all' ? 'No matching rooms' : 'It’s quiet here.', query || filter !== 'all' ? 'Try another search or filter.' : 'Live rooms will appear as people join TempChat.');
    for (const r of rooms) {
      const card = node('button', '', 'room-card' + (selected === r.room ? ' selected' : '')); card.type = 'button';
      const left = node('div', '', 'room-card-main'); left.append(node('span', '#', 'room-icon'));
      const names = node('div'); names.append(node('strong', r.room), node('small', r.members.length ? r.members.slice(0, 3).map(p => p.username).join(', ') + (r.members.length > 3 ? ` +${r.members.length - 3}` : '') : 'No connected members'));
      left.append(names); card.append(left);
      const meta = node('div', '', 'room-card-meta'); meta.append(node('span', `${r.members.length} members`, 'small-tag'));
      if (r.callCount) meta.append(node('span', `${r.callCount} in call`, 'small-tag accent'));
      if (r.locked) meta.append(node('span', 'Locked', 'small-tag warning'));
      card.append(meta); card.onclick = () => { selected = r.room; renderRooms(); renderDetail(); }; $('room-list').append(card);
    }
  }
  function stat(label, value) { const n = node('div'); n.append(node('strong', String(value)), node('small', label)); return n; }
  function actionButton(parent, label, action, room, member, cls = 'secondary') { const b = node('button', label, cls); b.type = 'button'; b.onclick = () => openAction(action, room, member); parent.append(b); return b; }
  function renderDetail() {
    const parent = $('room-detail'); parent.replaceChildren();
    const room = snapshot?.rooms.find(r => r.room === selected);
    if (!room) return empty(parent, selected ? 'This room has ended' : 'Select a room', 'Choose a live room to see current sessions and moderation controls.');
    const heading = node('div', '', 'detail-heading'); const title = node('div'); title.append(node('span', 'ROOM INSPECTOR', 'eyebrow'), node('h2', '#' + room.room));
    heading.append(title); const enter = node('a', 'Enter as Admin ↗', 'primary compact'); enter.href = '/?room=' + encodeURIComponent(room.room) + '&admin=1'; enter.target = '_blank'; enter.rel = 'noopener noreferrer'; heading.append(enter); parent.append(heading);
    parent.append(node('p', 'Your visit will be announced. You can see new messages after joining, not past history.', 'detail-note'));
    if (room.locked) parent.append(node('p', `New entry locked until ${time(room.lockedUntil)}. Existing members may continue; verified Admin can enter.`, 'lock-note'));
    const stats = node('div', '', 'room-stats'); stats.append(stat('Text messages', room.text), stat('Photos', room.photo), stat('Voice notes', room.voice), stat('Relay payload', bytes(room.relayBytes))); parent.append(stats);
    const actions = node('div', '', 'room-actions');
    actionButton(actions, room.locked ? 'Unlock entry' : 'Lock entry · 1h', room.locked ? 'unlock' : 'lock', room);
    actionButton(actions, 'End call', 'end-call', room).disabled = !room.callCount;
    actionButton(actions, 'Clear chat', 'clear', room, null, 'secondary danger-text');
    actionButton(actions, 'Close & lock', 'close-room', room, null, 'secondary danger-text'); parent.append(actions);
    const info = node('p', `Created ${time(room.createdAt)} · Last message/media ${time(room.lastActivityAt)} · ${room.callCount} call participants`, 'fine'); parent.append(info);
    const wrap = node('div', '', 'table-wrap'), table = node('table');
    const head = node('thead'), hr = node('tr'); for (const label of ['Member / session', 'State', 'In room', 'Active', 'Away', 'Last signal', 'Call', 'Sent', '']) hr.append(node('th', label)); head.append(hr); table.append(head);
    const body = node('tbody');
    for (const m of room.members) {
      const row = node('tr'), identity = node('td'); const name = node('strong', m.username); identity.append(name);
      if (m.isAdmin) identity.append(node('span', 'ADMIN', 'admin-badge'));
      identity.append(node('small', '…' + m.id.slice(-8), 'session-id')); row.append(identity);
      const status = node('td'); status.append(node('span', m.state, 'state-pill ' + m.state)); row.append(status);
      row.append(node('td', duration(snapshot.serverNow - m.joinedAt)), node('td', duration(m.activeMs)), node('td', duration(m.awayMs)), node('td', m.lastSignalAt ? duration(snapshot.serverNow - m.lastSignalAt) + ' ago' : '—'), node('td', m.inCall ? `${m.camera ? 'Video' : 'Audio'} · ${m.mic ? 'mic on' : 'muted'}` : '—'), node('td', String(m.messages)));
      const remove = node('td'); actionButton(remove, 'Remove', 'kick', room, m, 'row-action'); row.append(remove); body.append(row);
    }
    table.append(body); wrap.append(table); parent.append(wrap);
    if (!room.members.length) parent.append(node('p', 'No connected sessions. The entry lock keeps this room listed until it expires or is unlocked.', 'fine'));
    parent.append(node('p', 'Active/away time is based on browser presence signals, not keyboard activity or proof of attention. “Remove” ends that socket session; anonymous users can return through a new session unless entry is locked. Counters cover this room instance. Relay payload excludes protocol, TLS and static assets—it is not Render’s bandwidth meter.', 'fine detail-footnote'));
  }
  function renderAudit() {
    $('audit-list').replaceChildren();
    if (!snapshot.audit.length) return empty($('audit-list'), 'No activity yet', 'Recent joins and admin actions will appear here.');
    for (const entry of snapshot.audit.slice(0, 40)) {
      const row = node('div', '', 'audit-row'); row.append(node('time', time(entry.at)), node('span', entry.action.replace(/_/g, ' '), 'audit-action'), node('span', entry.room ? '#' + entry.room : 'Console', 'audit-room'), node('span', entry.detail || '—', 'audit-detail')); $('audit-list').append(row);
    }
  }
  function openAction(action, room, member) {
    pending = { action, room: room.room, roomInstanceId: room.instanceId, ...(member ? { socketId: member.id } : {}) };
    const descriptions = {
      lock: ['Lock new entry?', 'New non-admin sessions cannot enter for one hour. Current members stay connected.'],
      unlock: ['Unlock this room?', 'New sessions will be able to enter with this room code again.'],
      kick: ['Remove this session?', `Remove ${member?.username || ''} (session …${member?.id.slice(-8) || ''}). Their call and room session will end. This is not a permanent identity ban.`],
      clear: ['Clear the room chat?', 'Messages, reply metadata and shared appearance will be reset for everyone. Already captured content cannot be recalled.'],
      'end-call': ['End this room’s call?', 'All call participants will be disconnected from this call. Their chat room stays open.'],
      'close-room': ['Close and lock the room?', 'Clear the live room, end its call, remove all sessions and lock entry for one hour.'],
    };
    const [title, description] = descriptions[action]; $('action-title').textContent = title; $('action-description').textContent = description;
    const needsCode = ['clear', 'end-call', 'close-room'].includes(action);
    $('confirm-group').classList.toggle('hidden', !needsCode); $('confirm-room').required = needsCode; $('confirm-room').value = ''; $('confirm-room').placeholder = room.room;
    $('action-reason').value = ''; $('action-error').textContent = ''; $('confirm-action').disabled = false; $('action-dialog').showModal();
    (needsCode ? $('confirm-room') : $('cancel-action')).focus();
  }
  $('action-form').onsubmit = async e => {
    e.preventDefault(); if (!pending) return;
    $('confirm-action').disabled = true;
    try { await api('action', { ...pending, confirmation: $('confirm-room').value, reason: $('action-reason').value }); $('action-dialog').close(); toast('Moderation action completed.'); await refresh(); }
    catch (error) { if (error.status === 401) loggedOut('Session ended. Sign in again.'); else $('action-error').textContent = error.message; }
    finally { $('confirm-action').disabled = false; }
  };
  for (const id of ['cancel-action', 'cancel-action-top']) $(id).onclick = () => $('action-dialog').close();
  $('room-search').oninput = renderRooms; $('room-filter').onchange = renderRooms; $('refresh-button').onclick = refresh;
  for (const link of document.querySelectorAll('.admin-reload-link')) link.addEventListener('click', event => {
    event.preventDefault();
    if ($('action-dialog').open && !confirm('Reload the panel and discard this unfinished moderation form? No action will be submitted.')) return;
    if (navigator.onLine === false && !confirm('Your device appears offline. Reloading may fail until internet access returns. Continue?')) return;
    const url = new URL('/admin', location.origin); url.searchParams.set('_reload', String(Date.now()));
    location.replace(url.href);
  });
  window.addEventListener('online', () => { if (csrf && !document.hidden) refresh(); });
  window.addEventListener('pageshow', event => { if (event.persisted && csrf) refresh(); });
  $('login-form').onsubmit = async e => {
    e.preventDefault(); $('login-button').disabled = true; $('login-error').textContent = '';
    const key = $('admin-key').value; $('admin-key').value = '';
    try { loggedIn(await api('login', { key })); }
    catch (error) { $('login-error').textContent = error.name === 'AbortError' ? 'Login timed out. Try again.' : error.message; }
    finally { $('login-button').disabled = false; }
  };
  $('logout-button').onclick = async () => { try { await api('logout', {}); loggedOut('You have signed out. Admin room sessions have ended.'); } catch (error) { if (error.status === 401) loggedOut(); else $('console-error').textContent = 'Could not confirm logout: ' + error.message; } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && csrf) refresh(); });
  api('session').then(s => { if (s.authenticated) loggedIn(s); else if (!s.configured) $('login-error').textContent = 'Owner setup needed: generate an ADMIN_KEY and add it in Render Environment. See ADMIN-SETUP.md.'; }).catch(e => $('login-error').textContent = e.message);
})();
