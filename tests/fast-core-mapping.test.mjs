import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/SIRA_CHARACTER_FAST_CORE_V1.gs', import.meta.url),'utf8');
function harness({missing=null,progressWrong=null,rename=true}={}) {
  const ids=Array.from({length:33},(_,i)=>`char-${i}`);
  const links=ids.map((_,i)=>`fake_personal_sheet_${String(i).padStart(25,'x')}`);
  const realName=(i)=>i===1 && rename ? 'Магнолия Феер' : `Персонаж ${i}`;
  const cells=Array.from({length:165},()=>Array(10).fill(''));
  const abFormulas=Array.from({length:165},()=>['']);
  ids.forEach((_,i)=>{
    if(i===missing)return;
    const n=i*5;
    cells[n][0]=1;cells[n][9]=20;cells[n+1][0]=i===progressWrong?2:0.7692307692;
    abFormulas[n][0]=`=IMPORTRANGE("https://docs.google.com/spreadsheets/d/${links[i]}/edit";"ТЕХ!A1")`;
  });
  const registryRows=ids.map((id,i)=>[id,realName(i),`https://docs.google.com/spreadsheets/d/${links[i]}/edit`]);
  const writes=[];const properties=new Map();const triggers=[];
  const obj = { console:{log(){},error(){}}, Date, Set, Object, Array, JSON, isFinite,
    MAIN_SPREADSHEET_ID:'MAIN', SYSTEM_SPREADSHEET_ID:'SYSTEM',
    REGISTRY_SHEET_NAME:'САЙТ', MAIN_CHARACTERS_SHEET_NAME:'Маги',
    CHARACTER_SYNC_URL_V1:'https://test.local/.netlify/functions/character-sync',
    characterSyncSecretV1_:()=>'secret',
    SpreadsheetApp:{openById(id){return {getSheetByName(name){
      if(id==='MAIN'&&name==='САЙТ')return {getLastRow:()=>34,
        getRange(r,c,n,w){assert.deepEqual([r,c,n,w],[2,1,33,3]);return {getDisplayValues:()=>registryRows};}};
      if(id==='SYSTEM'&&name==='Маги')return {getLastRow:()=>166,
        getRange(r,c,n,w){assert.equal(r,2);assert.equal(n,165);
          if(c===20&&w===10)return {getValues:()=>cells};
          if(c===28&&w===1)return {getFormulas:()=>abFormulas};
          throw new Error('Unexpected scan range');}};
      return null;}};}},
    UrlFetchApp:{fetch(url, opts){writes.push({url,body:JSON.parse(opts.payload)});return {getResponseCode:()=>200,
      getContentText:()=>JSON.stringify({ok:true,status:'applied',count:33})};}},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key)??null,
      setProperty:(key,value)=>properties.set(key,value)})},
    Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},
      computeDigest:(_,_text)=>[_text.length%255,99],base64EncodeWebSafe:bytes=>bytes.join('-')},
    ScriptApp:{getProjectTriggers:()=>triggers,newTrigger:()=>({timeBased(){return this;},everyMinutes(){return this;},create(){triggers.push({getHandlerFunction:()=> 'siraFastCoreWorkerV1'});}}),deleteTrigger(){}},
  };
  vm.createContext(obj); new vm.Script(source).runInContext(obj);
  return {ctx:obj, writes};
}
test('33 characters map by personal sheet ID even after Magnolia rename',()=>{
  const h=harness(); const result=h.ctx.siraFastCoreReadV1_();
  assert.equal(result.ok,true); assert.equal(result.matched,33);
  assert.equal(result.characters.find(x=>x.characterId==='char-1').name,'Магнолия Феер');
  assert.equal(result.characters.find(x=>x.characterId==='char-1').level.progress,76.92);
  assert.equal(h.writes.length,0);
});
test('missing link fails audit and never publishes incomplete snapshot',()=>{
  const h=harness({missing:1});
  const audit=h.ctx.siraFastCoreAuditV1();assert.equal(audit.ok,false);
  assert.equal(audit.missing[0],'char-1');
  assert.throws(()=>h.ctx.siraFastCoreWorkerV1(),/incomplete scan/);
  assert.equal(h.writes.length,0);
});
test('wrong imported percent fails closed (level formula broken)',()=>{
  const h=harness({progressWrong:10});
  const audit=h.ctx.siraFastCoreAuditV1(); assert.equal(audit.ok,false);
  assert.equal(audit.invalid[0].id,'char-10');
});
test('worker publishes all 33 only after complete audit',()=>{
  const h=harness();
  const result=h.ctx.siraFastCoreWorkerV1(); assert.equal(result.ok,true);assert.equal(result.count,33);
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].body.complete,true);
  assert.equal(h.writes[0].body.characters.length,33);
  assert.match(h.writes[0].url,/\/character-fast-state$/);
});
