'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const create=require('../lib/push-service');
test('legacy Web Push stays disabled even if old keys and storage configuration exist',()=>{
 let attempted=false;const service=create({env:{VAPID_PUBLIC_KEY:'old',VAPID_PRIVATE_KEY:'old',PUSH_STORE_PATH:'/unused'},transport:{sendNotification(){attempted=true;}}});
 assert.equal(service.config().configured,false);assert.equal(service.config().mode,'joined-page-only');assert.equal('publicKey' in service.config(),false);
 service.notify({id:'x',room:'ROOM'},{title:'No push',body:'Never sent'});assert.equal(attempted,false);
});
test('old clients cannot register or test a closed-page push subscription',async()=>{
 const handlers={},service=create();service.attach({on:(name,fn)=>handlers[name]=fn});
 for(const event of ['push-register','push-test']){const result=await new Promise(r=>handlers[event]({},r));assert.match(result.error,/removed|disabled/i);}
 const reply=await new Promise(r=>handlers['push-unregister']({},r));assert.equal(reply.ok,true);
});
test('legacy cleanup methods never load or recreate a subscription store',()=>{
 const service=create();for(const name of ['unregister','disableDevice','leave','disconnect','reset','close'])assert.doesNotThrow(()=>service[name]('unused'));
 const pkg=require('../package.json');assert.equal(pkg.dependencies['web-push'],undefined);
});
