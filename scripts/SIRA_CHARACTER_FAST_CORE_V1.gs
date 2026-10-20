/**
 * SIRA Fast Central Core E1 (READ ONLY).
 * Reads level/XP/progress from SYSTEM formula imports, name from MAIN registry.
 * Matches identity by PERSONAL SPREADSHEET ID in SYSTEM AB: never by display name.
 * Does not modify Google cells/formulas, does not edit C1/AUTO/Live triggers.
 * In the SAME Apps Script project as Code.gs and CHARACTER_SYNC_V1_AUTO_SAFE_30M.gs.
 * Requires constants MAIN_SPREADSHEET_ID, SYSTEM_SPREADSHEET_ID,
 * REGISTRY_SHEET_NAME, MAIN_CHARACTERS_SHEET_NAME, CHARACTER_SYNC_URL_V1
 * and characterSyncSecretV1_() supplied by the installed project.
 */
const SIRA_FAST_CORE_HANDLER_V1 = 'siraFastCoreWorkerV1';
const SIRA_FAST_CORE_STATE_KEY_V1 = 'SIRA_FAST_CORE_E1_STATUS';
const SIRA_FAST_CORE_HASH_KEY_V1 = 'SIRA_FAST_CORE_E1_HASH';
const SIRA_FAST_CORE_FIRST_ROW_V1 = 2;
const SIRA_FAST_CORE_BLOCK_ROWS_V1 = 5;

function siraFastCoreRegistryV1_() {
  const sheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID).getSheetByName(REGISTRY_SHEET_NAME);
  if (!sheet) throw new Error('FAST E1: registry sheet absent');
  const last = sheet.getLastRow();
  if (last < 11 || last > 3000) throw new Error('FAST E1: unexpected registry size ' + last);
  const rows = sheet.getRange(2, 1, last - 1, 3).getDisplayValues();
  const ids = [], names = {}, bySource = {};
  rows.forEach((row) => {
    const id = String(row[0] || '').trim().toLowerCase();
    if (!id) return;
    if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(id) || names[id]) {
      throw new Error('FAST E1: invalid/duplicate registry ID ' + id);
    }
    const name = String(row[1] || '').trim();
    const link = String(row[2] || '');
    const match = link.match(/[-\w]{25,}/);
    if (!name || !match || bySource[match[0]]) {
      throw new Error('FAST E1: missing/duplicated name or personal link for ' + id);
    }
    ids.push(id); names[id] = name; bySource[match[0]] = id;
  });
  if (ids.length < 10 || ids.length > 300) throw new Error('FAST E1: incomplete registry');
  return { ids, names, bySource };
}

function siraFastCoreNumericV1_(value) {
  return typeof value === 'number' && isFinite(value) ? value : null;
}

function siraFastCoreReadV1_() {
  const registry = siraFastCoreRegistryV1_();
  const sheet = SpreadsheetApp.openById(SYSTEM_SPREADSHEET_ID)
    .getSheetByName(MAIN_CHARACTERS_SHEET_NAME);
  if (!sheet) throw new Error('FAST E1: SYSTEM Magi sheet absent');
  const last = sheet.getLastRow();
  if (last < 3 || last > 2000) throw new Error('FAST E1: unexpected SYSTEM rows ' + last);
  const count = last - 1;
  // T=20 (level in block row 1, progress fraction in row 2), AC=29 (XP in row 1).
  // AB=28 contains the personal sheet link/import from which stable ID is resolved.
  const cells = sheet.getRange(2, 20, count, 10).getValues(); // T:AC
  const abFormulas = sheet.getRange(2, 28, count, 1).getFormulas();
  const linkPairs = Object.entries(registry.bySource);
  const byId = {};
  const invalid = [];
  for (let anchor = SIRA_FAST_CORE_FIRST_ROW_V1; anchor + 1 <= last;
       anchor += SIRA_FAST_CORE_BLOCK_ROWS_V1) {
    const matches = new Set();
    for (let row = anchor; row < anchor + SIRA_FAST_CORE_BLOCK_ROWS_V1 && row <= last; row++) {
      const offset = row - 2;
      const source = String(cells[offset][8] || '') + ' ' + String(abFormulas[offset][0] || '');
      for (const [sourceId, id] of linkPairs) {
        if (source.includes(sourceId)) matches.add(id);
      }
    }
    if (matches.size === 0) continue; // unused/preallocated block
    if (matches.size !== 1) { invalid.push({ row: anchor, reason: 'ambiguous-link' }); continue; }
    const id = Array.from(matches)[0];
    if (byId[id]) { invalid.push({ row: anchor, id, reason: 'duplicate-character-block' }); continue; }
    const offset = anchor - 2;
    const lvl = siraFastCoreNumericV1_(cells[offset][0]); // T anchor
    const xp = siraFastCoreNumericV1_(cells[offset][9]); // AC anchor
    const fraction = siraFastCoreNumericV1_(cells[offset + 1][0]); // T anchor+1
    if (lvl === null || !Number.isSafeInteger(lvl) || lvl < 0 || lvl > 100000 ||
        xp === null || xp < 0 || xp > 1e12 || fraction === null ||
        fraction < 0 || fraction > 1.000001) {
      invalid.push({ row: anchor, id, reason: 'invalid-level-xp-progress' });
      continue;
    }
    byId[id] = { characterId: id, name: registry.names[id],
      level: { current: lvl, experience: xp, progress: Math.min(100, Math.round(fraction * 10000) / 100) } };
  }
  const missing = registry.ids.filter(id => !byId[id]);
  const characters = Object.keys(byId).sort().map(id => byId[id]);
  return { ok: missing.length === 0 && invalid.length === 0,
    registryCount: registry.ids.length, matched: characters.length, missing, invalid,
    characters, source: 'SYSTEM Маги T/AC (imported TECH level/XP/progress), MAIN САЙТ name' };
}

function siraFastCoreAuditV1() {
  const scan = siraFastCoreReadV1_();
  const result = { ok:scan.ok, registryCount:scan.registryCount, matched:scan.matched,
    missing:scan.missing, invalid:scan.invalid,
    sample:scan.characters.filter(x=>['ren','mangoliya-feer'].includes(x.characterId)),
    source:scan.source, readOnlyGoogle:true, installedTriggers:false };
  console.log('=== SIRA FAST CORE AUDIT E1 === ' + JSON.stringify(result));
  return result;
}

function siraFastCoreStatePatchV1_(patch) {
  const props = PropertiesService.getScriptProperties();
  let current = {};
  try { current = JSON.parse(props.getProperty(SIRA_FAST_CORE_STATE_KEY_V1) || '{}'); } catch (_) {}
  props.setProperty(SIRA_FAST_CORE_STATE_KEY_V1, JSON.stringify(Object.assign({}, current, patch)));
}
function siraFastCoreStatusV1() {
  const props = PropertiesService.getScriptProperties();
  let state = {};
  try { state = JSON.parse(props.getProperty(SIRA_FAST_CORE_STATE_KEY_V1) || '{}'); } catch (_) {}
  const result = Object.assign({ ok:true,
    triggerCount:ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction() === SIRA_FAST_CORE_HANDLER_V1).length,
    lastSuccessAt:'', lastPublishedAt:'', lastOutcome:'', lastError:null, lastCount:0,
    readOnlyGoogle:true, source:'SYSTEM T/AC, registry name' }, state);
  console.log('=== SIRA FAST CORE STATUS E1 === ' + JSON.stringify(result));
  return result;
}

function siraFastCorePostV1_(characters, observedAt) {
  const url = CHARACTER_SYNC_URL_V1.replace(/\/character-sync\/?$/, '/character-fast-state');
  if (url === CHARACTER_SYNC_URL_V1) throw new Error('FAST E1: invalid character sync URL');
  const response = UrlFetchApp.fetch(url, { method:'post', contentType:'application/json',
    muteHttpExceptions:true, headers:{ 'x-character-sync-secret': characterSyncSecretV1_() },
    payload:JSON.stringify({ schemaVersion:1, complete:true, observedAt, characters }) });
  if (response.getResponseCode() !== 200) throw new Error('FAST E1: HTTP ' + response.getResponseCode());
  const result = JSON.parse(response.getContentText());
  if (!result || result.ok !== true || result.count !== characters.length ||
      !['applied','superseded'].includes(result.status)) throw new Error('FAST E1: publish not confirmed');
  return result;
}

function siraFastCoreWorkerV1() {
  // No script-wide lock: C1 and AUTO hold it during expensive personal-sheet reads.
  // Overlap is safe at Netlify through observedAt + ETag compare-and-set.
  try {
    const observedAt = new Date().toISOString();
    const scan = siraFastCoreReadV1_();
    if (!scan.ok) throw new Error('FAST E1: incomplete scan: ' +
      JSON.stringify({ missing:scan.missing, invalid:scan.invalid }));
    const props = PropertiesService.getScriptProperties();
    const digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, JSON.stringify(scan.characters), Utilities.Charset.UTF_8));
    const previous = props.getProperty(SIRA_FAST_CORE_HASH_KEY_V1);
    const priorStateRaw = props.getProperty(SIRA_FAST_CORE_STATE_KEY_V1) || '{}';
    let prior = {};
    try { prior = JSON.parse(priorStateRaw); } catch (_) {}
    const lastPost = Date.parse(prior.lastPublishedAt || '') || 0;
    const shouldPost = digest !== previous || Date.now() - lastPost >= 4 * 60 * 1000;
    let outcome = 'unchanged';
    if (shouldPost) {
      const result = siraFastCorePostV1_(scan.characters, observedAt);
      outcome = result.status;
      // On superseded writes the next poll may simply retry; never call this applied.
      if (result.status === 'applied') {
        props.setProperty(SIRA_FAST_CORE_HASH_KEY_V1, digest);
        siraFastCoreStatePatchV1_({ lastPublishedAt:new Date().toISOString() });
      }
      console.log('=== SIRA FAST CORE PUBLISH E1 === ' + JSON.stringify({ status:result.status, count:scan.matched }));
    }
    siraFastCoreStatePatchV1_({ lastSuccessAt:new Date().toISOString(),
      lastOutcome:outcome, lastCount:scan.matched, lastError:null });
    return { ok:true, published:shouldPost, status:outcome, count:scan.matched };
  } catch(error) {
    const message = error && error.message ? error.message : String(error);
    siraFastCoreStatePatchV1_({lastError:message,lastOutcome:'error'});
    console.error('=== SIRA FAST CORE FAILED E1 === ' + message);
    throw error;
  }
}
function siraFastCoreInstallV1() {
  const audit = siraFastCoreAuditV1();
  if (!audit.ok) throw new Error('FAST E1: audit failed. Worker not installed.');
  characterSyncSecretV1_();
  const current = ScriptApp.getProjectTriggers();
  if (!current.some(t=>t.getHandlerFunction() === SIRA_FAST_CORE_HANDLER_V1)) {
    if (current.length >= 20) throw new Error('FAST E1: no available trigger slots');
    ScriptApp.newTrigger(SIRA_FAST_CORE_HANDLER_V1).timeBased().everyMinutes(1).create();
  }
  return siraFastCoreStatusV1();
}
function siraFastCoreUninstallV1() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t=>{
    if (t.getHandlerFunction() === SIRA_FAST_CORE_HANDLER_V1) {
      ScriptApp.deleteTrigger(t); removed++;
    }
  });
  const result = { ok:true, removedFastTriggers:removed, otherTriggersPreserved:true };
  console.log('=== SIRA FAST CORE UNINSTALLED E1 === ' + JSON.stringify(result));
  return result;
}
