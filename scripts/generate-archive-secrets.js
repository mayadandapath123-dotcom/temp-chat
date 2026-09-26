#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const file=path.join(__dirname,'..','archive-secrets.env');
if(fs.existsSync(file)){console.error('archive-secrets.env already exists. Keep its encryption key: replacing it makes existing archives unreadable.');process.exit(1);}
fs.writeFileSync(file,`ARCHIVE_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('base64url')}\nARCHIVE_CLEANUP_TOKEN=${crypto.randomBytes(32).toString('base64url')}\n`,{mode:0o600,flag:'wx'});
console.log('Created private archive-secrets.env. Keep a secure backup of the encryption key.');
console.log('Add these values and the NEW Neon project connection string to Render. Never paste secrets in chat or commit this file.');
