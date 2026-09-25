'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const create=require('../public/push-worker-core');
function fixture(){
 const shown=[],windows=new Map();
 let status={joined:true,connected:true,enabled:true,epoch:'epoch-1',room:'ROOM',foreground:false};
 const page={id:'tab-1',type:'window',focus:async()=>{page.focused=true;},postMessage:m=>page.message=m};windows.set(page.id,page);
 const registration={getNotifications:async()=>shown.filter(n=>!n.closed),showNotification:async(title,options)=>shown.push({title,...options,close(){this.closed=true;}})};
 const core=create({registration,clients:{get:async id=>windows.get(id)},confirmSession:async()=>status});
 return{core,registration,windows,shown,page,get status(){return status;},set status(s){status=s;}};
}
const msg={type:'session-notify',epoch:'epoch-1',room:'ROOM',title:'Mira',body:'Hello'};
test('connected joined background page can display name and text',async()=>{const f=fixture();const reply=await f.core.message(msg,f.page);assert.equal(reply.shown,true);assert.equal(f.shown[0].title,'Mira');assert.equal(f.shown[0].body,'Hello');});
test('foreground page suppresses ordinary alerts; explicit test may show',async()=>{const f=fixture();f.status.foreground=true;assert.equal((await f.core.message(msg,f.page)).shown,false);assert.equal((await f.core.message({...msg,test:true},f.page)).shown,true);});
test('exited, disconnected, disabled and other-room sessions cannot notify',async()=>{for(const change of [{joined:false},{connected:false},{enabled:false},{room:'OTHER'},{epoch:'new-epoch'}]){const f=fixture();Object.assign(f.status,change);assert.equal((await f.core.message(msg,f.page)).shown,false);assert.equal(f.shown.length,0);}});
test('closed page cannot create a new alert even if a show request was queued',async()=>{const f=fixture();f.windows.delete(f.page.id);assert.equal((await f.core.message(msg,f.page)).shown,false);assert.equal(f.shown.length,0);});
test('unresponsive/suspended page is not treated as permission to notify',async()=>{const f=fixture();f.status=null;assert.equal((await f.core.message(msg,f.page)).shown,false);});
test('Exit closes already-shown session alerts and rejects its stale queued epoch',async()=>{const f=fixture();await f.core.message(msg,f.page);await f.core.message({type:'session-stop',epoch:'epoch-1'},f.page);assert.equal(f.shown[0].closed,true);assert.equal((await f.core.message(msg,f.page)).shown,false);});
test('a slow OS show completion is closed when Exit raced with it',async()=>{
 const f=fixture();let release,started;const barrier=new Promise(r=>started=r);const original=f.registration.showNotification;
 f.registration.showNotification=async(...args)=>{started();await new Promise(r=>release=r);return original(...args);};
 const notifying=f.core.message(msg,f.page);await barrier;await f.core.message({type:'session-stop',epoch:'epoch-1'},f.page);release();
 assert.equal((await notifying).shown,false);assert.equal(f.shown[0].closed,true);
});
test('new joined epoch may notify after previous session ended',async()=>{const f=fixture();await f.core.message({type:'session-stop',epoch:'epoch-1'},f.page);f.status.epoch='epoch-2';assert.equal((await f.core.message({...msg,epoch:'epoch-2'},f.page)).shown,true);});
test('notification click focuses only a still-joined original page; never reopens closed room',async()=>{const f=fixture();await f.core.click({clientId:f.page.id,epoch:'epoch-1',room:'ROOM'});assert.equal(f.page.focused,true);f.page.focused=false;f.status.joined=false;await f.core.click({clientId:f.page.id,epoch:'epoch-1',room:'ROOM'});assert.equal(f.page.focused,false);f.windows.clear();await f.core.click({clientId:f.page.id,epoch:'epoch-1',room:'ROOM'});});
test('legacy remote push payloads are always ignored',async()=>{const f=fixture();assert.equal(await f.core.push({type:'room-message',title:'Old push',body:'Must not display'}),false);assert.equal(f.shown.length,0);});
test('platform notification failure is returned as a failure',async()=>{const f=fixture();f.registration.showNotification=async()=>{throw new Error('denied');};await assert.rejects(f.core.message(msg,f.page),/denied/);});
