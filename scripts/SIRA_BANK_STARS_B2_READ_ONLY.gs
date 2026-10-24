/**
 * SIRA Bank Stars B2. ONLY reads вкладка "Звёзды" of the B1 bank.
 * NEVER reads/writes "Юли" or "История юли"; no edits to any sheet.
 * Runs in same project as B1 and existing character-sync.
 */
const SIRA_STARS_B2_WORKER_NAME = 'siraStarsB2Worker';
const SIRA_STARS_B2_STATE_KEY = 'SIRA_STARS_B2_STATUS';
const SIRA_STARS_B2_LAST_PUBLISHED = 'SIRA_STARS_B2_LAST_PUBLISHED';

function siraStarsB2Read_() {
  const key = 'SIRA_BANK_V2_GOOGLE_SPREADSHEET_ID';
  const id = PropertiesService.getScriptProperties().getProperty(key);
  if (!id) throw new Error('STARS B2: B1 Google bank not registered');
  if (typeof siraBankB1Roster_ !== 'function') throw new Error('STARS B2: B1 registry missing');
  const roster = siraBankB1Roster_();
  if (roster.length !== 34) throw new Error('STARS B2: expected 34 characters, got ' + roster.length);
  const sheet = SpreadsheetApp.openById(id).getSheetByName('Звёзды');
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
  return {schemaVersion:2,currency:'stars',complete:true,observedAt:new Date().toISOString(),accounts:accounts};
}

function siraStarsB2Audit() {
  const snap = siraStarsB2Read_();
  const result = {ok:true,count:snap.accounts.length,zeroBalances:snap.accounts.filter(x=>x.stars===0).length,
    source:'SIRA Bank B1 / Звёзды only',juliSheetsRead:0,googleWrites:0,triggersAdded:false};
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
  return {count:data.count,status:data.status};
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
