import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {spawn as spawnProcess} from 'node:child_process';
import {validProgress} from './history.mjs';
import {resolveForPlayer,modelExpiry} from './playback.mjs';

const PREFIX='/api/hongguo';
const COOKIE='hongguo_session';
const digest=s=>createHash('sha256').update(s).digest();
const same=(a,b)=>timingSafeEqual(digest(a),digest(b));
const validId=s=>/^\d{1,24}$/.test(s);
function fail(status,message){return Object.assign(new Error(message),{status});}
export function selectStream(streams,quality='best'){
 const available=streams.filter(s=>s.url).sort((a,b)=>(b.height??0)-(a.height??0)||(b.bitrate??0)-(a.bitrate??0));
 const stream=quality==='best'?available[0]:available.find(s=>s.definition===quality);
 if(!stream)throw fail(400,'本集没有所选画质，请选择最高可用画质');return stream;
}
export function streamArgs(stream,key,start){
 const args=['-nostdin','-hide_banner','-loglevel','error','-rw_timeout','15000000'];
 if(start>0)args.push('-ss',String(start));
 if(key)args.push('-decryption_key',key);
 args.push('-i',stream.url,'-map','0:v:0','-map','0:a:0?','-c','copy');
 if(stream.codec==='bytevc1'||stream.codec==='hevc'||!stream.codec)args.push('-tag:v','hvc1');
 return [...args,'-avoid_negative_ts','make_zero','-movflags','frag_keyframe+empty_moov+default_base_moof','-f','mp4','pipe:1'];
}
function summary(s){return {id:s.id,title:s.title??'',description:(s.description??'').slice(0,3000),cover_url:/^https:\/\//.test(s.cover_url??'')?s.cover_url:'',episode_count:s.episode_count??0,tags:(s.tags??[]).slice(0,12)};}
export function createApp({client,username,password,history,secure=true,allowedOrigin='https://plan.xiaoliang.tech',spawn=spawnProcess,now=Date.now,maxStreams=2,diagnostic=()=>{}}){
 if(!username||!password)throw new Error('Personal account credentials must be injected before starting');
 const sessions=new Map(),cache=new Map(),children=new Set();let active=0,inFlight=0,queue=Promise.resolve();
 const basic='Basic '+Buffer.from(`${username}:${password}`).toString('base64');
 function authorized(req){
  if(req.headers.authorization)return same(req.headers.authorization,basic);
  const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  const expiry=token&&sessions.get(token);if(expiry&&expiry>now())return true;if(token)sessions.delete(token);return false;
 }
 async function upstream(fn){
  if(inFlight>=8)throw fail(429,'片库请求较多，请稍后再试');inFlight++;
  const result=queue.then(fn);queue=result.catch(()=>{});try{return await result;}finally{inFlight--;}
 }
 async function playback(id){
  const old=cache.get(id);if(old&&old.expiry>now())return old.value;
  const value=await upstream(()=>resolveForPlayer(client,id));
  const expiry=modelExpiry(value.playback,now());
  if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(id,{value,expiry});return value;
 }
 function json(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));}
 const app=async(req,res)=>{
  const origin=req.headers.origin;
  if((origin&&origin!==allowedOrigin)||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{message:'不允许跨站访问'});
  if(!authorized(req))return json(res,401,{message:'请先绑定个人工作台账号'});
  try{
   const url=new URL(req.url,'http://localhost');const path=url.pathname;
   if(req.method==='POST'&&path===PREFIX+'/session'){
    if(!req.headers.authorization)return json(res,401,{message:'请使用个人工作台账号连接'});
    for(const [token,expiry]of sessions)if(expiry<=now())sessions.delete(token);
    if(sessions.size>=32)sessions.delete(sessions.keys().next().value);
    const token=randomBytes(32).toString('base64url');sessions.set(token,now()+2*3600000);
    res.setHeader('set-cookie',`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=${PREFIX}; Max-Age=7200${secure?'; Secure':''}`);
    return json(res,200,{ok:true});
   }
   if(path===PREFIX+'/history'&&history){
    if(req.method==='GET')return json(res,200,{items:await history.list()});
    if(req.method==='PUT'){
     let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)throw fail(413,'进度记录过大');}
     let value;try{value=JSON.parse(body);}catch{throw fail(400,'进度格式无效');}
     if(!validProgress(value))throw fail(400,'进度格式无效');
     const {seriesId,title,episode,position,quality,updatedAt}=value;
     await history.save({seriesId,title,episode,position,quality,updatedAt});return json(res,200,{ok:true});
    }
   }
   if(req.method!=='GET')return json(res,405,{message:'不支持此请求方法'});
   if(path===PREFIX+'/search'){
    const q=(url.searchParams.get('q')??'').trim();if(!q||q.length>120)throw fail(400,'请输入1至120字的剧名或关键词');
    const result=await upstream(()=>client.search(q));return json(res,200,{items:result.items.slice(0,30).map(summary),has_more:result.has_more});
   }
   const match=path.match(/^\/api\/hongguo\/(series|playback|stream)\/(\d{1,24})$/);
   if(!match||!validId(match[2]))return json(res,404,{message:'找不到此接口'});
   const [,kind,id]=match;
   if(kind==='series'){
    const [series,episodes]=await upstream(async()=>{
     const series=await client.getSeries(id);let page=await client.listEpisodes(id);
     const items=new Map(page.items.map(e=>[e.id,e])),seen=new Set();
     for(let n=0;page.has_more&&page.cursor&&!seen.has(page.cursor)&&n<20&&items.size<10000;n++){
      seen.add(page.cursor);page=await client.listEpisodes(id,{cursor:page.cursor});
      for(const e of page.items)items.set(e.id,e);
     }
     return [series,{items:[...items.values()],has_more:page.has_more}];
    });
    return json(res,200,{...summary(series),episodes:episodes.items.map((e,i)=>({id:e.id,title:e.title??`第${i+1}集`,index:i+1})),has_more:!!episodes.has_more});
   }
   const result=await playback(id),pb=result.playback;
   if(kind==='playback')return json(res,200,{episode_id:id,duration_seconds:pb.duration_seconds,streams:pb.streams.filter(s=>s.url).map(s=>({definition:s.definition,width:s.width,height:s.height,bitrate:s.bitrate,codec:s.codec}))});
   const start=Number(url.searchParams.get('start')??0);if(!Number.isFinite(start)||start<0||start>=pb.duration_seconds)throw fail(400,'播放位置超出本集范围');
   const stream=selectStream(pb.streams,url.searchParams.get('quality')??'best');
   if(pb.protected&&!result.contentKey?.key)throw fail(422,'本集暂时无法播放');
   if(pb.audio_url||stream.hls||stream.dash)throw fail(422,'本集格式暂不支持在线播放');
   if(res.destroyed)return;
   if(active>=maxStreams)throw fail(429,'同时播放数量已达上限，请关闭其他播放页后重试');
   active++;
   let child;
   try{child=spawn('ffmpeg',streamArgs(stream,pb.protected?result.contentKey.key:null,start),{stdio:['ignore','pipe','pipe']});}catch{active--;throw fail(502,'无法启动播放服务');}
   children.add(child);child.stderr.resume();
   let stopped=false,timer;
   const stop=()=>{if(stopped)return;stopped=true;active--;clearTimeout(timer);clearTimeout(lifetime);children.delete(child);child.kill('SIGTERM');setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');},2000).unref();};
   const timeout=()=>{if(!res.headersSent)json(res,504,{message:'视频连接超时，请重试'});else res.destroy();stop();};
   const lifetime=setTimeout(timeout,Math.min(pb.duration_seconds+120,7200)*1000);lifetime.unref();
   const renew=()=>{clearTimeout(timer);timer=setTimeout(timeout,20000);timer.unref();};renew();
   child.on('error',()=>{if(!res.headersSent)json(res,502,{message:'播放服务暂不可用'});else res.destroy();stop();});
   child.stdout.once('data',()=>{if(!res.destroyed)res.writeHead(200,{'content-type':'video/mp4','cache-control':'no-store','x-accel-buffering':'no','x-content-type-options':'nosniff'});});
   child.stdout.on('data',renew);
   res.on('close',stop);
   child.stdout.on('error',()=>{res.destroy();stop();});
   child.stdout.pipe(res,{end:false});
   child.on('close',code=>{
    if(stopped)return;
    if(code===0){if(!res.headersSent)json(res,502,{message:'平台没有返回视频数据'});else res.end();}
    else if(!res.headersSent)json(res,502,{message:'视频连接失败，请重试'});
    else res.destroy();
    stop();
   });
  }catch(e){if(res.destroyed)return;if(res.headersSent)return res.destroy();
   const codes={AUTHENTICATION_REQUIRED:'本集需要平台登录，匿名设备无法播放',ANONYMOUS_LIMITED:'平台暂未向匿名设备返回这集，请稍后重试',RATE_LIMITED:'平台请求频繁，请稍后再试',CONTENT_UNAVAILABLE:'剧集已下架或暂不可用',CHALLENGE_REQUIRED:'平台要求验证，暂时无法访问'};
   if(!e.status)diagnostic({stage:'upstream',code:typeof e.code==='string'?e.code:'UNKNOWN'});
   json(res,e.status??502,{message:e.status?e.message:(codes[e.code]??'片库连接失败，请稍后重试')});
  }
 };
 app.dispose=()=>{for(const child of children)child.kill('SIGTERM');sessions.clear();cache.clear();};
 return app;
}
