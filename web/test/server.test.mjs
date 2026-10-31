import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createApp, selectStream, streamArgs} from '../src/server.mjs';

const basic='Basic '+Buffer.from('owner:secret').toString('base64');
async function fixture(t,options={}){
 let calls=0;
 const client={search:async()=>{calls++;return {items:[{id:'123',title:'测试剧',description:'剧情',cover_url:'https://example.com/cover'}]};},getSeries:async()=>({id:'123',title:'测试剧'}),listEpisodes:async()=>({items:[{id:'456',title:'第1集'}]}),resolvePlayback:async()=>({playback:{duration_seconds:60,protected:true,streams:[{definition:'1080p',width:1920,height:1080,bitrate:100,url:'https://cdn.example.com/secret?token=x'}]},contentKey:{key:'a'.repeat(32)}})};
 const app=createApp({client,username:'owner',password:'secret',secure:false,allowedOrigin:'http://127.0.0.1',...options});
 const server=createServer(app);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{app.dispose();server.closeAllConnections();server.close(r);}));
 return {url:`http://127.0.0.1:${server.address().port}/api/hongguo`,calls:()=>calls};
}
test('authentication fails closed before touching the upstream',async t=>{const f=await fixture(t);const r=await fetch(f.url+'/search?q=x');assert.equal(r.status,401);assert.equal(f.calls(),0);});
test('session cookie is HttpOnly and protected data excludes upstream secrets',async t=>{const f=await fixture(t);let r=await fetch(f.url+'/session',{method:'POST',headers:{Authorization:basic}});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);r=await fetch(f.url+'/playback/456',{headers:{Cookie:cookie.split(';')[0]}});assert.equal(r.status,200);const body=await r.text();assert.match(body,/1920/);assert.doesNotMatch(body,/secret|token=x|aaaaaaaa|contentKey/);});
test('foreign origins are rejected and query validation does not touch upstream',async t=>{const f=await fixture(t);assert.equal((await fetch(f.url+'/session',{method:'POST',headers:{Authorization:basic,Origin:'https://evil.example'}})).status,403);assert.equal((await fetch(f.url+'/search?q='+ 'x'.repeat(130),{headers:{Authorization:basic}})).status,400);assert.equal(f.calls(),0);});
test('best means highest resolution, then highest bitrate; unavailable quality fails',()=>{const streams=[{definition:'1080p',height:1080,bitrate:10,url:'a'},{definition:'1080p',height:1080,bitrate:20,url:'b'},{definition:'720p',height:720,bitrate:50,url:'c'}];assert.equal(selectStream(streams,'best').url,'b');assert.equal(selectStream(streams,'720p').url,'c');assert.throws(()=>selectStream(streams,'4k'));});
test('streaming uses pipes, preserves codec and seeks at the source',()=>{const args=streamArgs({url:'https://cdn.example.com/v',definition:'1080p'},'a'.repeat(32),120);assert.ok(args.indexOf('-ss')<args.indexOf('-i'));assert.equal(args.at(-1),'pipe:1');assert.ok(args.includes('copy'));assert.ok(!args.includes('out.mp4'));});
function fakeChild(){const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;child.kills=0;child.kill=()=>{child.kills++;child.exitCode=-1;child.stdout.destroy();return true;};return child;}
test('ffmpeg failure before media returns 502 instead of a successful empty video',async t=>{const f=await fixture(t,{spawn:()=>{const c=fakeChild();setImmediate(()=>{c.stdout.end();c.exitCode=1;c.emit('close',1);});return c;}});const r=await fetch(f.url+'/stream/456',{headers:{Authorization:basic}});assert.equal(r.status,502);});
test('ffmpeg failure after bytes aborts the video instead of reporting normal EOF',async t=>{const f=await fixture(t,{spawn:()=>{const c=fakeChild();setImmediate(()=>{c.stdout.write('truncated');setTimeout(()=>{c.stdout.end();c.exitCode=1;c.emit('close',1);},20);});return c;}});await assert.rejects(async()=>{const r=await fetch(f.url+'/stream/456',{headers:{Authorization:basic}});await r.text();});});
test('disconnect terminates the matching worker and frees the stream slot',async t=>{const workers=[];const f=await fixture(t,{maxStreams:1,spawn:()=>{const c=fakeChild();workers.push(c);setImmediate(()=>c.stdout.write('media'));return c;}});const r=await fetch(f.url+'/stream/456',{headers:{Authorization:basic}});assert.equal((await fetch(f.url+'/stream/456',{headers:{Authorization:basic}})).status,429);await r.body.cancel();await new Promise(r=>setTimeout(r,30));assert.equal(workers[0].kills,1);const second=await fetch(f.url+'/stream/456',{headers:{Authorization:basic}});assert.equal(second.status,200);await second.body.cancel();});
test('one series follows episode cursors and removes duplicated IDs',async t=>{const pages=[];const f=await fixture(t,{client:{getSeries:async()=>({id:'123',title:'目录测试'}),listEpisodes:async(_id,opts)=>{pages.push(opts?.cursor??'first');return opts?{items:[{id:'456'},{id:'457'}],has_more:false}:{items:[{id:'456'}],has_more:true,cursor:'next'};}}});const r=await fetch(f.url+'/series/123',{headers:{Authorization:basic}});const body=await r.json();assert.deepEqual(pages,['first','next']);assert.equal(body.episodes.length,2);assert.equal(body.has_more,false);});
test('anonymous source limits remain visible when no refresh adapter is available',async t=>{const f=await fixture(t,{client:{resolvePlayback:async()=>{throw Object.assign(new Error('private internals'),{code:'ANONYMOUS_LIMITED'});}}});const r=await fetch(f.url+'/playback/456',{headers:{Authorization:basic}});assert.equal(r.status,502);const body=await r.text();assert.match(body,/匿名设备/);assert.doesNotMatch(body,/private internals/);});
test('HTTP preparation uses the upstream refresh flow and reuses a still-valid model',async t=>{
 let time=Date.now(),attempts=0,resets=0;
 const f=await fixture(t,{now:()=>time,client:{resolvePlayback:async()=>{if(attempts++===0)throw Object.assign(new Error('empty'),{code:'ANONYMOUS_LIMITED'});return {playback:{duration_seconds:60,expires_at:(time+600000)/1000,streams:[{definition:'1080p',height:1080,width:1920,url:'https://cdn.example.com/v'}]}};},resetDevice:async()=>{resets++;}}});
 assert.equal((await fetch(f.url+'/playback/456',{headers:{Authorization:basic}})).status,200);time+=120000;
 assert.equal((await fetch(f.url+'/playback/456',{headers:{Authorization:basic}})).status,200);assert.equal(attempts,2);assert.equal(resets,1);
});
