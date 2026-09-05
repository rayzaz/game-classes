/*
  v42.7.2 — helpers для создания персонажа из любого технического шаблона.

  ВАЖНО: этот файл добавляет helper-функции. После вставки всё равно нужно
  сделать 4 маленьких изменения внутри createCandidateFromPreparedPlan,
  перечисленных в GOOGLE_APPS_SCRIPT_DONORLESS_v42.7.2.md.
*/

function classFormulaColumnForCreate_(prepared) {
  const fromPlan = cleanText(
    prepared && prepared.plan && prepared.plan.classFormulaProfile &&
    prepared.plan.classFormulaProfile.column
  ).toUpperCase();

  if (/^[E-W]$/.test(fromPlan)) return fromPlan;

  const fallback = {
    tank: 'E', assassin: 'F', alchemist: 'G', bruiser: 'H', debuffer: 'I',
    healer_buffer: 'J', summoner_dps: 'K', summoner_sup: 'L',
    summoner_multi: 'M', buffer: 'N', support_x3: 'O',
    support_x3_alchemist: 'P', buffer_alchemist: 'Q',
    debuffer_alchemist: 'R', dps: 'S', healer: 'T',
    healer_debuffer: 'U', healer_alchemist: 'V', buffer_debuffer: 'W',
  };

  const column = fallback[prepared && prepared.targetClass];
  if (!column) {
    throw new Error('Для выбранного класса не определена колонка формул на листе «Классы».');
  }
  return column;
}

function validationOptionsSafeForCreate_(range) {
  try {
    const rule = range.getDataValidation();
    if (!rule) return [];
    const type = rule.getCriteriaType();
    const args = rule.getCriteriaValues();
    let values = [];

    if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
      values = Array.isArray(args[0]) ? args[0] : [];
    } else if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
      const sourceRange = args[0];
      if (sourceRange && typeof sourceRange.getDisplayValues === 'function') {
        values = sourceRange.getDisplayValues().reduce(function(result, row) {
          return result.concat(row);
        }, []);
      }
    }

    const seen = {};
    return values.map(cleanText).filter(function(value) {
      const key = normalizeText(value);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  } catch (_) {
    return [];
  }
}

function setValuePreservingValidationForCreate_(cell, value) {
  const rule = cell.getDataValidation();
  try {
    cell.setValue(value);
    return;
  } catch (error) {
    if (!rule) throw error;
  }
  cell.clearDataValidations();
  cell.setValue(value);
  cell.setDataValidation(rule);
}

function leadingClassSymbolForCreate_(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  for (let index = 0; index < raw.length; index++) {
    if (/[A-Za-zА-Яа-яЁё0-9]/.test(raw.charAt(index))) {
      return raw.slice(0, index).replace(/\s+/g, '').trim();
    }
  }
  return '';
}

function applyTargetClassForCreate_(systemSpreadsheet, characterSheet, techSheet, prepared) {
  const classColumn = classFormulaColumnForCreate_(prepared);
  const classSheet = requireSheet(systemSpreadsheet, 'Классы', 'системной таблице');
  const sourceClassLabel = cleanText(classSheet.getRange(classColumn + '1').getDisplayValue());

  if (classIdentityForCreate(sourceClassLabel) !== prepared.targetClass) {
    throw new Error(
      `Колонка ${classColumn} листа «Классы» относится к «${sourceClassLabel}», ` +
      `а анкета требует класс ${prepared.targetClass}.`
    );
  }

  const classCell = characterSheet.getRange('E38');
  const classOptions = validationOptionsSafeForCreate_(classCell);
  const optionForTarget = classOptions.find(function(value) {
    return classIdentityForCreate(value) === prepared.targetClass;
  }) || '';

  const payloadClassName = cleanText(prepared.combat.className || prepared.combat.classKey);
  const personalClassLabel = optionForTarget || payloadClassName || sourceClassLabel;
  if (!personalClassLabel) throw new Error('Не удалось получить отображаемое название выбранного класса.');

  setValuePreservingValidationForCreate_(classCell, personalClassLabel);

  const sourceRange = classSheet.getRange(classColumn + '3:' + classColumn + '15');
  const sourceValues = sourceRange.getValues();
  const sourceFormulas = sourceRange.getFormulas();
  const targetRange = techSheet.getRange('E3:E15');

  for (let index = 0; index < 13; index++) {
    const targetCell = targetRange.getCell(index + 1, 1);
    const formula = cleanText(sourceFormulas[index] && sourceFormulas[index][0]);
    if (formula) targetCell.setFormula(formula);
    else targetCell.setValue(sourceValues[index][0]);
  }

  SpreadsheetApp.flush();

  const liveClassLabel = cleanText(classCell.getDisplayValue());
  if (classIdentityForCreate(liveClassLabel) !== prepared.targetClass) {
    throw new Error(
      `Класс новой личной таблицы не применился. Получено «${liveClassLabel}», ` +
      `ожидался ${prepared.targetClass}.`
    );
  }

  const writtenFormulas = targetRange.getFormulas();
  for (let index = 0; index < 13; index++) {
    const expected = cleanText(sourceFormulas[index] && sourceFormulas[index][0]);
    const actual = cleanText(writtenFormulas[index] && writtenFormulas[index][0]);
    if (expected && !actual) {
      throw new Error(`Не записалась формула класса в ТЕХ!E${index + 3}.`);
    }
  }

  return {
    classColumn,
    sourceClassLabel,
    personalClassLabel: liveClassLabel,
    mainClassSymbol:
      leadingClassSymbolForCreate_(optionForTarget) ||
      leadingClassSymbolForCreate_(sourceClassLabel),
    sourceRange: `Классы!${classColumn}3:${classColumn}15`,
    targetRange: 'ТЕХ!E3:E15',
  };
}
