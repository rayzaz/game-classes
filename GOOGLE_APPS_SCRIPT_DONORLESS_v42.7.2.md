# Google Apps Script v42.7.2 — класс больше НЕ зависит от донора

Это патч именно для кода `CHARACTER_SERVICE_URL`, который был прислан в чат.

После него существующий персонаж используется **только как технический каркас файла**. Его класс вообще не проверяется и не наследуется.

Алгоритм создания становится таким:

1. взять любой рабочий Spreadsheet как каркас;
2. сделать копию;
3. определить целевой класс по анкете;
4. записать этот класс в `Лист персонажа!E38`;
5. взять формулы класса из `[🕸] Черный клевер СИСТЕМА → Классы`, нужная колонка `E:W`, строки `3:15`;
6. записать их в `ТЕХ!E3:E15` новой личной таблицы;
7. только затем создать блоки в `Основная → Маги` и `Система → Маги`.

## 1. Добавить эти функции ПЕРЕД `createCandidateFromPreparedPlan`

```javascript
function classFormulaColumnForCreate_(prepared) {
  const fromPlan =
    cleanText(
      prepared &&
      prepared.plan &&
      prepared.plan.classFormulaProfile &&
      prepared.plan.classFormulaProfile.column
    ).toUpperCase();

  if (/^[E-W]$/.test(fromPlan)) {
    return fromPlan;
  }

  const fallback = {
    tank: 'E',
    assassin: 'F',
    alchemist: 'G',
    bruiser: 'H',
    debuffer: 'I',
    healer_buffer: 'J',
    summoner_dps: 'K',
    summoner_sup: 'L',
    summoner_multi: 'M',
    buffer: 'N',
    support_x3: 'O',
    support_x3_alchemist: 'P',
    buffer_alchemist: 'Q',
    debuffer_alchemist: 'R',
    dps: 'S',
    healer: 'T',
    healer_debuffer: 'U',
    healer_alchemist: 'V',
    buffer_debuffer: 'W',
  };

  const column = fallback[
    prepared && prepared.targetClass
  ];

  if (!column) {
    throw new Error(
      'Для выбранного класса не определена колонка формул на листе «Классы».'
    );
  }

  return column;
}


function validationOptionsSafeForCreate_(range) {
  try {
    const rule = range.getDataValidation();

    if (!rule) {
      return [];
    }

    const type = rule.getCriteriaType();
    const args = rule.getCriteriaValues();
    let values = [];

    if (
      type ===
      SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST
    ) {
      values = Array.isArray(args[0])
        ? args[0]
        : [];

    } else if (
      type ===
      SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE
    ) {
      const sourceRange = args[0];

      if (
        sourceRange &&
        typeof sourceRange.getDisplayValues === 'function'
      ) {
        values = sourceRange
          .getDisplayValues()
          .reduce(function(result, row) {
            return result.concat(row);
          }, []);
      }
    }

    const seen = {};

    return values
      .map(function(value) {
        return cleanText(value);
      })
      .filter(function(value) {
        const key = normalizeText(value);

        if (!key || seen[key]) {
          return false;
        }

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
    if (!rule) {
      throw error;
    }
  }

  // Если старый шаблон имеет строгий dropdown, временно снимаем
  // проверку, записываем новый класс и возвращаем правило обратно.
  cell.clearDataValidations();
  cell.setValue(value);
  cell.setDataValidation(rule);
}


function leadingClassSymbolForCreate_(value) {
  const raw = cleanText(value);

  if (!raw) {
    return '';
  }

  for (
    let index = 0;
    index < raw.length;
    index++
  ) {
    const char = raw.charAt(index);

    if (/[A-Za-zА-Яа-яЁё0-9]/.test(char)) {
      return raw
        .slice(0, index)
        .replace(/\s+/g, '')
        .trim();
    }
  }

  return '';
}


function applyTargetClassForCreate_(
  systemSpreadsheet,
  characterSheet,
  techSheet,
  prepared
) {
  const classColumn =
    classFormulaColumnForCreate_(
      prepared
    );

  const classSheet =
    requireSheet(
      systemSpreadsheet,
      'Классы',
      'системной таблице'
    );

  const sourceClassLabel =
    cleanText(
      classSheet
        .getRange(
          classColumn + '1'
        )
        .getDisplayValue()
    );

  const sourceClassIdentity =
    classIdentityForCreate(
      sourceClassLabel
    );

  if (
    sourceClassIdentity !==
    prepared.targetClass
  ) {
    throw new Error(
      `Колонка ${classColumn} листа «Классы» относится к «${sourceClassLabel}», ` +
      `а анкета требует класс ${prepared.targetClass}.`
    );
  }

  // ----- 1. Название класса в личной таблице -----
  const classCell =
    characterSheet.getRange('E38');

  const classOptions =
    validationOptionsSafeForCreate_(
      classCell
    );

  const optionForTarget =
    classOptions.find(
      function(value) {
        return (
          classIdentityForCreate(value) ===
          prepared.targetClass
        );
      }
    ) || '';

  const payloadClassName =
    cleanText(
      prepared.combat.className ||
      prepared.combat.classKey
    );

  // Если в старом шаблоне уже есть dropdown со всеми классами —
  // используем его точное значение (включая старый/нужный emoji).
  // Если dropdown старый и нового класса там нет — всё равно
  // записываем имя класса из анкеты, не блокируя создание.
  const personalClassLabel =
    optionForTarget ||
    payloadClassName ||
    sourceClassLabel;

  if (!personalClassLabel) {
    throw new Error(
      'Не удалось получить отображаемое название выбранного класса.'
    );
  }

  setValuePreservingValidationForCreate_(
    classCell,
    personalClassLabel
  );

  // ----- 2. Формулы класса -----
  // Центральный каталог:
  //   Классы!E3:W15
  // Новая личная таблица:
  //   ТЕХ!E3:E15
  const sourceRange =
    classSheet.getRange(
      classColumn + '3:' +
      classColumn + '15'
    );

  const sourceValues =
    sourceRange.getValues();

  const sourceFormulas =
    sourceRange.getFormulas();

  const targetRange =
    techSheet.getRange(
      'E3:E15'
    );

  for (
    let index = 0;
    index < 13;
    index++
  ) {
    const targetCell =
      targetRange.getCell(
        index + 1,
        1
      );

    const formula =
      cleanText(
        sourceFormulas[index] &&
        sourceFormulas[index][0]
      );

    if (formula) {
      targetCell.setFormula(
        formula
      );
    } else {
      targetCell.setValue(
        sourceValues[index][0]
      );
    }
  }

  SpreadsheetApp.flush();

  // ----- 3. Контроль -----
  const liveClassLabel =
    cleanText(
      classCell.getDisplayValue()
    );

  if (
    classIdentityForCreate(
      liveClassLabel
    ) !==
    prepared.targetClass
  ) {
    throw new Error(
      `Класс новой личной таблицы не применился. ` +
      `Получено «${liveClassLabel}», ожидался ${prepared.targetClass}.`
    );
  }

  const writtenFormulas =
    targetRange.getFormulas();

  for (
    let index = 0;
    index < 13;
    index++
  ) {
    const expectedFormula =
      cleanText(
        sourceFormulas[index] &&
        sourceFormulas[index][0]
      );

    if (
      expectedFormula &&
      !cleanText(
        writtenFormulas[index] &&
        writtenFormulas[index][0]
      )
    ) {
      throw new Error(
        `Не записалась формула класса в ТЕХ!E${index + 3}.`
      );
    }
  }

  const mainClassSymbol =
    leadingClassSymbolForCreate_(
      optionForTarget
    ) ||
    leadingClassSymbolForCreate_(
      sourceClassLabel
    );

  return {
    classColumn,
    sourceClassLabel,
    personalClassLabel:
      liveClassLabel,
    mainClassSymbol,
    sourceRange:
      `Классы!${classColumn}3:${classColumn}15`,
    targetRange:
      'ТЕХ!E3:E15',
  };
}
```

## 2. В `createCandidateFromPreparedPlan` УДАЛИТЬ проверку класса донора

Найти этот существующий кусок:

```javascript
const donorClassName =
  cleanText(
    donorCharacterSheet
      .getRange(
        'E38'
      )
      .getDisplayValue()
  );

if (
  classIdentityForCreate(
    donorClassName
  ) !==
  prepared.targetClass
) {
  throw new Error(
    `Класс донора изменился: «${donorClassName}» не совпадает с классом анкеты.`
  );
}
```

**Удалить его полностью.**

Класс технического шаблона после v42.7.2 вообще не участвует в решении, можно ли создавать персонажа.

## 3. УДАЛИТЬ чтение `donorClassSymbol`

Найти:

```javascript
const donorClassSymbol =
  cleanText(
    mainCharactersSheet
      .getRange(
        donorMainRow + 1,
        21
      )
      .getDisplayValue()
  );
```

Удалить этот блок. Символ класса тоже больше не наследуется от технического шаблона.

## 4. После открытия НОВОЙ личной таблицы применить класс и формулы

Внутри `createCandidateFromPreparedPlan` уже есть:

```javascript
const techSheet =
  requireSheet(
    personalSpreadsheet,
    PERSONAL_TECH_SHEET_NAME,
    'новой личной таблице'
  );
```

**Сразу после него добавить:**

```javascript
const appliedClass =
  applyTargetClassForCreate_(
    systemSpreadsheet,
    characterSheet,
    techSheet,
    prepared
  );
```

Это важнейшая строка патча. Она перезаписывает классовые формулы технического шаблона формулами выбранного класса.

## 5. В Основной таблице не писать символ донора

Найти существующий код:

```javascript
mainCharactersSheet
  .getRange(
    prepared.mainStartRow + 1,
    21
  )
  .setValue(
    donorClassSymbol
  );
```

Заменить на:

```javascript
const targetMainClassCell =
  mainCharactersSheet
    .getRange(
      prepared.mainStartRow + 1,
      21
    );

if (appliedClass.mainClassSymbol) {
  setValuePreservingValidationForCreate_(
    targetMainClassCell,
    appliedClass.mainClassSymbol
  );
} else {
  // Редкий fallback: если в названии класса нет emoji,
  // пишем человекочитаемое название. Создание не блокируем.
  setValuePreservingValidationForCreate_(
    targetMainClassCell,
    appliedClass.personalClassLabel
  );
}
```

## 6. Результат

После этих пяти изменений вот эта ситуация больше НЕ должна останавливать создание:

- технический шаблон: `👊 Домагер`;
- новая анкета: `Призыватель (ДД)`.

Writer сделает копию таблицы Домагера, но сразу после копирования:

- заменит `Лист персонажа!E38` на Призывателя;
- заменит `ТЕХ!E3:E15` на формулы из `Классы!K3:K15`;
- в Основной поставит символ Призывателя;
- системный блок продолжит работать через `IMPORTRANGE` новой личной таблицы.

То есть класс донора больше ни на что не влияет.

## 7. Публикация Apps Script

После сохранения кода:

**Deploy → Manage deployments → Edit → New version → Deploy**

URL `CHARACTER_SERVICE_URL` менять не нужно, если обновляется существующий deployment.
