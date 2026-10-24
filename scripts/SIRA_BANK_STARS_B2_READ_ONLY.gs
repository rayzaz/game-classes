/**
 * SIRA Bank Stars B2.1: only reads star balances and star history.
 * Reads ONLY "Звёзды" and "История звёзд". Never reads/writes Юли tabs.
 * Runs in same project as B1 and existing character-sync.
 */
const SIRA_STARS_B2_WORKER_NAME = 'siraStarsB2Worker';
const SIRA_STARS_B2_STATE_KEY = 'SIRA_STARS_B2_STATUS';
const SIRA_STARS_B2_LAST_PUBLISHED = 'SIRA_STARS_B2_LAST_PUBLISHED';

/** Read the latest 300 records; the complete authoritative log stays in Google. */
function siraStarsB21ReadHistory_(book, knownIds) {
  const sheet = book.getSheetByName('История звёзд');
  if (!sheet) throw new Error('STARS B2.1: missing Stars history tab');
  const expected = ['transactionId','Время UTC','characterId','Имя при операции',
    'Операция','Сумма','Баланс до','Баланс после','Логин банкира','Причина','Ключ запроса'];
  const headers = sheet.getRange(1,1,1,11).getDisplayValues()[0];
  if (headers.join('|') !== expected.join('|')) {
    throw new Error('STARS B2.1: history columns do not match B1');
  }
  const total = Math.max(0,sheet.getLastRow()-1);
  const count = Math.min(total,300);
  const rows = count ? sheet.getRange(total-count+2,1,count,11).getValues() : [];
  const seen = new Set();
  const entries = rows.map(row=>{
    const transactionId = String(row[0] || '').trim();
    const date = row[1];
    const occurredAt = date instanceof Date && !isNaN(date.getTime())
      ? date.toISOString() : String(date || '').trim();
    const characterId = String(row[2] || '').trim();
    const kind = String(row[4] || '').trim();
    const amount = row[5],balanceBefore = row[6],balanceAfter = row[7];
    const bankerLogin = String(row[8] || '').trim();
    const reason = String(row[9] || '');
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(transactionId) || seen.has(transactionId) ||
        !knownIds.has(characterId) || !kind || kind.length>80 ||
        typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount<0 ||
        typeof balanceBefore !== 'number' || !Number.isSafeInteger(balanceBefore) || balanceBefore<0 ||
        typeof balanceAfter !== 'number' || !Number.isSafeInteger(balanceAfter) || balanceAfter<0 ||
        bankerLogin.length>120 || reason.length>500 ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(occurredAt)) {
      throw new Error('STARS B2.1: invalid history row');
    }
    seen.add(transactionId);
    return {transactionId,occurredAt,characterId,kind,amount,balanceBefore,balanceAfter,
      bankerLogin,reason};
  });
  return {entries,total};
}

function siraStarsB2Read_() {
  const key = 'SIRA_BANK_V2_GOOGLE_SPREADSHEET_ID';
  const id = PropertiesService.getScriptProperties().getProperty(key);
  if (!id) throw new Error('STARS B2: B1 Google bank not registered');
  if (typeof siraBankB1Roster_ !== 'function') throw new Error('STARS B2: B1 registry missing');
  const roster = siraBankB1Roster_();
  if (roster.length !== 34) throw new Error('STARS B2: expected 34 characters, got ' + roster.length);
  const book = SpreadsheetApp.openById(id);
  const sheet = book.getSheetByName('Звёзды');
  if (!sheet || sheet.getLastRow() !== roster.length + 1) throw new Error('STARS B2: wrong row count');
  const headers = sheet.getRange(1,1,1,6).getDisplayValues()[0];
  if (headers.join('|') !== ['characterId','Имя персонажа','Баланс','Обновлено UTC','Кем изменено','Версия'].join('|')) {
    throw new Error('STARS B2: unexpected column layout');
  }
  const rows = sheet.getRange(2,1,roster.length,6).getValues();
  const seen = new Set();
  const known = new Map(roster.map(x=>[x.id,x.name]));
  const accounts = [];
  rows.forEach(row => {
    const id = String(row[0] || '').trim();
    const stars = row[2];
    const version = row[5];
    if (!known.has(id) || seen.has(id) || typeof stars !== 'number' ||
        !Number.isSafeInteger(stars) || stars < 0 || stars > 1e12 ||
        typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
      throw new Error('STARS B2: invalid account record');
    }
    seen.add(id);
    accounts.push({characterId:id,name:known.get(id),stars:stars,version:version});
  });
  if (seen.size !== roster.length) throw new Error('STARS B2: missing bank account');
  const historySnapshot = siraStarsB21ReadHistory_(book, new Set(known.keys()));
  let historyEntries = historySnapshot.entries;
  // Keep the complete authoritative log in Google, but bound the published
  // read-only window by bytes (Russian reasons can be 3 bytes per character).
  while (historyEntries.length > 0 &&
         Utilities.newBlob(JSON.stringify(historyEntries), 'application/json').getBytes().length > 175000) {
    historyEntries = historyEntries.slice(Math.min(20, historyEntries.length));
  }
  return {schemaVersion:2,currency:'stars',complete:true,observedAt:new Date().toISOString(),
    accounts:accounts,historyComplete:true,history:historyEntries,
    historyTotal:historySnapshot.total};
}

function siraStarsB2Audit() {
  const snap = siraStarsB2Read_();
  const result = {ok:true,count:snap.accounts.length,zeroBalances:snap.accounts.filter(x=>x.stars===0).length,
    source:'SIRA Bank B1 / Звёзды + История звёзд',
    historyCount:snap.historyTotal,historySynced:snap.historyComplete,
    juliSheetsRead:0,googleWrites:0,triggersAdded:false};
  console.log('=== SIRA STARS B2 AUDIT === ' + JSON.stringify(result));
  return result;
}

function siraStarsB2Endpoint_() {
  if (typeof CHARACTER_SYNC_URL_V1 !== 'string' || typeof characterSyncSecretV1_ !== 'function') {
    throw new Error('STARS B2: existing Character Sync settings missing');
  }
  const url = CHARACTER_SYNC_URL_V1.replace(/\/character-sync(?:\?.*)?$/, '/bank-stars-v2');
  if (url === CHARACTER_SYNC_URL_V1 || !/^https:\/\//.test(url)) throw new Error('STARS B2: invalid sync URL');
  return url;
}

function siraStarsB2Publish_() {
  const snapshot = siraStarsB2Read_();
  const response = UrlFetchApp.fetch(siraStarsB2Endpoint_(), {
    method:'post',contentType:'application/json',muteHttpExceptions:true,
    headers:{'x-character-sync-secret':characterSyncSecretV1_()},
    payload:JSON.stringify(snapshot)
  });
  if (response.getResponseCode() !== 200) throw new Error('STARS B2: publish HTTP ' + response.getResponseCode());
  const data = JSON.parse(response.getContentText());
  if (data?.ok !== true || data.count !== snapshot.accounts.length || !['applied','superseded'].includes(data.status)) {
    throw new Error('STARS B2: publication unconfirmed');
  }
  return {count:data.count,status:data.status,historyCount:snapshot.historyTotal};
}

function siraStarsB2State_(patch) {
  const props = PropertiesService.getScriptProperties();
  let state = {};
  try {state=JSON.parse(props.getProperty(SIRA_STARS_B2_STATE_KEY) || '{}');} catch(_) {}
  const next = Object.assign({},state,patch);
  props.setProperty(SIRA_STARS_B2_STATE_KEY,JSON.stringify(next));
  return next;
}

function siraStarsB2Worker() {
  try {
    const result = siraStarsB2Publish_();
    siraStarsB2State_({lastSuccessAt:new Date().toISOString(),lastCount:result.count,lastOutcome:result.status,lastError:null});
    console.log('=== SIRA STARS B2 PUBLISHED === '+JSON.stringify(result));
    return {ok:true,...result};
  } catch(error) {
    const message = String(error?.message || error);
    siraStarsB2State_({lastOutcome:'error',lastError:message});
    console.error('=== SIRA STARS B2 FAILED === '+message);
    throw error;
  }
}

function siraStarsB2Status() {
  const props=PropertiesService.getScriptProperties();
  let state={};
  try {state=JSON.parse(props.getProperty(SIRA_STARS_B2_STATE_KEY)||'{}');} catch(_){}
  const result={ok:true,triggerCount:ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===SIRA_STARS_B2_WORKER_NAME).length,
    lastSuccessAt:state.lastSuccessAt||'',lastCount:state.lastCount||0,
    lastOutcome:state.lastOutcome||'',lastError:state.lastError||null,
    readsOnly:'Звёзды',juliTouched:false};
  console.log('=== SIRA STARS B2 STATUS === '+JSON.stringify(result));
  return result;
}

/** Do not install until Netlify Published and the manual Worker succeeds. */
function siraStarsB2Install() {
  siraStarsB2Audit();
  siraStarsB2Endpoint_();
  const current=ScriptApp.getProjectTriggers();
  if (!current.some(t=>t.getHandlerFunction()===SIRA_STARS_B2_WORKER_NAME)) {
    if (current.length>=20) throw new Error('STARS B2: trigger limit reached');
    ScriptApp.newTrigger(SIRA_STARS_B2_WORKER_NAME).timeBased().everyMinutes(1).create();
  }
  return siraStarsB2Status();
}
function siraStarsB2Uninstall() {
  let removed=0;
  ScriptApp.getProjectTriggers().forEach(t=>{
    if (t.getHandlerFunction()===SIRA_STARS_B2_WORKER_NAME) {ScriptApp.deleteTrigger(t);removed++;}
  });
  console.log('=== SIRA STARS B2 UNINSTALLED === '+JSON.stringify({removed:removed,otherTriggersPreserved:true}));
}
