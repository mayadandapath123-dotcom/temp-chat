'use strict';
const crypto = require('node:crypto');
const { Pool } = require('pg');
const codec = require('./archive-codec');
const WEEK = 7 * 86400000, BUDGET = 300 * 1024 * 1024, MAX_QUEUE = 32 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
module.exports = function createArchive({ env = process.env, pool: injectedPool, now = Date.now } = {}) {
  const key = codec.keyFrom(env.ARCHIVE_ENCRYPTION_KEY);
  const enabled = Boolean((env.ARCHIVE_DATABASE_URL || injectedPool) && key);
  let pool = injectedPool, initializing, ready = false, lastError = '', lastCleanup = null, queuedBytes = 0, closing = false;
  let chain = Promise.resolve(), flushTimer, cleaning = false;
  const buffers = new Map(), cutoffs = new Map();
  const metrics = { storedEvents: 0, droppedEvents: 0, excludedViewOnce: 0, failures: 0 };
  if (!enabled) lastError = 'Archive disabled. Configure a dedicated ARCHIVE_DATABASE_URL and generated ARCHIVE_ENCRYPTION_KEY.';
  if (enabled && !pool) {
    try {
      const url = new URL(env.ARCHIVE_DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
      url.searchParams.set('sslmode', 'verify-full');
      pool = new Pool({ connectionString: url.href, max: 2, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000, allowExitOnIdle: true, query_timeout: 16000 });
      pool.on('error', () => { lastError = 'Archive database connection interrupted.'; ready = false; initializing = null; });
    } catch (_) { lastError = 'Archive connection configuration is invalid.'; }
  }
  const fail = message => { lastError = message; metrics.failures++; };
  function enqueue(work) { const next = chain.then(work); chain = next.catch(() => {}); return next; }
  async function ensure() {
    if (!enabled || !pool) throw new Error(lastError);
    if (!initializing) initializing = (async () => {
      const client = await pool.connect();
      try {
        const unrelated = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT IN ('tc_archive_chunks','tc_archive_state')");
        if (unrelated.rowCount) throw new Error('DEDICATED_DATABASE_REQUIRED');
        await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout = '15s'"); await client.query('SELECT pg_advisory_xact_lock(78239011)');
        await client.query(`CREATE TABLE IF NOT EXISTS tc_archive_state (name text PRIMARY KEY, value text NOT NULL);
          CREATE TABLE IF NOT EXISTS tc_archive_chunks (
            id uuid PRIMARY KEY, room_instance uuid NOT NULL, room_code varchar(24) NOT NULL,
            started_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
            event_count integer NOT NULL, raw_bytes integer NOT NULL, compressed_bytes integer NOT NULL,
            cipher_bytes integer NOT NULL, payload bytea NOT NULL);
          ALTER TABLE tc_archive_chunks ALTER COLUMN payload SET STORAGE EXTERNAL;
          CREATE INDEX IF NOT EXISTS tc_archive_expiry_idx ON tc_archive_chunks(expires_at);
          CREATE INDEX IF NOT EXISTS tc_archive_room_idx ON tc_archive_chunks(room_instance, started_at DESC, id DESC);`);
        const keyId = crypto.createHash('sha256').update(key).digest('hex');
        await client.query("INSERT INTO tc_archive_state(name,value) VALUES('key_id',$1) ON CONFLICT DO NOTHING", [keyId]);
        const existing = await client.query("SELECT value FROM tc_archive_state WHERE name='key_id'");
        if (existing.rows[0]?.value !== keyId) throw new Error('ARCHIVE_KEY_MISMATCH');
        await client.query('COMMIT'); ready = true; lastError = '';
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        if (e.message === 'DEDICATED_DATABASE_REQUIRED') throw new Error('Use a new, empty dedicated database/project—not the typing website database.');
        if (e.message === 'ARCHIVE_KEY_MISMATCH') throw new Error('Archive encryption key differs from this database. Restore the original key; do not overwrite it.');
        throw new Error('Could not initialize the archive database. Check its URL, SSL access and quota.');
      } finally { client.release(); }
    })().catch(e => { initializing = null; ready = false; const safe = /dedicated|typing website|encryption key differs/.test(e.message) ? e.message : 'Archive database unavailable. Check its URL, SSL settings and quota.'; fail(safe); throw new Error(safe); });
    return initializing;
  }
  async function cleanup(source = 'server') {
    if (!enabled) return { deleted: 0, enabled: false };
    return enqueue(async () => {
      await ensure();
      const removed = await pool.query('DELETE FROM tc_archive_chunks WHERE expires_at <= NOW()');
      lastCleanup = new Date(now()).toISOString();
      await pool.query("INSERT INTO tc_archive_state(name,value) VALUES('last_cleanup',$1) ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value", [lastCleanup]);
      if (source === 'external') await pool.query("INSERT INTO tc_archive_state(name,value) VALUES('last_external_cleanup',$1) ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value", [lastCleanup]);
      return { deleted: removed.rowCount, lastCleanup };
    });
  }
  function schedule() { if (!flushTimer) { flushTimer = setTimeout(() => { flushTimer = null; flush().catch(() => {}); }, 2000); flushTimer.unref?.(); } }
  function capture(socket, instance, type, data) {
    if (!enabled || closing) return;
    let event;
    try { event = codec.eventFor(socket, type, data, now()); }
    catch (_) { metrics.droppedEvents++; fail('An unsupported or oversized media item was not archived (4 MiB per-media limit).'); return; }
    if (!event) { if (type === 'photo') metrics.excludedViewOnce++; return; }
    if (!UUID.test(instance)) { metrics.droppedEvents++; return; }
    const bytes = Buffer.byteLength(JSON.stringify(event));
    if (bytes > codec.MAX_RAW - 1024 || queuedBytes + bytes > MAX_QUEUE) { metrics.droppedEvents++; fail('Archive queue limit reached; some content was not retained.'); return; }
    let batch = buffers.get(instance);
    if (batch && (batch.bytes + bytes > 256 * 1024 || batch.events.length >= 80)) { seal(instance); batch = null; }
    if (!batch) { batch = { instance, room: socket.room, events: [], bytes: 0 }; buffers.set(instance, batch); }
    batch.events.push(event); batch.bytes += bytes; queuedBytes += bytes;
    if (batch.bytes >= 256 * 1024) seal(instance); else schedule();
  }
  function seal(instance) {
    const batch = buffers.get(instance); if (!batch) return;
    buffers.delete(instance);
    const id = crypto.randomUUID();
    enqueue(async () => {
      try {
        const cutoff = cutoffs.get(instance) || 0;
        const events = batch.events.filter(e => Date.parse(e.at) > cutoff && Date.parse(e.at) + WEEK > now());
        if (!events.length) return;
        await ensure();
        events.sort((a,b) => a.at.localeCompare(b.at));
        const startedAt = events[0].at, expiresAt = new Date(Date.parse(startedAt) + WEEK).toISOString();
        const meta = { id, instance, expiresAt };
        const packed = await codec.pack(events, key, meta);
        const client = await pool.connect();
        try {
          await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout = '15s'"); await client.query('SELECT pg_advisory_xact_lock(78239011)');
          await client.query('DELETE FROM tc_archive_chunks WHERE expires_at <= NOW()');
          const total = await client.query('SELECT COALESCE(SUM(cipher_bytes),0)::bigint AS bytes FROM tc_archive_chunks');
          if (Number(total.rows[0].bytes) + packed.payload.length > BUDGET) throw new Error('CAPACITY');
          await client.query(`INSERT INTO tc_archive_chunks(id,room_instance,room_code,started_at,expires_at,event_count,raw_bytes,compressed_bytes,cipher_bytes,payload)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`,
            [id, instance, batch.room, startedAt, expiresAt, events.length, packed.rawBytes, packed.compressedBytes, packed.payload.length, packed.payload]);
          await client.query('COMMIT'); metrics.storedEvents += events.length;
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
        finally { client.release(); }
      } catch (e) {
        metrics.droppedEvents += batch.events.length;
        fail(e.message === 'CAPACITY' ? 'Archive safety budget reached (300 MiB). Delete archives or wait for expiry; live chat continues.' : 'Archive write failed. Check database availability, quota and encryption configuration. Some content was not retained.');
      } finally { queuedBytes -= batch.bytes; }
    }).catch(() => {});
  }
  async function flush() { clearTimeout(flushTimer); flushTimer = null; for (const instance of buffers.keys()) seal(instance); await chain; }
  async function status() {
    if (!enabled) return { enabled: false, ready: false, error: lastError, retentionDays: 7, budgetBytes: BUDGET };
    try {
      await ensure();
      const result = await pool.query(`SELECT COUNT(*)::int AS chunks, COALESCE(SUM(event_count),0)::bigint AS events,
        COALESCE(SUM(raw_bytes),0)::bigint AS raw_bytes, COALESCE(SUM(cipher_bytes),0)::bigint AS stored_bytes,
        pg_database_size(current_database())::bigint AS database_bytes FROM tc_archive_chunks WHERE expires_at>NOW()`);
      const stamp = await pool.query("SELECT name,value FROM tc_archive_state WHERE name IN ('last_cleanup','last_external_cleanup')");
      const stamps = Object.fromEntries(stamp.rows.map(r => [r.name, r.value]));
      return { enabled, ready, error: lastError, ...Object.fromEntries(Object.entries(result.rows[0]).map(([k,v]) => [k, Number(v)])), metrics: { ...metrics }, pendingBytes: queuedBytes, retentionDays: 7, budgetBytes: BUDGET, lastCleanup: stamps.last_cleanup || null, lastExternalCleanup: stamps.last_external_cleanup || null };
    } catch (_) { return { enabled, ready: false, error: lastError || 'Archive database unavailable.', metrics: { ...metrics }, retentionDays: 7, budgetBytes: BUDGET }; }
  }
  async function list(offset = 0) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000000) throw new Error("Invalid archive list page.");
    await ensure();
    const result = await pool.query(`SELECT room_instance::text AS instance, room_code AS room, MIN(started_at) AS started_at,
      MAX(started_at) AS last_at, MIN(expires_at) AS next_expiry, SUM(event_count)::int AS events, SUM(cipher_bytes)::bigint AS bytes
      FROM tc_archive_chunks WHERE expires_at>NOW() GROUP BY room_instance,room_code ORDER BY MAX(started_at) DESC,room_instance DESC LIMIT 200 OFFSET $1`, [offset]);
    return result.rows.map(r => ({ ...r, bytes: Number(r.bytes) }));
  }
  async function read(instance, cursor) {
    if (!UUID.test(instance)) throw new Error('Invalid archive session.');
    await ensure();
    let beforeTime = 'infinity', beforeId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    if (cursor) {
      try { const c = JSON.parse(Buffer.from(cursor, 'base64url').toString()); if (!UUID.test(c.id) || !Number.isFinite(Date.parse(c.at))) throw new Error(); beforeTime = c.at; beforeId = c.id; }
      catch (_) { throw new Error('Invalid archive page.'); }
    }
    const rows = (await pool.query(`SELECT id::text,room_instance::text AS instance,room_code,started_at,expires_at,raw_bytes
      FROM tc_archive_chunks WHERE room_instance=$1 AND expires_at>NOW() AND (started_at,id)<($2::timestamptz,$3::uuid)
      ORDER BY started_at DESC,id DESC LIMIT 8`, [instance, beforeTime, beforeId])).rows;
    const events = []; let used = 0, last;
    for (const row of rows) {
      if (used && used + row.raw_bytes > codec.MAX_RAW) break;
      if (new Date(row.expires_at).getTime() <= now()) continue;
      const payload = await pool.query('SELECT payload FROM tc_archive_chunks WHERE id=$1 AND expires_at>NOW()', [row.id]);
      if (!payload.rowCount) continue;
      const decoded = await codec.unpack(payload.rows[0].payload, key, { id: row.id, instance: row.instance, expiresAt: row.expires_at });
      events.push(...decoded.map(({ media, ...event }) => ({ ...event, hasMedia: Boolean(media), chunkId: row.id, expiresAt: row.expires_at }))); used += row.raw_bytes; last = row;
    }
    // Re-check existence after decryption so a concurrent deletion/expiry is not returned as a fresh page.
    if (last && !(await pool.query('SELECT 1 FROM tc_archive_chunks WHERE id=$1 AND expires_at>NOW()', [last.id])).rowCount) return { events: [], next: null };
    events.sort((a,b) => a.at.localeCompare(b.at));
    return { events, next: last ? Buffer.from(JSON.stringify({ at: new Date(last.started_at).toISOString(), id: last.id })).toString('base64url') : null };
  }
  async function media(chunkId, eventId) {
    if (!UUID.test(chunkId) || typeof eventId !== 'string' || eventId.length > 80) throw new Error('Invalid media request.');
    await ensure();
    const result = await pool.query('SELECT id::text,room_instance::text AS instance,expires_at,payload FROM tc_archive_chunks WHERE id=$1 AND expires_at>NOW()', [chunkId]);
    if (!result.rowCount) return null;
    const row = result.rows[0];
    const events = await codec.unpack(row.payload, key, { id: row.id, instance: row.instance, expiresAt: row.expires_at });
    const event = events.find(e => e.id === eventId && ['photo','voice'].includes(e.type));
    if (!event?.media || new Date(row.expires_at).getTime() <= now()) return null;
    if (!(await pool.query('SELECT 1 FROM tc_archive_chunks WHERE id=$1 AND expires_at>NOW()', [chunkId])).rowCount) return null;
    return { bytes: Buffer.from(event.media, 'base64'), mime: event.mime };
  }
  function deleteSession(instance) {
    if (!UUID.test(instance)) return Promise.reject(new Error('Invalid archive session.'));
    const cutoff = now(); cutoffs.set(instance, cutoff);
    if (cutoffs.size > 2000) cutoffs.delete(cutoffs.keys().next().value);
    const buffered = buffers.get(instance); if (buffered) { buffers.delete(instance); queuedBytes -= buffered.bytes; }
    return enqueue(async () => { await ensure(); const result = await pool.query('DELETE FROM tc_archive_chunks WHERE room_instance=$1 AND started_at <= $2', [instance, new Date(cutoff)]); return { deleted: result.rowCount }; });
  }
  const timer = setInterval(() => { if (!cleaning && enabled) { cleaning = true; cleanup().catch(() => fail('Scheduled cleanup failed. Check database connectivity/quota.')).finally(() => cleaning = false); } }, 15 * 60000); timer.unref?.();
  return {
    policy: () => ({ enabled, version: 'archive-v1', days: 7, resetDeletesArchive: false, types: ['text', 'normal-photo', 'voice-note'], excluded: ['view-once-photo', 'calls'] }),
    capture, flush, status, list, read, media, cleanup, deleteSession,
    start: () => { if (enabled) cleanup().catch(() => {}); },
    async close() { closing = true; clearInterval(timer); await flush(); if (!injectedPool) await pool?.end(); },
  };
};
