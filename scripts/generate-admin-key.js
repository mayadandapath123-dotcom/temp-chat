#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const file = path.join(__dirname, '..', 'admin-key.env');
if (fs.existsSync(file)) { console.error('admin-key.env already exists. Keep it private; do not overwrite a working admin key by accident.'); process.exit(1); }
fs.writeFileSync(file, `ADMIN_KEY=${crypto.randomBytes(32).toString('base64url')}\n`, { mode: 0o600, flag: 'wx' });
console.log('Created private admin-key.env. Copy its ADMIN_KEY value into the TempChat service’s Render Environment.');
console.log('Keep the key secret: never paste it in chat, put it in a URL or commit this file.');
