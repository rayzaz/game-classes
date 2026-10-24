import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { cleanFastPayload, fastForCharacter } from '../netlify/functions/_character-db/fast-state-core.mjs';
const gs=fs.readFileSync(new URL('../scripts/SIRA_CHARACTER_FAST_CORE_V1.gs',import.meta.url),'utf8');
const ids=Array.from({length:34},(_,i)=>`char-${i}`);
const names=i=>i===12?'Магнолия Феер':`Персонаж ${i}`;
const links=ids.map((_,i)=>`sheet_${String(i).padStart(27,'x')}`);
function setup({missingName=-1,missingLabel=-1,badValue=-1}={}) {
  const system=Array.from({length:170},()=>Array(10).fill(''));
  const ab=Array.from({length:170},()=>['']);
  const main=Array.from({length:170},()=>Array(90).fill(''));
  ids.forEach((id,i)=>{
    const offset=i*5;
    system[offset+1][0]=i+1;
    system[offset+1][9]=50+i;
    system[offset+2][0]=0.5;
    ab[offset][0]=`=IMPORTRANGE("https://docs.google.com/spreadsheets/d/${links[i]}/edit";"ТЕХ!A1")`;
    main[offset][1]=i===missingName?'Wrong name':names(i);
    if(i!==missingLabel)main[offset][5]='Баллы прокачки';
    main[offset][6]=i===badValue?'#N/A':String(100+i);
  });
  const registry=ids.map((id,i)=>[id,names(i),`https://docs.google.com/spreadsheets/d/${links[i]}/edit`]);
  const writes=[], props=new Map();
  const sheets={
    MAINMAINMAINMAINMAINMAINMAIN:{
      'САЙТ':{getLastRow:()=>35,getRange:(r,c,n,w)=>({getDisplayValues:()=>{assert.deepEqual([r,c,n,w],[2,1,34,3]);return registry;}})},
      'Маги':{getLastRow:()=>171,getLastColumn:()=>90,getRange:(r,c,n,w)=>({getDisplayValues:()=>{assert.deepEqual([r,c,n,w],[2,1,170,90]);return main;}})}
    },
    SYSTEMSYSTEMSYSTEMSYSTEMSYS:{'Маги':{getLastRow:()=>171,getRange:(r,c,n,w)=>{
      assert.equal(r,2);assert.equal(n,170);
      if(c===20&&w===10)return {getValues:()=>system};
      if(c===28&&w===1)return {getFormulas:()=>ab};
      throw Error('Bad source range');
    }}}
  };
  const ctx={console:{log(){},error(){}},Date,Set,Object,Array,JSON,Map,isFinite,
    MAIN_SPREADSHEET_ID:'MAINMAINMAINMAINMAINMAINMAIN',SYSTEM_SPREADSHEET_ID:'SYSTEMSYSTEMSYSTEMSYSTEMSYS',REGISTRY_SHEET_NAME:'САЙТ',MAIN_CHARACTERS_SHEET_NAME:'Маги',
    CHARACTER_SYNC_URL_V1:'https://test.local/.netlify/functions/character-sync',characterSyncSecretV1_:()=> 'secret',
    SpreadsheetApp:{openById(id){return {getSheetByName(name){return sheets[id]?.[name]??null;}};}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)??null,setProperty:(k,v)=>props.set(k,v)})},
    UrlFetchApp:{fetch(url,opts){writes.push({url,body:JSON.parse(opts.payload)});return {getResponseCode:()=>200,
      getContentText:()=>JSON.stringify({ok:true,status:'applied',count:34})};}},
    Utilities:{DigestAlgorithm:{SHA_256:'x'},Charset:{UTF_8:'x'},computeDigest:(_,s)=>[s.length%250,2],base64EncodeWebSafe:a=>a.join('-')},
    ScriptApp:{getProjectTriggers:()=>[]}
  };
  vm.createContext(ctx);new vm.Script(gs).runInContext(ctx);return {ctx,writes};
}
test('All 34 IDs map through SYSTEM; points from MAIN; renamed Magnolia',()=>{
  const {ctx}=setup();const r=ctx.siraFastCoreReadV1_();assert.equal(r.ok,true);assert.equal(r.matched,34);
  const mag=r.characters.find(c=>c.characterId==='char-12');assert.equal(mag.name,'Магнолия Феер');
  assert.equal(mag.upgradePoints,112);assert.equal(mag.level.experience,62);
});
test('Bad MAIN name, missing label or corrupt number fail closed before publishing',()=>{
  for(const config of [{missingName:2},{missingLabel:3},{badValue:5}]){
    const {ctx,writes}=setup(config);assert.equal(ctx.siraFastCoreReadV1_().ok,false);
    assert.throws(()=>ctx.siraFastCoreWorkerV1(),/incomplete scan/);assert.equal(writes.length,0);
  }
});
test('Worker publishes full source snapshot with XP and upgrade points',()=>{
  const {ctx,writes}=setup();const r=ctx.siraFastCoreWorkerV1();assert.equal(r.ok,true);assert.equal(r.count,34);
  assert.equal(writes.length,1);assert.equal(writes[0].body.characters[0].upgradePoints,100);
  assert.match(writes[0].url,/\/character-fast-state$/);
});
test('Old fast snapshots remain valid; malformed points rejected',()=>{
  const now=Date.now();const body={schemaVersion:1,complete:true,observedAt:new Date(now).toISOString(),
    characters:ids.map(id=>({characterId:id,name:id,level:{current:1,experience:100,progress:30}}))};
  const old=cleanFastPayload(body,now);assert.equal(old.count,34);
  assert.equal(fastForCharacter(old,'char-0',now).upgradePoints,undefined);
  body.characters[0].upgradePoints=250;
  const fresh=cleanFastPayload(body,now);assert.equal(fastForCharacter(fresh,'char-0',now).upgradePoints,250);
  for(const value of [-1,3.2,'250',Number.NaN,1e12]){
    body.characters[0].upgradePoints=value;
    assert.throws(()=>cleanFastPayload(body,now),/Invalid\/duplicate/);
  }
});
test('Preflight script is read-only',()=>{
  const s=fs.readFileSync(new URL('../SIRA_XP_POINTS_E2_READ_ONLY_AUDIT.gs',import.meta.url),'utf8');
  assert.match(s,/function siraE2AuditReadOnly/);
  assert.doesNotMatch(s,/\.setValue\(|\.setValues\(|newTrigger\(|UrlFetchApp\.fetch\(/);
});
test('Player XP and upgrade points use fast source when present',()=>{
  const s=fs.readFileSync(new URL('../src/components/PlayerCabinet.tsx',import.meta.url),'utf8');
  assert.match(s,/cabinetFast\?\.upgradePoints \?\? data\.upgradePoints/);
  assert.match(s,/initialUpgradePoints=\{cabinetFast\?\.upgradePoints \?\? data\.upgradePoints\}/);
  assert.match(s,/cabinetFast\?\.level \?\? data\.level/);
});
