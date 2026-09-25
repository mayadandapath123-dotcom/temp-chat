'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function worker({fail=false,clients=[]}={}){
 const events={},shown=[],opened=[];
 const self={addEventListener:(name,handler)=>events[name]=handler,registration:{showNotification:async(title,opts)=>{if(fail)throw new Error('OS rejected notification');shown.push({title,...opts});}},clients:{matchAll:async()=>clients,openWindow:async u=>opened.push(u),claim:async()=>{}},skipWaiting:async()=>{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8'),{self,caches:{keys:async()=>[],delete:async()=>{}}});return{events,shown,opened};
}
test('notification worker keeps event alive, associates exact tab and confirms success',async()=>{
 const w=worker();let promise,reply;w.events.message({data:{type:'show-notification',title:'Test',body:'Text',room:'ROOM A',tag:'test'},source:{id:'client-a'},ports:[{postMessage:d=>reply=d}],waitUntil:p=>promise=p});
 assert.ok(promise);await promise;assert.equal(reply.ok,true);assert.equal(w.shown[0].data.clientId,'client-a');assert.equal(w.shown[0].data.room,'ROOM A');assert.equal(w.shown[0].icon,'/icons/icon-192.png');
});
test('notification failure is returned, not reported as success',async()=>{
 const w=worker({fail:true});let promise,reply;w.events.message({data:{type:'show-notification'},ports:[{postMessage:d=>reply=d}],waitUntil:p=>promise=p});await promise;assert.equal(reply.ok,false);assert.match(reply.error,/rejected/);
});
test('click focuses originating tab, not first unrelated room',async()=>{
 let focused='',message;const w=worker({clients:[{id:'unrelated',focus:async()=>focused='wrong'},{id:'right',focus:async()=>focused='right',postMessage:m=>message=m}]});let promise;
 w.events.notificationclick({notification:{data:{clientId:'right',room:'ROOM'},close:()=>{}},waitUntil:p=>promise=p});await promise;assert.equal(focused,'right');assert.equal(message.type,'notification-click');assert.equal(w.opened.length,0);
});
test('when originating tab is closed, click opens an encoded room link without auto-joining',async()=>{
 const w=worker();let promise;w.events.notificationclick({notification:{data:{clientId:'gone',room:'A&B'},close:()=>{}},waitUntil:p=>promise=p});await promise;assert.equal(w.opened[0],'/?room=A%26B');
});
