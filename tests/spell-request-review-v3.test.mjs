import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewCost, reviewRevision, assertReviewRevision, editableSpell,
  effectiveSpell, effectiveCost,
} from '../netlify/functions/_shared/_spell-review.mjs';

const file = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const gas = file('scripts/Код_v141_SPELL_REVIEW_V3.gs');
const requestHandler = file('netlify/functions/admin-spell-requests.mjs');
const requestUI = file('src/components/admin/AdminSpellRequests.tsx');
const reusableEditor = file('src/components/admin/AdminSpellEditor.tsx');
const playerHandler = file('netlify/functions/player-spell-requests.mjs');

function sliceFunction(startName, endName) {
  const start = gas.indexOf('function ' + startName + '(');
  const end = gas.indexOf('function ' + endName + '(', start + 10);
  assert.ok(start >= 0 && end > start, 'missing expected Google function ' + startName);
  return gas.slice(start, end);
}

const costsAndMarker = gas.slice(gas.indexOf('function spellPurchaseCost_('), gas.indexOf('function comparableSpellForPurchase_('));
const purchaseCode = gas.slice(gas.indexOf('function applySpellPurchase_('), gas.indexOf('/* ============================================================\n   ИНВЕНТАРЬ ДЛЯ ИВЕНТОВ', gas.indexOf('function applySpellPurchase_(')));
assert.ok(purchaseCode.length > 2000, 'full production Google purchase source not found');

function fixture(points = 10) {
  const cells = {
    points: { value: points },
    existingName: { value: 'Первое заклинание' },
    existingDescription: { value: 'Старое описание' },
    newName: { value: '' },
    newDescription: { value: '' },
  };
  let flushes = 0;
  let lockCount = 0;
  let writes = 0;
  const cell = (item) => ({
    getValue: () => item.value,
    setValue: (value) => { item.value = value; writes++; },
  });
  const pointsCell = cell(cells.points);
  const nameCell = cell(cells.newName);
  const descriptionCell = cell(cells.newDescription);
  const markers = new Map();
  const slots = [
    { index: 1, name: cells.existingName.value, descriptionRange: {getCell: () => cell(cells.existingDescription)} },
    { index: 2, name: '', descriptionRange: {getCell: () => descriptionCell}, nameRange: {getCell: () => nameCell} },
  ];
  const context = {
    SPELL_PURCHASE_COST_NEW: 3, SPELL_PURCHASE_COST_UPGRADE: 5,
    MAIN_SPREADSHEET_ID: 'main', SYSTEM_SPREADSHEET_ID: 'system',
    PERSONAL_CHARACTER_SHEET_NAME: 'Лист персонажа', SYSTEM_CHARACTERS_SHEET_NAME: 'Маги',
    asObjectForCreate: (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {},
    cleanText: (x) => String(x ?? '').trim(),
    normalizeCharacterId: (x) => String(x ?? '').trim(),
    numberValue: (x) => Number(x) || 0,
    normalizeSpellForStorage_: (x) => x,
    validateCanonicalSpell_: (s) => ({issues: [], spell: s}),
    buildSpellDescriptionForCreate: (s) => 'Формат: spell-v3\nЭффект: ' + s.effect,
    parseStoredSpell_: (name, description) => ({name, description, valid: true}),
    getPersonalSpellSlots_: () => slots,
    findRegistryEntry: () => ({active: true, spreadsheetId: 'personal', name: 'Тест'}),
    findSystemCharacterRowBySpreadsheetId: () => 2,
    requireSheet: (obj, sheetName) => obj.id === 'system' ? {getRange: () => pointsCell} : {},
    SpreadsheetApp: {openById: (id) => ({id}), flush: () => { flushes++; }},
    LockService: {getScriptLock: () => ({tryLock: () => {lockCount++; return true;}, releaseLock() {}})},
    PropertiesService: {getScriptProperties: () => ({getProperty: (k) => markers.get(k), setProperty: (k, v) => markers.set(k, v)})},
    console,
  };
  runInNewContext(costsAndMarker + '\n' + purchaseCode, context);
  function purchase(approvedCost, requestId = 'request-one') {
    return context.applySpellPurchase_({requestId, requestType: 'new', characterId: 'test',
      approvedCost, spell: {schemaVersion: 3, name: 'Волк', effect: 'Призыв волка', summonedCreatures: [{name:'Волк',hp:230,mp:45,abilities:[{name:'Укус',effect:'Урон',manaCost:0}]}]}});
  }
  return {purchase, cells, markers, counters: () => ({flushes, lockCount, writes})};
}

test('admin cost accepts free, larger and smaller amounts; rejects fractions and negatives', () => {
  assert.equal(reviewCost(0), 0);
  assert.equal(reviewCost(2), 2);
  assert.equal(reviewCost(7), 7);
  assert.equal(reviewCost(9999), 9999);
  assert.equal(reviewCost(undefined, 3), 3);
  for (const invalid of [-1, 1.5, '5', NaN, Infinity, 10000, null]) {
    assert.throws(() => reviewCost(invalid), /целым числом|цена/i, 'invalid=' + String(invalid));
  }
});

test('saved admin draft keeps the player original, revision prevents stale UI', () => {
  const original = {schemaVersion: 3, name: 'Первый', effect: 'Лёд'};
  const reviewed = editableSpell({schemaVersion: 3, name: 'Исправленное', effect: 'Огонь'});
  const record = {cost: 3, proposedSpell: original, reviewedSpell: reviewed, reviewCost: 0, reviewRevision: 1};
  assert.equal(effectiveSpell(record).name, 'Исправленное');
  assert.equal(effectiveCost(record), 0);
  assert.equal(record.proposedSpell.name, 'Первый');
  assert.equal(reviewRevision(record), 1);
  assert.doesNotThrow(() => assertReviewRevision(record, 1));
  assert.throws(() => assertReviewRevision(record, 0), /изменилась/);
});

test('malformed or oversized admin spell draft is refused before persistence', () => {
  for (const bad of [null, '', [], {}, {schemaVersion:3,name:'А'}, {schemaVersion:3,name:'А',effect:'х'.repeat(55000)}]) {
    assert.throws(() => editableSpell(bad));
  }
});

test('Google performs actual 0-point approval without changing balance', () => {
  const f = fixture(5);
  const result = f.purchase(0);
  assert.equal(result.cost, 0);
  assert.equal(result.pointsBefore, 5);
  assert.equal(result.pointsAfter, 5);
  assert.equal(f.cells.points.value, 5);
  assert.equal(f.cells.newName.value, 'Волк');
  assert.equal(f.cells.existingName.value, 'Первое заклинание');
  assert.ok(f.cells.newDescription.value.includes('Призыв волка'));
  assert.equal(result.spellIndex, 2);
});

test('Google deducts exactly chosen price, not hard-coded 3 or 5', () => {
  const f = fixture(17);
  const result = f.purchase(7);
  assert.equal(result.cost, 7);
  assert.equal(result.pointsAfter, 10);
  assert.equal(f.cells.points.value, 10);
});

test('insufficient points and invalid prices never write to Google', () => {
  const f = fixture(3);
  assert.throws(() => f.purchase(7), /Недостаточно баллов/);
  assert.equal(f.cells.points.value, 3);
  assert.equal(f.cells.newName.value, '');
  assert.equal(f.counters().writes, 0);
  assert.throws(() => f.purchase(-1, 'request-two'), /Стоимость/);
  assert.throws(() => f.purchase('2', 'request-three'), /Стоимость/);
  assert.equal(f.counters().writes, 0);
});

test('retry with same requestId does not spend points again', () => {
  const f = fixture(15);
  const first = f.purchase(8);
  assert.equal(first.pointsAfter, 7);
  const again = f.purchase(8);
  assert.equal(again.alreadyApplied, true);
  assert.equal(again.cost, 8);
  assert.equal(f.cells.points.value, 7);
  assert.equal(f.counters().lockCount, 1);
});

test('admin review flows use same approved cost through UI, Netlify and Google', () => {
  for (const value of ['save-review', 'expectedReviewRevision', 'reviewCost(body.cost', 'approvedCost', 'reviewedSpell', 'tryWriteAdminLog']) assert.ok(requestHandler.includes(value), value);
  for (const value of ['Исправить заклинание', 'Сохранить цену', '0 = бесплатно', 'reviewCost', 'expectedReviewRevision', '<SpellEditor']) assert.ok(requestUI.includes(value), value);
  for (const value of ['SummonedCreaturesEditor', 'spellPowerTypeLabel', 'validateCanonicalSpell', 'saveLabel']) assert.ok(reusableEditor.includes(value), value);
  assert.ok(gas.includes('spellPurchaseApprovedCost_(\n      purchase,\n      requestType'), 'Google still used fixed price');
  assert.ok(playerHandler.includes('spellRequestCost('), 'player price flow was changed');
});
