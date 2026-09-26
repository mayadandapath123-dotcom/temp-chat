'use strict';
/* Cleanup only. Cannot accept chat content, insert archives, extend deadlines,
   decrypt payloads or return message/media contents. Existing rows expire under
   their ORIGINAL expires_at values; no unexpired row is deleted here. */
const { Pool } = require('pg');
module.exports = function retiredArchiveCleanup({ env = process.env, pool: suppliedPool } = {}) {
  let pool = suppliedPool, task = null, closed = false;
  if (!pool && env.ARCHIVE_DATABASE_URL) {
    try {
      const url = new URL(env.ARCHIVE_DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
      url.searchParams.set('sslmode', 'verify-full');
      pool = new Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000, allowExitOnIdle: true, query_timeout: 16000 });
      pool.on('error', () => {}); // never print credentials or DB payloads
    } catch (_) { pool = null; }
  }
  function cleanup() {
    if (closed) return Promise.reject(new Error('Cleanup is shutting down.'));
    if (task) return task;
    task = (async () => {
      if (!pool) throw new Error('Keep the existing archive database URL until old records expire.');
      const exists = await pool.query("SELECT to_regclass('public.tc_archive_chunks') AS archive_table");
      if (!exists.rows[0]?.archive_table) return { archiving: false, deleted: 0, remaining: 0, lastExpiry: null };
      const removed = await pool.query('DELETE FROM public.tc_archive_chunks WHERE expires_at <= NOW()');
      const result = await pool.query('SELECT COUNT(*)::bigint AS remaining, MAX(expires_at) AS last_expiry FROM public.tc_archive_chunks');
      return { archiving: false, deleted: removed.rowCount, remaining: Number(result.rows[0].remaining), lastExpiry: result.rows[0].last_expiry || null };
    })().finally(() => { task = null; });
    return task;
  }
  const timer = setInterval(() => { if (pool && !closed) cleanup().catch(() => {}); }, 15 * 60000); timer.unref?.();
  return {
    cleanup,
    start() { if (pool) cleanup().catch(() => {}); },
    async close() { closed = true; clearInterval(timer); try { await task; } catch (_) {} if (!suppliedPool) await pool?.end(); },
  };
};
