'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
let server, base;
before(async () => {
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, ARCHIVE_DATABASE_URL: '', ARCHIVE_ENCRYPTION_KEY: '', ARCHIVE_CLEANUP_TOKEN: '', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    server.stdout.on('data', data => { const m = String(data).match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve(`http://127.0.0.1:${m[1]}`); } });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
});
after(async () => { if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); } });
test('join page has no archive notice, checkbox or generic admin disclosure', async () => {
  const html = await (await fetch(base + '/')).text();
  for (const text of ['archive-retention-notice', 'archive-notice.js', 'tc-moderation-disclosure', '7-day', '7 days']) assert.ok(!html.includes(text), text);
});
test('admin asset endpoints no longer serve archive viewer assets', async () => {
  for (const file of ['archive-viewer.js', 'archive-viewer.css']) {
    const res = await fetch(base + '/admin-assets/' + file); assert.equal(res.status, 404);
  }
});
test('admin console still serves its own assets', async () => {
  assert.equal((await fetch(base + '/admin-assets/admin.js')).status, 200);
});
