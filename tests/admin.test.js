'use strict';
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const {once}=require('node:events');const crypto=require('node:crypto');const {io}=require('socket.io-client');
let server,base,cookie,csrf;const key=crypto.randomBytes(32).toString('base64url'),sockets=[];
function event(socket,name,predicate=()=>true){return new Promise((resolve,reject)=>{const t=setTimeout(()=>{socket.off(name,on);reject(new Error('Timeout '+name));},5000);function on(d){if(predicate(d)){clearTimeout(t);socket.off(name,on);resolve(d);}}socket.on(name,on);});}
async function req(route,body,options={}){
 const headers={...(options.auth===false?{}:{cookie,'x-csrf-token':csrf}),...(body===undefined?{}:{'Content-Type':'application/json',Origin:base}),...options.headers};
 const r=await fetch(base+'/api/admin/'+route,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await r.json();return{status:r.status,data,headers:r.headers};
}
async function connect(room,name,admin=false){const s=io(base,{transports:['websocket'],forceNew:true,reconnection:false,extraHeaders:{Origin:base,...(admin?{Cookie:cookie}:{})}});sockets.push(s);await event(s,'connect');const ready=event(s,'room-ready');s.emit('join-room',{room,username:name,asAdmin:admin});const joined=await ready;return{s,joined};}
async function state(){const r=await req('snapshot');assert.equal(r.status,200);return r.data;}
async function action(kind,room,extra={}){const data=await state();const r=data.rooms.find(r=>r.room===room);return req('action',{action:kind,room,roomInstanceId:r.instanceId,...extra});}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
before(async()=>{
 server=spawn(process.execPath,['server.js'],{env:{...process.env, ARCHIVE_DATABASE_URL:"", ARCHIVE_ENCRYPTION_KEY:"", ARCHIVE_CLEANUP_TOKEN:"",PORT:'0',ADMIN_KEY:key,NODE_ENV:'test',RENDER:''},stdio:['ignore','pipe','pipe']});
 base=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Startup timeout')),5000);server.stdout.on('data',d=>{const m=String(d).match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(t);resolve('http://127.0.0.1:'+m[1]);}});server.once('exit',c=>reject(new Error('Server exited '+c)));});
 const login=await req('login',{key},{auth:false});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];csrf=login.data.csrf;
});
after(async()=>{for(const s of sockets)s.disconnect();if(server?.exitCode===null){server.kill();await once(server,'exit');}});
test('unauthenticated callers cannot read rooms or moderate; key is not in responses',async()=>{
 for(const route of ['snapshot'])assert.equal((await req(route,undefined,{auth:false})).status,401);
 assert.equal((await req('action',{action:'clear',room:'X'},{auth:false})).status,401);
 const info=await req('session',undefined,{auth:false});assert.equal(info.data.authenticated,false);assert.ok(!JSON.stringify(info.data).includes(key));
});
test('login uses HttpOnly SameSite cookie, rejects wrong keys and cross-origin requests',async()=>{
 const good=await req('login',{key},{auth:false});assert.equal(good.status,200);const h=good.headers.get('set-cookie');assert.match(h,/HttpOnly/);assert.match(h,/SameSite=Strict/);assert.ok(!h.includes(key));
 assert.equal((await req('login',{key:'wrong'},{auth:false})).status,401);
 assert.equal((await req('login',{key},{auth:false,headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await req('action',{action:'lock',room:'X'},{headers:{'x-csrf-token':'wrong'}})).status,403);
});
test('HTTPS-proxied login issues a Secure host-only cookie',async()=>{
 const r=await req('login',{key},{auth:false,headers:{'x-forwarded-proto':'https',Origin:base.replace('http:','https:')}});
 assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/^__Host-tempchat_admin=/);assert.match(r.headers.get('set-cookie'),/; Secure/);assert.ok(!/Domain=/i.test(r.headers.get('set-cookie')));
});
test('snapshot shows live member timings and counters but never message contents or IP addresses',async()=>{
 const {s:a}=await connect('METRICS','A'),{s:b}=await connect('METRICS','B');
 const message=event(b,'chat-message');a.emit('send-message','PRIVATE_BODY_NOT_FOR_ADMIN');await message;
 a.emit('presence-update','away');await wait(35);
 const d=await state(),r=d.rooms.find(r=>r.room==='METRICS');assert.equal(r.members.length,2);assert.equal(r.text,1);assert.ok(r.relayBytes>0);
 const m=r.members.find(m=>m.id===a.id);assert.equal(m.state,'away');assert.ok(m.awayMs>0);assert.ok(m.joinedAt>0);assert.equal(m.messages,1);
 assert.ok(!JSON.stringify(d).includes('PRIVATE_BODY_NOT_FOR_ADMIN'));assert.ok(!Object.keys(m).some(k=>/ip|location|token|password/i.test(k)));
});
test('visible admin entry requires a valid cookie, is announced and badges new messages',async()=>{
 const {s:guest}=await connect('ROLE','Guest');
 const bad=io(base,{transports:['websocket'],forceNew:true,reconnection:false,extraHeaders:{Origin:base}});sockets.push(bad);await event(bad,'connect');const denied=event(bad,'join-error');bad.emit('join-room',{room:'ROLE',username:'Admin',asAdmin:true});assert.match((await denied).error,/Sign in/);
 const announced=event(guest,'system-message',d=>d.text.includes('Admin joined'));
 const {s:moderator,joined}=await connect('ROLE','FakeName',true);await announced;assert.equal(joined.isAdmin,true);assert.equal(joined.username,'Admin');
 const incoming=event(guest,'chat-message');moderator.emit('send-message','Visible moderation message');assert.equal((await incoming).isAdmin,true);
 const spoofed=event(guest,'chat-message');guest.emit('send-message',{message:'ordinary',isAdmin:true});assert.equal((await spoofed).isAdmin,false);
 const unverified=await connect('ROLE','Admin');assert.equal(unverified.joined.username,'Admin (guest)');assert.equal(unverified.joined.isAdmin,false);
});
test('entry lock blocks new non-admins, preserves existing chat and permits verified admin',async()=>{
 const {s:existing}=await connect('LOCK','Existing');assert.equal((await action('lock','LOCK')).status,200);
 const newSocket=io(base,{transports:['websocket'],forceNew:true,reconnection:false});sockets.push(newSocket);await event(newSocket,'connect');const denied=event(newSocket,'join-error');newSocket.emit('join-room',{room:'LOCK',username:'New'});assert.match((await denied).error,/locked/);
 const echo=event(existing,'chat-message');existing.emit('send-message','Still allowed');await echo;
 const {joined}=await connect('LOCK','Admin',true);assert.equal(joined.isAdmin,true);
 assert.equal((await action('unlock','LOCK')).status,200);await connect('LOCK','Now allowed');
});
test('kick removes only the chosen socket session and does not clear other members',async()=>{
 const {s:a}=await connect('KICK','A'),{s:b}=await connect('KICK','B');let cleared=false;b.on('clear-chat',()=>cleared=true);
 const forced=event(a,'moderation-exit');assert.equal((await action('kick','KICK',{socketId:a.id,reason:'Testing a removal'})).status,200);assert.match((await forced).reason,/Testing/);
 const r=(await state()).rooms.find(r=>r.room==='KICK');assert.equal(r.members.length,1);assert.equal(r.members[0].id,b.id);assert.equal(cleared,false);
});
test('destructive actions require exact room confirmation and fresh room instance',async()=>{
 await connect('CONFIRM','A');
 assert.equal((await action('clear','CONFIRM')).status,400);
 const stale=await req('action',{action:'lock',room:'CONFIRM',roomInstanceId:'wrong'});assert.equal(stale.status,409);
});
test('clear and end-call affect only their intended room; close locks and removes all sessions',async()=>{
 const {s:a}=await connect('CONTROL','A'),{s:b}=await connect('CONTROL','B'),{s:other}=await connect('UNTOUCHED','Other');let otherCleared=false;other.on('clear-chat',()=>otherCleared=true);
 a.emit('call-start',{callType:'audio'});b.emit('call-join',{callType:'audio'});await wait(40);
 const ended=event(b,'call-ended');assert.equal((await action('end-call','CONTROL',{confirmation:'CONTROL'})).status,200);await ended;
 const clear=event(b,'clear-chat');assert.equal((await action('clear','CONTROL',{confirmation:'CONTROL'})).status,200);await clear;assert.equal(otherCleared,false);
 const removed=event(b,'moderation-exit');assert.equal((await action('close-room','CONTROL',{confirmation:'CONTROL'})).status,200);await removed;
 const room=(await state()).rooms.find(r=>r.room==='CONTROL');assert.equal(room.members.length,0);assert.equal(room.locked,true);
});
test('logout invalidates cookie and ends that login’s visible admin room sessions',async()=>{
 const login=await req('login',{key},{auth:false});const tempCookie=login.headers.get('set-cookie').split(';')[0],tempCsrf=login.data.csrf;
 const moderator=io(base,{transports:['websocket'],forceNew:true,reconnection:false,extraHeaders:{Origin:base,Cookie:tempCookie}});sockets.push(moderator);await event(moderator,'connect');const ready=event(moderator,'room-ready');moderator.emit('join-room',{room:'LOGOUT',username:'Admin',asAdmin:true});await ready;
 const forced=event(moderator,'moderation-exit');const result=await req('logout',{}, {headers:{Cookie:tempCookie,cookie:tempCookie,'x-csrf-token':tempCsrf}});assert.equal(result.status,200);await forced;
 assert.equal((await req('snapshot',undefined,{headers:{cookie:tempCookie}})).status,401);
});
test('admin pages set frame/CSP/no-cache protection and never include the key',async()=>{
 const r=await fetch(base+'/admin');assert.equal(r.status,200);assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('cache-control'),'no-store');assert.ok(!(await r.text()).includes(key));
});
test('repeated bad key attempts are rate limited',async()=>{
 let last;
 for(let i=0;i<12;i++)last=await req('login',{key:'invalid_'+i},{auth:false});
 assert.equal(last.status,429);assert.equal(last.headers.get('retry-after'),'600');
});

test('admin session expiry revokes visible admin room access and locks expire after one hour',async()=>{
 const express=require('express'),http=require('node:http'),createAdmin=require('../lib/admin-control');let clock=1000;
 const app=express(),httpServer=http.createServer(app),removed=[];const fakeSockets=new Map();
 const fakeIO={sockets:{sockets:fakeSockets},to:()=>({emit(){}})};
 const control=createAdmin({app,io:fakeIO,calls:new Map(),controls:{eject:s=>removed.push(s.id),clear(){},endCall(){}},env:{ADMIN_KEY:key},now:()=>clock});
 httpServer.listen(0,'127.0.0.1');await once(httpServer,'listening');const origin='http://127.0.0.1:'+httpServer.address().port;
 try{
  const login=await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key})});const data=await login.json(),c=login.headers.get('set-cookie').split(';')[0];
  const guest={id:'guest',username:'Guest',room:'TIMED',isAdmin:false};fakeSockets.set('guest',guest);control.joined(guest);
  const snapshot=await(await fetch(origin+'/api/admin/snapshot',{headers:{Cookie:c}})).json();
  const locked=await fetch(origin+'/api/admin/action',{method:'POST',headers:{Cookie:c,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':data.csrf},body:JSON.stringify({room:'TIMED',roomInstanceId:snapshot.rooms[0].instanceId,action:'lock'})});assert.equal(locked.status,200);assert.equal(control.canJoin('TIMED'),false);
  clock+=3600001;assert.equal(control.canJoin('TIMED'),true);
  const request={headers:{host:new URL(origin).host,origin:origin,cookie:c}};
  const session=control.authorizeSocket({handshake:request,request:{socket:{}}});assert.ok(session);
  const moderator={id:'moderator',room:'TIMED',username:'Admin',isAdmin:true,adminSessionId:session.id};fakeSockets.set('moderator',moderator);
  clock+=8*3600000;
  const expired=await fetch(origin+'/api/admin/snapshot',{headers:{Cookie:c}});assert.equal(expired.status,401);assert.ok(removed.includes('moderator'));
 }finally{control.close();await new Promise(r=>httpServer.close(r));}
});
test('missing owner key disables admin login without affecting public chat',async()=>{
 const express=require('express'),http=require('node:http'),createAdmin=require('../lib/admin-control');const app=express(),s=http.createServer(app);
 const control=createAdmin({app,io:{sockets:{sockets:new Map()},to:()=>({emit(){}})},calls:new Map(),controls:{},env:{}});s.listen(0,'127.0.0.1');await once(s,'listening');const origin='http://127.0.0.1:'+s.address().port;
 try{const r=await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key:'anything'})});assert.equal(r.status,503);const status=await(await fetch(origin+'/api/admin/session')).json();assert.equal(status.configured,false);}finally{control.close();await new Promise(r=>s.close(r));}
});
test('retired archive history routes are gone from the admin API',async()=>{
 for(const route of ['archive/status','archive/rooms','archive/messages?instance=bad','archive/media?chunk=bad&event=bad','archive/delete']) assert.equal((await req(route,undefined,{auth:false})).status,404);
});
