'use strict';
const crypto = require('node:crypto'), zlib = require('node:zlib');
const { promisify } = require('node:util');
const compress = promisify(zlib.brotliCompress), decompress = promisify(zlib.brotliDecompress);
const MAX_RAW = 8 * 1024 * 1024, MAX_MEDIA = 4 * 1024 * 1024;
function keyFrom(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const key = Buffer.from(value, 'base64url'); return key.length === 32 ? key : null;
}
const aad = meta => Buffer.from(`tempchat-archive-v1|${meta.id}|${meta.instance}|${new Date(meta.expiresAt).toISOString()}`);
async function pack(events, key, meta) {
  const raw = Buffer.from(JSON.stringify({ version: 1, events }));
  if (raw.length > MAX_RAW) throw new Error('Archive batch is too large.');
  const zipped = await compress(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(meta));
  const data = Buffer.concat([cipher.update(zipped), cipher.final()]);
  return { payload: Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), data]), rawBytes: raw.length, compressedBytes: zipped.length };
}
async function unpack(payload, key, meta) {
  if (!Buffer.isBuffer(payload) || payload.length < 30 || payload[0] !== 1 || payload.length > MAX_RAW + 1024) throw new Error('Invalid encrypted archive.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, payload.subarray(1, 13));
  decipher.setAAD(aad(meta)); decipher.setAuthTag(payload.subarray(13, 29));
  const compressed = Buffer.concat([decipher.update(payload.subarray(29)), decipher.final()]);
  const raw = await decompress(compressed, { maxOutputLength: MAX_RAW });
  const data = JSON.parse(raw.toString('utf8'));
  if (data.version !== 1 || !Array.isArray(data.events) || data.events.length > 100) throw new Error('Invalid archive content.');
  return data.events;
}
function eventFor(socket, type, data, now = Date.now()) {
  if (!['text', 'photo', 'voice'].includes(type) || !data || !socket.room) return null;
  const event = { id: String(data.id).slice(0, 80), type, username: socket.username, senderId: socket.id, isAdmin: Boolean(socket.isAdmin), at: new Date(now).toISOString() };
  if (type === 'text') {
    event.text = String(data.message || '').slice(0, 1500);
    if (data.reply) event.reply = { id: String(data.reply.id).slice(0, 80), username: String(data.reply.username).slice(0, 24), text: String(data.reply.text).slice(0, 180), kind: data.reply.kind };
  } else if (type === 'photo') {
    if (data.isViewOnce !== false) return null;
    if (typeof data.image !== 'string' || data.image.length > Math.ceil(MAX_MEDIA * 4 / 3) + 100) throw new Error('Photo exceeds archive media limit.');
    const match = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(data.image);
    if (!match) throw new Error('Unsupported archive photo format.');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > MAX_MEDIA) throw new Error('Invalid photo size.');
    event.media = bytes.toString('base64'); event.mime = 'image/' + match[1]; event.caption = String(data.caption || '').slice(0, 200);
  } else {
    if (!Buffer.isBuffer(data.audio) || !data.audio.length || data.audio.length > MAX_MEDIA) throw new Error('Voice note exceeds archive media limit.');
    const mime = String(data.mime || 'audio/webm').split(';')[0].toLowerCase();
    if (!['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(mime)) throw new Error('Unsupported voice-note format.');
    event.media = data.audio.toString('base64'); event.mime = mime;
  }
  return event;
}
module.exports = { keyFrom, pack, unpack, eventFor, MAX_RAW, MAX_MEDIA };
