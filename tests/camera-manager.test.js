'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const create = require('../public/camera-manager');
function error(name) { return Object.assign(new Error(name), { name }); }
function track(id, facing) {
  return { kind:'video', readyState:'live', enabled:true, label:facing === 'user' ? 'Front Camera' : 'Back Camera',
    getSettings() { return {deviceId:id, facingMode:facing}; }, stop() { this.readyState='ended'; } };
}
function stream(t) { return { getVideoTracks:()=>[t], getTracks:()=>[t] }; }
const devices = [{kind:'videoinput',deviceId:'front',label:'Front Camera'}, {kind:'videoinput',deviceId:'back',label:'Back Camera'}];
const immediate = async () => {};
test('releases old camera first, uses strict facing and never requests audio',async()=>{
 const old=track('front','user'); const back=track('back','environment');
 const manager=create({enumerateDevices:async()=>devices, getUserMedia:async c=>{
  assert.equal(old.readyState,'ended'); assert.equal(c.audio,false); assert.equal(c.video.facingMode.exact,'environment');return stream(back);
 }},immediate);
 const result=await manager.open({previousTrack:old,facing:'environment'});assert.equal(result.track,back);assert.equal(result.restored,false);
});
test('deviceId fallback works when exact facing is not supported',async()=>{
 let count=0;const old=track('front','user');
 const manager=create({enumerateDevices:async()=>devices,getUserMedia:async c=>{
  count++; if(c.video.facingMode) throw error('OverconstrainedError');assert.equal(c.video.deviceId.exact,'back');return stream(track('back','environment'));
 }},immediate);
 assert.equal((await manager.open({previousTrack:old,facing:'environment'})).facing,'environment');assert.equal(count,2);
});
test('silently returning the same camera is rejected and its track stopped',async()=>{
 const wrong=track('front','user');let calls=0;
 const manager=create({enumerateDevices:async()=>devices,getUserMedia:async()=>stream(++calls===1?wrong:track('back','environment'))},immediate);
 const result=await manager.open({previousTrack:track('front','user'),facing:'environment'});
 assert.equal(wrong.readyState,'ended');assert.equal(result.facing,'environment');assert.equal(calls,2);
});
test('single-camera failure restores previous camera instead of black preview',async()=>{
 const manager=create({enumerateDevices:async()=>devices.slice(0,1),getUserMedia:async c=>{
  if(c.video.facingMode?.exact) throw error('OverconstrainedError');assert.equal(c.video.deviceId.exact,'front');return stream(track('front','user'));
 }},immediate);
 const r=await manager.open({previousTrack:track('front','user'),facing:'environment'});assert.equal(r.restored,true);assert.equal(r.facing,'user');
});
test('closing/leaving while camera permission is pending disposes the late stream',async()=>{
 let active=true;const late=track('back','environment');
 const manager=create({enumerateDevices:async()=>devices,getUserMedia:async()=>{active=false;return stream(late);}},immediate);
 await assert.rejects(manager.open({previousTrack:track('front','user'),facing:'environment',active:()=>active}),{name:'AbortError'});
 assert.equal(late.readyState,'ended');
});
test('initial open supports a single camera and reports actual facing',async()=>{
 const manager=create({enumerateDevices:async()=>devices.slice(0,1),getUserMedia:async c=>{assert.equal(c.audio,false);return stream(track('front','user'));}},immediate);
 const r=await manager.open({facing:'environment'});assert.equal(r.facing,'user');
});
test('already cancelled operations never request the camera',async()=>{
 let requested=false;const manager=create({getUserMedia:async()=>{requested=true;}},immediate);
 await assert.rejects(manager.open({active:()=>false}),{name:'AbortError'});assert.equal(requested,false);
});
test('permission denial does not pretend switching succeeded',async()=>{
 const manager=create({enumerateDevices:async()=>devices,getUserMedia:async()=>{throw error('NotAllowedError');}},immediate);
 await assert.rejects(manager.open({previousTrack:track('front','user'),facing:'environment'}),{name:'NotAllowedError'});
});
test('capture-permission UI, events and server state were removed',()=>{
 for(const file of ['public/room-features.js','lib/room-features.js','public/room-features.css']) {
  const source=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');
  assert.doesNotMatch(source,/capture-request|capture-vote|capture-revoke|capture-consent|tc-consent|showConsent/);
 }
});
