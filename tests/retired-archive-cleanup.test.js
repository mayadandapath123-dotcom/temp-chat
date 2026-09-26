'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const create=require('../lib/retired-archive-cleanup');
test('cleanup only deletes expired records and never reads payloads or inserts data',async()=>{
 const rows=[{id:'old',expires_at:new Date(Date.now()-1000),payload:'encrypted-old'},{id:'future',expires_at:new Date(Date.now()+86400000),payload:'encrypted-future'}],queries=[];
 const pool={async query(sql){queries.push(sql);if(sql.includes('to_regclass'))return{rows:[{archive_table:'tc_archive_chunks'}]};if(sql.startsWith('DELETE')){assert.match(sql,/WHERE expires_at <= NOW\(\)/);let count=0;for(let i=rows.length-1;i>=0;i--)if(rows[i].expires_at<=new Date()){rows.splice(i,1);count++;}return{rowCount:count};}return{rows:[{remaining:rows.length,last_expiry:rows[0]?.expires_at}]};}};
 const cleanup=create({pool});const result=await cleanup.cleanup();assert.equal(result.archiving,false);assert.equal(result.deleted,1);assert.equal(result.remaining,1);assert.equal(rows[0].payload,'encrypted-future');assert.ok(queries.every(q=>!(/payload|INSERT|UPDATE|CREATE|TRUNCATE|DROP/i.test(q))));await cleanup.close();
});
test('an absent legacy table creates nothing and reports zero remaining',async()=>{let calls=0;const cleanup=create({pool:{async query(sql){calls++;assert.ok(sql.includes('to_regclass'));return{rows:[{archive_table:null}]};}}});assert.deepEqual(await cleanup.cleanup(),{archiving:false,deleted:0,remaining:0,lastExpiry:null});assert.equal(calls,1);await cleanup.close();});
test('missing old database configuration cannot falsely report successful cleanup',async()=>{const cleanup=create({env:{}});await assert.rejects(cleanup.cleanup(),/database URL/);await cleanup.close();});
test('overlapping cleanup requests share one operation',async()=>{let n=0;const cleanup=create({pool:{async query(sql){n++;await new Promise(r=>setTimeout(r,5));return sql.includes('to_regclass')?{rows:[{archive_table:null}]}:{rows:[]};}}});await Promise.all([cleanup.cleanup(),cleanup.cleanup()]);assert.equal(n,1);await cleanup.close();});
test('archive writer, decoder, viewer and capture hooks are absent from release source',()=>{
 for(const name of ['lib/chat-archive.js','lib/archive-codec.js','lib/archive-routes.js','public/archive-notice.js','admin/archive-viewer.js','admin/archive-viewer.css'])assert.equal(fs.existsSync(path.join(__dirname,'..',name)),false);
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');assert.ok(!server.includes('archive.capture'));assert.ok(!server.includes('archiveConsent'));assert.ok(!server.includes('archiveNoticeVersion'));
});
