import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateStarsSnapshot,viewStarsSnapshot,saveStarsSnapshot,ACCOUNT_COUNT} from '../netlify/functions/_bank-stars-v2/snapshot.mjs';

const now=Date.now();
const original=()=>({schemaVersion:2,complete:true,currency:'stars',
  observedAt:new Date(now).toISOString(),accounts:Array.from({length:ACCOUNT_COUNT},(_,i)=>({
    characterId:`p-${i+1}`,name:`Персонаж ${i+1}`,stars:0,version:0
  }))});
const tx=(id,cid)=>({transactionId:id,characterId:cid,
  occurredAt:new Date(now-60000).toISOString(),kind:'Начисление',
  amount:5,balanceBefore:0,balanceAfter:5,reason:'Награда',bankerLogin:'admin-one'});
function withHistory(){return {...original(),historyComplete:true,history:[tx('t1','p-1'),tx('t2','p-2')],historyTotal:2};}

test('old B2 snapshot remains readable but does not pretend the history is empty',()=>{
  const snap=validateStarsSnapshot(original(),now);
  const view=viewStarsSnapshot(snap,{cid:'p-1'},false,now);
  assert.equal(view.historyAvailable,false);
  assert.equal(view.history.length,0);
  assert.equal(view.accounts.length,1);
});

test('player gets only their account and their own operations (no banker login)',()=>{
  const snap=validateStarsSnapshot(withHistory(),now);
  const view=viewStarsSnapshot(snap,{cid:'p-1',role:'player'},false,now);
  assert.equal(view.count,1);
  assert.deepEqual(view.accounts.map(x=>x.characterId),['p-1']);
  assert.deepEqual(view.history.map(x=>x.characterId),['p-1']);
  assert.equal(view.history[0].reason,'Награда');
  assert.equal('bankerLogin' in view.history[0],false);
  assert.equal(view.canManageBank,false);
});

test('staff may see the roster and operations including banker login',()=>{
  const snap=validateStarsSnapshot(withHistory(),now);
  const view=viewStarsSnapshot(snap,{cid:'',role:'admin'},true,now);
  assert.equal(view.accounts.length,34);
  assert.equal(view.history.length,2);
  assert.equal(view.history[0].bankerLogin,'admin-one');
  assert.equal(view.ownAccount,null);
});

test('unlinked player cannot see accounts or history by login or query character ID',()=>{
  const snap=validateStarsSnapshot(withHistory(),now);
  const view=viewStarsSnapshot(snap,{cid:'not-in-bank',sub:'p-1',role:'player'},false,now);
  assert.equal(view.accounts.length,0);
  assert.equal(view.history.length,0);
  assert.equal(view.ownAccount,null);
});

test('reject malformed histories, duplicates, alien IDs, bad balances and partial payloads',()=>{
  const cases=[
    x=>{x.history[1].transactionId=x.history[0].transactionId;},
    x=>{x.history[0].characterId='other';},
    x=>{x.history[0].amount=-3;},
    x=>{x.history[0].reason='a'.repeat(501);},
    x=>{x.history[0].occurredAt='nonsense';},
    x=>{x.historyTotal=1;},
    x=>{x.historyComplete=false;},
    x=>{x.history[0].bankerLogin=123;},
  ];
  for(const change of cases){const payload=withHistory();change(payload);assert.throws(()=>validateStarsSnapshot(payload,now));}
});

test('stale view discloses neither balances nor history',()=>{
  const snap=validateStarsSnapshot(withHistory(),now);
  const view=viewStarsSnapshot(snap,{cid:'p-1'},false,now+16*60_000);
  assert.equal(view.available,false);
  assert.deepEqual(view.accounts,[]);
  assert.deepEqual(view.history,[]);
});

test('returns truncated history notice without revealing global transaction count to a player',()=>{
  const payload=withHistory();payload.historyTotal=5000;
  const snap=validateStarsSnapshot(payload,now);
  const view=viewStarsSnapshot(snap,{cid:'p-1'},false,now);
  assert.equal(view.historyHasMore,true);
  assert.equal('historyTotal' in view,false);
});

test('CAS continues to protect against outdated source snapshots',async()=>{
  let existing=null;
  const store={async getWithMetadata(){return existing;},async setJSON(_key,value){existing={data:value,etag:'e1'};return {modified:true,etag:'e1'};}};
  const snapshot=validateStarsSnapshot(withHistory(),now);
  assert.equal((await saveStarsSnapshot(store,snapshot)).status,'applied');
  assert.equal((await saveStarsSnapshot(store,snapshot)).status,'superseded');
});

test('Google worker reads only Stars and Stars History, no Juli tabs and no writes',()=>{
  const source=readFileSync(new URL('../scripts/SIRA_BANK_STARS_B2_READ_ONLY.gs',import.meta.url),'utf8');
  const opened=[];
  const context={
    PropertiesService:{getScriptProperties:()=>({getProperty:(key)=>key==='SIRA_BANK_V2_GOOGLE_SPREADSHEET_ID'?'fake-id':null})},
    siraBankB1Roster_:()=>Array.from({length:34},(_,i)=>({id:`p-${i+1}`,name:`Персонаж ${i+1}`})),
    Utilities:{newBlob:(s)=>({getBytes:()=>Array.from(Buffer.from(s,'utf8'))})},
    SpreadsheetApp:{openById:()=>({getSheetByName:(name)=>{
      opened.push(name);
      if (name==='Звёзды') return {getLastRow:()=>35,getRange:()=>({
        getDisplayValues:()=>[['characterId','Имя персонажа','Баланс','Обновлено UTC','Кем изменено','Версия']],
        getValues:()=>Array.from({length:34},(_,i)=>[`p-${i+1}`,`Персонаж ${i+1}`,0,'','',0])})};
      if(name==='История звёзд') return {getLastRow:()=>2,getRange:(row,col,count)=>({
        getDisplayValues:()=>[['transactionId','Время UTC','characterId','Имя при операции','Операция','Сумма','Баланс до','Баланс после','Логин банкира','Причина','Ключ запроса']],
        getValues:()=>[['tx_1',new Date(now-60000).toISOString(),'p-1','Персонаж 1','Начисление',5,0,5,'admin','Награда','key']]
      })};
      throw new Error(`Forbidden tab ${name}`);
    }})}
  };
  vm.createContext(context);vm.runInContext(source,context);
  const snap=context.siraStarsB2Read_();
  assert.equal(snap.accounts.length,34);
  assert.equal(snap.history.length,1);
  assert.equal(snap.history[0].characterId,'p-1');
  assert.deepEqual(opened,['Звёзды','История звёзд']);
  assert.doesNotMatch(source,/\.setValues\(|\.appendRow\(|\.setValue\(/);
});

test('UI has no star mutations; staff-only diagnostics and private player history',()=>{
  const source=readFileSync(new URL('../src/components/BankPage.tsx',import.meta.url),'utf8');
  assert.match(source,/canManage \? <p>Управление счетами/);
  assert.match(source,/canManage \? \(/);
  assert.match(source,/История ваших операций/);
  assert.match(source,/canManage && item\.bankerLogin/);
  assert.doesNotMatch(source,/method:\s*['"]POST['"]/);
  assert.match(source,/setCanManage\(false\)/);
});
