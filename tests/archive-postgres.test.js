'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const create=require('../lib/chat-archive'),codec=require('../lib/archive-codec');
const url=process.env.ARCHIVE_TEST_DATABASE_URL;
test('actual PostgreSQL: encrypted storage, lazy reader, deletion, expiry, restart, wrong-key and database isolation',{skip:!url},async()=>{
 const parsed=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname));assert.ok(parsed.pathname.startsWith('/tempchat_test_'),'Never run destructive integration setup on a real Neon database');
 const{Pool}=require('pg');const pool=new Pool({connectionString:url});const key=crypto.randomBytes(32),env={ARCHIVE_ENCRYPTION_KEY:key.toString('base64url')};
 await pool.query('DROP TABLE IF EXISTS tc_archive_chunks,tc_archive_state,typing_data');
 let archive=create({pool,env});
 try{
  assert.equal((await archive.status()).ready,true);
  const socket={room:'TEST',username:'Mira',id:'s'},instance=crypto.randomUUID();
  archive.capture(socket,instance,'text',{id:'t1',message:'SENSITIVE_TEXT_ONLY_ADMIN'});
  archive.capture(socket,instance,'photo',{id:'once',isViewOnce:true,image:'secret'});
  archive.capture(socket,instance,'photo',{id:'photo',isViewOnce:false,image:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='});
  archive.capture(socket,instance,'voice',{id:'voice',audio:Buffer.from('fake-audio'),mime:'audio/webm'});
  await archive.flush();const listed=await archive.list();assert.equal(listed.length,1);assert.equal(listed[0].events,3);
  const raw=(await pool.query('SELECT * FROM tc_archive_chunks')).rows[0];assert.ok(!raw.payload.toString().includes('SENSITIVE_TEXT'));assert.ok(raw.expires_at>new Date());
  const page=await archive.read(instance);assert.equal(page.events.length,3);assert.equal(page.events[0].text,'SENSITIVE_TEXT_ONLY_ADMIN');assert.ok(page.events.every(e=>!Object.hasOwn(e,'media')));
  const media=await archive.media(page.events.find(e=>e.id==='voice').chunkId,'voice');assert.equal(media.bytes.toString(),'fake-audio');
  await archive.close();archive=create({pool,env});assert.equal((await archive.read(instance)).events.length,3,'survives process-instance replacement');
  const wrong=create({pool,env:{ARCHIVE_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64url')}});assert.equal((await wrong.status()).ready,false);await wrong.close();
  archive.capture(socket,instance,'text',{id:'pending',message:'delete me too'});await archive.deleteSession(instance);await archive.flush();assert.equal((await archive.read(instance)).events.length,0);
  const m={id:crypto.randomUUID(),instance:crypto.randomUUID(),expiresAt:new Date(Date.now()-10000).toISOString()};const expired=await codec.pack([{id:'expired',type:'text',text:'gone',at:new Date(Date.now()-8*86400000).toISOString()}],key,m);
  await pool.query('INSERT INTO tc_archive_chunks VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9)',[m.id,m.instance,'OLD',new Date(Date.now()-8*86400000),m.expiresAt,expired.rawBytes,expired.compressedBytes,expired.payload.length,expired.payload]);
  assert.equal((await archive.read(m.instance)).events.length,0);assert.equal(await archive.media(m.id,'expired'),null);assert.equal((await archive.cleanup()).deleted,1);
  await archive.close();await pool.query('CREATE TABLE typing_data(id int)');archive=create({pool,env});const status=await archive.status();assert.equal(status.ready,false);assert.match(status.error,/dedicated|typing/);assert.equal((await pool.query("SELECT to_regclass('typing_data') AS t")).rows[0].t,'typing_data');
 }finally{await archive.close();await pool.query('DROP TABLE IF EXISTS tc_archive_chunks,tc_archive_state,typing_data');await pool.end();}
});
