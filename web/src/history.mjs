import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';

export function validProgress(p){return p&&typeof p.seriesId==='string'&&/^\d{1,24}$/.test(p.seriesId)&&typeof p.title==='string'&&p.title.length<=300&&Number.isInteger(p.episode)&&p.episode>0&&p.episode<=10000&&Number.isFinite(p.position)&&p.position>=0&&p.position<86400&&typeof p.quality==='string'&&p.quality.length<=30&&typeof p.updatedAt==='string'&&Number.isFinite(Date.parse(p.updatedAt))&&new Date(p.updatedAt).toISOString()===p.updatedAt&&Math.abs(Date.parse(p.updatedAt)-Date.now())<7*86400000;}
export function createHistoryStore(directory){
 let chain=Promise.resolve();
 const read=async()=>{try{const data=JSON.parse(await readFile(join(directory,'history.json'),'utf8'));if(!Array.isArray(data))throw new Error('Invalid watch history');return data;}catch(e){if(e.code==='ENOENT')return [];throw e;}};
 return {
  async list(){await chain;return read();},
  async save(progress){
   const work=chain.then(async()=>{const items=await read();const old=items.find(p=>p.seriesId===progress.seriesId);if(old&&old.updatedAt>progress.updatedAt)return;
    const next=[progress,...items.filter(p=>p.seriesId!==progress.seriesId)].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,40);
    await mkdir(directory,{recursive:true,mode:0o700});const tmp=join(directory,`history.${process.pid}.tmp`);
    await writeFile(tmp,JSON.stringify(next),{mode:0o600});await rename(tmp,join(directory,'history.json'));
   });chain=work.catch(()=>{});return work;
  }
 };
}
