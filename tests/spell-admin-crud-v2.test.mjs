import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const gas = readFileSync(new URL('scripts/GOS_MAG_SPELL_ADMIN_V2.gs', root), 'utf8');
const adminUI = readFileSync(new URL('src/components/admin/AdminSpells.tsx', root), 'utf8');
const handler = readFileSync(new URL('netlify/functions/admin-spells.mjs', root), 'utf8');

function fixture() {
  let flushed = 0;
  let locks = 0;
  const makeCell = (initial = '') => ({
    value: initial,
    formula: '',
    getValue() { return this.value; },
    getDisplayValue() { return String(this.value); },
    getFormula() { return this.formula; },
    setValue(value) { this.value = value; return this; },
    clearContent() { this.value = ''; return this; },
  });
  const oldName = makeCell('Старое заклинание');
  const oldDesc = makeCell('Формат: spell-v3\nЭффект: тест');
  const freeName = makeCell();
  const freeDesc = makeCell();
  const slots = [
    { index: 1, name: oldName.value, rawDescription: oldDesc.value,
      nameRange: { getCell: () => oldName }, descriptionRange: { getCell: () => oldDesc } },
    { index: 2, name: '', rawDescription: '',
      nameRange: { getCell: () => freeName }, descriptionRange: { getCell: () => freeDesc } },
  ];
  const ctx = {
    cleanText: (v) => String(v ?? '').trim(),
    normalizeCharacterId: (v) => String(v ?? '').trim(),
    asObjectForCreate: (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}),
    validateCanonicalSpell_: (s) => ({ spell: s, issues: s.name ? [] : [{ message: 'missing name' }] }),
    getPersonalSpellSlots_: () => slots,
    findRegistryEntry: () => ({ spreadsheetId: 'personal' }),
    requireSheet: () => ({}),
    buildSpellDescriptionForCreate: (s) => `Формат: spell-v3\nЭффект: ${s.effect}`,
    parseStoredSpell_: (name, description) => ({ name, description, valid: true }),
    SpreadsheetApp: { openById: () => ({}), flush: () => { flushed++; } },
    LockService: { getScriptLock: () => ({ tryLock: () => { locks++; return true; }, releaseLock() {} }) },
    MAIN_SPREADSHEET_ID: 'main', PERSONAL_CHARACTER_SHEET_NAME: 'Лист персонажа',
  };
  runInNewContext(gas, ctx);
  const execute = (op, index, spell, expected) => ctx.gosmagManageSpellAdminV2_(op, 'ren', index, spell, expected);
  return { execute, slots, oldName, oldDesc, freeName, freeDesc, counters: () => ({ flushed, locks }) };
}

test('create uses first empty slot without touching old spell or points', () => {
  const f = fixture();
  const result = f.execute('create', null, { name: 'Новый призыв', effect: 'монстр', summonedCreatures: [{ name: 'Волк', hp: 500, mp: 100 }] }, {});
  assert.equal(result.spellIndex, 2);
  assert.equal(f.oldName.value, 'Старое заклинание');
  assert.equal(f.freeName.value, 'Новый призыв');
  assert.equal(f.freeDesc.value, 'Формат: spell-v3\nЭффект: монстр');
  assert.equal(f.counters().locks, 1);
});

test('update checks old snapshot; stale update never overwrites', () => {
  const f = fixture();
  assert.throws(() => f.execute('update', 1, { name: 'Урон', effect: 'урон' }, { name: 'Старое заклинание', rawDescription: 'неверный снимок' }), /уже изменилось/);
  assert.equal(f.oldName.value, 'Старое заклинание');
  assert.equal(f.counters().flushed, 0);
});

test('update existing spell succeeds, does not move slots', () => {
  const f = fixture();
  const result = f.execute('update', 1, { name: 'Обновлённое', effect: 'новый эффект' }, { name: 'Старое заклинание', rawDescription: f.oldDesc.value });
  assert.equal(result.spellIndex, 1);
  assert.equal(f.oldName.value, 'Обновлённое');
  assert.equal(f.freeName.value, '');
});

test('delete clears only matching old slot; no shifting', () => {
  const f = fixture();
  const result = f.execute('delete', 1, {}, { name: 'Старое заклинание', rawDescription: f.oldDesc.value });
  assert.equal(result.spellIndex, 1);
  assert.equal(result.spell, null);
  assert.equal(f.oldName.value, '');
  assert.equal(f.oldDesc.value, '');
  assert.equal(f.freeName.value, '');
});

test('delete without snapshot and delete of missing slot fail closed', () => {
  const f = fixture();
  assert.throws(() => f.execute('delete', 1, {}, {}), /актуальный снимок/);
  assert.throws(() => f.execute('delete', 33, {}, { name: 'Старое заклинание', rawDescription: f.oldDesc.value }), /отсутствует/);
  assert.equal(f.oldName.value, 'Старое заклинание');
});

test('occupied or formula-backed slots cannot be created into', () => {
  const f = fixture();
  f.freeName.formula = '=FOO()';
  assert.throws(() => f.execute('create', null, { name: 'Новый', effect: 'описание' }, {}), /нет свободных слотов/);
  assert.equal(f.freeName.value, '');
});

test('only allow create update delete and reject invalid spell', () => {
  const f = fixture();
  assert.throws(() => f.execute('import', 1, { name: 'х' }, {}), /Недопустимое действие/);
  assert.throws(() => f.execute('create', null, { effect: 'нет названия' }, {}), /missing name/);
  assert.equal(f.counters().locks, 0);
});

test('UI has tabs, add, delete with confirmation, and search; Netlify keeps admin permission and write secret', () => {
  for (const required of ['AdminSpellRequests', 'Гримуары и редактор', 'Создать заклинание', 'Подтвердить удаление', 'spellQuery', 'deleteConfirmation']) assert.ok(adminUI.includes(required), required);
  for (const required of ['session.role !== \'admin\'', 'CHARACTER_WRITE_SECRET', 'admin-manage-character-spell-v2', 'CHARACTER_SPELL_', 'confirmName']) assert.ok(handler.includes(required), required);
});
