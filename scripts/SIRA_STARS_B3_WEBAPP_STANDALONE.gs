/**
 * SIRA Stars B3 — отдельный проект Apps Script (не вставлять в Character Service).
 * Один публично доступный Web App doPost, защищённый HMAC из Script Properties.
 * Работает ТОЛЬКО с вкладками «Звёзды» и «История звёзд».
 * Баланс + запись истории изменяются атомарным Sheets API batchUpdate.
 */
const B3_BANK_PROP = 'SIRA_STARS_B3_BANK_ID';
const B3_SECRET_PROP = 'SIRA_STARS_B3_SECRET';
const B3_ACCOUNT_HEADERS = ['characterId','Имя персонажа','Баланс','Обновлено UTC','Кем изменено','Версия'];
const B3_HISTORY_HEADERS = ['transactionId','Время UTC','characterId','Имя при операции','Операция','Сумма','Баланс до','Баланс после','Логин банкира','Причина','Ключ запроса'];

function siraStarsB3Result_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function siraStarsB3Settings_() {
  const props = PropertiesService.getScriptProperties();
  const bankId = String(props.getProperty(B3_BANK_PROP)||'').trim();
  const secret = String(props.getProperty(B3_SECRET_PROP)||'').trim();
  if (!/^[A-Za-z0-9_-]{25,}$/.test(bankId) || secret.length < 32) throw new Error('B3 not configured');
  return {bankId,secret};
}
function siraStarsB3AssertHeaders_(sheet, expected) {
  if (!sheet) throw new Error('Stars tab missing');
  if (sheet.getRange(1,1,1,expected.length).getDisplayValues()[0].join('|') !== expected.join('|')) {
    throw new Error('Unexpected B1 column layout');
  }
}
function siraStarsB3Audit() {
  const cfg=siraStarsB3Settings_();
  const book=SpreadsheetApp.openById(cfg.bankId);
  const accounts=book.getSheetByName('Звёзды');
  const history=book.getSheetByName('История звёзд');
  siraStarsB3AssertHeaders_(accounts,B3_ACCOUNT_HEADERS);
  siraStarsB3AssertHeaders_(history,B3_HISTORY_HEADERS);
  if (accounts.getLastRow() !== 35) throw new Error('Expected exactly 34 stars accounts');
  const rows=accounts.getRange(2,1,34,6).getValues();
  const ids=rows.map(r=>String(r[0]||'').trim());
  if(new Set(ids).size!==34 || rows.some(r=> !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(r[0]) ||
     typeof r[1]!=='string'||!r[1].trim() || !Number.isSafeInteger(r[2])||r[2]<0||
     !Number.isSafeInteger(r[5])||r[5]<0)) throw new Error('Invalid accounts');
  const result={ok:true,accounts:34,historyRows:Math.max(0,history.getLastRow()-1),
    tabsAccessed:['Звёзды','История звёзд'],googleWrites:0,configured:true};
  console.log('=== SIRA STARS B3 AUDIT === '+JSON.stringify(result));
  return result;
}
function siraStarsB3Signature_(payload, secret) {
  const bytes=Utilities.computeHmacSha256Signature(JSON.stringify(payload),secret,Utilities.Charset.UTF_8);
  return bytes.map(b=>(b&255).toString(16).padStart(2,'0')).join('');
}
function siraStarsB3Auth_(envelope,cfg) {
  if(!envelope || !envelope.payload || typeof envelope.signature!=='string' ||
     !/^[a-f0-9]{64}$/.test(envelope.signature)) throw new Error('Unauthorized');
  const expected=siraStarsB3Signature_(envelope.payload,cfg.secret);
  let same=expected.length===envelope.signature.length ? 0 : 1;
  for(let i=0;i<64;i++) same|=(expected.charCodeAt(i)^envelope.signature.charCodeAt(i));
  if(same!==0) throw new Error('Unauthorized');
  const p=envelope.payload;
  if(Object.keys(p).sort().join('|') !== ['action','amount','bankerLogin','characterId','issuedAt','postUrl','reason','requestId'].sort().join('|')) throw new Error('Invalid signed fields');
  if(!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(p.characterId) ||
     !['credit','debit'].includes(p.action) || !Number.isSafeInteger(p.amount) || p.amount<1 || p.amount>1e6 ||
     !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.requestId) ||
     typeof p.bankerLogin!=='string'||!p.bankerLogin.trim()||p.bankerLogin.length>120 ||
     typeof p.reason!=='string'||p.reason.length>180 || typeof p.postUrl!=='string'||p.postUrl.length>350 ||
     (!p.reason&&!p.postUrl) || /[\r\n\u0000-\u001f]/.test(p.reason+p.postUrl)) throw new Error('Invalid transaction');
  if(p.postUrl && !/^https:\/\/[^\s/@]+\.[^\s/]+(?:[/?#]|$)/i.test(p.postUrl)) throw new Error('Invalid post link');
  const t=Date.parse(p.issuedAt);
  if(!Number.isFinite(t)||Math.abs(Date.now()-t)>120000) throw new Error('Signed request expired');
  return p;
}
function siraStarsB3Cell_(value){return {userEnteredValue: typeof value==='number'?{numberValue:value}:{stringValue:String(value)}};}
function siraStarsB3Apply_(p,bankId){
  const book=SpreadsheetApp.openById(bankId);
  const accounts=book.getSheetByName('Звёзды');
  const history=book.getSheetByName('История звёзд');
  siraStarsB3AssertHeaders_(accounts,B3_ACCOUNT_HEADERS);
  siraStarsB3AssertHeaders_(history,B3_HISTORY_HEADERS);
  if(accounts.getLastRow()!==35) throw new Error('Bank roster changed; operation blocked');
  const all=accounts.getRange(2,1,34,6).getValues();
  const matched=[];
  all.forEach((r,i)=>{if(String(r[0]||'')===p.characterId)matched.push({row:i+2,data:r});});
  if(matched.length!==1) throw new Error('Account missing or duplicated');
  const {row:accountRow,data:account}=matched[0];
  const amountBefore=account[2]; const version=account[5];
  if(!Number.isSafeInteger(amountBefore)||amountBefore<0||amountBefore>1e12||
     !Number.isSafeInteger(version)||version<0) throw new Error('Invalid balance or version');
  const reason=p.postUrl ? (p.reason ? p.reason+' | Пост: '+p.postUrl : 'Пост: '+p.postUrl) : p.reason;
  if(reason.length>500) throw new Error('Evidence too long');
  // Search for the same request ID under the script lock. Retry with that ID is safe.
  if(history.getLastRow()>1){
    const keyRange=history.getRange(2,11,history.getLastRow()-1,1);
    const found=keyRange.createTextFinder(p.requestId).matchEntireCell(true).findNext();
    if(found){
      const old=history.getRange(found.getRow(),1,1,11).getValues()[0];
      if(String(old[2])!==p.characterId || old[4] !== (p.action==='credit'?'Начисление':'Списание') ||
         Number(old[5])!==p.amount || String(old[8])!==p.bankerLogin || String(old[9])!==reason)
        throw new Error('Request key reused with other parameters');
      return {ok:true,status:'duplicate',balanceAfter:Number(old[7]),transactionId:String(old[0])};
    }
  }
  const balanceAfter=p.action==='credit'?amountBefore+p.amount:amountBefore-p.amount;
  if(!Number.isSafeInteger(balanceAfter)||balanceAfter<0||balanceAfter>1e12) throw new Error('Insufficient stars or exceeded limit');
  const txid='tx_'+p.requestId.replace(/-/g,'');
  const now=new Date().toISOString();
  const record=[txid,now,p.characterId,String(account[1]),
    p.action==='credit'?'Начисление':'Списание',p.amount,amountBefore,balanceAfter,p.bankerLogin,reason,p.requestId];
  // BatchUpdate is atomic: account update AND ledger row are committed together.
  const request={requests:[
    {updateCells:{start:{sheetId:accounts.getSheetId(),rowIndex:accountRow-1,columnIndex:2},
      rows:[{values:[balanceAfter,now,p.bankerLogin,version+1].map(siraStarsB3Cell_)}],fields:'userEnteredValue'}},
    {appendCells:{sheetId:history.getSheetId(),rows:[{values:record.map(siraStarsB3Cell_)}],fields:'userEnteredValue'}}
  ]};
  // The Advanced Sheets service uses the Google Sheets API atomic batchUpdate.
  const response = Sheets.Spreadsheets.batchUpdate(request, bankId);
  if (!response || response.spreadsheetId !== bankId) {
    throw new Error('Atomic Google Sheets update not confirmed');
  }
  return {ok:true,status:'applied',balanceAfter,transactionId:txid};
}
function doPost(e){
  try {
    if(!e||!e.postData||!e.postData.contents||e.postData.contents.length>7000)throw new Error('Invalid request');
    const cfg=siraStarsB3Settings_();
    const p=siraStarsB3Auth_(JSON.parse(e.postData.contents),cfg);
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(25000))throw new Error('Bank busy; retry same request ID');
    try {return siraStarsB3Result_(siraStarsB3Apply_(p,cfg.bankId));}
    finally {lock.releaseLock();}
  } catch(error){
    console.error('SIRA Stars B3 rejected transaction: '+String(error.message||error));
    return siraStarsB3Result_({ok:false,error:String(error.message||'Operation failed').slice(0,150)});
  }
}
