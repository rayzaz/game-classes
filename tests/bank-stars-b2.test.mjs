import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateStarsSnapshot, saveStarsSnapshot, viewStarsSnapshot,
  ACCOUNT_COUNT} from '../netlify/functions/_bank-stars-v2/snapshot.mjs';

const now = Date.now();
const roster = Array.from({length:ACCOUNT_COUNT},(_,i)=>({
  characterId:`player-${i+1}`,name:`Персонаж ${i+1}`,stars:0,version:0
}));
const payload = () => ({schemaVersion:2,complete:true,currency:'stars',observedAt:new Date(now).toISOString(),
  accounts:roster.map(x=>({...x}))});

test('SIRA new stars snapshot accepts all 34 zero-balance accounts',()=>{
  const snapshot=validateStarsSnapshot(payload(),now);
  assert.equal(snapshot.count,34);
  assert.equal(snapshot.accounts['player-1'].stars,0);
  assert.equal(Object.keys(snapshot.accounts).length,34);
});

test('rejects partial, duplicate, negative, fractional and nonnumeric balances',()=>{
  for (const change of [
    x=>x.accounts.pop(),
    x=>x.accounts[1].characterId=x.accounts[0].characterId,
    x=>x.accounts[0].stars=-1,
    x=>x.accounts[0].stars=0.5,
    x=>x.accounts[0].stars='0',
    x=>x.accounts[0].version=-1,
    x=>x.accounts[0].name='',
  ]) {const x=payload();change(x);assert.throws(()=>validateStarsSnapshot(x,now));}
});

test('rejects Yuli currency and any accidental juli-only payload',()=>{
  const x=payload(); x.currency='juli'; assert.throws(()=>validateStarsSnapshot(x,now));
  delete x.currency; assert.throws(()=>validateStarsSnapshot(x,now));
});

test('rejects stale timestamps and future timestamps',()=>{
  const x=payload(); x.observedAt=new Date(now-400000).toISOString();
  assert.throws(()=>validateStarsSnapshot(x,now));
  x.observedAt=new Date(now+300000).toISOString();assert.throws(()=>validateStarsSnapshot(x,now));
});

test('players see only own stars, no complete roster',()=>{
  const snap=validateStarsSnapshot(payload(),now);
  const view=viewStarsSnapshot(snap,{cid:'player-2',role:'player'},false,now);
  assert.equal(view.available,true);
  assert.equal(view.readOnly,true);
  assert.equal(view.accounts.length,1);
  assert.equal(view.accounts[0].characterId,'player-2');
  assert.equal(view.ownAccount.characterId,'player-2');
  assert.equal(view.accounts.find(x=>x.characterId==='player-1'),undefined);
});

test('unlinked player sees no accounts, no fallback by name',()=>{
  const snap=validateStarsSnapshot(payload(),now);
  const view=viewStarsSnapshot(snap,{cid:'unknown',sub:'player-3'},false,now);
  assert.deepEqual(view.accounts,[]);
  assert.equal(view.ownAccount,null);
});

test('admin and banker may read all 34, but only in read-only mode',()=>{
  const snap=validateStarsSnapshot(payload(),now);
  const view=viewStarsSnapshot(snap,{cid:'player-1'},true,now);
  assert.equal(view.accounts.length,34);
  assert.equal(view.readOnly,true);
  assert.equal(view.canManageBank,true);
});

test('stale snapshots return no balances, even to banker',()=>{
  const snap=validateStarsSnapshot(payload(),now);
  const view=viewStarsSnapshot(snap,{cid:'player-1'},true,now+16*60000);
  assert.equal(view.available,false);
  assert.equal(view.accounts.length,0);
  assert.equal(view.ownAccount,undefined);
});

test('CAS rejects older or same snapshots and fails unconfirmed writes',async()=>{
  const snap=validateStarsSnapshot(payload(),now);
  let current=null;
  const store={
    async getWithMetadata(){return current;},
    async setJSON(key,value,opts){
      assert.match(key,/stars-v2/);
      if(!current) assert.equal(opts.onlyIfNew,true);
      else assert.equal(opts.onlyIfMatch,'e1');
      current={data:value,etag:'e1'};
      return {modified:true,etag:'e1'};
    }
  };
  assert.equal((await saveStarsSnapshot(store,snap)).status,'applied');
  assert.equal((await saveStarsSnapshot(store,snap)).status,'superseded');
  const older={...snap,observedAt:new Date(now-60000).toISOString()};
  assert.equal((await saveStarsSnapshot(store,older)).status,'superseded');
  const bad={async getWithMetadata(){return null;},async setJSON(){return {modified:true};}};
  await assert.rejects(()=>saveStarsSnapshot(bad,snap));
});

test('Apps Script reads only Stars tab and never opens Yuli or writes to Google',()=>{
  const source=readFileSync(new URL('../scripts/SIRA_BANK_STARS_B2_READ_ONLY.gs',import.meta.url),'utf8');
  let openedTabs=[];
  const context={
    PropertiesService:{getScriptProperties:()=>({getProperty:(key)=>key==='SIRA_BANK_V2_GOOGLE_SPREADSHEET_ID'?'mock-bank-id':null})},
    siraBankB1Roster_:()=>Array.from({length:34},(_,i)=>({id:`player-${i+1}`,name:`Персонаж ${i+1}`})),
    SpreadsheetApp:{openById:()=>({getSheetByName:(name)=>{
      openedTabs.push(name);
      if(name!=='Звёзды') throw new Error('Forbidden tab');
      return {getLastRow:()=>35,getRange:(row,col,count,width)=>({
        getDisplayValues:()=>[['characterId','Имя персонажа','Баланс','Обновлено UTC','Кем изменено','Версия']],
        getValues:()=>Array.from({length:34},(_,i)=>[`player-${i+1}`,`Персонаж ${i+1}`,0,'','',0])
      })};
    }})}
  };
  vm.createContext(context);vm.runInContext(source,context);
  const data=context.siraStarsB2Read_();
  assert.equal(data.accounts.length,34);
  assert.deepEqual(openedTabs,['Звёзды']);
  assert.ok(!/\.setValues\(|\.appendRow\(|\.setValue\(/.test(source));
});

test('old /bank POST disabled, new UI never sends balance mutations',()=>{
  const backend=readFileSync(new URL('../netlify/functions/bank.mjs',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/components/BankPage.tsx',import.meta.url),'utf8');
  assert.match(backend,/Старый банк закрыт для операций/);
  assert.match(backend,/410/);
  assert.ok(!/method:\s*['"]POST['"]/.test(ui));
  assert.match(ui,/bank-stars-v2/);
  assert.ok(!ui.includes('/.netlify/functions/bank\''));
});
