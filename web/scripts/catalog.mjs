// Read-only companion for the assistant: descriptions first, playback links after selection.
const [command,input]=process.argv.slice(2);
if(!['search','info'].includes(command)||!input){console.error('Usage: node web/scripts/catalog.mjs search <keywords> | info <series-id>');process.exit(2);}
if(!process.env.WB_PERSONAL_USER||!process.env.WB_PERSONAL_PASSWORD){console.error('Inject the existing personal Workbench identity through the authorized secret provider.');process.exit(2);}
if(command==='info'&&!/^\d{1,24}$/.test(input)){console.error('Invalid series ID');process.exit(2);}
const path=command==='search'?'/search?'+new URLSearchParams({q:input}):'/series/'+input;
try{
 const response=await fetch('https://plan.xiaoliang.tech/api/hongguo'+path,{headers:{Authorization:'Basic '+Buffer.from(`${process.env.WB_PERSONAL_USER}:${process.env.WB_PERSONAL_PASSWORD}`).toString('base64')},redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok){console.error(`Catalogue request failed (${response.status})`);process.exit(1);}
 const data=await response.json();
 const pick=s=>({id:s.id,title:s.title,description:s.description,episode_count:s.episode_count,url:`https://plan.xiaoliang.tech/watch?series=${s.id}`});
 console.log(JSON.stringify(command==='search'?data.items.map(pick):{...pick(data),episodes:data.episodes},null,2));
}catch{console.error('Catalogue unavailable; no playback was started.');process.exit(1);}
