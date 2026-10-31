import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHistoryStore,validProgress} from '../src/history.mjs';
test('progress survives reopening and an older request cannot overwrite a newer position',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'watch-history-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=createHistoryStore(dir);
 const p={seriesId:'123',title:'测试剧',episode:2,position:120,quality:'best',updatedAt:new Date().toISOString()};assert.ok(validProgress(p));
 await store.save(p);await store.save({...p,position:10,updatedAt:new Date(Date.now()-5000).toISOString()});
 assert.equal((await createHistoryStore(dir).list())[0].position,120);
 assert.equal(validProgress({...p,position:NaN}),false);assert.equal(validProgress({...p,seriesId:'../../private'}),false);
});
