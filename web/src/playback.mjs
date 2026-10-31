// Match upstream internal/cliapp/playback.go, not a general-purpose retry loop.
export async function resolveForPlayer(client,episodeId){
 for(let refreshes=0;;refreshes++){
  try{return await client.resolvePlayback(episodeId);}
  catch(error){
   if(error.code!=='ANONYMOUS_LIMITED'||refreshes>=2||typeof client.resetDevice!=='function')throw error;
   await client.resetDevice();
  }
 }
}

export function modelExpiry(playback,now){
 const expires=playback.expires_at;
 return typeof expires==='number'&&expires>0
  ? Math.min(now+15*60000,expires*1000-5000)
  : now+60000;
}
