# Google Apps Script: создание персонажа без донора того же класса

## Что изменено в проекте

Netlify-часть теперь считает существующего персонажа **только техническим шаблоном Spreadsheet**.
Класс берётся из анкеты и из центрального каталога формул `[🕸] Черный клевер СИСТЕМА → Классы`.

План создания версии 3 передаёт:

- `plan.templateMode`: `same-class` или `generic`;
- `plan.targetClassId`: канонический id класса;
- `plan.classFormulaProfile.sheet`: `Классы`;
- `plan.classFormulaProfile.column`: колонка формул класса (`E`–`W`);
- `plan.classFormulaProfile.number`: номер класса (`1`–`19`);
- `plan.classFormulaProfile.personalClassCell`: `Лист персонажа!E38`;
- legacy-поле `plan.donorCharacterId` остаётся, но теперь означает **id технического шаблона**, а не источник класса.

## Почему нужен маленький патч Apps Script

Исходник опубликованного Apps Script в архиве проекта отсутствует. В текущем writer, судя по контракту проекта,
`createCandidateFromPreparedPlan` повторно сверяет класс шаблона через `E38`. Эту проверку надо заменить:
класс шаблона больше не обязан совпадать с классом анкеты.

## Патч логики `createCandidateFromPreparedPlan`

### 1. Не блокировать копирование из-за класса шаблона

Оставить проверки, что технический Spreadsheet существует и содержит необходимые листы:

```javascript
const templateBook = SpreadsheetApp.openById(templateSpreadsheetId);
const templateCharacterSheet = templateBook.getSheetByName('Лист персонажа');
const templateTechSheet = templateBook.getSheetByName('ТЕХ');

if (!templateCharacterSheet || !templateTechSheet) {
  throw new Error('Технический шаблон повреждён: нет «Лист персонажа» или «ТЕХ».');
}
```

Удалить/не выполнять блок вида:

```javascript
// БОЛЬШЕ НЕ НУЖНО:
if (templateClass !== targetClass) {
  throw new Error('Класс донора не совпадает ...');
}
```

### 2. После `makeCopy` назначить класс новой таблице

Сразу после создания копии шаблона и до финальной проверки формул выполнить:

```javascript
function applyTargetClassFromPlan_(newSpreadsheet, plan) {
  const payload = plan && plan.payload ? plan.payload : {};
  const combat = payload && payload.combat ? payload.combat : {};

  // В таблицу пишем отображаемое русское имя класса.
  const targetClassName = String(
    combat.className || combat.classKey || ''
  ).trim();

  if (!targetClassName) {
    throw new Error('В плане создания отсутствует класс персонажа.');
  }

  const characterSheet = newSpreadsheet.getSheetByName('Лист персонажа');
  if (!characterSheet) {
    throw new Error('В новой таблице нет листа «Лист персонажа».');
  }

  const classA1 =
    plan && plan.classFormulaProfile && plan.classFormulaProfile.personalClassCell
      ? String(plan.classFormulaProfile.personalClassCell).split('!').pop()
      : 'E38';

  characterSheet.getRange(classA1).setValue(targetClassName);
  SpreadsheetApp.flush();

  const actualClass = String(
    characterSheet.getRange(classA1).getDisplayValue() || ''
  ).trim();

  if (!actualClass) {
    throw new Error(`Не удалось назначить класс «${targetClassName}» в ${classA1}.`);
  }
}
```

В основном создании:

```javascript
const newSpreadsheet = SpreadsheetApp.openById(createdSpreadsheetId);
applyTargetClassFromPlan_(newSpreadsheet, plan);
```

### 3. Формулы класса тоже брать по `plan.classFormulaProfile`, а не из класса шаблона

Это обязательный пункт, если в личной таблице формулы класса записаны непосредственно в ячейки. Одной замены `E38` тогда недостаточно.

В загруженной таблице `[🕸] Черный клевер СИСТЕМА` источник действительно централизован: лист `Классы`, классы находятся в колонках `E:W`; формулы базовых параметров находятся в строках `3:15`, а их текстовые варианты — в блоке `74:86`. Выбранная колонка уже приходит в `plan.classFormulaProfile.column`.

То есть старая логика вида «скопировать классовые формулы из личной таблицы донора» должна стать логикой вида:

```javascript
const classColumn = String(plan.classFormulaProfile?.column || '').trim();
if (!/^[E-W]$/.test(classColumn)) {
  throw new Error('Не определена колонка формул выбранного класса.');
}

// Дальше используйте ТУ ЖЕ существующую карту целевых ячеек,
// которой writer уже заполняет формулы персонажа, но источником
// делайте колонку classColumn центрального листа «Классы».
// Не используйте формулы, оставшиеся в copied template.
```

Точную карту целевых ячеек личного Spreadsheet из этого архива восстановить нельзя: исходника Apps Script и самой личной таблицы-шаблона в загрузке нет. Поэтому этот участок надо встроить в существующую процедуру writer, которая сейчас работает с классовыми формулами.

### 4. Финальную проверку делать по НОВОЙ таблице, а не по шаблону

Если writer проверяет `E38`, проверять `E38` уже созданного Spreadsheet:

```javascript
const targetClassName = String(plan.payload?.combat?.className || '').trim();
const createdClassName = String(
  newSpreadsheet
    .getSheetByName('Лист персонажа')
    .getRange('E38')
    .getDisplayValue() || ''
).trim();

if (targetClassName && createdClassName !== targetClassName) {
  throw new Error(
    `Класс новой таблицы не применился: ожидалось «${targetClassName}», получено «${createdClassName}».`
  );
}
```

## Центральные формулы классов, проверенные по загруженной СИСТЕМЕ

| classId | № | колонка `Классы` |
|---|---:|---|
| `tank` | 1 | E |
| `assassin` | 2 | F |
| `alchemist` | 3 | G |
| `bruiser` | 4 | H |
| `debuffer` | 5 | I |
| `healer_buffer` | 6 | J |
| `summoner_dps` | 7 | K |
| `summoner_sup` | 8 | L |
| `summoner_multi` | 9 | M |
| `buffer` | 10 | N |
| `support_x3` | 11 | O |
| `support_x3_alchemist` | 12 | P |
| `buffer_alchemist` | 13 | Q |
| `debuffer_alchemist` | 14 | R |
| `dps` | 15 | S |
| `healer` | 16 | T |
| `healer_debuffer` | 17 | U |
| `healer_alchemist` | 18 | V |
| `buffer_debuffer` | 19 | W |

Старый сценарий не ломается: если активный персонаж нужного класса существует, сервер предпочитает его как шаблон.
Если такого персонажа ещё нет, используется любой рабочий технический шаблон, но `E38` новой таблицы назначается из анкеты.
