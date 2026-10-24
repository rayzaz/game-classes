import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const player = fs.readFileSync(new URL('../src/components/PlayerCabinet.tsx', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../netlify/functions/admin-character-data.mjs', import.meta.url), 'utf8');
const handler = fs.readFileSync(new URL('../netlify/functions/character-data.mjs', import.meta.url), 'utf8');
const e3 = player.split('// SIRA_E3_AUTOREFRESH:')[1]?.split('/* =========================')[0] || '';

test('E3 polls authenticated existing Character DB every 90 sec only while visible', () => {
  assert.match(e3, /setInterval\(\(\) => \{ void refreshDetails\(\); \}, 90_000\)/);
  assert.match(e3, /document\.hidden \|\| view !== 'cabinet'/);
  assert.match(e3, /busy/);
  assert.match(e3, /PLAYER_CABINET_API/);
  assert.match(e3, /e3=1/);
  assert.match(e3, /ADMIN_CABINET_API/);
  assert.match(e3, /credentials: 'same-origin'/);
});
test('E3 refresh is lifecycle safe and handles idle tab return', () => {
  assert.match(e3, /active = false/);
  assert.match(e3, /clearInterval\(timer\)/);
  assert.match(e3, /removeEventListener\('focus', refreshDetails\)/);
  assert.match(e3, /removeEventListener\('visibilitychange', refreshDetails\)/);
  assert.match(e3, /if \(!previous\) return previous/);
  assert.doesNotMatch(e3, /setLoading\(|setError\(/);
});
test('E3 only changes profile, combat, skills, spells, and inventory', () => {
  assert.match(e3, /pchk: result\.pchk/);
  assert.match(e3, /battle: result\.battle/);
  assert.match(e3, /classSkills: result\.classSkills/);
  assert.match(e3, /specialSkills: result\.specialSkills/);
  assert.match(e3, /spells: result\.spells/);
  assert.match(e3, /inventory: result\.inventory/);
  assert.doesNotMatch(e3, /^\s*(?:money|health|mana|level|upgradePoints): result\./m);
});
test('E3 rejects incomplete details, stale timestamps, and unnecessary state changes', () => {
  assert.match(e3, /result\.ok !== true/);
  assert.match(e3, /!result\.pchk \|\| !result\.battle/);
  assert.match(e3, /after < before/);
  assert.match(e3, /JSON\.stringify\(oldFields\) === JSON\.stringify\(newFields\)/);
});
test('admin E3 retains admin-only authorization and guarded refresh', () => {
  assert.match(admin, /session\.role !==[\s\S]*?'admin'/);
  assert.match(admin, /180_000/);
  assert.match(admin, /context\.waitUntil\(/);
  assert.match(admin, /refreshCharacterDb\(characterId\)/);
  assert.match(handler, /export async function refreshCharacterDb\(/);
  assert.match(handler, /publishCharacterSnapshot\(/);
  assert.match(handler, /searchParams.get\('e3'\) === '1'/);
  assert.match(handler, /180_000 : REFRESH_AFTER_MS/);
});
test('existing E2 and live HP/MP polls unchanged', () => {
  assert.match(player, /PLAYER_FAST_CORE_API/);
  assert.match(player, /PLAYER_LIVE_HP_MP_API/);
  assert.match(player, /setInterval\(\(\) => \{ void loadFastCore\(\); \}, 20_000\)/);
  assert.match(player, /setInterval\(\(\) => \{ void loadLiveHpMp\(\); \}, 20_000\)/);
});
