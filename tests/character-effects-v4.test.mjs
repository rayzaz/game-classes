import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { validateEffectsV4 } from '../netlify/functions/_shared/_character-effects-v4.mjs';

const v4Source = readFileSync(new URL('../scripts/GOS_MAG_CHARACTER_EFFECTS_V4.gs', import.meta.url), 'utf8');
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const effect = (value, mode = 'percent', trigger = 'always') => ({ id: 'e:1', kind:'modifier', stat:'mp', mode, value, trigger });
const feature = (effects, name = 'Дар книги') => ({ id:'trait:1',kind:'feature',origin:'book',name,description:'',enabled:true,effects });
const payload = (sources) => ({schemaVersion:4,race:'Демон',sources});

function gas(extra = {}) {
  const ctx = { ...extra, console, Number, Math, JSON, String, Object, Array, Error, isFinite };
  runInNewContext(`${v4Source}\nthis.V4={read:gosmagV4Read_,save:gosmagV4Save_,calculate:gosmagV4Calculate_,validate:gosmagV4Validate_,race:gosmagV4RaceFromProfile_,summary:gosmagV4WriteSummary_};`,ctx);
  return ctx.V4;
}

test('book features can have several effects, including an ability', () => {
  const src = feature([effect(20), {id:'e:2',kind:'ability',abilityName:'Адское зрение',trigger:'always'}]);
  const out = validateEffectsV4(payload([src]));
  assert.equal(out.sources[0].origin,'book');
  assert.equal(out.sources[0].effects.length,2);
});
test('freeform positive and negative flat and percent modifiers are accepted', () => {
  const entries = [feature([effect(-15,'flat')]), {...feature([{...effect(30),id:'e:3'}],'Благословение'),id:'feature:2',origin:'blessing'}];
  assert.equal(validateEffectsV4(payload(entries)).sources.length,2);
});
test('invalid amount, fractional injection and unknown stat rejected by server', () => {
  assert.throws(()=>validateEffectsV4(payload([feature([effect(Number.POSITIVE_INFINITY)])])));
  assert.throws(()=>validateEffectsV4(payload([feature([{...effect(20),stat:'constructor'}])])));
  assert.throws(()=>validateEffectsV4(payload([feature([{...effect(100001)}])])));
});
test('race cannot be duplicated; disabled features are retained', () => {
  const r = {id:'race:main',kind:'race',origin:'race',name:'Демон',enabled:true,effects:[]};
  assert.throws(()=>validateEffectsV4(payload([r,{...r,id:'race:other'}])));
  assert.equal(validateEffectsV4(payload([{...feature([]),enabled:false}])).sources[0].enabled,false);
});
test('Google math: flat first, then additive percentage; clamp at zero', () => {
  const V4 = gas();
  const sources = [{...feature([{...effect(10,'flat'),id:'e:1'},{...effect(20),id:'e:2'}])}];
  const result = V4.calculate({mp:100},sources);
  assert.equal(result.stats.mp,132);
  sources[0].effects.push({...effect(-400),id:'e:3'});
  assert.equal(V4.calculate({mp:100},sources).stats.mp,0);
});
test('situational buffs never change permanent stats', () => {
  const V4 = gas();
  const sources = [feature([effect(20,'percent','battle')])];
  assert.equal(V4.calculate({mp:100},sources).stats.mp,100);
});
test('disabled and archived sources do not change permanent stats', () => {
  const V4 = gas();
  const f = feature([effect(20)]);
  assert.equal(V4.calculate({mp:100},[{...f,enabled:false}]).stats.mp,100);
  assert.equal(V4.calculate({mp:100},[{...f,archived:true}]).stats.mp,100);
});
test('old B76 book traits are imported read-only; race comes from AB5', () => {
  const V4 = gas({readSpecialSkills:()=>[{name:'Дар лунной книги',description:'Особое зрение'}]});
  const sheet = {getRange(cell){return {getDisplayValue(){return cell === 'AB5' ? 'Возраст: 19 лет\nРаса: Человек\nИстория: ...' : '';}}}};
  const book = {getSheetByName:()=>null};
  const read = V4.read(book,sheet);
  assert.equal(read.race,'Человек');
  assert.equal(read.sources.length,2);
  assert.equal(read.sources[1].legacyName,'Дар лунной книги');
});
test('Google V4 writer is forbidden to touch core sheets and old feature cell', () => {
  assert.doesNotMatch(v4Source,/getRange\(['"](?:B76|E3:E15|AB5)['"]\)\.set(?:Value|Values|Formula)/);
  assert.ok(v4Source.includes("'ЭФФЕКТЫ_V4'"));
  assert.match(v4Source,/stored\.revision !== expectedRevision/);
  assert.match(v4Source,/original.*features|исходн|Исходн/i);
});
test('admin proxy authenticates and enforces V4 revision and write secret', () => {
  const netlify = src('../netlify/functions/admin-character-effects-v4.mjs');
  assert.match(netlify,/readSession\(request\)/);
  assert.match(netlify,/session\.role !== 'admin'/);
  assert.match(netlify,/expectedRevision/);
  assert.match(netlify,/CHARACTER_WRITE_SECRET/);
  assert.match(netlify,/validateEffectsV4\(body\.profile\)/);
});
test('Google endpoint and character projection are included in prepared code', () => {
  // This test checks the local extension contract without requiring the 1MB runtime in Git.
  assert.match(v4Source,/function gosmagV4CharacterRead_/);
  assert.match(v4Source,/function gosmagV4Save_/);
  assert.match(v4Source,/function gosmagV4Read_/);
});
test('player card and admin screen wire race, book effects and calculated preview', () => {
  assert.match(src('../src/components/admin/AdminCabinet.tsx'),/AdminCharacterEffectsV4/);
  assert.match(src('../src/components/PlayerCabinet.tsx'),/effectiveStatsV4/);
  assert.match(src('../src/components/PlayerCabinet.tsx'),/source\.origin === 'book'/);
});
