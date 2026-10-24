/**
 * SIRA Fast Central Core E2 (READ ONLY): E1.3 plus upgrade points from MAIN.
 * Reads level/XP/progress from SYSTEM formula imports, name from MAIN registry.
 * Matches identity by PERSONAL SPREADSHEET ID in SYSTEM AB: never by display name.
 * Does not modify Google cells/formulas, does not edit C1/AUTO/Live triggers.
 * In the SAME Apps Script project as Code.gs and CHARACTER_SYNC_V1_AUTO_SAFE_30M.gs.
 * E1.3: real SYSTEM block offsets; config uses globals/Script Properties/C1 triggers.
 * No Google sheets are edited; no other project files must be changed.
 */
/**
 * E1.3 config adapter: avoids relying on globals from unrelated .gs files.
 * Preferred: existing Code.gs constants. Fallback: Script Properties.
 * If C1 edit triggers are installed, discover Main/System by sheet role.
 * Never print workbook IDs or the sync secret.
 */
function siraFastCoreConfigV12_() {
  const p = PropertiesService.getScriptProperties();
  let main = typeof MAIN_SPREADSHEET_ID !== 'undefined'
    ? String(MAIN_SPREADSHEET_ID || '').trim() : '';
  let system = typeof SYSTEM_SPREADSHEET_ID !== 'undefined'
    ? String(SYSTEM_SPREADSHEET_ID || '').trim() : '';
  main = main || String(p.getProperty('SIRA_FAST_CORE_MAIN_ID') || '').trim();
  system = system || String(p.getProperty('SIRA_FAST_CORE_SYSTEM_ID') || '').trim();
  const registrySheet = (typeof REGISTRY_SHEET_NAME !== 'undefined' && REGISTRY_SHEET_NAME)
    ? String(REGISTRY_SHEET_NAME) : 'САЙТ';
  const mageSheet = (typeof MAIN_CHARACTERS_SHEET_NAME !== 'undefined' && MAIN_CHARACTERS_SHEET_NAME)
    ? String(MAIN_CHARACTERS_SHEET_NAME) : 'Маги';

  // C1 has two distinct edit triggers attached to the source workbooks.
  // Only try discovery if IDs are absent; never use unverified trigger IDs.
  if (!main || !system) {
    const ids = new Set();
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() !== 'siraC1HandleEdit' ||
          typeof t.getTriggerSourceId !== 'function') return;
      const id = String(t.getTriggerSourceId() || '').trim();
      if (/^[A-Za-z0-9_-]{25,}$/.test(id)) ids.add(id);
    });
    for (const id of ids) {
      const book = SpreadsheetApp.openById(id);
      if (!main && book.getSheetByName(registrySheet)) main = id;
      else if (!system && book.getSheetByName(mageSheet) && !book.getSheetByName(registrySheet))
        system = id;
    }
  }
  if (!/^[A-Za-z0-9_-]{25,}$/.test(main) || !/^[A-Za-z0-9_-]{25,}$/.test(system) || main === system)
    throw new Error('FAST E1.2: Main/System IDs unavailable. Use the Apps Script project with working C1/Live, or set Script Properties SIRA_FAST_CORE_MAIN_ID and SIRA_FAST_CORE_SYSTEM_ID from the two Google Sheets URLs.');
  const knownUrl = typeof CHARACTER_SYNC_URL_V1 !== 'undefined'
    ? String(CHARACTER_SYNC_URL_V1 || '') : '';
  const syncUrl = knownUrl || String(p.getProperty('SIRA_FAST_CORE_SYNC_URL') || '').trim()
    || 'https://game-classes.netlify.app/.netlify/functions/character-sync';
  if (!/^https:\/\/[^\s]+\/character-sync\/?$/.test(syncUrl))
    throw new Error('FAST E1.2: invalid Netlify character-sync URL');
  return { main, system, registrySheet, mageSheet, syncUrl };
}
function siraFastCoreSecretV12_() {
  if (typeof characterSyncSecretV1_ === 'function') return characterSyncSecretV1_();
  const secret = String(PropertiesService.getScriptProperties()
    .getProperty('CHARACTER_SYNC_SECRET') || '').trim();
  if (!secret) throw new Error('FAST E1.2: CHARACTER_SYNC_SECRET not configured in this Apps Script project. Use the project with working AUTO/Live. Never paste secret in chat.');
  return secret;
}
function siraFastCoreEnvironmentV12() {
  let environment = { ok: false, hasMain: false, hasSystem: false,
    hasSyncSecret: false, hasAutoSync: typeof characterSyncSecretV1_ === 'function',
    c1EditTriggers: 0, error: null };
  try {
    const cfg = siraFastCoreConfigV12_();
    environment.hasMain = Boolean(cfg.main);
    environment.hasSystem = Boolean(cfg.system);
    // Never return the token; check only presence.
    environment.hasSyncSecret = Boolean(siraFastCoreSecretV12_());
    environment.ok = environment.hasSyncSecret;
  } catch (error) {
    environment.error = String(error && error.message ? error.message : error);
  }
  environment.c1EditTriggers = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'siraC1HandleEdit').length;
  console.log('=== SIRA FAST CORE ENV E1.2 === ' + JSON.stringify(environment));
  return environment;
}

/** Read MAIN block labels like the existing readCharacterSystemStats, but batched once. */
function siraE2PointsMainRead_(registry, config) {
  const sheet = SpreadsheetApp.openById(config.main).getSheetByName(config.mageSheet);
  if (!sheet) throw new Error('E2: MAIN Magi sheet not found');
  const capRows = Math.min(sheet.getLastRow() - 1, (registry.ids.length + 12) * 5);
  const cols = sheet.getLastColumn();
  if (capRows < registry.ids.length * 5 || cols < 10 || cols > 300)
    throw new Error('E2: MAIN grid outside safe bounds');
  const grid = sheet.getRange(2, 1, capRows, cols).getDisplayValues();
  const byName = new Map();
  const duplicates = [];
  const norm = s => String(s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim().toLowerCase();
  for (let offset = 0; offset + 4 < grid.length; offset += 5) {
    const name = String(grid[offset][1] || '').trim();
    if (!name) continue;
    const key = norm(name);
    if (byName.has(key)) { duplicates.push(name); continue; }
    const found = [];
    for (let r = offset; r < offset + 5; r++) {
      const line = grid[r];
      for (let c = 0; c < cols; c++) {
        if (!/^балл(?:ы|а|ов)?(?:\s+прокачки)?\s*:?$/.test(norm(line[c]))) continue;
        let number = null;
        for (let step = 1; step <= 6 && c + step < cols; step++) {
          const text = String(line[c + step] || '').replace(/\s/g, '').replace(',', '.');
          if (/^-?\d+(?:\.\d+)?$/.test(text)) { number = Number(text); break; }
        }
        found.push(number);
      }
    }
    byName.set(key, { name, firstRow: offset + 2, values: found });
  }
  const values = Object.create(null);
  const invalid = duplicates.map(name => ({ reason: 'duplicate-main-name', name }));
  for (const id of registry.ids) {
    const entry = byName.get(norm(registry.names[id]));
    if (!entry) { invalid.push({ id, reason: 'main-name-unmatched' }); continue; }
    const nums = entry.values;
    if (nums.length === 0) { invalid.push({ id, reason: 'upgrade-label-missing', row: entry.firstRow }); continue; }
    if (nums.some(n => !Number.isSafeInteger(n) || n < 0 || n > 1000000000) ||
        nums.some(n => n !== nums[0])) {
      invalid.push({ id, reason: 'upgrade-number-invalid', row: entry.firstRow }); continue;
    }
    values[id] = nums[0];
  }
  return { values, invalid };
}

const SIRA_FAST_CORE_HANDLER_V1 = 'siraFastCoreWorkerV1';
const SIRA_FAST_CORE_STATE_KEY_V1 = 'SIRA_FAST_CORE_E1_STATUS';
const SIRA_FAST_CORE_HASH_KEY_V1 = 'SIRA_FAST_CORE_E1_HASH';
const SIRA_FAST_CORE_FIRST_ROW_V1 = 2;
const SIRA_FAST_CORE_BLOCK_ROWS_V1 = 5;

function siraFastCoreRegistryV1_() {
  const config = siraFastCoreConfigV12_();
  const sheet = SpreadsheetApp.openById(config.main).getSheetByName(config.registrySheet);
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
  const config = siraFastCoreConfigV12_();
  const sheet = SpreadsheetApp.openById(config.system)
    .getSheetByName(config.mageSheet);
  if (!sheet) throw new Error('FAST E1: SYSTEM Magi sheet absent');
  const last = sheet.getLastRow();
  if (last < 3 || last > 2000) throw new Error('FAST E1: unexpected SYSTEM rows ' + last);
  const count = last - 1;
  // SYSTEM blocks contain FIVE rows starting at 2,7,12,...
  // AB[anchor] is the personal spreadsheet link (stable identity).
  // T[anchor+1] = imported TECH!C18 level;
  // T[anchor+2] = imported TECH!J19 progress fraction;
  // AC[anchor+1] = imported experience; see concrete source sheet and audit.
  // The earlier E1/E1.2 incorrectly read all three from one row too high.
  const cells = sheet.getRange(2, 20, count, 10).getValues(); // T:AC
  const abFormulas = sheet.getRange(2, 28, count, 1).getFormulas();
  const linkPairs = Object.entries(registry.bySource);
  const byId = {};
  const invalid = [];
  const unlinkedCandidateRows = [];
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
    if (matches.size === 0) {
      // Read-only diagnostic for newly created or incompletely linked characters.
      // No links, names or secret IDs are logged; do not silently drop a registry ID.
      if (unlinkedCandidateRows.length < 12 &&
          (cells[anchor - 2][8] || cells[anchor - 1][0] || cells[anchor - 1][9])) {
        unlinkedCandidateRows.push({ row: anchor,
          linkPresent: !!String(cells[anchor - 2][8] || '').trim(),
          hasLevel: cells[anchor - 1][0] !== '' && cells[anchor - 1][0] !== null,
          hasExperience: cells[anchor - 1][9] !== '' && cells[anchor - 1][9] !== null });
      }
      continue; // unused/preallocated, or a new character lacking AB link.
    }
    if (matches.size !== 1) { invalid.push({ row: anchor, reason: 'ambiguous-link' }); continue; }
    const id = Array.from(matches)[0];
    if (byId[id]) { invalid.push({ row: anchor, id, reason: 'duplicate-character-block' }); continue; }
    const offset = anchor - 2;
    const rawLevel = cells[offset + 1]?.[0];
    const rawXp = cells[offset + 1]?.[9];
    const rawProgress = cells[offset + 2]?.[0];
    const lvl = siraFastCoreNumericV1_(rawLevel); // T anchor+1
    const xp = siraFastCoreNumericV1_(rawXp); // AC anchor+1
    const fraction = siraFastCoreNumericV1_(rawProgress); // T anchor+2
    if (lvl === null || !Number.isSafeInteger(lvl) || lvl < 0 || lvl > 100000 ||
        xp === null || xp < 0 || xp > 1e12 || fraction === null ||
        fraction < 0 || fraction > 1.000001) {
      invalid.push({ row: anchor, id, reason: 'invalid-level-xp-progress',
        // Safe diagnostics: game stats only, no Google URLs or secrets.
        level: typeof rawLevel === 'number' ? rawLevel : String(rawLevel || '').slice(0, 24),
        experience: typeof rawXp === 'number' ? rawXp : String(rawXp || '').slice(0, 24),
        progress: typeof rawProgress === 'number' ? rawProgress : String(rawProgress || '').slice(0, 24) });
      continue;
    }
    byId[id] = { characterId: id, name: registry.names[id],
      level: { current: lvl, experience: xp, progress: Math.min(100, Math.round(fraction * 10000) / 100) } };
  }
  const points = siraE2PointsMainRead_(registry, config);
  invalid.push(...points.invalid);
  for (const id of registry.ids) {
    if (byId[id] && Object.hasOwn(points.values, id))
      byId[id].upgradePoints = points.values[id];
  }
  const missing = registry.ids.filter(id => !byId[id] || !Object.hasOwn(points.values, id));
  const characters = Object.keys(byId).sort().map(id => byId[id]);
  return { ok: missing.length === 0 && invalid.length === 0,
    registryCount: registry.ids.length, matched: characters.length, missing, invalid,
    unlinkedCandidateRows, characters, source: 'SYSTEM T/AC level+XP, MAIN Маги named upgrade points' };
}

function siraFastCoreAuditV1() {
  const scan = siraFastCoreReadV1_();
  const result = { ok:scan.ok, registryCount:scan.registryCount, matched:scan.matched,
    missing:scan.missing, invalid:scan.invalid,
    unlinkedCandidateRows:scan.unlinkedCandidateRows,
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
    readOnlyGoogle:true, source:'SYSTEM T(+1)/AC(+1)/T(+2), registry name' }, state);
  console.log('=== SIRA FAST CORE STATUS E1 === ' + JSON.stringify(result));
  return result;
}

function siraFastCorePostV1_(characters, observedAt) {
  const syncUrl = siraFastCoreConfigV12_().syncUrl;
  const url = syncUrl.replace(/\/character-sync\/?$/, '/character-fast-state');
  if (url === syncUrl) throw new Error('FAST E1.2: invalid character sync URL');
  const response = UrlFetchApp.fetch(url, { method:'post', contentType:'application/json',
    muteHttpExceptions:true, headers:{ 'x-character-sync-secret': siraFastCoreSecretV12_() },
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
  siraFastCoreSecretV12_();
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
