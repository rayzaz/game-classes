import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function loadSource(relative) {
  return fs.readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
}
async function loadPureTS(relative) {
  const source = loadSource(relative);
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: relative,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(diagnostics?.filter(x => x.category === ts.DiagnosticCategory.Error).length ?? 0, 0);
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
}

const system = await loadPureTS('src/components/questionnaire/questionnaireLogic.ts');
const schema = await loadPureTS('src/lib/spellSchema.ts');

const chartTypes = ['Урон', 'Защита', 'Лечение', 'Бафф', 'Дебафф', 'Зелья', 'Призыв', 'Перемещение', 'Модификатор скорости', 'Физическое воздействие', 'Прочее'];

test('class priority no longer hides spell-affecting SYSTEM chart stats', () => {
  for (const classKey of Object.keys(system.CLASS_SPELL_TYPES).concat('unknown', null)) {
    const types = system.getSpellTypes(classKey);
    for (const value of chartTypes) assert.ok(types.includes(value), `${classKey}: ${value}`);
    assert.equal(new Set(types).size, types.length);
    for (const old of ['Контроль', 'Ресурс', 'Без расчёта']) assert.ok(types.includes(old));
  }
});

test('preserves historic power keys while showing SYSTEM terms', () => {
  assert.equal(system.spellPowerTypeLabel('Урон'), 'Атака заклинанием (урон)');
  assert.equal(system.spellPowerTypeLabel('Защита'), 'Защита заклинанием');
});

test('old schemaVersion 3 spells remain compatible, no creature profiles required', () => {
  const legacy = schema.makeCanonicalSpell('Призыв');
  legacy.name = 'Призыв защитника';
  legacy.effect = 'Призывает защитника';
  legacy.basePower = 9;
  delete legacy.summonedCreatures;
  const normalized = schema.normalizeCanonicalSpell(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(normalized.summonedCreatures, []);
  assert.deepEqual(schema.validateCanonicalSpell(normalized), []);
  assert.equal(normalized.schemaVersion, 3);
});

test('new summon profiles and nested abilities survive canonical JSON roundtrip', () => {
  const spell = schema.makeCanonicalSpell('Призыв');
  spell.name = 'Огненные волки';
  spell.effect = 'Призывает волков';
  spell.basePower = 13;
  spell.summonCount = 2;
  spell.summonedCreatures = [{ name: 'Волк', hp: 230, mp: 45, description: 'Огненный', abilities: [
    { name: 'Укус', effect: 'Урон по цели', manaCost: 0 },
    { name: 'Пламя', effect: 'Область огня', manaCost: 12 },
  ] }];
  const restored = schema.normalizeCanonicalSpell(JSON.parse(JSON.stringify(spell)));
  assert.deepEqual(restored.summonedCreatures, spell.summonedCreatures);
  assert.deepEqual(schema.validateCanonicalSpell(restored), []);
  assert.match(schema.spellSpatialLabels(restored).join(' '), /профили существ: 1/);
});

test('partial or malformed summoned creature profile is rejected', () => {
  const spell = schema.makeCanonicalSpell('Призыв');
  spell.name = 'Волк'; spell.effect = 'Вызывает волка'; spell.basePower = 7;
  spell.summonedCreatures = [{ name: '', hp: null, mp: null, description: '', abilities: [{ name: '', effect: '', manaCost: null }] }];
  const issues = schema.validateCanonicalSpell(spell);
  assert.ok(issues.filter(x => x.field === 'summonedCreatures').length >= 4);
});

test('new movement power type selects movement form and retains old d20 requirement', () => {
  const spell = schema.makeCanonicalSpell('Перемещение');
  assert.equal(spell.form, 'Перемещение');
  assert.equal(spell.movementMeters, null);
  assert.equal(schema.spellUsesFixedPower(spell.powerType), true);
});

test('all three creation/editing screens contain summoned creature editor and chart labels', () => {
  for (const path of [
    'src/components/questionnaire/QuestionnaireWizard.tsx',
    'src/components/player/PlayerSpellDevelopment.tsx',
    'src/components/admin/AdminSpells.tsx',
  ]) {
    const source = loadSource(path);
    assert.match(source, /<SummonedCreaturesEditor\b/);
    assert.match(source, /spellPowerTypeLabel\(/);
    assert.match(source, /summonedCreatures/);
  }
});
