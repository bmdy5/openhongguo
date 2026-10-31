// Explicit browser fixture. No platform calls and no playable media endpoint.
import {createServer} from 'node:http';
import {createApp} from '../src/server.mjs';
const progress={seriesId:'123',title:'续播竞态验收（合成资料）',episode:1,position:120,quality:'best',updatedAt:new Date().toISOString()};
const client={
 search:async()=>({items:[]}),
 getSeries:async id=>({id,title:progress.title,episode_count:2}),
 listEpisodes:async()=>({items:[{id:'456',title:'第1集'},{id:'457',title:'第2集'}],has_more:false}),
 resolvePlayback:async id=>({playback:{episode_id:id,duration_seconds:300,protected:false,streams:[{definition:'1080p',width:1920,height:1080,bitrate:1000,codec:'hevc',url:'https://example.invalid/never-fetch'}]}}),
};
const app=createApp({client,history:{list:async()=>{await new Promise(r=>setTimeout(r,800));return [progress];},save:async()=>{}},username:'wb-personal',password:'local-test-only',secure:false,allowedOrigin:'http://127.0.0.1:18764',spawn:()=>{throw new Error('Fixture must not play media');}});
const server=createServer(app).listen(8014,'127.0.0.1',()=>console.log('Synthetic browser fixture on loopback'));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{app.dispose();server.closeAllConnections();server.close();});
