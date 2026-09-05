# Установка v42.7.1 — анкеты без донора того же класса

## Что можно просто распаковать

Весь архив проекта можно **распаковать прямо поверх существующей папки `C:\game-classes`** с заменой файлов.

В архиве **нет `node_modules` и нет Google Apps Script-кода**, поэтому локальные зависимости и опубликованный Google Script не затрутся.

### PowerShell

1. Положить архив `game-classes-donorless-v42.7.1.zip` в `Загрузки`.
2. Открыть PowerShell.
3. Выполнить:

```powershell
Expand-Archive `
  "$HOME\Downloads\game-classes-donorless-v42.7.1.zip" `
  -DestinationPath "C:\game-classes" `
  -Force

cd C:\game-classes
npm ci
npx tsc --noEmit
npm run build
```

Если `npx tsc --noEmit` и `npm run build` завершились без ошибок — проектная часть установлена.

> Архив специально собран БЕЗ внешней папки `game-classes`, поэтому после распаковки не появится `C:\game-classes\game-classes`.

## Публикация на Netlify

Если проект уже привязан к Netlify CLI, из `C:\game-classes`:

```powershell
netlify deploy --prod
```

Netlify сам использует настройки из `netlify.toml`:

- build: `npm ci && npm run build`
- publish: `dist`
- functions: `netlify/functions`

Если публикация у тебя идёт через Git/Netlify автоматически, достаточно обычного commit + push вместо команды выше.

---

# Отдельно: Google Apps Script

**Google Apps Script НЕ устанавливается распаковкой архива.**

Проект сайта теперь умеет отправлять создание персонажа без донора того же класса, но опубликованный Google writer тоже должен перестать требовать совпадение класса шаблона.

Инструкция и код изменений лежат в файле:

`GOOGLE_APPS_SCRIPT_CLASS_TEMPLATE_PATCH.md`

Что нужно сделать в Google Apps Script:

1. Открыть проект Apps Script, URL которого используется в `CHARACTER_SERVICE_URL`.
2. Найти функцию создания персонажа — в текущем контракте это `createCandidateFromPreparedPlan` или функция с той же ролью.
3. Убрать проверку вида «класс донора/шаблона должен совпадать с классом нового персонажа».
4. После копирования технического Spreadsheet записывать выбранный класс в `Лист персонажа!E38`.
5. Классовые формулы брать из центрального листа `Классы` по `plan.classFormulaProfile.column` (`E:W`), а НЕ оставлять формулы технического шаблона.
6. Сохранить Apps Script.
7. Обновить Web App deployment: **Deploy → Manage deployments → Edit → New version → Deploy**.
8. URL Web App менять не нужно, если обновляется существующий deployment.

## Проверка после установки

Лучший тест — создать анкету класса, которого сейчас нет ни у одного персонажа.

Ожидаемое поведение:

- подготовка анкеты не требует донора этого класса;
- сервер выбирает любой рабочий Spreadsheet как технический шаблон;
- новая таблица получает правильный класс в `Лист персонажа!E38`;
- формулы берутся из соответствующей колонки листа `Классы`;
- существующие классы продолжают работать как раньше.

## Если появляется ошибка про несовпадение класса донора

Это означает, что сайт уже обновлён, а Google Apps Script всё ещё опубликован в старой версии. Нужно применить `GOOGLE_APPS_SCRIPT_CLASS_TEMPLATE_PATCH.md` и сделать новую версию deployment.
