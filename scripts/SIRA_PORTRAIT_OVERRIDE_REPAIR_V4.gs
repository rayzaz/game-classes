/**
 * SIRA Portrait Source Repair V4: isolated manual repair.
 * Reads current personal "Лист персонажа"!AS1 and updates ONLY
 * a separate Netlify portrait override, never the full Character DB.
 * Install as a NEW Apps Script file beside working Fast Core E1.3.
 * No triggers, no writes to Google or Drive, no secret in logs.
 */
function siraPortraitV4DriveId_(value) {
  var input = String(value || '').trim();
  if (!/^https:\/\/(?:drive|docs)\.google\.com\//i.test(input)) return '';
  var match = input.match(/\/file\/d\/([A-Za-z0-9_-]{20,})(?:[\/?#]|$)/i) ||
    input.match(/\/d\/([A-Za-z0-9_-]{20,})(?:[\/?#]|$)/i) ||
    input.match(/[?&]id=([A-Za-z0-9_-]{20,})(?:[&#]|$)/i);
  return match ? match[1] : '';
}
function siraPortraitV4Read_() {
  if (typeof siraFastCoreRegistryV1_ !== 'function') {
    throw new Error('Fast Core E1.3 registry function is missing');
  }
  var registry = siraFastCoreRegistryV1_();
  var sheetIdByCharacter = {};
  Object.keys(registry.bySource || {}).forEach(function (spreadsheetId) {
    var characterId = String(registry.bySource[spreadsheetId] || '').trim();
    if (characterId) sheetIdByCharacter[characterId] = spreadsheetId;
  });
  var characterIds = [
    'mangoliya-feer', 'kaleb-vidogast',
    'feliks-raunbaunt', 'alstromeriya-lerri'
  ];
  var portraits = characterIds.map(function (characterId) {
    var spreadsheetId = sheetIdByCharacter[characterId];
    if (!spreadsheetId) throw new Error('No personal spreadsheet in registry: ' + characterId);
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet = spreadsheet.getSheetByName('Лист персонажа');
    if (!sheet) throw new Error('No character sheet: ' + characterId);
    var source = String(sheet.getRange('AS1').getDisplayValue() || '').trim();
    if (!siraPortraitV4DriveId_(source)) {
      throw new Error('AS1 must be a stable Google Drive link: ' + characterId);
    }
    return { characterId: characterId, source: source };
  });
  if (portraits.length !== characterIds.length) throw new Error('Incomplete portrait source set');
  return portraits;
}
function siraPortraitV4Audit() {
  var portraits = siraPortraitV4Read_();
  var result = {
    ok: true, count: portraits.length,
    ids: portraits.map(function (entry) { return entry.characterId; }),
    sources: 'GOOGLE_DRIVE', readOnly: true,
    googleWrites: 0, dbWrites: 0, triggersAdded: 0
  };
  console.log('=== SIRA PORTRAITS V4 AUDIT === ' + JSON.stringify(result));
  return result;
}
function siraPortraitV4Publish() {
  var portraits = siraPortraitV4Read_();
  var secret = String(PropertiesService.getScriptProperties()
    .getProperty('CHARACTER_SYNC_SECRET') || '').trim();
  if (!secret) throw new Error('CHARACTER_SYNC_SECRET Script Property is missing');
  var url = 'https://game-classes.netlify.app/.netlify/functions/character-portrait-override-sync';
  var response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-character-sync-secret': secret },
    payload: JSON.stringify({ schemaVersion: 1, observedAt: new Date().toISOString(), portraits: portraits })
  });
  var body;
  try { body = JSON.parse(response.getContentText()); } catch (_) { body = null; }
  if (response.getResponseCode() !== 200 || !body || body.ok !== true || body.count !== 4) {
    console.error('=== SIRA PORTRAITS V4 FAILED === ' + JSON.stringify({
      http: response.getResponseCode(),
      serverError: body && body.error ? body.error : 'Response invalid'
    }));
    throw new Error('Netlify portrait override publication was not confirmed');
  }
  var applied = Array.isArray(body.applied) ? body.applied : [];
  var superseded = Array.isArray(body.superseded) ? body.superseded : [];
  if (applied.length + superseded.length !== 4) throw new Error('Incomplete Netlify portrait confirmation');
  var result = { ok: true, count: 4, applied: applied, superseded: superseded,
    googleWrites: 0, fullCharacterDbWrites: 0, triggersAdded: 0 };
  console.log('=== SIRA PORTRAITS V4 PUBLISHED === ' + JSON.stringify(result));
  return result;
}
