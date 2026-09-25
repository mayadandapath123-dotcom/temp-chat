#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const webpush = require('web-push');
const subject = process.argv[2];
if (!subject || !/^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(subject)) {
  console.error('Usage: node scripts/generate-push-keys.js mailto:YOUR_REAL_EMAIL_ADDRESS'); process.exit(1);
}
const file = path.join(__dirname, '..', 'push-keys.env');
if (fs.existsSync(file)) { console.error('push-keys.env already exists. Keep your existing keys; changing them invalidates browser subscriptions.'); process.exit(1); }
const keys = webpush.generateVAPIDKeys();
fs.writeFileSync(file, `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=${subject}\n`, { mode: 0o600, flag: 'wx' });
console.log('Created private push-keys.env in the project folder. It is excluded from Git.');
console.log('Copy these three names and values into Render Environment.');
console.log('Never upload this file, paste the private key into chat, or add it to Git.');
