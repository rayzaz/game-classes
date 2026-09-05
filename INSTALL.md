# Установка v42.7.2 — создание анкеты без донора того же класса

## Важно

Исправление состоит из **двух частей**:

1. GitHub-проект сайта — его можно просто распаковать поверх `C:\game-classes` и отправить в GitHub.
2. Google Apps Script — он публикуется отдельно и **не обновляется через GitHub**.

Если обновить только GitHub, старый Apps Script продолжит выдавать ошибку:

`Класс донора ... не совпадает с классом анкеты.`

---

# Часть 1. GitHub-проект

## 1. Распаковать архив поверх проекта

Положи `game-classes-donorless-v42.7.2.zip` в папку `Загрузки`, затем PowerShell:

```powershell
Expand-Archive `
  "$HOME\Downloads\game-classes-donorless-v42.7.2.zip" `
  -DestinationPath "C:\game-classes" `
  -Force

cd C:\game-classes
```

Архив собран без внешней папки `game-classes`, поэтому не появится
`C:\game-classes\game-classes`.

## 2. Проверить сборку

```powershell
npm ci
npx tsc --noEmit
npm run build
```

## 3. Отправить в GitHub

```powershell
git status
git add .
git commit -m "Allow character creation from any class template"
git push origin main
```

Если Netlify уже связан с GitHub, после `git push origin main` он сам запустит публикацию.

**`netlify deploy --prod` не нужен.**

---

# Часть 2. Google Apps Script

Открой тот Apps Script, URL которого записан в `CHARACTER_SERVICE_URL`.

Для присланного тобой кода подготовлен точный патч:

`GOOGLE_APPS_SCRIPT_DONORLESS_v42.7.2.md`

И отдельно helper-функции, чтобы их можно было скопировать одним куском:

`GOOGLE_APPS_SCRIPT_DONORLESS_HELPERS_v42.7.2.gs`

## Что сделать

1. Вставить функции из `GOOGLE_APPS_SCRIPT_DONORLESS_HELPERS_v42.7.2.gs` в Apps Script.
2. В `createCandidateFromPreparedPlan` удалить проверку совпадения класса донора с классом анкеты.
3. Там же удалить наследование `donorClassSymbol`.
4. Сразу после открытия `characterSheet` и `techSheet` новой копии вызвать `applyTargetClassForCreate_(...)` — точная строка есть в инструкции.
5. В основной таблице записывать `appliedClass.mainClassSymbol`, а не `donorClassSymbol`.
6. Сохранить код.
7. Обновить Web App: **Deploy → Manage deployments → Edit → New version → Deploy**.

Если обновляешь существующий deployment, `CHARACTER_SERVICE_URL` менять не надо.

---

# Что теперь происходит при создании

Например:

- технический шаблон — Домагер;
- новая анкета — Призыватель (ДД).

Это теперь нормально.

Apps Script:

- копирует таблицу Домагера только как каркас;
- пишет новый класс в `Лист персонажа!E38`;
- берёт формулы Призывателя из `СИСТЕМА → Классы!K3:K15`;
- записывает их в `ТЕХ!E3:E15` новой личной таблицы;
- создаёт обычные блоки Основной и Системы.

Класс технического шаблона больше не является условием создания.

---

# Проверка

После обеих публикаций создай анкету класса, которого нет среди существующих персонажей.

Правильный результат:

- экран подготовки показывает универсальный технический шаблон;
- кнопка создания не требует персонажа того же класса;
- Google Apps Script не выдаёт ошибку про несовпадение классов;
- в новой таблице `Лист персонажа!E38` стоит класс из анкеты;
- `ТЕХ!E3:E15` содержит формулы нужной колонки листа `Классы`;
- персонаж появляется в `Основная → Маги`, `Система → Маги` и `САЙТ`.
