import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  driveFileId, preferredPortraitUrl, safePortraitId, assertPortraitPayload,
  publishPortraitOverride, readPortraitOverride, portraitOverrideKey
} from '../netlify/functions/_character-db/portrait-source.mjs';
const A = '1AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPp';
const B = '2AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPp';
const source = `https://drive.google.com/file/d/${A}/view?usp=sharing`;
const payload = (when = new Date().toISOString()) => ({ schemaVersion: 1,
  observedAt: when, portraits: [{ characterId: 'mangoliya-feer', source }] });
class MemoryStore {
  constructor(){this.data=new Map(); this.seq=0;}
  async getWithMetadata(key){const v=this.data.get(key);return v ? structuredClone(v) : null;}
  async get(key){return (await this.getWithMetadata(key))?.data || null;}
  async setJSON(key,value,condition){
    const prev=this.data.get(key);
    if (condition.onlyIfNew && prev) return {modified:false};
    if (condition.onlyIfMatch && (!prev || condition.onlyIfMatch!==prev.etag)) return {modified:false};
    const etag='"'+(++this.seq)+'"';this.data.set(key,{data:structuredClone(value),etag});
    return {modified:true,etag};
  }
}
test('Drive file IDs accepted only on trustworthy canonical Drive origins',()=>{
  assert.equal(driveFileId(source),A);
  assert.equal(driveFileId('https://drive.google.com/uc?export=view&id='+A),A);
  assert.equal(driveFileId('https://drive.google.com/thumbnail?id='+A+'&sz=w1600'),A);
  assert.equal(driveFileId('https://drive.google.com.evil.example/file/d/'+A+'/view'),'');
  assert.equal(driveFileId('http://drive.google.com/file/d/'+A+'/view'),'');
  assert.equal(driveFileId('https://evil.com/file/d/'+A+'/view'),'');
  assert.equal(driveFileId('https://drive.google.com/file/d/short/view'),'');
  assert.match(preferredPortraitUrl(source),/^https:\/\/drive\.google\.com\/thumbnail\?/);
  assert.equal(driveFileId(preferredPortraitUrl(source)),A);
});
test('Validates count, time, distinct IDs and rejects non-Drive sources',()=>{
  assert.equal(assertPortraitPayload(payload()).portraits.length,1);
  assert.throws(()=>assertPortraitPayload({...payload(),portraits:[]}),/schema or count/);
  assert.throws(()=>assertPortraitPayload({...payload(),portraits:[{characterId:'ren',source:'https://evil.com/a.jpg'}]}),/portrait entry/);
  assert.throws(()=>assertPortraitPayload({...payload(),portraits:[{characterId:'ren',source},{characterId:'ren',source}]}),/portrait entry/);
  assert.throws(()=>assertPortraitPayload(payload(new Date(Date.now()+3600000).toISOString())),/acceptable window/);
  assert.throws(()=>assertPortraitPayload(payload(new Date(Date.now()-8*86400000).toISOString())),/acceptable window/);
  assert.equal(safePortraitId('../secret'),'');
});
test('Portrait override is independent from characters snapshot key',async()=>{
  const store=new MemoryStore(); const stamp=new Date().toISOString();
  const result=await publishPortraitOverride(store,'mangoliya-feer',source,stamp);
  assert.equal(result,'applied');
  assert.equal((await readPortraitOverride(store,'mangoliya-feer')),source);
  assert.deepEqual([...store.data.keys()],[portraitOverrideKey('mangoliya-feer')]);
  assert.equal(await store.get('characters/mangoliya-feer'),null);
});
test('Older or same observed version cannot overwrite a newer portrait',async()=>{
  const store=new MemoryStore(); const newer=new Date(Date.now()-1000).toISOString();
  const older=new Date(Date.now()-5000).toISOString();
  assert.equal(await publishPortraitOverride(store,'kaleb-vidogast',source,newer),'applied');
  assert.equal(await publishPortraitOverride(store,'kaleb-vidogast',`https://drive.google.com/file/d/${B}/view`,older),'superseded');
  assert.equal(await publishPortraitOverride(store,'kaleb-vidogast',`https://drive.google.com/file/d/${B}/view`,newer),'superseded');
  assert.equal(driveFileId(await readPortraitOverride(store,'kaleb-vidogast')),A);
});
test('Never returns unvalidated or unrelated stored portrait overrides',async()=>{
  const store=new MemoryStore();
  store.data.set(portraitOverrideKey('feliks-raunbaunt'),{etag:'"1"',data:{characterId:'other',source}});
  assert.equal(await readPortraitOverride(store,'feliks-raunbaunt'),'');
});
test('Proxy reads portrait overrides before stale Character DB',()=>{
  const code=fs.readFileSync(new URL('../netlify/functions/character-portrait.mjs',import.meta.url),'utf8');
  assert.match(code,/readPortraitOverride\(getCharacterDbStore\(\), characterId\)/);
  assert.match(code,/overrideSource\s*\? preferredPortraitUrl\(overrideSource\)/);
});
test('Admin list consistently uses the proxy instead of direct portrait URLs',()=>{
  const code=fs.readFileSync(new URL('../netlify/functions/admin-characters.mjs',import.meta.url),'utf8');
  assert.match(code,/characterPortraitProxyUrl\(characterId, 'portrait-fix-v4'\)/);
});
test('Apps Script reads AS1, but does not change Google sheets or triggers',()=>{
  const code=fs.readFileSync(new URL('../scripts/SIRA_PORTRAIT_OVERRIDE_REPAIR_V4.gs',import.meta.url),'utf8');
  assert.match(code,/getRange\('AS1'\)\.getDisplayValue\(\)/);
  assert.doesNotMatch(code, /\.set(Value|Values|Formula|Formulas|RichTextValue)\(/);
  assert.doesNotMatch(code, /newTrigger\(/);
  assert.match(code,/siraPortraitV4Audit/);
  assert.match(code,/siraPortraitV4Publish/);
});
