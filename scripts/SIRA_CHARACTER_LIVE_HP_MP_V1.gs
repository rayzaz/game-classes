/**
 * SIRA Live HP/MP V1 — READ-ONLY Google SYSTEM sampler.
 * New separate Apps Script file. NEVER modify any cells, formulas or links.
 * Runs at most once per minute after audit/install; reads only 4 SYSTEM columns
 * plus character IDs from existing C1 registry index and linked spreadsheet IDs.
 * Requires: Code.gs, C1 .gs, AUTO SAFE 30M .gs, Stage Live Netlify deployed.
 */
const SIRA_LIVE_WORKER_V1 = 'siraLiveWorkerV1';
const SIRA_LIVE_STATE_V1 = 'SIRA_LIVE_HPMP_STATUS_V1';
const SIRA_LIVE_FINGERPRINT_V1 = 'SIRA_LIVE_HPMP_FINGERPRINT_V1';
const SIRA_LIVE_BLOCK_START_V1 = 2;
const SIRA_LIVE_BLOCK_SIZE_V1 = 5;

function siraLiveNumericV1_(value) {
  return typeof value === 'number' && isFinite(value) ? value : null;
}

/** Maps SYSTEM 5-row blocks by AB formulas/values to real IDs in САЙТ.
 * Fail closed: an unknown/ambiguous block is never assigned to a different ID. */
function siraLiveReadSnapshotV1_() {
  const index = siraC1RegistryIndex_();
  const ids = Array.from(new Set(index.ids));
  if (ids.length < 10 || ids.length !== index.ids.length) {
    throw new Error('Live V1: incomplete or duplicated registry IDs');
  }
  const book = SpreadsheetApp.openById(SYSTEM_SPREADSHEET_ID);
  const sheet = book.getSheetByName(MAIN_CHARACTERS_SHEET_NAME);
  if (!sheet) throw new Error('Live V1: лист Маги отсутствует в СИСТЕМЕ');
  const lastRow = sheet.getLastRow();
  if (lastRow < 3 || lastRow > 2000) throw new Error('Live V1: unexpected SYSTEM size: ' + lastRow);
  const count = lastRow - 1;
  const sourcesValues = sheet.getRange(2, 28, count, 1).getDisplayValues(); // AB
  const sourcesFormulas = sheet.getRange(2, 28, count, 1).getFormulas();
  const maxValues = sheet.getRange(2, 34, count, 2).getValues(); // AH, AI
  const resourceValues = sheet.getRange(2, 51, count, 3).getValues(); // AY, AZ, BA
  const byId = {};
  const links = Object.entries(index.bySpreadsheetId);
  const invalid = [];
  for (let anchor = SIRA_LIVE_BLOCK_START_V1; anchor + 1 <= lastRow; anchor += SIRA_LIVE_BLOCK_SIZE_V1) {
    const matched = new Set();
    for (let r = anchor; r < anchor + SIRA_LIVE_BLOCK_SIZE_V1 && r <= lastRow; r++) {
      const i = r - 2;
      const source = String(sourcesValues[i][0] || '') + ' ' + String(sourcesFormulas[i][0] || '');
      for (const pair of links) {
        if (source.indexOf(pair[0]) !== -1) matched.add(pair[1]);
      }
    }
    if (matched.size === 0) continue; // unoccupied or preallocated block
    if (matched.size !== 1) { invalid.push({ row: anchor, reason: 'ambiguous-id' }); continue; }
    const id = Array.from(matched)[0];
    if (byId[id]) { invalid.push({ row: anchor, id: id, reason: 'duplicate-block' }); continue; }
    const i = anchor + 1 - 2; // GREEN SECOND ROW in every SYSTEM block
    const healthMax = siraLiveNumericV1_(maxValues[i][0]);
    const manaMax = siraLiveNumericV1_(maxValues[i][1]);
    // Existing Events semantics: blank green current means full resource.
    // NEVER treat an empty cell as zero damage or as an invalid block.
    const greenHealthRaw = resourceValues[i][0];
    const greenManaRaw = resourceValues[i][2];
    const healthCurrent = (greenHealthRaw === '' || greenHealthRaw === null)
      ? healthMax : siraLiveNumericV1_(greenHealthRaw);
    const manaCurrent = (greenManaRaw === '' || greenManaRaw === null)
      ? manaMax : siraLiveNumericV1_(greenManaRaw);
    if (healthMax === null || healthMax <= 0 || manaMax === null || manaMax <= 0 ||
      healthCurrent === null || healthCurrent < 0 || manaCurrent === null || manaCurrent < 0) {
      invalid.push({ row: anchor, id: id, reason: 'non-numeric-green-resource-or-max' });
      continue;
    }
    byId[id] = { characterId: id,
      health: { current: healthCurrent, max: healthMax },
      mana: { current: manaCurrent, max: manaMax } };
  }
  const missing = ids.filter(id => !byId[id]);
  const characters = Object.keys(byId).sort().map(id => byId[id]);
  return { complete: missing.length === 0 && invalid.length === 0,
    characters: characters, registryCount: ids.length, mappedCount: characters.length,
    missing: missing, invalid: invalid };
}

function siraLiveStatusV1() {
  const triggers = ScriptApp.getProjectTriggers();
  const props = PropertiesService.getScriptProperties();
  let state = {};
  try { state = JSON.parse(props.getProperty(SIRA_LIVE_STATE_V1) || '{}'); } catch (_) {}
  const status = { ok: true,
    triggerCount: triggers.filter(t => t.getHandlerFunction() === SIRA_LIVE_WORKER_V1).length,
    lastSuccessAt: state.lastSuccessAt || '', lastPublishedAt: state.lastPublishedAt || '',
    lastChangedAt: state.lastChangedAt || '', lastCount: state.lastCount || 0,
    lastOutcome: state.lastOutcome || '', lastError: state.lastError || null,
    readOnlyGoogle: true, intervalMinutes: 1 };
  console.log('=== SIRA LIVE HP/MP STATUS === ' + JSON.stringify(status));
  return status;
}
function siraLiveStatePatchV1_(patch) {
  const props = PropertiesService.getScriptProperties();
  let state = {};
  try { state = JSON.parse(props.getProperty(SIRA_LIVE_STATE_V1) || '{}'); } catch (_) {}
  props.setProperty(SIRA_LIVE_STATE_V1, JSON.stringify(Object.assign({}, state, patch)));
}

function siraLiveAuditV1() {
  const scan = siraLiveReadSnapshotV1_();
  const ren = scan.characters.filter(item => item.characterId === 'ren').map(item => ({health:item.health, mana:item.mana}));
  const result = { ok: scan.complete, registryCount: scan.registryCount,
    matched: scan.mappedCount, missing: scan.missing, invalid: scan.invalid,
    ren: ren, readsGoogleOnly: true, installedTriggers: false };
  console.log('=== SIRA LIVE HP/MP READ-ONLY AUDIT === ' + JSON.stringify(result));
  return result;
}

function siraLivePostV1_(characters, observedAt) {
  const url = CHARACTER_SYNC_URL_V1.replace(/\/character-sync$/, '/character-live-state');
  if (url === CHARACTER_SYNC_URL_V1) throw new Error('Live V1: invalid character sync URL');
  const response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-character-sync-secret': characterSyncSecretV1_() },
    payload: JSON.stringify({ schemaVersion: 1, complete: true, observedAt: observedAt, characters: characters })
  });
  if (response.getResponseCode() !== 200) throw new Error('Live V1: endpoint HTTP ' + response.getResponseCode());
  const result = JSON.parse(response.getContentText());
  if (!result || result.ok !== true || result.count !== characters.length ||
     !['applied', 'superseded'].includes(result.status)) throw new Error('Live V1: publish not confirmed');
  return result;
}

function siraLiveWorkerV1() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok:true, deferred:true };
  try {
    const observedAt = new Date().toISOString();
    const scan = siraLiveReadSnapshotV1_();
    if (!scan.complete) throw new Error('Live V1: mapping incomplete: ' +
      JSON.stringify({ missing:scan.missing, invalid:scan.invalid }));
    const props = PropertiesService.getScriptProperties();
    const payloadFingerprint = JSON.stringify(scan.characters);
    const digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, payloadFingerprint, Utilities.Charset.UTF_8));
    const priorHash = props.getProperty(SIRA_LIVE_FINGERPRINT_V1);
    const stateRaw = props.getProperty(SIRA_LIVE_STATE_V1) || '{}';
    let state = {};
    try { state = JSON.parse(stateRaw); } catch (_) {}
    const lastPost = Date.parse(state.lastPublishedAt || '') || 0;
    // Re-publish at least every 5 minutes so opened pages can detect stalled sync.
    const shouldPost = digest !== priorHash || Date.now() - lastPost >= 5 * 60 * 1000;
    if (shouldPost) {
      const result = siraLivePostV1_(scan.characters, observedAt);
      props.setProperty(SIRA_LIVE_FINGERPRINT_V1, digest);
      siraLiveStatePatchV1_({ lastPublishedAt: new Date().toISOString(),
        lastChangedAt: digest !== priorHash ? observedAt : state.lastChangedAt || observedAt });
      console.log('=== SIRA LIVE HP/MP PUBLISHED === ' + JSON.stringify({count:scan.mappedCount,status:result.status}));
    }
    siraLiveStatePatchV1_({ lastSuccessAt: new Date().toISOString(), lastCount:scan.mappedCount,
      lastOutcome: shouldPost ? 'published' : 'unchanged', lastError: null });
    return { ok:true, published:shouldPost, count:scan.mappedCount };
  } catch(error) {
    const reason = error && error.message ? error.message : String(error);
    siraLiveStatePatchV1_({ lastOutcome:'error', lastError:reason });
    console.error('=== SIRA LIVE HP/MP FAILED === ' + reason);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function siraLiveInstallV1() {
  const audit = siraLiveAuditV1();
  if (!audit.ok) throw new Error('Live V1: cannot install — mapping or numbers invalid');
  characterSyncSecretV1_();
  const current = ScriptApp.getProjectTriggers();
  if (!current.some(t => t.getHandlerFunction() === SIRA_LIVE_WORKER_V1)) {
    if (current.length >= 20) throw new Error('Live V1: no trigger slots available');
    ScriptApp.newTrigger(SIRA_LIVE_WORKER_V1).timeBased().everyMinutes(1).create();
  }
  console.log('=== SIRA LIVE HP/MP INSTALLED === ' + JSON.stringify(siraLiveStatusV1()));
  return siraLiveStatusV1();
}
function siraLiveUninstallV1() {
  let removed = 0;
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === SIRA_LIVE_WORKER_V1) {
      ScriptApp.deleteTrigger(trigger); removed++;
    }
  }
  const result = {ok:true, removedLiveTriggers:removed, otherTriggersPreserved:true};
  console.log('=== SIRA LIVE HP/MP UNINSTALLED === ' + JSON.stringify(result));
  return result;
}
