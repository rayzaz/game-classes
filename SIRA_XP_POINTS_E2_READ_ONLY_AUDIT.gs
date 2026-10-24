/** SIRA E2 preflight: read-only XP/upgrade-points across all active characters. */
/** Read MAIN block labels like the existing readCharacterSystemStats, but batched once. */
function siraE2PreflightMainRead_(registry, config) {
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

function siraE2AuditReadOnly() {
  if (typeof siraFastCoreReadV1_ !== 'function' ||
      typeof siraFastCoreRegistryV1_ !== 'function' ||
      typeof siraFastCoreConfigV12_ !== 'function')
    throw new Error('E2: run in CENTRAL character Apps Script containing FAST CORE E1.3');
  const fast = siraFastCoreReadV1_();
  const registry = siraFastCoreRegistryV1_();
  const points = siraE2PreflightMainRead_(registry, siraFastCoreConfigV12_());
  const all = fast.characters.map(c => ({ id:c.characterId, level:c.level.current,
    experience:c.level.experience, progress:c.level.progress,
    upgradePoints:points.values[c.characterId] }));
  const ok = fast.ok && fast.matched === registry.ids.length && points.invalid.length === 0 &&
    all.every(c=>Number.isSafeInteger(c.upgradePoints));
  const result = {ok, registryCount:registry.ids.length, matchedFast:fast.matched,
    matchedPoints:Object.keys(points.values).length, invalid:points.invalid,
    missingFast:fast.missing, sample:all.filter(c=>['ren','ariadna','mangoliya-feer'].includes(c.id)),
    googleWrites:0, triggersAdded:0, source:'SYSTEM level+XP; MAIN Маги labels: Баллы/Баллы прокачки'};
  console.log('=== SIRA XP POINTS E2 READ-ONLY AUDIT === '+JSON.stringify(result));
  return result;
}
