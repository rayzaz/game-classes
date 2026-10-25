/* ============================================================
   GOS MAG — ADMIN SPELL CRUD V2
   Admin-only path via Netlify admin-spells, CHARACTER_WRITE_SECRET required.
   No price/points touched. Existing purchase and player flows unchanged.
   On delete, clear exact slot, NEVER shift slots or rewrite formulas.
   ============================================================ */
function gosmagManageSpellAdminV2_(operationValue, characterIdValue, spellIndexValue, rawSpell, expected) {
  const operation = cleanText(operationValue).toLowerCase();
  if (['create', 'update', 'delete'].indexOf(operation) === -1) {
    throw new Error('Недопустимое действие администратора с заклинанием');
  }
  const characterId = normalizeCharacterId(characterIdValue);
  if (!characterId) throw new Error('Не указан персонаж');
  const expectedRecord = asObjectForCreate(expected);
  let checked = null;
  if (operation !== 'delete') {
    checked = validateCanonicalSpell_(rawSpell);
    if (checked.issues.length) {
      throw new Error(checked.issues.map(function (item) { return item.message; }).join(' '));
    }
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Google занят записью, повторите попытку');
  try {
    const main = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);
    const entry = findRegistryEntry(main, characterId);
    if (!entry || !entry.spreadsheetId) throw new Error('Персонаж не найден или не подключён');
    const personal = SpreadsheetApp.openById(entry.spreadsheetId);
    const sheet = requireSheet(personal, PERSONAL_CHARACTER_SHEET_NAME, 'личной таблице');
    const slots = getPersonalSpellSlots_(sheet);
    const slotIndex = Number(spellIndexValue);
    let target = null;
    if (operation === 'create') {
      target = slots.find(function (slot) {
        return slot.descriptionRange && !slot.name && !slot.rawDescription &&
          !slot.nameRange.getCell(1, 1).getFormula() &&
          !slot.descriptionRange.getCell(1, 1).getFormula();
      });
      if (!target) throw new Error('В гримуаре нет свободных слотов. Ничего не изменено.');
    } else {
      if (!Number.isSafeInteger(slotIndex) || slotIndex < 1) throw new Error('Некорректный номер слота');
      target = slots.find(function (slot) { return slot.index === slotIndex; });
      if (!target || !target.descriptionRange || !target.name) throw new Error('Заклинание отсутствует в выбранном слоте');
      if (typeof expectedRecord.name !== 'string' || typeof expectedRecord.rawDescription !== 'string') {
        throw new Error('Перед изменением требуется актуальный снимок заклинания');
      }
      if (String(target.name) !== String(expectedRecord.name) ||
          String(target.rawDescription).replace(/\r/g, '').trim() !==
            String(expectedRecord.rawDescription).replace(/\r/g, '').trim()) {
        throw new Error('Заклинание уже изменилось. Обновите гримуар и повторите действие.');
      }
    }
    const nameCell = target.nameRange.getCell(1, 1);
    const descriptionCell = target.descriptionRange.getCell(1, 1);
    if (nameCell.getFormula() || descriptionCell.getFormula()) {
      throw new Error('Выбранный слот содержит формулу. Запись запрещена.');
    }
    const originalName = nameCell.getValue();
    const originalDescription = descriptionCell.getValue();
    let nextDescription = '';
    try {
      if (operation === 'delete') {
        nameCell.clearContent();
        descriptionCell.clearContent();
      } else {
        nextDescription = buildSpellDescriptionForCreate(checked.spell);
        nameCell.setValue(checked.spell.name);
        descriptionCell.setValue(nextDescription);
      }
      SpreadsheetApp.flush();
      const resultName = String(nameCell.getDisplayValue() || '').trim();
      const resultDescription = String(descriptionCell.getDisplayValue() || '').replace(/\r/g, '').trim();
      if (operation === 'delete') {
        if (resultName || resultDescription) throw new Error('Google не подтвердил очистку слота');
      } else if (resultName !== checked.spell.name || resultDescription !== nextDescription.replace(/\r/g, '').trim()) {
        throw new Error('Google не подтвердил сохранение заклинания');
      }
    } catch (writeError) {
      nameCell.setValue(originalName);
      descriptionCell.setValue(originalDescription);
      SpreadsheetApp.flush();
      throw writeError;
    }
    return {
      ok: true, operation: operation, characterId: characterId,
      spellIndex: target.index,
      spell: operation === 'delete' ? null : {
        slotIndex: target.index,
        ...parseStoredSpell_(checked.spell.name, nextDescription)
      }
    };
  } finally {
    lock.releaseLock();
  }
}
