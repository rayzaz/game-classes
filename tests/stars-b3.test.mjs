import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';
import {validateStarCommand,buildSignedEnvelope,parseGoogleResult} from '../netlify/functions/_bank-stars-v2/operation-core.mjs';

const command={characterId:'ren',action:'credit',amount:5,requestId:'895bb72d-ce5c-4b5e-86ab-3e1d7b47e263',postUrl:'https://vk.com/wall-12_345',reason:''};
const secret='a'.repeat(64);
test('banker may use post URL instead of a text reason',()=>{
  assert.deepEqual(validateStarCommand(command),command);
  assert.throws(()=>validateStarCommand({...command,reason:'',postUrl:''}));
  assert.throws(()=>validateStarCommand({...command,postUrl:'javascript:alert(1)'}));
  assert.throws(()=>validateStarCommand({...command,postUrl:'http://vk.com/wall-1_2'}));
});
test('rejects noninteger, oversize and malformed requests',()=>{
  for(const x of [0,-3,1.5,1000001,NaN])assert.throws(()=>validateStarCommand({...command,amount:x}));
  assert.throws(()=>validateStarCommand({...command,characterId:'../../ren'}));
  assert.throws(()=>validateStarCommand({...command,requestId:'x'}));
  assert.throws(()=>validateStarCommand({...command,reason:'x\ny'}));
});
test('HMAC signs a verified server-side banker identity',()=>{
  const env=buildSignedEnvelope(command,'banker-test',secret);
  assert.equal(env.payload.bankerLogin,'banker-test');
  assert.equal(env.signature,createHmac('sha256',secret).update(JSON.stringify(env.payload)).digest('hex'));
  assert.throws(()=>buildSignedEnvelope(command,'user','short'));
});
test('Google response must confirm applied or duplicate',()=>{
  assert.deepEqual(parseGoogleResult({ok:true,status:'duplicate',balanceAfter:12,transactionId:'tx_1'}),
    {status:'duplicate',balanceAfter:12,transactionId:'tx_1'});
  assert.throws(()=>parseGoogleResult({ok:true,status:'queued',balanceAfter:12,transactionId:'tx_1'}));
  assert.throws(()=>parseGoogleResult({ok:true,status:'applied',balanceAfter:-1,transactionId:'x'}));
});

function mockGoogle(){
  const code=readFileSync(new URL('../scripts/SIRA_STARS_B3_WEBAPP_STANDALONE.gs',import.meta.url),'utf8');
  const headersA=['characterId','Имя персонажа','Баланс','Обновлено UTC','Кем изменено','Версия'];
  const headersH=['transactionId','Время UTC','characterId','Имя при операции','Операция','Сумма','Баланс до','Баланс после','Логин банкира','Причина','Ключ запроса'];
  const rows=Array.from({length:34},(_,i)=>[i===0?'ren':`p-${i}`,i===0?'Паувинд Рен':`Персонаж ${i}`,0,'','',0]);
  const history=[];let atomicCalls=0;
  const accountSheet={getSheetId:()=>101,getLastRow:()=>35,getRange:(r,c,n,m)=>({
    getDisplayValues:()=>[headersA],getValues:()=>rows.map(x=>[...x])
  })};
  const historySheet={getSheetId:()=>102,getLastRow:()=>history.length+1,getRange:(r,c,n,m)=>({
    getDisplayValues:()=>[headersH],getValues:()=>history.map(x=>[...x]),
    createTextFinder:q=>({matchEntireCell:()=>({findNext:()=>{
      const i=history.findIndex(x=>x[10]===q);return i>=0?{getRow:()=>i+2}:null;
    }})})
  })};
  const sheets={'Звёзды':accountSheet,'История звёзд':historySheet};
  const vmctx={
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='SIRA_STARS_B3_BANK_ID'?'A'.repeat(30):secret})},
    SpreadsheetApp:{openById:()=>({getSheetByName:k=>sheets[k] || (()=>{throw new Error('Forbidden tab '+k);})()})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:x=>({payload:JSON.parse(x),setMimeType(){return this;}})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    ScriptApp:{getOAuthToken:()=> 'oauth-token'},
    Utilities:{Charset:{UTF_8:'UTF_8'},computeHmacSha256Signature:(message,key)=>Array.from(createHmac('sha256',key).update(message).digest())},
    Sheets:{Spreadsheets:{batchUpdate:(request,bankId)=>{
      atomicCalls++;
      assert.equal(bankId,'A'.repeat(30));
      const items=request.requests;
      assert.equal(items.length,2);
      assert.ok(items[0].updateCells && items[1].appendCells);
      // Simulate the atomic Google Sheets update.
      const cells=items[0].updateCells.rows[0].values;
      const idx=items[0].updateCells.start.rowIndex-1;
      rows[idx].splice(2,4,...cells.map(c=>c.userEnteredValue.numberValue ?? c.userEnteredValue.stringValue));
      history.push(items[1].appendCells.rows[0].values.map(c=>c.userEnteredValue.numberValue ?? c.userEnteredValue.stringValue));
      return {spreadsheetId:bankId};
    }}},console
  };
  vm.createContext(vmctx);vm.runInContext(code,vmctx);
  return {ctx:vmctx,rows,history,calls:()=>atomicCalls};
}
test('Google write changes balance AND appends history using ONE atomic batch; idempotent replay',()=>{
  const g=mockGoogle();
  const envelope=buildSignedEnvelope(command,'banker-test',secret);
  const e={postData:{contents:JSON.stringify(envelope)}};
  const first=g.ctx.doPost(e).payload;
  assert.equal(first.status,'applied');
  assert.equal(first.balanceAfter,5);
  assert.equal(g.rows[0][2],5);assert.equal(g.history.length,1);
  assert.equal(g.history[0][9],'Пост: https://vk.com/wall-12_345');
  assert.equal(g.calls(),1);
  const second=g.ctx.doPost(e).payload;
  assert.equal(second.status,'duplicate');
  assert.equal(g.rows[0][2],5);assert.equal(g.history.length,1);
  assert.equal(g.calls(),1);
});
test('insufficient balance, signature tampering and reuse with changed amount cannot mutate',()=>{
  const g=mockGoogle();
  const debit=buildSignedEnvelope({...command,action:'debit'},'banker-test',secret);
  assert.equal(g.ctx.doPost({postData:{contents:JSON.stringify(debit)}}).payload.ok,false);
  const p=buildSignedEnvelope(command,'banker-test',secret);
  p.payload.amount=7;
  assert.equal(g.ctx.doPost({postData:{contents:JSON.stringify(p)}}).payload.ok,false);
  assert.equal(g.calls(),0);
});
test('Google code touches only stars tabs and uses LockService',()=>{
  const s=readFileSync(new URL('../scripts/SIRA_STARS_B3_WEBAPP_STANDALONE.gs',import.meta.url),'utf8');
  assert.doesNotMatch(s,/getSheetByName\(['"](?:Юли|История юли)['"]\)/);
  assert.match(s,/LockService\.getScriptLock/);
  assert.match(s,/appendCells/);
  assert.match(s,/updateCells/);
  assert.match(s,/Sheets\.Spreadsheets\.batchUpdate/);
});
test('backend writes only after signed session and dynamic banker permission',()=>{
  const s=readFileSync(new URL('../netlify/functions/bank-stars-operation-v3.mjs',import.meta.url),'utf8');
  assert.match(s,/readSession\(request\)/);
  assert.match(s,/getBankManagerPermissions/);
  assert.match(s,/if\(!permissions\.canManageBank\)/);
  assert.match(s,/buildSignedEnvelope\(command,session\.sub,secret\)/);
});
test('role API requires admin; bank UI checks admin before presenting role controls',()=>{
  const api=readFileSync(new URL('../netlify/functions/admin-banker-access.mjs',import.meta.url),'utf8');
  const page=readFileSync(new URL('../src/components/BankPage.tsx',import.meta.url),'utf8');
  assert.match(api,/session\.role\s*!==\s*'admin'/);
  assert.match(page,/user\.role==='admin'/);
  assert.match(page,/setRole\(/);
  assert.match(page,/submitOperation/);
});
