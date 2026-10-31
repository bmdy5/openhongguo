import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveForPlayer,modelExpiry} from '../src/playback.mjs';
const limited=()=>Object.assign(new Error('empty'),{code:'ANONYMOUS_LIMITED'});
test('matches upstream CLI: refresh only after an empty playback model, then continue',async()=>{
 let attempts=0,resets=0;const result=await resolveForPlayer({resolvePlayback:async()=>{if(attempts++===0)throw limited();return {playback:{streams:[]}};},resetDevice:async()=>{resets++;}},'123');
 assert.equal(attempts,2);assert.equal(resets,1);assert.ok(result.playback);
});
test('never refreshes more than twice for one playback preparation',async()=>{
 let attempts=0,resets=0;await assert.rejects(()=>resolveForPlayer({resolvePlayback:async()=>{attempts++;throw limited();},resetDevice:async()=>{resets++;}},'123'),{code:'ANONYMOUS_LIMITED'});
 assert.equal(attempts,3);assert.equal(resets,2);
});
test('login, captcha and actual rate limits stop without device refresh',async()=>{
 for(const code of ['AUTHENTICATION_REQUIRED','CHALLENGE_REQUIRED','RATE_LIMITED']){
  let resets=0,attempts=0;await assert.rejects(()=>resolveForPlayer({resolvePlayback:async()=>{attempts++;throw Object.assign(new Error('stop'),{code});},resetDevice:async()=>{resets++;}},'123'),{code});assert.equal(resets,0);assert.equal(attempts,1);
 }
});
test('registration failure stops instead of looping',async()=>{
 let attempts=0;await assert.rejects(()=>resolveForPlayer({resolvePlayback:async()=>{attempts++;throw limited();},resetDevice:async()=>{throw Object.assign(new Error('register failed'),{code:'TRANSPORT'});}},'123'),{code:'TRANSPORT'});assert.equal(attempts,1);
});
test('reuse issued models until their expiry, with a 15-minute memory cap',()=>{
 const now=1000000;assert.equal(modelExpiry({expires_at:(now+600000)/1000},now),now+595000);assert.equal(modelExpiry({expires_at:(now+3600000)/1000},now),now+900000);assert.equal(modelExpiry({},now),now+60000);assert.ok(modelExpiry({expires_at:100},now)<now);
});
