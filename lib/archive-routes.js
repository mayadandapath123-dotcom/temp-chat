'use strict';
module.exports = function archiveRoutes(router, archive, requireAuth, requireWrite, authorized) {
  const wrap = handler => async (req, res) => {
    try {
      const value = await handler(req);
      if (!authorized(req)) return res.status(401).json({ error: 'Admin session expired. Sign in again.' });
      if (value?.status) return res.status(value.status).json({ error: value.error });
      if (value?.media) { res.set('Content-Type', value.media.mime); res.set('Content-Disposition','inline'); return res.send(value.media.bytes); }
      res.json(value);
    } catch (_) { res.status(503).json({ error: 'Archive operation failed. Check archive status, connection, quota and encryption-key configuration.' }); }
  };
  router.get('/archive/status', requireAuth, wrap(() => archive.status()));
  router.get('/archive/rooms', requireAuth, wrap(async req => { const offset = Number(req.query.offset || 0); const rooms = await archive.list(offset); return { rooms, nextOffset: rooms.length === 200 ? offset + 200 : null }; }));
  router.get('/archive/messages', requireAuth, wrap(req => archive.read(String(req.query.instance || ''), typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 300) : null)));
  router.get('/archive/media', requireAuth, wrap(async req => {
    const media = await archive.media(String(req.query.chunk || ''), String(req.query.event || ''));
    return media ? { media } : { status:404, error:'Media expired, was deleted or is unavailable.' };
  }));
  router.post('/archive/delete', requireAuth, requireWrite, wrap(async req => {
    if (req.body?.confirmation !== 'DELETE') return { status:400, error:'Type DELETE to confirm archive deletion.' };
    return { ok:true, ...await archive.deleteSession(String(req.body.instance || '')) };
  }));
  router.post('/archive/cleanup', requireAuth, requireWrite, wrap(async () => ({ ok:true, ...await archive.cleanup() })));
};
