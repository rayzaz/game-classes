import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLivePayload, liveForCharacter, publishLiveSnapshot, validMetric, resolveLiveCharacterId } from '../netlify/functions/_character-db/live-state-core.mjs';
const iso = '2026-10-12T00:00:00.000Z';
const mkPayload = (time=iso) => ({ schemaVersion:1, complete:true, observedAt:time,
  characters:Array.from({length:33},(_,i)=>({characterId:`char-${i}`,health:{current:0,max:100},mana:{current:200,max:300}})) });
function fakeStore() {
  let value=null; let etag=null; let index=0;
  return {
    async getWithMetadata() {return value===null?null:{data:value,etag}},
    async setJSON(k,doc,opts) {
      if (value===null ? opts.onlyIfNew !== true : opts.onlyIfMatch !== etag) return { modified:false };
      value=doc; etag=`v${++index}`; return {modified:true,etag};
    },
    value:()=>value,
  };
}
test('accept valid 33 characters, including zero HP',()=>{
 const v=cleanLivePayload(mkPayload(),Date.parse(iso)+1000);
 assert.equal(v.count,33);assert.equal(v.characters['char-0'].health.current,0);
});
test('reject missing, duplicate, bogus max, incomplete and stale payloads',()=>{
 for (const alter of [p=>p.complete=false,p=>p.characters.pop(),p=>p.characters[1].characterId='char-0',p=>p.characters[1].health.max=0,p=>p.characters[1].health.current='15']) {
  const p=mkPayload();alter(p);if(p.characters.length===32 && p.complete) p.characters.length=9;
  assert.throws(()=>cleanLivePayload(p,Date.parse(iso)+1000));
 }
 assert.throws(()=>cleanLivePayload(mkPayload(),Date.parse(iso)+400000));
});
test('reject NaN, negative, invalid metrics',()=>{
 assert.equal(validMetric({current:-1,max:100}),false);
 assert.equal(validMetric({current:NaN,max:100}),false);
 assert.equal(validMetric({current:0,max:200}),true);
});
test('publish latest, reject older and equal version',async()=>{
 const store=fakeStore();const v1=cleanLivePayload(mkPayload(),Date.parse(iso)+1000);
 const later='2026-10-12T00:01:00.000Z';const v2=cleanLivePayload(mkPayload(later),Date.parse(later)+1000);
 assert.equal((await publishLiveSnapshot(store,v1)).status,'applied');
 assert.equal((await publishLiveSnapshot(store,v2)).status,'applied');
 assert.equal((await publishLiveSnapshot(store,v1)).status,'superseded');
 assert.equal(store.value().observedAt,later);
});
test('read only correct character, reject stale',()=>{
 const s=cleanLivePayload(mkPayload(),Date.parse(iso)+1000);
 assert.equal(liveForCharacter(s,'char-4',Date.parse(iso)+1000).mana.current,200);
 assert.equal(liveForCharacter(s,'char-42',Date.parse(iso)+1000),null);
 assert.equal(liveForCharacter(s,'char-4',Date.parse(iso)+20*60*1000),null);
});
test('never accept unconfirmed blob success',async()=>{
 const s=cleanLivePayload(mkPayload(),Date.parse(iso)+1000);
 const store={ getWithMetadata:async()=>null,setJSON:async()=>({modified:true})};
 await assert.rejects(()=>publishLiveSnapshot(store,s),/not confirmed/);
});

test('players cannot fetch another character; admin can',()=>{
 assert.equal(resolveLiveCharacterId({role:'player',cid:'ren'},null),'ren');
 assert.equal(resolveLiveCharacterId({role:'player',cid:'ren'},'nero'),null);
 assert.equal(resolveLiveCharacterId({role:'admin',cid:''},'nero'),'nero');
 assert.equal(resolveLiveCharacterId(null,'ren'),null);
});
