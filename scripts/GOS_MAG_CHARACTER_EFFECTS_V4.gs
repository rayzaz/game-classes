/* GOS MAG V4 effects extension: read and write only a dedicated personal sheet.
 * NO writes to ТЕХ, Основная, СИСТЕМА, Лист персонажа!B76/AB5, or owned formulas.
 */
var GOSMAG_V4_SHEET_NAME_ = 'ЭФФЕКТЫ_V4';
var GOSMAG_V4_MARKER_ = 'GOSMAG_CHARACTER_EFFECTS_V4';
var GOSMAG_V4_STAT_ROWS_ = [
  ['hp','Макс. HP','H3'],['mp','Макс. MP','H6'],['strength','Физическая сила','H4'],
  ['speed','Скорость','H5'],['attack','Магическая атака','E5'],
  ['defense','Магическая защита','E6'],['healing','Лечение','E7'],
  ['buff','Бафф','E8'],['debuff','Дебафф','E9'],['potions','Зелья','E10'],
  ['summon','Призыв','E11'],['movement','Перемещение','E12'],
  ['speedModifier','Модификатор скорости','E13'],['physical','Физическое воздействие','E14'],
  ['other','Прочее','E15']
];

function gosmagV4RaceFromProfile_(characterSheet) {
  var raw = String(characterSheet.getRange('AB5').getDisplayValue() || '');
  var match = raw.match(/(?:^|\n)\s*Раса\s*:\s*([^\r\n]+)/i);
  return match ? match[1].trim().slice(0,120) : '';
}
function gosmagV4LegacyId_(name,index) { return 'legacy:' + (index + 1); }
function gosmagV4Empty_() { return { schemaVersion:4,revision:0,race:'',sources:[] }; }
function gosmagV4ReadSaved_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(GOSMAG_V4_SHEET_NAME_);
  if (!sheet) return gosmagV4Empty_();
  if (String(sheet.getRange('A1').getValue() || '') !== GOSMAG_V4_MARKER_)
    return gosmagV4Empty_(); // Read-only view must not break existing player pages; write still blocks.
  var raw = String(sheet.getRange('K2').getValue() || '');
  if (!raw) return gosmagV4Empty_();
  var value = JSON.parse(raw);
  if (value.schemaVersion !== 4 || !Array.isArray(value.sources) || !Number.isSafeInteger(value.revision))
    throw new Error('Данные ЭФФЕКТЫ_V4 повреждены');
  return value;
}
function gosmagV4Read_(spreadsheet,characterSheet) {
  var saved = gosmagV4ReadSaved_(spreadsheet);
  var originalRace = gosmagV4RaceFromProfile_(characterSheet);
  var race = saved.revision > 0 ? String(saved.race || '') : originalRace;
  var sources = saved.sources.slice();
  var exists = {};
  sources.forEach(function(s) {
    if (s.legacyName) exists[String(s.legacyName).trim().toLowerCase()] = true;
  });
  (readSpecialSkills(characterSheet) || []).forEach(function(s,index) {
    var name = String(s.name || '').trim();
    if (!name || exists[name.toLowerCase()]) return;
    sources.push({id:gosmagV4LegacyId_(name,index),kind:'feature',origin:'other',
      name:name,description:String(s.description || ''),enabled:true,archived:false,
      legacyName:name,effects:[]});
    exists[name.toLowerCase()] = true;
  });
  if (race && !sources.some(function(s) {return s.kind === 'race' && !s.archived;})) {
    sources.unshift({id:'race:main',kind:'race',origin:'race',name:race,description:'',
      enabled:true,archived:false,legacyName:'',effects:[]});
  }
  return {schemaVersion:4,revision:saved.revision,race:race,sources:sources};
}
function gosmagV4Validate_(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.sources) || value.sources.length > 45)
    throw new Error('Неверное количество особенностей V4');
  var allowedStats = {};
  GOSMAG_V4_STAT_ROWS_.forEach(function(s) { allowedStats[s[0]] = true; });
  var seen = {}, result = [], raceCount = 0;
  value.sources.forEach(function(s) {
    if (!s || typeof s !== 'object') throw new Error('Некорректная особенность');
    var id = String(s.id || '').trim();
    var name = String(s.name || '').trim();
    if (!/^[\w:.-]{1,100}$/i.test(id) || seen[id] || !name || name.length > 180)
      throw new Error('Некорректное название или ID особенности');
    seen[id] = true;
    if (s.kind !== 'race' && s.kind !== 'feature') throw new Error('Некорректный вид особенности');
    if (['race','book','rp','curse','blessing','other'].indexOf(s.origin) < 0) throw new Error('Некорректный источник');
    if (s.kind === 'race' && s.archived !== true) raceCount++;
    if (!Array.isArray(s.effects) || s.effects.length > 12) throw new Error('Превышен лимит эффектов');
    var effectIds = {};
    var effects = s.effects.map(function(e) {
      if (!e || typeof e !== 'object') throw new Error('Некорректный эффект');
      var eid = String(e.id || '').trim();
      if (!/^[\w:.-]{1,100}$/i.test(eid) || effectIds[eid]) throw new Error('Некорректный ID эффекта');
      effectIds[eid] = true;
      if (['always','battle','conditional'].indexOf(e.trigger) < 0) throw new Error('Некорректное условие');
      if (e.kind === 'ability') {
        var abilityName = String(e.abilityName || '').trim();
        if (!abilityName || abilityName.length > 160) throw new Error('Неверное название способности');
        return {id:eid,kind:'ability',abilityName:abilityName,description:String(e.description || '').slice(0,2000),trigger:e.trigger};
      }
      if (e.kind !== 'modifier' || !allowedStats[e.stat] || ['flat','percent'].indexOf(e.mode) < 0 ||
          typeof e.value !== 'number' || !isFinite(e.value) || Math.abs(e.value) > 100000)
        throw new Error('Некорректный модификатор');
      return {id:eid,kind:'modifier',stat:e.stat,mode:e.mode,value:e.value,trigger:e.trigger,description:String(e.description || '').slice(0,2000)};
    });
    result.push({id:id,kind:s.kind,origin:s.origin,name:name,
      description:String(s.description || '').slice(0,4000),
      enabled:s.enabled === true,archived:s.archived === true,
      legacyName:String(s.legacyName || '').slice(0,180),effects:effects});
  });
  if (raceCount > 1) throw new Error('Нельзя записать две расы');
  var normalized = {schemaVersion:4,race:String(value.race || '').trim().slice(0,120),sources:result};
  if (JSON.stringify(normalized).length > 30000) throw new Error('Лимит размера данных V4');
  return normalized;
}
function gosmagV4Calculate_(base,sources) {
  var stats = {}, breakdown = {};
  GOSMAG_V4_STAT_ROWS_.forEach(function(row) {
    var key = row[0], flat = 0, percent = 0;
    sources.forEach(function(source) {
      if (!source.enabled || source.archived) return;
      (source.effects || []).forEach(function(e) {
        if (e.kind !== 'modifier' || e.trigger !== 'always' || e.stat !== key) return;
        if (e.mode === 'flat') flat += Number(e.value) || 0;
        if (e.mode === 'percent') percent += Number(e.value) || 0;
      });
    });
    var b = Number(base[key]) || 0;
    var total = Math.max(0,Math.round((b + flat) * (1 + percent / 100) * 100) / 100);
    stats[key] = total;
    breakdown[key] = {base:b,flat:flat,percent:percent,total:total};
  });
  return {stats:stats,breakdown:breakdown};
}
function gosmagV4BaseStats_(tech) {
  var stats = {};
  var combat = tech.getRange('E5:E15').getValues();
  var physical = tech.getRange('H3:H6').getValues();
  GOSMAG_V4_STAT_ROWS_.forEach(function(row) {
    var cell = row[2];
    var number = cell[0] === 'E' ? combat[Number(cell.slice(1))-5][0] : physical[Number(cell.slice(1))-3][0];
    stats[row[0]] = Number(number) || 0;
  });
  return stats;
}
function gosmagV4CharacterRead_(characterId) {
  var main = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);
  var entry = findRegistryEntry(main,normalizeCharacterId(characterId));
  if (!entry || !entry.active || !entry.spreadsheetId) throw new Error('Персонаж не найден или отключён');
  var book = SpreadsheetApp.openById(entry.spreadsheetId);
  var personal = requireSheet(book,PERSONAL_CHARACTER_SHEET_NAME,'личной таблице');
  var tech = requireSheet(book,PERSONAL_TECH_SHEET_NAME,'личной таблице');
  var profile = gosmagV4Read_(book,personal);
  return {ok:true,characterId:entry.characterId,characterName:entry.name,
    profile:profile,effectiveStatsV4:gosmagV4Calculate_(gosmagV4BaseStats_(tech),profile.sources)};
}
function gosmagV4WriteSummary_(sheet,profile) {
  // Only own sheet, with exact marker. All core sheets are untouched.
  if (String(sheet.getRange('A1').getValue() || '') !== GOSMAG_V4_MARKER_)
    throw new Error('Подозрительный лист ЭФФЕКТЫ_V4, изменение заблокировано');
  var statRows = GOSMAG_V4_STAT_ROWS_.length;
  var existing = sheet.getRange(3,1,statRows + 34,5);
  if (existing.getFormulas().some(function(row) {return row.some(Boolean);} )) {
    // Previously installed own formulas in column E are permitted ONLY in expected cells.
    var formulas = existing.getFormulas();
    for (var i=0; i<formulas.length; i++) for (var j=0; j<formulas[i].length; j++) {
      if (formulas[i][j] && !(j === 1 && i >= 1 && i < statRows+1) && !(j === 4 && i >= 1 && i < statRows+1))
        throw new Error('В листе V4 обнаружена посторонняя формула');
    }
  }
  var oldRecords = sheet.getRange(22,1,50,5);
  if (oldRecords.getFormulas().some(function(row){return row.some(Boolean);}))
    throw new Error('Сторонние формулы в таблице особенностей V4');
  sheet.getRange('A2').setValue('Раса');
  sheet.getRange('B2').setValue(String(profile.race || 'Не указана').replace(/^=/,"'="));
  sheet.getRange('A3:E3').setValues([['Характеристика','База из ТЕХ','Бонус (+/−)','Бонус (%)','Итог V4']]);
  var calculated = gosmagV4Calculate_({},profile.sources).breakdown;
  GOSMAG_V4_STAT_ROWS_.forEach(function(row,i) {
    var r = i + 4;
    sheet.getRange(r,1,1,4).setValues([[row[1],null,calculated[row[0]].flat,calculated[row[0]].percent]]);
    // Existing formulas are owned by THIS sheet, not ТЕХ, so safe to replace.
    sheet.getRange(r,2).setFormula("='ТЕХ'!" + row[2]);
    setLocalizedFormulaForCreate_(sheet.getRange(r,5),'=MAX(0,ROUND((B'+r+'+C'+r+')*(1+D'+r+'/100),2))');
  });
  oldRecords.clearContent();
  sheet.getRange('A21:E21').setValues([['Тип','Источник','Название','Описание','Эффекты / условия']]);
  var rows = profile.sources.slice(0,45).map(function(s) {
    var description = String(s.description || '').replace(/^=/,"'=");
    var name = String(s.name || '').replace(/^=/,"'=");
    var effects = s.effects.map(function(e){
      if (e.kind === 'ability') return 'Способность: ' + e.abilityName;
      return e.stat + ' ' + e.value + (e.mode === 'percent' ? '%' : '') + ' ['+e.trigger+']';
    }).join('; ');
    return [s.kind === 'race' ? 'Раса' : 'Особенность',s.origin,name,description,(s.archived ? '[АРХИВ] ' : '')+effects];
  });
  if (rows.length) sheet.getRange(22,1,rows.length,5).setValues(rows);
  sheet.setFrozenRows(3);
}
function gosmagV4Save_(characterId,requested,expectedRevision) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Другая запись выполняется, повторите попытку');
  try {
    var main = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);
    var entry = findRegistryEntry(main,normalizeCharacterId(characterId));
    if (!entry || !entry.active || !entry.spreadsheetId) throw new Error('Персонаж не найден');
    var book = SpreadsheetApp.openById(entry.spreadsheetId);
    var personal = requireSheet(book,PERSONAL_CHARACTER_SHEET_NAME,'личной таблице');
    var stored = gosmagV4ReadSaved_(book);
    if (!Number.isSafeInteger(expectedRevision) || stored.revision !== expectedRevision)
      throw new Error('Данные изменились с момента загрузки. Обновите редактор.');
    var cleaned = gosmagV4Validate_(requested);
    // Ensure the original features in B76 are not silently lost.
    var legacy = readSpecialSkills(personal) || [];
    legacy.forEach(function(item) {
      var found = cleaned.sources.some(function(s){ return String(s.legacyName || '').toLowerCase() === String(item.name || '').toLowerCase();});
      if (!found) throw new Error('Исходная особенность «'+item.name+'» отсутствует. Для удаления используйте архивирование.');
    });
    var profile = {schemaVersion:4,revision:stored.revision+1,race:cleaned.race,sources:cleaned.sources};
    var data = JSON.stringify(profile);
    if (data.length > 30000) throw new Error('Данные V4 слишком большие');
    var sheet = book.getSheetByName(GOSMAG_V4_SHEET_NAME_);
    if (!sheet) { sheet = book.insertSheet(GOSMAG_V4_SHEET_NAME_); sheet.getRange('A1').setValue(GOSMAG_V4_MARKER_); }
    if (String(sheet.getRange('A1').getValue() || '') !== GOSMAG_V4_MARKER_) throw new Error('Лист V4 имеет чужой формат');
    if (sheet.getRange('K2').getFormula()) throw new Error('Нельзя перезаписывать формулу хранения V4');
    // Prepare human-readable table first; revision changes only after summary validates.
    gosmagV4WriteSummary_(sheet,profile);
    if (stored.revision > 0) {
      var historyRow = Math.max(73,sheet.getLastRow()+1);
      if (historyRow <= 400) {
        sheet.getRange(historyRow,11).setValue(JSON.stringify(stored));
        sheet.getRange(historyRow,12).setValue(new Date().toISOString());
      }
    }
    sheet.getRange('K1').setValue('V4 JSON · не редактировать вручную');
    sheet.getRange('K2').setValue(data);
    SpreadsheetApp.flush();
    if (String(sheet.getRange('K2').getValue()) !== data) throw new Error('Google не подтвердил запись V4');
    return {ok:true,characterId:entry.characterId,profile:gosmagV4Read_(book,personal),
      effectiveStatsV4:gosmagV4Calculate_(gosmagV4BaseStats_(requireSheet(book,PERSONAL_TECH_SHEET_NAME,'личной таблице')),profile.sources)};
  } finally { lock.releaseLock(); }
}
