import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFastPayload, fastForCharacter, publishFastSnapshot, resolveLiveCharacterId } from '../netlify/functions/_character-db/fast-state-core.mjs';
const epoch = Date.parse('2026-10-20T17:00:00.000Z');
const iso = (n=epoch) => new Date(n).toISOString();
const fixture = (timestamp=epoch) => ({schemaVersion:1,complete:true,observedAt:iso(timestamp),
  characters:Array.from({length:33},(_,i)=>({characterId:`char-${i}`, name:`Маг ${i}`,
    level:{current:1,experience:20,progress:76.92}}))});
function fakeStore() {
  let data=null,etag=null,n=0;
  return {async getWithMetadata(){return data ? {data,etag} : null;},
    async setJSON(_,value,cond) {
      if (data ? cond.onlyIfMatch!==etag : cond.onlyIfNew!==true) return {modified:false};
      data=value;etag=`e${++n}`;return {modified:true,etag};
    },peek:()=>data};
}
test('central snapshot preserves all 33 levels and Cyrillic names',()=>{
  const result=cleanFastPayload(fixture(),epoch+5000);
  assert.equal(result.count,33);
  assert.deepEqual(result.characters['char-0'].level,{current:1,experience:20,progress:76.92});
  assert.equal(result.characters['char-0'].name,'Маг 0');
});
test('fail closed on duplicates, invalid progress, nonnumeric experience, stale payload',()=>{
  for(const mutate of [p=>p.characters[1].characterId='char-0',p=>p.characters[1].level.progress=200,
    p=>p.characters[1].level.experience='20', p=>p.characters.pop(),p=>p.characters[0].name='']) {
    const p=fixture();mutate(p);
    if(p.characters.length===32)p.characters.length=8;
    assert.throws(()=>cleanFastPayload(p,epoch+5000));
  }
  assert.throws(()=>cleanFastPayload(fixture(),epoch+600000));
  assert.throws(()=>cleanFastPayload(fixture(epoch+180000),epoch));
});
test('snapshot CAS rejects older observations and unconfirmed writes',async()=>{
  const store=fakeStore();
  const old=cleanFastPayload(fixture(),epoch+1000);
  const updated=cleanFastPayload(fixture(epoch+60000),epoch+61000);
  assert.equal((await publishFastSnapshot(store,old)).status,'applied');
  assert.equal((await publishFastSnapshot(store,updated)).status,'applied');
  assert.equal((await publishFastSnapshot(store,old)).status,'superseded');
  assert.equal(store.peek().observedAt,updated.observedAt);
  const bad={getWithMetadata:async()=>null,setJSON:async()=>({modified:true})};
  await assert.rejects(publishFastSnapshot(bad,old),/not confirmed/);
});
test('per-character read is session-scoped, expires after 10 minutes',()=>{
  const p=cleanFastPayload(fixture(),epoch+1000);
  assert.equal(fastForCharacter(p,'char-1',epoch+6000).name,'Маг 1');
  assert.equal(fastForCharacter(p,'char-1',epoch+11*60_000),null);
  assert.equal(fastForCharacter(p,'char-44',epoch+5000),null);
  assert.equal(resolveLiveCharacterId({role:'player',cid:'ren'},'nero'),null);
  assert.equal(resolveLiveCharacterId({role:'admin',cid:'ren'},'nero'),'nero');
});
