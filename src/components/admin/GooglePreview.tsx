import React, { useEffect, useMemo, useState } from 'react';

import CLASSES from '../../data/merged';

import {
  buildQuestionnaireTransfer,
  validateQuestionnaireTransfer,
  type QuestionnaireTransferPayload,
} from '../questionnaire/questionnaireTransfer';


type Props = {
  data: Record<string, unknown>;
  questionnaireId: string;
  questionnaireKey: string;
  questionnaireStatus: string;
};




type GoogleReadCheckResult = {
  ok: boolean;
  mode?: string;
  serviceConfigured?: boolean;
  checkedAt?: string;
  writesPerformed?: number;
  registry?: {
    ok?: boolean;
    count?: number;
    responseMs?: number;
    elapsedMs?: number;
    sample?: Array<{
      characterId?: string;
      name?: string;
      className?: string;
      squad?: string;
      active?: boolean;
    }>;
    characters?: Array<{
      characterId?: string;
      id?: string;
      name?: string;
      className?: string;
      squad?: string;
      active?: boolean;
    }>;
  };
  layout?: Record<string, any>;
  detailProbe?: {
    ok?: boolean;
    characterId?: string;
    name?: string;
    responseMs?: number;
    fields?: string[];
    error?: string;
    skipped?: boolean;
  } | null;
  error?: string;
};





type GooglePrepareResult = {
  ok: boolean;
  prepared?: boolean;
  writesPerformed?: number;
  checkedAt?: string;
  questionnaire?: {
    id?: string;
    key?: string;
    status?: string;
    name?: string;
  };
  donor?: {
    characterId?: string;
    name?: string;
    className?: string;
    classSkillsCount?: number;
  };
  proposed?: {
    characterId?: string;
    active?: boolean;
    theme?: string;
  };
  lifecycle?: {
    status?: string;
    examRequired?: boolean;
  };
  targets?: {
    main?: {
      block?: string;
      startRow?: number | null;
      endRow?: number | null;
      cells?: Record<string, string>;
    };
    system?: {
      block?: string;
      startRow?: number | null;
      endRow?: number | null;
      cells?: Record<string, string>;
    };
    registry?: {
      row?: number | null;
      range?: string;
      cells?: Record<string, string>;
    };
  };
  timings?: {
    registryMs?: number;
    layoutMs?: number;
    donorMs?: number;
  };
  checks?: Array<{
    id: string;
    label: string;
    ok: boolean;
    message: string;
  }>;
  blockers?: string[];
  fingerprint?: string;
  error?: string;
};

type GoogleCreateResult = {
  ok: boolean;
  created?: {
    characterId?: string;
    name?: string;
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    mainRows?: {
      start?: number;
      end?: number;
    };
    systemRows?: {
      start?: number;
      end?: number;
    };
    registryRow?: number;
  };
  verification?: {
    ok?: boolean;
    registry?: boolean;
    cabinet?: boolean;
    message?: string;
  };
  warnings?: string[];
  questionnaireUpdated?: boolean;
  error?: string;
};


type GoogleCreateStartResult = {
  ok: boolean;
  jobId?: string;
  status?: string;
  message?: string;
  error?: string;
};


type GoogleCreateJobStatusResult = {
  ok: boolean;
  job?: {
    fingerprint?: string;
    status?: 'queued' | 'running' | 'success' | 'error' | string;
    error?: string;
    result?: GoogleCreateResult;
    queuedAt?: string;
    startedAt?: string;
    finishedAt?: string;
    updatedAt?: string;
  };
  error?: string;
};


type CharacterLifecycleResult = {
  ok: boolean;
  candidateCreated?: boolean;
  characterCreation?: {
    status?: string;
    lifecycleStatus?: string;
    createdAt?: string;
    characterId?: string;
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    mainRows?: { start?: number; end?: number } | null;
    systemRows?: { start?: number; end?: number } | null;
    registryRow?: number | null;
  } | null;
  exam?: {
    status?: string;
    passed?: boolean;
    passedAt?: string;
    squad?: string;
    rank?: string;
    housing?: string;
    upgradePoints?: number;
    pchk?: {
      protection?: number;
      senses?: number;
      control?: number;
    };
    startingMoney?: number;
  } | null;
  google?: {
    examPassed?: boolean;
    current?: {
      squad?: string;
      rank?: string;
      housing?: string;
    };
    options?: {
      squads?: string[];
      housing?: string[];
      startingRank?: string;
    };
  } | null;
  optionsError?: string;
  error?: string;
};


type DonorRegistryCharacter = {
  characterId: string;
  name: string;
  className: string;
  squad: string;
  active: boolean;
};

type DonorCheckItem = {
  characterId: string;
  name: string;
  registryClassName: string;
  detailClassName: string;
  canonicalClassId: string;
  canonicalClassName: string;
  detailOk: boolean;
  classSkillsCount: number;
  spellsCount: number;
  error: string;
};

type DonorAuditResult = {
  checked: number;
  totalCharacters: number;
  items: DonorCheckItem[];
};

function normalizeClassName(value: unknown) {
  let text = String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/саппорт/g, 'сапорт')
    .replace(/сапорт\s*[xх×]\s*3/g, 'сапорт3')
    .replace(/[^a-zа-я0-9]+/gi, '');

  // На случай уже склеенного "сапортх3" после нестандартной строки.
  text = text
    .replace(/сапорт[хx]3/g, 'сапорт3');

  return text;
}

const DONOR_CLASSES = (CLASSES as Array<any>)
  .filter((item) => !item?.placeholder && String(item?.id || '') !== 'placeholder')
  .map((item) => ({
    id: String(item.id || '').trim(),
    name: String(item.name || '').trim(),
    normalized: normalizeClassName(item.name),
  }))
  .filter((item) => item.id && item.name && item.normalized);

// Персонажи, чьи личные дела на живом сервисе иногда дают HTTP 500,
// но их класс подтверждён вручную по рабочей Google-системе.
// Это используется ТОЛЬКО для read-only аудита доноров и ничего не записывает.
const DONOR_CLASS_OVERRIDES: Record<string, string> = {
  anet: 'tank',
  evtida: 'dps',
};

function getOverrideCanonicalClass(characterId: string) {
  const classId = DONOR_CLASS_OVERRIDES[String(characterId || '').trim().toLowerCase()];
  if (!classId) return null;
  return DONOR_CLASSES.find((item) => item.id === classId) || null;
}

function levenshteinDistance(a: string, b: string) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function matchCanonicalClass(value: unknown) {
  const normalized = normalizeClassName(value)
    .replace(/хиллер/g, 'хилер')
    .replace(/бафер/g, 'баффер');

  if (!normalized) return null;

  const exact = DONOR_CLASSES.find((item) => item.normalized === normalized);
  if (exact) return exact;

  const partial = DONOR_CLASSES.find(
    (item) =>
      normalized.includes(item.normalized) ||
      item.normalized.includes(normalized),
  );
  if (partial) return partial;

  // На живых листах иногда встречаются небольшие опечатки в названии класса.
  // Разрешаем очень осторожное нечёткое совпадение только для достаточно длинных названий.
  if (normalized.length >= 5) {
    const fuzzy = DONOR_CLASSES
      .map((item) => ({
        item,
        distance: levenshteinDistance(normalized, item.normalized),
      }))
      .filter(({ item, distance }) => item.normalized.length >= 5 && distance <= 2)
      .sort((a, b) => a.distance - b.distance)[0];

    if (fuzzy) return fuzzy.item;
  }

  return null;
}

async function readJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function readCharacterDetailWithRetry(characterId: string) {
  let lastError = 'Не удалось прочитать личное дело';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(
        `/.netlify/functions/admin-character-data?characterId=${encodeURIComponent(characterId)}&_=${Date.now()}`,
        {
          method: 'GET',
          headers: { accept: 'application/json' },
          cache: 'no-store',
        },
      );

      const detail = await readJsonSafe(response);

      if (response.ok && detail?.ok === true) {
        return { ok: true as const, detail, attempts: attempt, error: '' };
      }

      lastError = String(detail?.error || `HTTP ${response.status}`);

      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      if (!retryable || attempt === 3) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Ошибка сети';
      if (attempt === 3) break;
    }

    // Apps Script и несколько связанных таблиц могут отвечать медленно.
    // Не долбим сервис параллельными повторными запросами.
    await sleep(1200 * attempt);
  }

  return { ok: false as const, detail: null, attempts: 3, error: lastError };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;

  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;

      results[index] = await worker(items[index], index);
      done += 1;
      onProgress?.(done, items.length);
    }
  }

  const runners = Array.from(
    { length: Math.min(Math.max(1, limit), Math.max(1, items.length)) },
    () => runner(),
  );

  await Promise.all(runners);
  return results;
}

type PreviewKind =
  | 'write'
  | 'copy'
  | 'formula'
  | 'system'
  | 'unmapped';


type PreviewRow = {
  kind: PreviewKind;
  source: string;
  value: string;
  target: string;
  note: string;
};

type DryRunStep = {
  number: number;
  title: string;
  target: string;
  actions: string[];
  protected: string[];
};

function buildDryRunSteps(
  payload: QuestionnaireTransferPayload,
  donor: DonorCheckItem | null,
  layout?: Record<string, any> | null,
): DryRunStep[] {
  const donorName = donor?.name || 'донор ещё не выбран';
  const donorId = donor?.characterId || '—';

  const mainBlock = layout?.main?.nextBlock || {};
  const systemBlock = layout?.system?.nextBlock || {};
  const registryRow = layout?.registry?.nextRow || {};

  const mainCells = mainBlock?.cells || {};
  const systemCells = systemBlock?.cells || {};
  const registryCells = registryRow?.cells || {};

  const mainTarget = mainBlock?.a1
    ? `[☘] Черный клевер → Маги!${mainBlock.a1}`
    : '[☘] Черный клевер → Маги → координаты ещё не проверены';

  const systemTarget = systemBlock?.a1
    ? `[🕸] Черный клевер СИСТЕМА → Маги!${systemBlock.a1}`
    : '[🕸] Черный клевер СИСТЕМА → Маги → координаты ещё не проверены';

  const registryTarget = registryRow?.a1
    ? `[☘] Черный клевер → САЙТ!${registryRow.a1}`
    : '[☘] Черный клевер → САЙТ → координаты ещё не проверены';

  return [
    {
      number: 1,
      title: 'Основная таблица',
      target: mainTarget,
      actions: [
        mainBlock?.startRow
          ? `Зарезервированный безопасный блок: строки ${mainBlock.startRow}–${mainBlock.endRow}.`
          : 'Сначала получить реальный безопасный пятистрочный блок через «Проверить связь».',
        `Скопировать 5-строчный блок донора ${donorName} того же класса вместе с форматированием и относительными формулами.`,
        `Имя: ${mainCells.name || 'B[r]'} ← ${payload.character.name || '—'}.`,
        `Ссылка игрока: ${mainCells.player || 'B[r+2]'} ← ${payload.character.playerLink || '—'}.`,
        `Название магии: ${mainCells.magic || 'S[r+2]'} ← ${payload.magic.name || '—'}.`,
        `Обозначение класса: ${mainCells.classSymbol || 'U[r+1]'} ← класс «${payload.combat.className || payload.combat.classKey || '—'}».`,
        `Орден: ${mainCells.squad || 'U[r]'} — оставить пустым до экзамена.`,
        `Рыцарский ранг: ${mainCells.rank || 'B[r+3]'} — оставить пустым до экзамена.`,
        'Проживание, баллы, ПЧК и стартовые сбережения до экзамена не выдаются.',
      ],
      protected: [
        'Не заменять текстом вычисляемые ячейки скопированного блока.',
        'Не нарушать шаг блоков по 5 строк.',
      ],
    },
    {
      number: 2,
      title: 'Таблица персонажа',
      target: `Копия донора: ${donorName} (${donorId})`,
      actions: [
        `Создать копию рабочей таблицы персонажа-донора класса «${payload.combat.className || payload.combat.classKey || '—'}».`,
        'Сохранить листы «Лист персонажа» и «ТЕХ» со всеми существующими формулами.',
        `ТЕХ!O2 ← ${payload.character.name || '—'}.`,
        `Лист персонажа!AB5 ← биография (${payload.character.biography ? 'есть' : 'пусто'}).`,
        `Лист персонажа!AU15 ← ${payload.appearance.weightCategory || '—'}.`,
        `Лист персонажа!BB15 ← ${payload.appearance.bodyType || '—'}.`,
        `Заполнить ${payload.spells.length} старт. заклин. в существующих слотах.`,
        payload.appearance.portraitDataUrl
          ? 'Загрузить портрет в доступное хранилище и записать в AS1 его URL.'
          : 'Портрет отсутствует — AS1 не заполнять автоматически.',
      ],
      protected: [
        'Не переписывать формулы HP, MP, атаки, защиты и других характеристик.',
        'Не генерировать заново классовые навыки — оставить их от донора того же класса.',
        'Не менять формулы поиска имени и IMPORTRANGE.',
      ],
    },
    {
      number: 3,
      title: 'Системная таблица',
      target: systemTarget,
      actions: [
        systemBlock?.startRow
          ? `Безопасный системный блок: строки ${systemBlock.startRow}–${systemBlock.endRow}.`
          : 'Сначала получить реальный безопасный системный блок через «Проверить связь».',
        'Скопировать рабочий системный блок целиком.',
        `Ссылка/id новой личной таблицы → ${systemCells.personalSpreadsheetLink || 'AB[r]'}.`,
        `Имя должно появиться через формулу в ${systemCells.characterNameFormula || 'B[r]'}.`,
        `Стартовый опыт → ${systemCells.experience || 'AC[r+1]'} = 0.`,
        'Баллы прокачки и ПЧК = 0 до прохождения экзамена.',
        'Проверить, что СИСТЕМА начинает читать имя, уровень и характеристики из нового ТЕХ.',
      ],
      protected: [
        'Не подменять значения HP/MP/атаки текстом — они должны прийти из ТЕХ.',
        'Не переписывать формулы блока после копирования.',
      ],
    },
    {
      number: 4,
      title: 'Проверка связей',
      target: 'Основная ↔ Персонаж ↔ Система',
      actions: [
        'Убедиться, что имя совпадает символ в символ во всех точках связи.',
        'Проверить чтение уровня, HP, MP и основных характеристик без #REF!/ошибок.',
        'Проверить, что диаграмма и классовые навыки остались рабочими.',
        'После успешной проверки считать персонажа созданным как кандидата до экзамена.',
      ],
      protected: [
        'При ошибке связи не регистрировать персонажа на сайте до исправления.',
      ],
    },
    {
      number: 5,
      title: 'Регистрация для сайта',
      target: registryTarget,
      actions: [
        registryRow?.row
          ? `Безопасная строка реестра: ${registryRow.row}.`
          : 'Сначала получить безопасную строку листа САЙТ через «Проверить связь».',
        `characterId → ${registryCells.characterId || 'A[row]'}.`,
        `Имя: ${registryCells.name || 'B[row]'} ← ${payload.character.name || '—'}.`,
        `spreadsheetId → ${registryCells.spreadsheetId || 'C[row]'}.`,
        `Активен = TRUE → ${registryCells.active || 'D[row]'}.`,
        `Тема = default → ${registryCells.theme || 'E[row]'}.`,
        'После регистрации проверить чтение персонажа через CHARACTER_SERVICE_URL.',
      ],
      protected: [
        'Регистрацию в САЙТ выполнять последней.',
      ],
    },
  ];
}



const KIND_META: Record<
  PreviewKind,
  {
    icon: string;
    label: string;
    color: string;
    background: string;
  }
> = {
  write: {
    icon: '🟢',
    label: 'Записываем значение',
    color: '#63d59a',
    background: 'rgba(50, 180, 115, .08)',
  },
  copy: {
    icon: '🔵',
    label: 'Копируется из шаблона',
    color: '#6fb7ff',
    background: 'rgba(55, 130, 220, .08)',
  },
  formula: {
    icon: '🟣',
    label: 'Формула — не трогаем',
    color: '#c697ff',
    background: 'rgba(145, 80, 220, .08)',
  },
  system: {
    icon: '🟡',
    label: 'Задаёт система/админ',
    color: '#e7c65f',
    background: 'rgba(215, 175, 55, .08)',
  },
  unmapped: {
    icon: '⚪',
    label: 'Пока не переносится',
    color: '#a9afba',
    background: 'rgba(150, 155, 170, .06)',
  },
};


function clean(value: unknown) {
  return String(value ?? '').trim();
}


function compact(value: string, max = 90) {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (!normalized) return '—';
  if (normalized.length <= max) return normalized;

  return `${normalized.slice(0, max - 1)}…`;
}


function portraitLabel(payload: QuestionnaireTransferPayload) {
  const dataUrl = payload.appearance.portraitDataUrl;

  if (!dataUrl) return 'Портрет не приложен';

  const approxBytes = Math.round((dataUrl.length * 3) / 4);
  const kb = Math.max(1, Math.round(approxBytes / 1024));

  return `Портрет приложен (~${kb} КБ). Перед записью нужен URL файла.`;
}


function spellSummary(
  payload: QuestionnaireTransferPayload,
  index: number,
) {
  const spell = payload.spells[index];
  if (!spell) return 'Пустой слот';

  return compact(
    `${spell.name}; ${spell.powerType || 'тип не указан'}: ${spell.power ?? '—'}/20; ` +
    `каст ${spell.castTime || '—'}; радиус ${spell.radius || '—'}; ` +
    `длительность ${spell.duration || '—'}`,
    150,
  );
}


function buildRows(payload: QuestionnaireTransferPayload): PreviewRow[] {
  const rows: PreviewRow[] = [
    {
      kind: 'write',
      source: 'Имя персонажа',
      value: payload.character.name,
      target: 'ОСНОВНАЯ → Маги!B[r]',
      note: 'r — первая строка нового 5-строчного блока. Имя станет ссылкой на таблицу персонажа.',
    },
    {
      kind: 'write',
      source: 'Имя персонажа',
      value: payload.character.name,
      target: 'ПЕРСОНАЖ → ТЕХ!O2',
      note: 'Должно совпадать с именем в основной таблице символ в символ.',
    },
    {
      kind: 'write',
      source: 'Ссылка на игрока',
      value: payload.character.playerLink,
      target: 'ОСНОВНАЯ → Маги!B[r+2]',
      note: 'ТЕХ персонажа дальше подтянет эту ссылку сам.',
    },
    {
      kind: 'write',
      source: 'Название магии',
      value: payload.magic.name,
      target: 'ОСНОВНАЯ → Маги!S[r+2]',
      note: 'Берём итоговое название магии, а не вдохновитель.',
    },
    {
      kind: 'write',
      source: 'Биография',
      value: compact(payload.character.biography, 150),
      target: 'ПЕРСОНАЖ → Лист персонажа!AB5',
      note: 'Текстовое описание персонажа.',
    },
    {
      kind: 'write',
      source: 'Весовая категория',
      value: payload.appearance.weightCategory,
      target: 'ПЕРСОНАЖ → Лист персонажа!AU15',
      note: 'После записи коэффициенты в ТЕХ рассчитываются существующими формулами.',
    },
    {
      kind: 'write',
      source: 'Телосложение',
      value: payload.appearance.bodyType,
      target: 'ПЕРСОНАЖ → Лист персонажа!BB15',
      note: 'После записи коэффициенты силы/скорости рассчитываются существующими формулами.',
    },
    {
      kind: 'write',
      source: 'Портрет',
      value: portraitLabel(payload),
      target: 'ПЕРСОНАЖ → Лист персонажа!AS1',
      note: 'В таблицу должен попасть URL изображения. Сам data:image/... в ячейку писать не будем.',
    },
    {
      kind: 'write',
      source: 'Заклинание №1',
      value: spellSummary(payload, 0),
      target: 'ПЕРСОНАЖ → B112 / R112 / B114',
      note: 'Название, служебное поле и описание/эффект существующего первого слота.',
    },
    {
      kind: 'write',
      source: 'Заклинание №2',
      value: spellSummary(payload, 1),
      target: 'ПЕРСОНАЖ → B117 / R117 / B119',
      note: 'Заполняется только если второе заклинание есть.',
    },
    {
      kind: 'write',
      source: 'Заклинание №3',
      value: spellSummary(payload, 2),
      target: 'ПЕРСОНАЖ → B122 / R122 / B124',
      note: 'Заполняется только если третье заклинание есть.',
    },

    {
      kind: 'copy',
      source: '5-строчный блок персонажа',
      value: 'Копия рабочего блока предыдущего персонажа',
      target: 'ОСНОВНАЯ → Маги!r:r+4',
      note: 'Копируем блок целиком, чтобы сохранить формулы, форматирование и структуру.',
    },
    {
      kind: 'copy',
      source: 'Лист персонажа + ТЕХ',
      value: payload.combat.className || payload.combat.classKey,
      target: 'НОВАЯ ТАБЛИЦА ПЕРСОНАЖА',
      note: 'Берём рабочий лист/ТЕХ персонажа-донора того же класса. Формулы не строим с нуля.',
    },
    {
      kind: 'copy',
      source: 'Блок в системной таблице',
      value: 'Копия рабочего блока с формулами',
      target: 'СИСТЕМА → Маги!новый блок',
      note: 'После копирования меняется только ссылка на новую таблицу персонажа и разрешённые системные значения.',
    },
    {
      kind: 'copy',
      source: 'Классовые навыки и формулы',
      value: payload.combat.className || payload.combat.classKey,
      target: 'ПЕРСОНАЖ → ТЕХ',
      note: 'Остаются из донора того же класса.',
    },

    {
      kind: 'formula',
      source: 'Уровень',
      value: 'Не записываем',
      target: 'ПЕРСОНАЖ → ТЕХ!C18',
      note: 'Рассчитывается из опыта существующей формулой.',
    },
    {
      kind: 'formula',
      source: 'HP / MP / атака / защита / лечение / бафф / дебафф и др.',
      value: 'Не записываем',
      target: 'ПЕРСОНАЖ → ТЕХ → СИСТЕМА',
      note: 'Все производные характеристики рассчитываются и импортируются существующими формулами.',
    },
    {
      kind: 'formula',
      source: 'Диаграмма характеристик',
      value: 'Не изменяем вручную',
      target: 'ПЕРСОНАЖ → диаграмма из ТЕХ!J3:K13',
      note: 'Данные должны обновиться через существующие формулы.',
    },

    {
      kind: 'system',
      source: 'Отряд',
      value: 'Пока выбирает администратор',
      target: 'ОСНОВНАЯ → Маги!U[r]',
      note: 'Этого выбора пока нет в анкете.',
    },
    {
      kind: 'system',
      source: 'Звание',
      value: 'Стартовое значение задаёт администрация',
      target: 'ОСНОВНАЯ → Маги!B[r+3]',
      note: 'Не берём из анкеты игрока.',
    },
    {
      kind: 'system',
      source: 'Значок/обозначение класса',
      value: payload.combat.className || payload.combat.classKey,
      target: 'ОСНОВНАЯ → Маги!U[r+1]',
      note: 'Будет определяться выбранным классом, а не вводиться игроком вручную.',
    },
    {
      kind: 'system',
      source: 'Опыт',
      value: 'Стартовое системное значение',
      target: 'СИСТЕМА → Маги!AC[r+1]',
      note: 'Не берём из анкеты. ТЕХ затем подтянет опыт обратно через существующую связь.',
    },
    {
      kind: 'system',
      source: 'Ссылка на таблицу персонажа',
      value: 'Будет известна после создания Google Spreadsheet',
      target: 'СИСТЕМА → Маги!AB[r]',
      note: 'Это ключевая связь СИСТЕМА → ТЕХ персонажа.',
    },
    {
      kind: 'system',
      source: 'Регистрация персонажа для сайта',
      value: `${payload.character.name || '—'} / новый characterId`,
      target: 'ОСНОВНАЯ → САЙТ (новая строка)',
      note: 'Выполняется последней, когда новая таблица персонажа уже создана и проверена.',
    },

    {
      kind: 'unmapped',
      source: 'Возраст',
      value: payload.character.age === null ? '—' : String(payload.character.age),
      target: 'Отдельной штатной ячейки пока не найдено',
      note: 'Остаётся в анкете/сайте. Самовольно место в Google не создаём.',
    },
    {
      kind: 'unmapped',
      source: 'Королевство / место рождения',
      value: payload.character.kingdom,
      target: 'Отдельной штатной ячейки пока не найдено',
      note: 'Остаётся в анкете/сайте.',
    },
    {
      kind: 'unmapped',
      source: 'Раса',
      value: payload.character.race,
      target: 'Отдельной штатной ячейки пока не найдено',
      note: 'Остаётся в анкете/сайте.',
    },
    {
      kind: 'unmapped',
      source: 'Рост / вес в физических единицах',
      value: `${payload.appearance.heightRaw || '—'} см / ${payload.appearance.weightRaw || '—'} кг`,
      target: 'Отдельной штатной ячейки пока не найдено',
      note: 'Для расчётов Google использует весовую категорию и телосложение.',
    },
    {
      kind: 'unmapped',
      source: 'Волосы / глаза / особые приметы',
      value: compact(
        `${payload.appearance.hairColor} ${payload.appearance.hairLength}; глаза: ${payload.appearance.eyes}; ${payload.appearance.marks}`,
        150,
      ),
      target: 'Отдельной штатной ячейки пока не найдено',
      note: 'Информация сохраняется в анкете.',
    },
    {
      kind: 'unmapped',
      source: 'Природы и магия-вдохновитель',
      value: compact(
        `${payload.magic.elements.join(' + ') || '—'}; вдохновитель: ${payload.magic.inspiration || '—'}`,
        150,
      ),
      target: 'Отдельной штатной ячейки пока не найдено',
      note: 'Итоговое название магии переносится, а вспомогательные данные остаются в анкете.',
    },
  ];

  return rows;
}


export default function QuestionnaireGooglePreview({
  data,
  questionnaireId,
  questionnaireKey,
  questionnaireStatus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [connectionResult, setConnectionResult] =
    useState<GoogleReadCheckResult | null>(null);

  const [donorBusy, setDonorBusy] = useState(false);
  const [donorError, setDonorError] = useState('');
  const [donorProgress, setDonorProgress] = useState({ done: 0, total: 0 });
  const [donorAudit, setDonorAudit] = useState<DonorAuditResult | null>(null);
  const [selectedDonorId, setSelectedDonorId] = useState('');

  const [prepareBusy, setPrepareBusy] = useState(false);
  const [prepareError, setPrepareError] = useState('');
  const [prepareResult, setPrepareResult] =
    useState<GooglePrepareResult | null>(null);

  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createNotice, setCreateNotice] = useState('');
  const [createResult, setCreateResult] =
    useState<GoogleCreateResult | null>(null);

  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState('');
  const [lifecycle, setLifecycle] =
    useState<CharacterLifecycleResult | null>(null);

  const [examFormOpen, setExamFormOpen] = useState(false);
  const [examBusy, setExamBusy] = useState(false);
  const [examError, setExamError] = useState('');
  const [examSquad, setExamSquad] = useState('');
  const [examHousing, setExamHousing] = useState('');
  const [examUpgradePoints, setExamUpgradePoints] = useState(0);
  const [examProtection, setExamProtection] = useState(0);
  const [examSenses, setExamSenses] = useState(0);
  const [examControl, setExamControl] = useState(0);
  const [examStartingMoney, setExamStartingMoney] = useState(0);

  useEffect(() => {
    void loadCharacterLifecycle();
  }, [questionnaireKey]);


  function invalidatePrepareResult() {
    setPrepareResult(null);
    setPrepareError('');
    setCreateResult(null);
    setCreateError('');
  }

  async function loadCharacterLifecycle(
    quiet = false,
  ): Promise<CharacterLifecycleResult | null> {
    if (!quiet) {
      setLifecycleBusy(true);
      setLifecycleError('');
    }

    try {
      const params =
        new URLSearchParams({
          questionnaireKey,
        });

      if (payload.character.name) {
        params.set(
          'characterName',
          payload.character.name,
        );
      }

      const expectedCharacterId =
        prepareResult?.proposed?.characterId ||
        createResult?.created?.characterId ||
        '';

      if (expectedCharacterId) {
        params.set(
          'expectedCharacterId',
          expectedCharacterId,
        );
      }

      params.set(
        '_',
        String(Date.now()),
      );

      const response = await fetch(
        `/.netlify/functions/admin-character-exam?${params.toString()}`,
        {
          method: 'GET',
          headers: { accept: 'application/json' },
          cache: 'no-store',
        },
      );

      const rawText = await response.text();
      let result: CharacterLifecycleResult | null = null;

      try {
        result = JSON.parse(rawText) as CharacterLifecycleResult;
      } catch {
        throw new Error(
          rawText.trim()
            ? `Сервер статуса персонажа вернул не JSON: ${rawText.slice(0, 240)}`
            : `Статус персонажа завершился с HTTP ${response.status} без ответа`,
        );
      }

      if (!response.ok || result?.ok !== true) {
        throw new Error(
          String(result?.error || `Статус персонажа: HTTP ${response.status}`),
        );
      }

      setLifecycle(result);

      if (result?.exam?.passed || result?.google?.examPassed) {
        setExamFormOpen(false);
      }

      return result;
    } catch (error) {
      if (!quiet) {
        setLifecycleError(
          error instanceof Error ? error.message : 'Не удалось прочитать статус персонажа',
        );
      }

      return null;
    } finally {
      if (!quiet) {
        setLifecycleBusy(false);
      }
    }
  }


  async function waitForCandidateAfterLocalTimeout(
    maxWaitMs = 3 * 60 * 1000,
  ): Promise<CharacterLifecycleResult | null> {
    const startedAt =
      Date.now();

    while (
      Date.now() - startedAt <
      maxWaitMs
    ) {
      const status =
        await loadCharacterLifecycle(
          true,
        );

      if (
        status?.candidateCreated &&
        status?.characterCreation?.characterId
      ) {
        return status;
      }

      await new Promise(
        (resolve) =>
          window.setTimeout(
            resolve,
            5000,
          ),
      );
    }

    return null;
  }


  async function submitExamResults() {
    if (!lifecycle?.candidateCreated || !lifecycle?.characterCreation?.characterId) {
      setExamError('Сначала создайте кандидата из одобренной анкеты.');
      return;
    }

    if (!examSquad || !examHousing) {
      setExamError('Выберите орден и проживание из живых Google-списков.');
      return;
    }

    const confirmed = window.confirm(
      `Подтвердить прохождение экзамена для «${payload.character.name || lifecycle.characterCreation.characterId}»?\n\nБудут записаны орден, стартовый ранг, проживание, баллы, ПЧК и стартовые сбережения.`,
    );

    if (!confirmed) return;

    setExamBusy(true);
    setExamError('');

    try {
      const response = await fetch(
        '/.netlify/functions/admin-character-exam',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            questionnaireKey,
            squad: examSquad,
            housing: examHousing,
            upgradePoints: examUpgradePoints,
            pchk: {
              protection: examProtection,
              senses: examSenses,
              control: examControl,
            },
            startingMoney: examStartingMoney,
          }),
        },
      );

      const rawText = await response.text();
      let result: CharacterLifecycleResult | null = null;

      try {
        result = JSON.parse(rawText) as CharacterLifecycleResult;
      } catch {
        throw new Error(
          rawText.trim()
            ? `Сервер экзамена вернул не JSON: ${rawText.slice(0, 260)}`
            : `Экзамен завершился с HTTP ${response.status} без ответа`,
        );
      }

      if (!response.ok || result?.ok !== true) {
        throw new Error(
          String(result?.error || `Экзамен завершился с HTTP ${response.status}`),
        );
      }

      await loadCharacterLifecycle();
      setExamFormOpen(false);
    } catch (error) {
      setExamError(
        error instanceof Error ? error.message : 'Не удалось записать результаты экзамена',
      );
    } finally {
      setExamBusy(false);
    }
  }


  async function checkLiveGoogleConnection() {
    setConnectionBusy(true);
    setConnectionError('');
    setPrepareResult(null);
    setPrepareError('');
    setCreateResult(null);
    setCreateError('');

    try {
      const response = await fetch(
        '/.netlify/functions/admin-google-read-check',
        {
          method: 'GET',
          headers: {
            accept: 'application/json',
          },
          cache: 'no-store',
        },
      );

      const rawText = await response.text();

      let result: GoogleReadCheckResult | null = null;

      try {
        result = JSON.parse(rawText) as GoogleReadCheckResult;
      } catch {
        throw new Error(
          rawText.trim()
            ? `Сервер проверки вернул не JSON: ${rawText.slice(0, 220)}`
            : `Проверка завершилась с HTTP ${response.status} без ответа`,
        );
      }

      if (!response.ok || result.ok !== true) {
        throw new Error(
          String(
            result?.error ||
              `Проверка завершилась с HTTP ${response.status}`,
          ),
        );
      }

      setConnectionResult(result);
    } catch (error) {
      setConnectionResult(null);
      setConnectionError(
        error instanceof Error
          ? error.message
          : 'Не удалось проверить связь с живой системой',
      );
    } finally {
      setConnectionBusy(false);
    }
  }


  async function checkAllDonors() {
    setDonorBusy(true);
    setDonorError('');
    setPrepareResult(null);
    setPrepareError('');
    setCreateResult(null);
    setCreateError('');
    setDonorAudit(null);
    setDonorProgress({ done: 0, total: 0 });

    try {
      // Для аудита доноров используем тот же Google-read endpoint,
      // который уже стабильно читает живой реестр. Старый admin-characters
      // здесь больше не используется: именно он давал HTTP 500.
      const registryResponse = await fetch(
        '/.netlify/functions/admin-google-read-check?mode=registry',
        {
          method: 'GET',
          headers: { accept: 'application/json' },
          cache: 'no-store',
        },
      );

      const registryData = await readJsonSafe(registryResponse);

      if (!registryResponse.ok || registryData?.ok !== true || registryData?.registry?.ok !== true) {
        throw new Error(
          String(
            registryData?.error ||
              registryData?.registry?.error ||
              `Не удалось прочитать реестр: HTTP ${registryResponse.status}`,
          ),
        );
      }

      const registrySource = Array.isArray(registryData?.registry?.characters)
        ? registryData.registry.characters
        : [];

      const registryCharacters: DonorRegistryCharacter[] = registrySource.length
        ? registrySource
            .map((character: any) => ({
              characterId: String(character?.characterId || character?.id || '').trim().toLowerCase(),
              name: String(character?.name || character?.characterId || 'Без имени').trim(),
              className: String(character?.className || '').trim(),
              squad: String(character?.squad || '').trim(),
              active: character?.active !== false,
            }))
            .filter((character: DonorRegistryCharacter) => character.characterId && character.active)
        : [];

      setDonorProgress({ done: 0, total: registryCharacters.length });

      const items = await runWithConcurrency(
        registryCharacters,
        1,
        async (character, index): Promise<DonorCheckItem> => {
          // Между персонажами оставляем паузу. На живой системе одно личное дело
          // может собираться из нескольких связанных Google-таблиц.
          if (index > 0) await sleep(700);

          const overrideCanonical = getOverrideCanonicalClass(character.characterId);
          const registryCanonical = overrideCanonical || matchCanonicalClass(character.className);
          const result = await readCharacterDetailWithRetry(character.characterId);

          if (!result.ok) {
            return {
              characterId: character.characterId,
              name: character.name,
              registryClassName: character.className,
              detailClassName: '',
              canonicalClassId: registryCanonical?.id || '',
              canonicalClassName: registryCanonical?.name || '',
              detailOk: false,
              classSkillsCount: 0,
              spellsCount: 0,
              error: registryCanonical
                ? overrideCanonical
                  ? `Личное дело не прочитано после повторных попыток (${result.error}). Класс вручную подтверждён как «${registryCanonical.name}».`
                  : `Личное дело не прочитано после повторных попыток (${result.error}). Класс из реестра распознан как «${registryCanonical.name}», но донор пока не подтверждён.`
                : `Личное дело не прочитано после повторных попыток (${result.error}).`,
            };
          }

          const detail = result.detail;
          const detailClassName = String(
            detail?.character?.className || character.className || '',
          ).trim();

          const canonical = matchCanonicalClass(detailClassName) || registryCanonical;

          return {
            characterId: character.characterId,
            name: String(detail?.character?.name || character.name).trim(),
            registryClassName: character.className,
            detailClassName,
            canonicalClassId: canonical?.id || '',
            canonicalClassName: canonical?.name || '',
            detailOk: true,
            classSkillsCount: Array.isArray(detail?.classSkills) ? detail.classSkills.length : 0,
            spellsCount: Array.isArray(detail?.spells) ? detail.spells.length : 0,
            error: canonical ? '' : `Не удалось сопоставить класс «${detailClassName || 'не указан'}» с каталогом сайта`,
          };
        },
        (done, total) => setDonorProgress({ done, total }),
      );

      setDonorAudit({
        checked: items.length,
        totalCharacters: registryCharacters.length,
        items,
      });
    } catch (error) {
      setDonorError(
        error instanceof Error ? error.message : 'Не удалось проверить доноров',
      );
    } finally {
      setDonorBusy(false);
    }
  }


  async function prepareGoogleCreation(
    transferPayload: QuestionnaireTransferPayload,
    donor: DonorCheckItem,
  ) {
    setPrepareBusy(true);
    setPrepareError('');
    setPrepareResult(null);
    setCreateResult(null);
    setCreateError('');

    try {
      const response = await fetch(
        '/.netlify/functions/admin-google-prepare',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            questionnaireId,
            questionnaireKey,
            payload: transferPayload,
            donorCharacterId: donor.characterId,
          }),
        },
      );

      const rawText = await response.text();

      let result: GooglePrepareResult | null = null;

      try {
        result = JSON.parse(rawText) as GooglePrepareResult;
      } catch {
        throw new Error(
          rawText.trim()
            ? `Сервер подготовки вернул не JSON: ${rawText.slice(0, 240)}`
            : `Подготовка завершилась с HTTP ${response.status} без ответа`,
        );
      }

      if (!response.ok || result.ok !== true) {
        throw new Error(
          String(
            result?.error ||
              `Подготовка завершилась с HTTP ${response.status}`,
          ),
        );
      }

      setPrepareResult(result);
    } catch (error) {
      setPrepareError(
        error instanceof Error
          ? error.message
          : 'Не удалось выполнить серверную подготовку',
      );
    } finally {
      setPrepareBusy(false);
    }
  }


  async function createGoogleCharacter() {
    if (
      !prepareResult?.prepared ||
      !prepareResult.fingerprint
    ) {
      setCreateError(
        'Сначала получите зелёную серверную подготовку.'
      );
      return;
    }

    const characterName =
      payload.character.name ||
      prepareResult.questionnaire?.name ||
      'персонажа';

    const confirmed =
      window.confirm(
        `Создать кандидата «${characterName}» в живых Google-таблицах?\n\nБудут созданы личная таблица, блоки Основной/Системы и строка САЙТ. Орден, ранг, проживание, баллы, ПЧК и стартовые сбережения останутся пустыми/нулевыми до экзамена.\n\nЭто уже настоящая запись.`
      );

    if (!confirmed) {
      return;
    }

    setCreateBusy(true);
    setCreateError('');
    setCreateNotice('Запускаю создание кандидата. Если localhost перестанет ждать через 30 секунд, это будет считаться ожиданием, а не ошибкой: сайт продолжит проверять живой САЙТ.');
    setCreateResult(null);

    try {
      /*
        Само создание теперь выполняется Background Function.
        Этот запрос только ставит задачу в очередь и быстро возвращает jobId.
      */
      const startResponse = await fetch(
        '/.netlify/functions/admin-google-create',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            fingerprint:
              prepareResult.fingerprint,
          }),
        },
      );

      const startText =
        await startResponse.text();

      let startResult:
        GoogleCreateStartResult | null =
        null;

      try {
        startResult =
          JSON.parse(
            startText
          ) as GoogleCreateStartResult;
      } catch {
        throw new Error(
          startText.trim()
            ? `Сервер запуска создания вернул не JSON: ${startText.slice(0, 260)}`
            : `Запуск создания завершился с HTTP ${startResponse.status} без ответа`,
        );
      }

      if (
        !startResponse.ok ||
        startResult.ok !== true ||
        !startResult.jobId
      ) {
        throw new Error(
          String(
            startResult?.error ||
            `Не удалось запустить создание: HTTP ${startResponse.status}`,
          ),
        );
      }

      const jobId =
        startResult.jobId;

      const startedAt =
        Date.now();

      const maxWaitMs =
        14 * 60 * 1000;

      while (
        Date.now() - startedAt <
        maxWaitMs
      ) {
        await new Promise(
          (resolve) =>
            window.setTimeout(
              resolve,
              2500,
            ),
        );

        const statusResponse =
          await fetch(
            `/.netlify/functions/admin-google-create-status?jobId=${encodeURIComponent(jobId)}&_=${Date.now()}`,
            {
              method: 'GET',
              headers: {
                accept: 'application/json',
              },
              cache: 'no-store',
            },
          );

        const statusText =
          await statusResponse.text();

        let statusResult:
          GoogleCreateJobStatusResult | null =
          null;

        try {
          statusResult =
            JSON.parse(
              statusText
            ) as GoogleCreateJobStatusResult;
        } catch {
          throw new Error(
            statusText.trim()
              ? `Статус создания вернул не JSON: ${statusText.slice(0, 260)}`
              : `Проверка статуса завершилась с HTTP ${statusResponse.status} без ответа`,
          );
        }

        if (
          !statusResponse.ok ||
          statusResult.ok !== true
        ) {
          throw new Error(
            String(
              statusResult?.error ||
              `Не удалось проверить статус создания: HTTP ${statusResponse.status}`,
            ),
          );
        }

        const job =
          statusResult.job;

        if (
          job?.status ===
          'success'
        ) {
          if (
            !job.result ||
            job.result.ok !== true
          ) {
            throw new Error(
              'Фоновое создание завершилось без корректного результата.'
            );
          }

          setCreateResult(
            job.result
          );
          setCreateNotice('');

          await loadCharacterLifecycle();
          return;
        }

        if (
          job?.status ===
          'error'
        ) {
          throw new Error(
            String(
              job.error ||
              'Фоновое создание завершилось с ошибкой.',
            ),
          );
        }
      }

      throw new Error(
        'Создание кандидата всё ещё не завершилось спустя 14 минут. Не запускайте создание повторно: сначала проверьте статус анкеты и Google-таблицы.'
      );

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Не удалось создать персонажа';

      const looksLikeLocalTimeout =
        /Task timed out after 30\.00 seconds|TimeoutError|Сервер запуска создания вернул не JSON/i
          .test(
            message,
          );

      if (looksLikeLocalTimeout) {
        setCreateError('');
        setCreateNotice(
          'Localhost перестал ждать ответ через 30 секунд, но Google продолжает создание. Это не ошибка. Жду появления кандидата в живом листе САЙТ и автоматически восстанавливаю жизненный цикл...',
        );

        const recovered =
          await waitForCandidateAfterLocalTimeout();

        if (
          recovered?.candidateCreated &&
          recovered?.characterCreation?.characterId
        ) {
          setCreateResult({
            ok: true,
            created: {
              characterId:
                recovered.characterCreation.characterId,
              name:
                payload.character.name,
              spreadsheetId:
                recovered.characterCreation.spreadsheetId,
              spreadsheetUrl:
                recovered.characterCreation.spreadsheetUrl,
              mainRows:
                recovered.characterCreation.mainRows ||
                undefined,
              systemRows:
                recovered.characterCreation.systemRows ||
                undefined,
              registryRow:
                recovered.characterCreation.registryRow ||
                undefined,
            },
            verification: {
              ok: true,
              registry: true,
              message:
                'Кандидат найден в живом реестре после локального timeout. Жизненный цикл анкеты восстановлен автоматически.',
            },
            warnings: [
              'Netlify Dev перестал ждать ответ через 30 секунд, но Google завершил создание. Связь анкеты с кандидатом восстановлена по листу САЙТ.',
            ],
            questionnaireUpdated:
              true,
          });

          setCreateError('');
          setCreateNotice('✓ Google завершил создание после локального таймаута. Кандидат найден в САЙТ, жизненный цикл восстановлен.');
          setPrepareResult(null);
          return;
        }

        setCreateNotice('');
        setCreateError(
          'Localhost перестал ждать через 30 секунд, а кандидат пока не появился в живом САЙТ в течение 3 минут. Не нажимайте создание повторно: сначала проверьте Основную, Систему, САЙТ и личную таблицу.',
        );
        return;
      }

      setCreateNotice('');
      setCreateError(
        message,
      );

    } finally {
      setCreateBusy(false);
    }
  }


  const payload = useMemo(
    () =>
      buildQuestionnaireTransfer(data, {
        questionnaireId,
        questionnaireKey,
        questionnaireStatus,
      }),
    [data, questionnaireId, questionnaireKey, questionnaireStatus],
  );

  const issues = useMemo(
    () => validateQuestionnaireTransfer(payload),
    [payload],
  );

  const rows = useMemo(() => buildRows(payload), [payload]);

  const grouped = useMemo(() => {
    const result: Record<PreviewKind, PreviewRow[]> = {
      write: [],
      copy: [],
      formula: [],
      system: [],
      unmapped: [],
    };

    rows.forEach((row) => result[row.kind].push(row));
    return result;
  }, [rows]);

  const ready = issues.length === 0;


  const donorCoverage = useMemo(() => {
    const byClass = new Map<string, DonorCheckItem[]>();

    for (const item of donorAudit?.items || []) {
      if (!item.canonicalClassId) continue;
      const list = byClass.get(item.canonicalClassId) || [];
      list.push(item);
      byClass.set(item.canonicalClassId, list);
    }

    return DONOR_CLASSES.map((gameClass) => {
      const all = byClass.get(gameClass.id) || [];
      const donors = all
        .filter((item) => item.detailOk)
        .sort((a, b) => {
          if (b.classSkillsCount !== a.classSkillsCount) {
            return b.classSkillsCount - a.classSkillsCount;
          }
          return a.name.localeCompare(b.name, 'ru');
        });
      const candidates = all
        .filter((item) => !item.detailOk)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

      return {
        ...gameClass,
        donors,
        candidates,
      };
    });
  }, [donorAudit]);

  const selectedClassMatch = useMemo(() => {
    return (
      DONOR_CLASSES.find((item) => item.id === payload.combat.classKey) ||
      matchCanonicalClass(payload.combat.className) ||
      null
    );
  }, [payload.combat.classKey, payload.combat.className]);

  const selectedDonors = useMemo(() => {
    if (!selectedClassMatch) return [] as DonorCheckItem[];
    return donorCoverage.find((item) => item.id === selectedClassMatch.id)?.donors || [];
  }, [donorCoverage, selectedClassMatch]);

  const selectedDryRunDonor = useMemo(() => {
    if (!selectedDonors.length) return null;

    return (
      selectedDonors.find((item) => item.characterId === selectedDonorId) ||
      selectedDonors[0]
    );
  }, [selectedDonors, selectedDonorId]);

  const liveLayout = connectionResult?.layout?.ok === true
    ? connectionResult.layout
    : null;

  const dryRunSteps = useMemo(
    () => buildDryRunSteps(payload, selectedDryRunDonor, liveLayout),
    [payload, selectedDryRunDonor, liveLayout],
  );

  const dryRunReady = Boolean(
    ready &&
    donorAudit &&
    selectedClassMatch &&
    selectedDryRunDonor &&
    liveLayout,
  );

  const realCreationEligible = Boolean(
    dryRunReady &&
    liveLayout?.safeForWritePreparation === true,
  );

  const creationParametersReady = true;

  const candidateCreated = Boolean(
    lifecycle?.candidateCreated ||
    createResult?.created?.characterId
  );

  const examPassed = Boolean(
    lifecycle?.exam?.passed ||
    lifecycle?.google?.examPassed
  );

  const examSquadOptions = Array.isArray(lifecycle?.google?.options?.squads)
    ? lifecycle?.google?.options?.squads || []
    : [];

  const examHousingOptions = Array.isArray(lifecycle?.google?.options?.housing)
    ? lifecycle?.google?.options?.housing || []
    : [];

  const startingRank = String(
    lifecycle?.google?.options?.startingRank ||
    lifecycle?.exam?.rank ||
    'Младший рыцарь-чародей 1',
  );


  const missingDonorClasses = donorCoverage.filter(
    (item) => item.donors.length === 0 && item.candidates.length === 0,
  );
  const candidateOnlyClasses = donorCoverage.filter(
    (item) => item.donors.length === 0 && item.candidates.length > 0,
  );
  const verifiedDonorClasses = donorCoverage.filter((item) => item.donors.length > 0);
  const donorErrors = donorAudit?.items.filter((item) => !item.detailOk || item.error) || [];

  return (
    <section
      style={{
        marginTop: 18,
        border: '1px solid var(--admin-line-soft)',
        borderRadius: 18,
        overflow: 'hidden',
        background: 'rgba(255,255,255,.018)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          padding: '16px 18px',
          border: 0,
          background: 'transparent',
          color: 'var(--admin-text)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'grid', gap: 4 }}>
          <strong style={{ fontSize: 14 }}>
            🔎 Предпросмотр переноса в Google
          </strong>
          <small style={{ color: 'var(--admin-muted-2)', lineHeight: 1.5 }}>
            Ничего не записывает. Показывает, какие данные мы позже будем менять, копировать или оставлять формулам.
          </small>
        </span>

        <span
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              padding: '6px 9px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              color: ready ? '#77dda7' : '#f1bf68',
              background: ready
                ? 'rgba(70,190,125,.10)'
                : 'rgba(220,160,60,.10)',
              border: `1px solid ${ready ? 'rgba(90,210,145,.25)' : 'rgba(230,175,80,.25)'}`,
            }}
          >
            {ready ? 'Готово к следующему этапу' : `Нужно проверить: ${issues.length}`}
          </span>
          <span style={{ color: 'var(--admin-muted-2)', fontSize: 18 }}>
            {open ? '⌃' : '⌄'}
          </span>
        </span>
      </button>

      {open && (
        <div
          style={{
            borderTop: '1px solid var(--admin-line-soft)',
            padding: 18,
            display: 'grid',
            gap: 18,
          }}
        >
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: '1px solid rgba(80,150,230,.22)',
              background: 'rgba(55,115,190,.06)',
              display: 'grid',
              gap: 11,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <strong style={{ color: '#7ec1ff', fontSize: 12 }}>
                  🔗 Проверка живой Google-системы
                </strong>
                <span style={{ color: 'var(--admin-muted-2)', fontSize: 10, lineHeight: 1.55, maxWidth: 720 }}>
                  Выполняет только чтение через уже подключённый CHARACTER_SERVICE_URL: сначала реестр персонажей, затем одно личное дело. Никакие Google-таблицы не изменяются.
                </span>
              </div>

              <button
                type="button"
                onClick={checkLiveGoogleConnection}
                disabled={connectionBusy}
                style={{
                  border: '1px solid rgba(100,175,245,.28)',
                  background: connectionBusy ? 'rgba(80,120,160,.08)' : 'rgba(70,145,220,.12)',
                  color: connectionBusy ? '#8997a5' : '#8bc9ff',
                  borderRadius: 10,
                  padding: '8px 11px',
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: connectionBusy ? 'wait' : 'pointer',
                }}
              >
                {connectionBusy ? 'Проверяю…' : 'Проверить связь'}
              </button>
            </div>

            {connectionError && (
              <div style={{ padding: '9px 11px', borderRadius: 10, color: '#ef9b9b', background: 'rgba(185,65,70,.08)', border: '1px solid rgba(220,90,95,.18)', fontSize: 10, lineHeight: 1.5 }}>
                {connectionError}
              </div>
            )}

            {connectionResult?.ok === true && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 8 }}>
                  <div style={{ padding: 10, borderRadius: 10, background: 'rgba(60,190,120,.06)', border: '1px solid rgba(80,205,135,.16)' }}>
                    <small style={{ display: 'block', color: 'var(--admin-muted-2)', fontSize: 8, marginBottom: 3 }}>РЕЕСТР</small>
                    <strong style={{ color: '#77dda7', fontSize: 12 }}>{connectionResult.registry?.count ?? 0} персонажей</strong>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, background: 'rgba(60,150,220,.06)', border: '1px solid rgba(85,170,235,.16)' }}>
                    <small style={{ display: 'block', color: 'var(--admin-muted-2)', fontSize: 8, marginBottom: 3 }}>ЧТЕНИЕ РЕЕСТРА</small>
                    <strong style={{ color: '#8bc9ff', fontSize: 12 }}>{connectionResult.registry?.responseMs ?? connectionResult.registry?.elapsedMs ?? '—'} мс</strong>
                  </div>
                  <div style={{
                    padding: 10,
                    borderRadius: 10,
                    background: connectionResult.detailProbe?.skipped
                      ? 'rgba(60,150,220,.06)'
                      : connectionResult.detailProbe?.ok
                        ? 'rgba(60,190,120,.06)'
                        : 'rgba(210,145,55,.07)',
                    border: connectionResult.detailProbe?.skipped
                      ? '1px solid rgba(85,170,235,.16)'
                      : connectionResult.detailProbe?.ok
                        ? '1px solid rgba(80,205,135,.16)'
                        : '1px solid rgba(220,160,65,.18)'
                  }}>
                    <small style={{ display: 'block', color: 'var(--admin-muted-2)', fontSize: 8, marginBottom: 3 }}>ЛИЧНОЕ ДЕЛО</small>
                    <strong style={{
                      color: connectionResult.detailProbe?.skipped
                        ? '#8bc9ff'
                        : connectionResult.detailProbe?.ok
                          ? '#77dda7'
                          : '#efc06c',
                      fontSize: 12
                    }}>
                      {connectionResult.detailProbe?.skipped
                        ? 'Проверяется отдельно'
                        : connectionResult.detailProbe?.ok
                          ? 'Читается'
                          : 'Есть проблема'}
                    </strong>
                  </div>
                </div>

                {connectionResult.registry?.sample && connectionResult.registry.sample.length > 0 && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <small style={{ color: 'var(--admin-muted-2)', fontSize: 9, fontWeight: 800 }}>Пример записей из живого реестра</small>
                    {connectionResult.registry.sample.map((character) => (
                      <div key={character.characterId || character.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, .8fr) minmax(150px, 1.2fr) minmax(100px, .8fr) minmax(100px, .8fr)', gap: 8, padding: '7px 9px', borderRadius: 9, background: 'rgba(255,255,255,.025)', border: '1px solid var(--admin-line-soft)', color: '#c7cad2', fontSize: 9 }}>
                        <code>{character.characterId || '—'}</code>
                        <span>{character.name || '—'}</span>
                        <span>{character.className || '—'}</span>
                        <span>{character.squad || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}

                {connectionResult.detailProbe && (
                  <div style={{ padding: '9px 11px', borderRadius: 10, background: 'rgba(255,255,255,.022)', border: '1px solid var(--admin-line-soft)', color: '#bfc3cc', fontSize: 9, lineHeight: 1.55 }}>
                    <b style={{
                      color: connectionResult.detailProbe.skipped
                        ? '#8bc9ff'
                        : connectionResult.detailProbe.ok
                          ? '#77dda7'
                          : '#efc06c'
                    }}>
                      {connectionResult.detailProbe.skipped ? 'Личное дело:' : 'Пробное чтение:'}
                    </b>{' '}
                    {connectionResult.detailProbe.name || '—'}
                    {!connectionResult.detailProbe.skipped && (
                      <> · {connectionResult.detailProbe.responseMs ?? '—'} мс</>
                    )}
                    {connectionResult.detailProbe.fields && connectionResult.detailProbe.fields.length > 0 && (
                      <>
                        <br />
                        <b style={{ color: '#8bc9ff' }}>Поля ответа:</b>{' '}
                        {connectionResult.detailProbe.fields.join(', ')}
                      </>
                    )}
                    {connectionResult.detailProbe.error && (
                      <>
                        <br />
                        <b style={{ color: '#ef9b9b' }}>Ошибка:</b>{' '}
                        {connectionResult.detailProbe.error}
                      </>
                    )}
                  </div>
                )}

                {connectionResult.layout?.ok === true && (
                  <div style={{ display: 'grid', gap: 9, padding: 12, borderRadius: 12, background: 'rgba(60,185,145,.045)', border: '1px solid rgba(80,205,160,.18)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <b style={{ color: '#7be0b4', fontSize: 10 }}>📐 Реальная разметка живых таблиц</b>
                      <span style={{ color: '#8fa1ad', fontSize: 8 }}>прочитано за {connectionResult.layout?.responseMs ?? connectionResult.layout?.elapsedMs ?? '—'} мс</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(150px, 1fr))', gap: 8 }}>
                      <div style={{ padding: 10, borderRadius: 10, border: '1px solid var(--admin-line-soft)', background: 'rgba(255,255,255,.022)', display: 'grid', gap: 3 }}>
                        <small style={{ color: 'var(--admin-muted-2)', fontSize: 8 }}>ОСНОВНАЯ · МАГИ</small>
                        <b style={{ color: '#d9dde6', fontSize: 10 }}>{connectionResult.layout?.main?.detectedCharacters ?? '—'} блоков</b>
                        <span style={{ color: '#8bc9ff', fontSize: 9 }}>следующий: {connectionResult.layout?.main?.nextBlock?.a1 || '—'}</span>
                        <span style={{ color: '#a9b1bd', fontSize: 8 }}>имя: {connectionResult.layout?.main?.nextBlock?.cells?.name || '—'}</span>
                        <span style={{ color: connectionResult.layout?.main?.nextBlock?.empty ? '#78dca8' : '#ef9b9b', fontSize: 8, fontWeight: 800 }}>
                          {connectionResult.layout?.main?.nextBlock?.empty ? '✓ диапазон свободен' : '✕ диапазон уже содержит данные'}
                        </span>
                      </div>

                      <div style={{ padding: 10, borderRadius: 10, border: '1px solid var(--admin-line-soft)', background: 'rgba(255,255,255,.022)', display: 'grid', gap: 3 }}>
                        <small style={{ color: 'var(--admin-muted-2)', fontSize: 8 }}>СИСТЕМА · МАГИ</small>
                        <b style={{ color: '#d9dde6', fontSize: 10 }}>{connectionResult.layout?.system?.detectedCharacters ?? '—'} блоков</b>
                        <span style={{ color: '#cba4ff', fontSize: 9 }}>следующий: {connectionResult.layout?.system?.nextBlock?.a1 || '—'}</span>
                        <span style={{ color: '#a9b1bd', fontSize: 8 }}>ссылка: {connectionResult.layout?.system?.nextBlock?.cells?.personalSpreadsheetLink || '—'}</span>
                        <span style={{ color: connectionResult.layout?.system?.nextBlock?.empty ? '#78dca8' : '#ef9b9b', fontSize: 8, fontWeight: 800 }}>
                          {connectionResult.layout?.system?.nextBlock?.empty ? '✓ диапазон свободен' : '✕ диапазон уже содержит данные'}
                        </span>
                      </div>

                      <div style={{ padding: 10, borderRadius: 10, border: '1px solid var(--admin-line-soft)', background: 'rgba(255,255,255,.022)', display: 'grid', gap: 3 }}>
                        <small style={{ color: 'var(--admin-muted-2)', fontSize: 8 }}>ОСНОВНАЯ · САЙТ</small>
                        <b style={{ color: '#d9dde6', fontSize: 10 }}>{connectionResult.layout?.registry?.detectedCharacters ?? '—'} записей</b>
                        <span style={{ color: '#f0c374', fontSize: 9 }}>следующая строка: {connectionResult.layout?.registry?.nextRow?.row ?? '—'}</span>
                        <span style={{ color: '#a9b1bd', fontSize: 8 }}>{connectionResult.layout?.registry?.nextRow?.a1 || '—'}</span>
                        <span style={{ color: connectionResult.layout?.registry?.nextRow?.empty ? '#78dca8' : '#ef9b9b', fontSize: 8, fontWeight: 800 }}>
                          {connectionResult.layout?.registry?.nextRow?.empty ? '✓ строка свободна' : '✕ строка уже содержит данные'}
                        </span>
                      </div>
                    </div>

                    <div style={{ padding: '9px 10px', borderRadius: 10, background: connectionResult.layout?.safeForWritePreparation ? 'rgba(65,190,125,.06)' : 'rgba(215,145,60,.07)', border: connectionResult.layout?.safeForWritePreparation ? '1px solid rgba(80,205,140,.18)' : '1px solid rgba(225,165,75,.20)', color: connectionResult.layout?.safeForWritePreparation ? '#78dca8' : '#efc06c', fontSize: 9, lineHeight: 1.55 }}>
                      <b>{connectionResult.layout?.safeForWritePreparation ? '✓ Три структуры согласованы.' : '⚠ Структуры пока расходятся.'}</b>{' '}
                      Основная: {connectionResult.layout?.consistency?.mainCount ?? '—'} · Система: {connectionResult.layout?.consistency?.systemCount ?? '—'} · САЙТ: {connectionResult.layout?.consistency?.registryCount ?? '—'}.
                      {connectionResult.layout?.warning ? ` ${connectionResult.layout.warning}` : ''}
                    </div>

                    {Array.isArray(connectionResult.layout?.system?.malformedBlocks) && connectionResult.layout.system.malformedBlocks.length > 0 && (
                      <div style={{ color: '#ef9b9b', fontSize: 9, lineHeight: 1.5 }}>
                        <b>Неполные блоки в СИСТЕМЕ:</b>{' '}
                        {connectionResult.layout.system.malformedBlocks.map((item: any) => `${item?.startRow || '?'}–${item?.endRow || '?'}`).join(', ')}.
                        В этих пятистрочных диапазонах уже есть данные, но не найден обязательный spreadsheetId в колонке AB.
                      </div>
                    )}

                    {Array.isArray(connectionResult.layout?.main?.malformedBlocks) && connectionResult.layout.main.malformedBlocks.length > 0 && (
                      <div style={{ color: '#ef9b9b', fontSize: 9, lineHeight: 1.5 }}>
                        <b>Неполные блоки в основной таблице:</b>{' '}
                        {connectionResult.layout.main.malformedBlocks.map((item: any) => `${item?.startRow || '?'}–${item?.endRow || '?'}`).join(', ')}.
                      </div>
                    )}

                    {Array.isArray(connectionResult.layout?.consistency?.mainOnly) && connectionResult.layout.consistency.mainOnly.length > 0 && (
                      <div style={{ color: '#efb06f', fontSize: 9, lineHeight: 1.5 }}>
                        <b>Есть в основной, но отсутствуют минимум в одной другой структуре:</b>{' '}
                        {connectionResult.layout.consistency.mainOnly.map((item: any) => item?.name || '—').join(', ')}
                      </div>
                    )}

                    {Array.isArray(connectionResult.layout?.consistency?.systemOnly) && connectionResult.layout.consistency.systemOnly.length > 0 && (
                      <div style={{ color: '#ef9b9b', fontSize: 9, lineHeight: 1.5 }}>
                        <b>Есть в СИСТЕМЕ, но отсутствуют минимум в одной другой структуре:</b>{' '}
                        {connectionResult.layout.consistency.systemOnly.map((item: any) => item?.name || '—').join(', ')}
                      </div>
                    )}

                    {Array.isArray(connectionResult.layout?.consistency?.registryOnly) && connectionResult.layout.consistency.registryOnly.length > 0 && (
                      <div style={{ color: '#ef9b9b', fontSize: 9, lineHeight: 1.5 }}>
                        <b>Есть в САЙТ, но отсутствуют минимум в одной другой структуре:</b>{' '}
                        {connectionResult.layout.consistency.registryOnly.map((item: any) => item?.name || '—').join(', ')}
                      </div>
                    )}
                  </div>
                )}

                {connectionResult.layout && connectionResult.layout?.ok !== true && (
                  <div style={{ padding: '9px 11px', borderRadius: 10, color: '#ef9b9b', background: 'rgba(185,65,70,.08)', border: '1px solid rgba(220,90,95,.18)', fontSize: 9, lineHeight: 1.5 }}>
                    Не удалось прочитать разметку таблиц: {String(connectionResult.layout?.error || 'неизвестная ошибка')}
                  </div>
                )}

                <div style={{ color: '#78dca8', fontSize: 9, fontWeight: 800 }}>
                  ✓ Режим: только чтение · записей выполнено: {connectionResult.writesPerformed ?? 0}
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: candidateCreated
                ? '1px solid rgba(85,195,140,.22)'
                : '1px solid rgba(125,145,170,.16)',
              background: candidateCreated
                ? 'rgba(55,165,110,.045)'
                : 'rgba(255,255,255,.018)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 3 }}>
                <strong style={{ color: candidateCreated ? '#78dca8' : '#b8c2ce', fontSize: 11 }}>
                  🎓 Жизненный цикл персонажа
                </strong>
                <span style={{ color: 'var(--admin-muted-2)', fontSize: 9, lineHeight: 1.5 }}>
                  Одобрение создаёт кандидата без ордена и ранга. Результаты экзамена выдаются отдельным действием позже.
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  void loadCharacterLifecycle();
                }}
                disabled={lifecycleBusy}
                style={{
                  border: '1px solid var(--admin-line-soft)',
                  background: 'rgba(255,255,255,.035)',
                  color: '#cbd3dd',
                  borderRadius: 9,
                  padding: '7px 10px',
                  fontSize: 8.5,
                  fontWeight: 800,
                  cursor: lifecycleBusy ? 'wait' : 'pointer',
                }}
              >
                {lifecycleBusy ? 'Обновляю...' : 'Обновить статус'}
              </button>
            </div>

            {lifecycleError && (
              <div style={{ padding: 9, borderRadius: 9, color: '#efaaaa', background: 'rgba(185,65,70,.06)', border: '1px solid rgba(220,90,95,.16)', fontSize: 8.5 }}>
                {lifecycleError}
              </div>
            )}

            {lifecycle?.optionsError && (
              <div style={{ padding: 9, borderRadius: 9, color: '#efc06c', background: 'rgba(205,145,55,.06)', border: '1px solid rgba(225,165,75,.16)', fontSize: 8.5, lineHeight: 1.5 }}>
                Кандидат создан, но пока не удалось прочитать Google-чипы экзамена: {lifecycle.optionsError}
              </div>
            )}

            {!candidateCreated && !lifecycleBusy && (
              <div style={{ color: '#b8c2ce', fontSize: 9 }}>
                Кандидат ещё не создан. Ниже выберите донора того же класса и создайте Google-структуру из одобренной анкеты.
              </div>
            )}

            {candidateCreated && (
              <div style={{ display: 'grid', gap: 9 }}>
                <div style={{ padding: '9px 10px', borderRadius: 9, background: examPassed ? 'rgba(65,180,120,.065)' : 'rgba(80,135,205,.055)', border: examPassed ? '1px solid rgba(80,195,135,.16)' : '1px solid rgba(90,155,225,.16)', display: 'grid', gap: 4 }}>
                  <b style={{ color: examPassed ? '#78dca8' : '#9ed4ff', fontSize: 9.5 }}>
                    {examPassed ? '✓ Экзамен уже пройден' : 'Кандидат опубликован · экзамен ещё не пройден'}
                  </b>
                  <span style={{ color: '#c8cfd8', fontSize: 8.5, lineHeight: 1.5 }}>
                    characterId: <b>{lifecycle?.characterCreation?.characterId || createResult?.created?.characterId || '—'}</b>
                    {lifecycle?.characterCreation?.spreadsheetUrl ? ' · личная таблица создана' : ''}
                  </span>
                </div>

                {examPassed && lifecycle?.exam && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(120px, 1fr))', gap: 7 }}>
                    {[
                      ['Орден', lifecycle.exam.squad || '—'],
                      ['Ранг', lifecycle.exam.rank || '—'],
                      ['Проживание', lifecycle.exam.housing || '—'],
                      ['Баллы', String(lifecycle.exam.upgradePoints ?? 0)],
                      ['Сбережения', String(lifecycle.exam.startingMoney ?? 0)],
                    ].map(([label, value]) => (
                      <div key={label} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--admin-line-soft)', background: 'rgba(255,255,255,.02)', display: 'grid', gap: 2 }}>
                        <small style={{ color: 'var(--admin-muted-2)', fontSize: 7.5 }}>{label}</small>
                        <b style={{ color: '#d9dde5', fontSize: 8.5 }}>{value}</b>
                      </div>
                    ))}
                  </div>
                )}

                {!examPassed && (
                  <>
                    {!examFormOpen ? (
                      <button
                        type="button"
                        onClick={() => setExamFormOpen(true)}
                        disabled={Boolean(lifecycle?.optionsError) || examSquadOptions.length === 0 || examHousingOptions.length === 0}
                        style={{
                          justifySelf: 'start',
                          border: '1px solid rgba(235,185,85,.28)',
                          background: 'rgba(205,150,55,.10)',
                          color: '#efc06c',
                          borderRadius: 9,
                          padding: '8px 12px',
                          fontSize: 9,
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        Экзамен пройден
                      </button>
                    ) : (
                      <div style={{ padding: 11, borderRadius: 10, border: '1px solid rgba(225,170,70,.18)', background: 'rgba(205,150,55,.04)', display: 'grid', gap: 10 }}>
                        <div style={{ display: 'grid', gap: 3 }}>
                          <strong style={{ color: '#efc06c', fontSize: 10.5 }}>
                            🎓 Результаты экзамена
                          </strong>
                          <span style={{ color: '#c4cbd4', fontSize: 8.5, lineHeight: 1.5 }}>
                            Орден и проживание читаются прямо из Google-чипов. Ранг назначается автоматически: <b>{startingRank}</b>.
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: 8 }}>
                          <label style={{ display: 'grid', gap: 4 }}>
                            <span style={{ color: '#cfd5de', fontSize: 8.5, fontWeight: 800 }}>Орден *</span>
                            <select
                              value={examSquad}
                              onChange={(event) => setExamSquad(event.target.value)}
                              style={{ borderRadius: 9, border: '1px solid var(--admin-line-soft)', background: '#151a22', color: 'var(--admin-text)', padding: '8px 9px', fontSize: 9 }}
                            >
                              <option value="">Выберите орден</option>
                              {examSquadOptions.map((value) => (
                                <option key={value} value={value}>{value}</option>
                              ))}
                            </select>
                          </label>

                          <label style={{ display: 'grid', gap: 4 }}>
                            <span style={{ color: '#cfd5de', fontSize: 8.5, fontWeight: 800 }}>Проживание *</span>
                            <select
                              value={examHousing}
                              onChange={(event) => setExamHousing(event.target.value)}
                              style={{ borderRadius: 9, border: '1px solid var(--admin-line-soft)', background: '#151a22', color: 'var(--admin-text)', padding: '8px 9px', fontSize: 9 }}
                            >
                              <option value="">Выберите проживание</option>
                              {examHousingOptions.map((value) => (
                                <option key={value} value={value}>{value}</option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(100px, 1fr))', gap: 8 }}>
                          {[
                            ['Баллы прокачки', examUpgradePoints, setExamUpgradePoints, 0, undefined],
                            ['Покров', examProtection, setExamProtection, 0, 100],
                            ['Чувство', examSenses, setExamSenses, 0, 200],
                            ['Контроль', examControl, setExamControl, 0, 500],
                            ['Стартовые сбережения', examStartingMoney, setExamStartingMoney, 0, undefined],
                          ].map(([label, value, setter, min, max]) => (
                            <label key={String(label)} style={{ display: 'grid', gap: 4 }}>
                              <span style={{ color: '#cfd5de', fontSize: 8, fontWeight: 800 }}>{String(label)}</span>
                              <input
                                type="number"
                                min={Number(min)}
                                max={max === undefined ? undefined : Number(max)}
                                step={1}
                                value={Number(value)}
                                onChange={(event) => {
                                  const next = Number.isFinite(Number(event.target.value))
                                    ? Math.trunc(Number(event.target.value))
                                    : 0;
                                  (setter as React.Dispatch<React.SetStateAction<number>>)(next);
                                }}
                                style={{ width: '100%', boxSizing: 'border-box', borderRadius: 9, border: '1px solid var(--admin-line-soft)', background: 'rgba(255,255,255,.035)', color: 'var(--admin-text)', padding: '8px 9px', fontSize: 9, outline: 'none' }}
                              />
                            </label>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={submitExamResults}
                            disabled={examBusy || !examSquad || !examHousing}
                            style={{ borderRadius: 9, border: '1px solid rgba(90,205,145,.28)', background: examBusy || !examSquad || !examHousing ? 'rgba(255,255,255,.04)' : 'rgba(55,175,115,.12)', color: examBusy || !examSquad || !examHousing ? '#8b939e' : '#8de0b2', padding: '8px 12px', fontSize: 9, fontWeight: 900, cursor: examBusy || !examSquad || !examHousing ? 'not-allowed' : 'pointer' }}
                          >
                            {examBusy ? 'Записываю...' : 'Подтвердить результаты экзамена'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExamFormOpen(false);
                              setExamError('');
                            }}
                            disabled={examBusy}
                            style={{ borderRadius: 9, border: '1px solid var(--admin-line-soft)', background: 'rgba(255,255,255,.025)', color: '#bfc6d0', padding: '8px 11px', fontSize: 9, cursor: examBusy ? 'not-allowed' : 'pointer' }}
                          >
                            Отмена
                          </button>
                        </div>

                        {examError && (
                          <div style={{ padding: '8px 9px', borderRadius: 8, background: 'rgba(185,65,70,.07)', border: '1px solid rgba(220,90,95,.18)', color: '#efaaaa', fontSize: 8.5, lineHeight: 1.5 }}>
                            {examError}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: '1px solid rgba(180,125,235,.22)',
              background: 'rgba(120,75,175,.055)',
              display: candidateCreated ? 'none' : 'grid',
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <strong style={{ color: '#cba4ff', fontSize: 12 }}>
                  🧬 Проверка персонажей-доноров
                </strong>
                <span style={{ color: 'var(--admin-muted-2)', fontSize: 10, lineHeight: 1.55, maxWidth: 760 }}>
                  Проверяет все активные личные дела из живого реестра и сопоставляет их с 19 классами сайта. Это только чтение: таблицы и формулы не меняются.
                </span>
              </div>

              <button
                type="button"
                onClick={checkAllDonors}
                disabled={donorBusy}
                style={{
                  border: '1px solid rgba(195,145,245,.28)',
                  background: donorBusy ? 'rgba(100,85,120,.08)' : 'rgba(135,85,190,.12)',
                  color: donorBusy ? '#948c9f' : '#d4b2ff',
                  borderRadius: 10,
                  padding: '8px 11px',
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: donorBusy ? 'wait' : 'pointer',
                }}
              >
                {donorBusy
                  ? `Проверяю ${donorProgress.done}/${donorProgress.total || '…'}`
                  : donorAudit
                    ? 'Проверить заново'
                    : 'Проверить всех доноров'}
              </button>
            </div>

            {donorBusy && donorProgress.total > 0 && (
              <div style={{ display: 'grid', gap: 5 }}>
                <div style={{ height: 6, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,.06)' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.round((donorProgress.done / donorProgress.total) * 100)}%`,
                      background: 'linear-gradient(90deg, #8e68d8, #c79cff)',
                      transition: 'width .2s ease',
                    }}
                  />
                </div>
                <small style={{ color: 'var(--admin-muted-2)', fontSize: 9 }}>
                  Проверено персонажей: {donorProgress.done} из {donorProgress.total}. Запросы идут по одному и при временной ошибке повторяются, поэтому полная проверка может занять несколько минут.
                </small>
              </div>
            )}

            {donorError && (
              <div style={{ padding: '9px 11px', borderRadius: 10, color: '#ef9b9b', background: 'rgba(185,65,70,.08)', border: '1px solid rgba(220,90,95,.18)', fontSize: 10 }}>
                {donorError}
              </div>
            )}

            {donorAudit && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, minmax(105px, 1fr))',
                    gap: 8,
                  }}
                >
                  <div style={{ padding: 10, borderRadius: 10, background: 'rgba(85,190,125,.06)', border: '1px solid rgba(85,200,135,.16)' }}>
                    <small style={{ display: 'block', color: 'var(--admin-muted-2)', fontSize: 8 }}>ЛИЧНЫХ ДЕЛ</small>
                    <strong style={{ color: '#77dda7', fontSize: 12 }}>{donorAudit.checked}</strong>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, background: 'rgba(85,190,125,.06)', border: '1px solid rgba(85,200,135,.16)' }}>
                    <small style={{ display: 'block', color: 'var(--admin-muted-2)', fontSize: 8 }}>ПОДТВЕРЖДЕНО</small>
                    <strong style={{ color: '#77dda7', fontSize: 12 }}>{verifiedDonorClasses.length} / {donorCoverage.length}</strong>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, background: candidateOnlyClasses.length ? 'rgba(105,135,215,.07)' : 'rgba(85,190,125,.06)', border: candidateOnlyClasses.length ? '1px solid rgba(115,150,225,.18)' : '1px solid rgba(85,200,135,.16)' }}>
                    <small style={{ display: 'block', color: 'var(--admin-muted-2)', fontSize: 8 }}>КАНДИДАТЫ</small>
                    <strong style={{ color: candidateOnlyClasses.length ? '#8fb5ff' : '#77dda7', fontSize: 12 }}>{candidateOnlyClasses.length}</strong>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, background: missingDonorClasses.length ? 'rgba(215,145,55,.07)' : 'rgba(85,190,125,.06)', border: missingDonorClasses.length ? '1px solid rgba(220,160,65,.18)' : '1px solid rgba(85,200,135,.16)' }}>
                    <small style={{ display: 'block', color: 'var(--admin-muted-2)', fontSize: 8 }}>БЕЗ ДОНОРА</small>
                    <strong style={{ color: missingDonorClasses.length ? '#efc06c' : '#77dda7', fontSize: 12 }}>{missingDonorClasses.length}</strong>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, background: donorErrors.length ? 'rgba(190,75,80,.06)' : 'rgba(85,190,125,.06)', border: donorErrors.length ? '1px solid rgba(220,90,95,.16)' : '1px solid rgba(85,200,135,.16)' }}>
                    <small style={{ display: 'block', color: 'var(--admin-muted-2)', fontSize: 8 }}>ПРОБЛЕМ ЧТЕНИЯ/КЛАССА</small>
                    <strong style={{ color: donorErrors.length ? '#ef9b9b' : '#77dda7', fontSize: 12 }}>{donorErrors.length}</strong>
                  </div>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: selectedDonors.length ? 'rgba(55,180,115,.06)' : 'rgba(215,145,55,.07)',
                    border: selectedDonors.length ? '1px solid rgba(75,200,135,.18)' : '1px solid rgba(225,165,70,.2)',
                  }}
                >
                  <small style={{ display: 'block', color: 'var(--admin-muted-2)', fontSize: 8, marginBottom: 4 }}>
                    КЛАСС ТЕКУЩЕЙ АНКЕТЫ
                  </small>
                  <strong style={{ display: 'block', color: selectedDonors.length ? '#77dda7' : '#efc06c', fontSize: 12 }}>
                    {selectedClassMatch?.name || payload.combat.className || payload.combat.classKey || 'Класс не определён'}
                  </strong>

                  {selectedDonors.length > 0 ? (
                    <div style={{ marginTop: 8, fontSize: 10, color: '#c6cad3', lineHeight: 1.55 }}>
                      Рекомендуемый донор: <b style={{ color: '#d7e6db' }}>{selectedDonors[0].name}</b>
                      {' · '}classSkills: {selectedDonors[0].classSkillsCount}
                      {' · '}заклинаний в ответе: {selectedDonors[0].spellsCount}
                      {selectedDonors.length > 1 && ` · всего кандидатов: ${selectedDonors.length}`}
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, color: '#d7b36e', fontSize: 10, lineHeight: 1.55 }}>
                      Для этого класса подходящий донор среди проверенных персонажей не найден. Если такой персонаж существует, ниже будет видно, почему его класс не сопоставился.
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <small style={{ color: 'var(--admin-muted-2)', fontSize: 9, fontWeight: 800 }}>
                    Покрытие всех классов
                  </small>

                  {donorCoverage.map((gameClass) => (
                    <div
                      key={gameClass.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '24px minmax(150px, 1fr) 70px minmax(190px, 1.4fr)',
                        gap: 8,
                        alignItems: 'center',
                        padding: '7px 9px',
                        borderRadius: 9,
                        background: gameClass.id === selectedClassMatch?.id
                          ? 'rgba(145,95,205,.08)'
                          : 'rgba(255,255,255,.022)',
                        border: gameClass.id === selectedClassMatch?.id
                          ? '1px solid rgba(185,135,235,.18)'
                          : '1px solid var(--admin-line-soft)',
                        fontSize: 9,
                      }}
                    >
                      <span style={{ color: gameClass.donors.length ? '#77dda7' : gameClass.candidates.length ? '#8fb5ff' : '#ef9b9b' }}>
                        {gameClass.donors.length ? '✓' : gameClass.candidates.length ? '?' : '✕'}
                      </span>
                      <strong style={{ color: '#d6d8df' }}>{gameClass.name}</strong>
                      <span style={{ color: gameClass.donors.length ? '#77dda7' : gameClass.candidates.length ? '#8fb5ff' : '#ef9b9b' }}>
                        {gameClass.donors.length
                          ? `${gameClass.donors.length} дон.`
                          : gameClass.candidates.length
                            ? `${gameClass.candidates.length} канд.`
                            : '0 дон.'}
                      </span>
                      <span style={{ color: '#aeb4c0', overflowWrap: 'anywhere' }}>
                        {gameClass.donors.length
                          ? gameClass.donors.map((donor) => donor.name).join(', ')
                          : gameClass.candidates.length
                            ? `${gameClass.candidates.map((donor) => donor.name).join(', ')} — класс распознан, личное дело нужно дочитать`
                            : 'нет найденного персонажа этого класса'}
                      </span>
                    </div>
                  ))}
                </div>

                {donorErrors.length > 0 && (
                  <div style={{ padding: '9px 11px', borderRadius: 10, color: '#d9b76f', background: 'rgba(205,145,55,.06)', border: '1px solid rgba(220,160,65,.16)', fontSize: 9, lineHeight: 1.55 }}>
                    Важно: ошибка чтения не означает, что персонаж не существует или не подходит как донор. Если класс удалось распознать из реестра, он показан как кандидат «?», пока личное дело не прочитается успешно.
                  </div>
                )}

                {donorErrors.length > 0 && (
                  <details style={{ border: '1px solid rgba(220,95,100,.15)', borderRadius: 10, padding: '8px 10px', background: 'rgba(180,60,70,.035)' }}>
                    <summary style={{ cursor: 'pointer', color: '#ef9b9b', fontSize: 10, fontWeight: 800 }}>
                      Показать персонажей с проблемой ({donorErrors.length})
                    </summary>
                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      {donorErrors.map((item) => (
                        <div key={item.characterId} style={{ padding: '7px 9px', borderRadius: 8, background: 'rgba(255,255,255,.02)', color: '#c7cad2', fontSize: 9, lineHeight: 1.5 }}>
                          <b>{item.name}</b> ({item.characterId}) · класс: {item.detailClassName || item.registryClassName || '—'}
                          <br />
                          <span style={{ color: '#ef9b9b' }}>{item.error || 'Неизвестная проблема'}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div style={{ color: '#78dca8', fontSize: 9, fontWeight: 800 }}>
                  ✓ Проверка доноров выполняет только GET-запросы · записей в Google: 0
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: dryRunReady
                ? '1px solid rgba(70,205,145,.24)'
                : '1px solid rgba(215,155,65,.22)',
              background: dryRunReady
                ? 'rgba(45,170,115,.055)'
                : 'rgba(190,130,45,.045)',
              display: candidateCreated ? 'none' : 'grid',
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <strong style={{ color: dryRunReady ? '#7de0ad' : '#efc06c', fontSize: 12 }}>
                  🧪 Полный dry-run создания кандидата
                </strong>
                <span style={{ color: 'var(--admin-muted-2)', fontSize: 10, lineHeight: 1.55, maxWidth: 780 }}>
                  Это симуляция будущей кнопки «Создать кандидата». Она показывает порядок действий и защищённые формулы, но не выполняет ни одной записи в Google.
                </span>
              </div>

              <span
                style={{
                  padding: '6px 9px',
                  borderRadius: 999,
                  fontSize: 9,
                  fontWeight: 900,
                  color: dryRunReady ? '#77dda7' : '#efc06c',
                  background: dryRunReady
                    ? 'rgba(70,190,125,.10)'
                    : 'rgba(220,160,60,.10)',
                  border: dryRunReady
                    ? '1px solid rgba(90,210,145,.22)'
                    : '1px solid rgba(230,175,80,.22)',
                }}
              >
                {realCreationEligible
                  ? 'СИМУЛЯЦИЯ ГОТОВА · СТРУКТУРЫ СОГЛАСОВАНЫ'
                  : dryRunReady
                    ? 'СИМУЛЯЦИЯ ГОТОВА · РЕАЛЬНАЯ ЗАПИСЬ ЗАБЛОКИРОВАНА'
                    : 'ЕЩЁ НЕ ГОТОВ'}
              </span>
            </div>

            {!liveLayout && (
              <div style={{ padding: '10px 12px', borderRadius: 10, color: '#d8b36c', background: 'rgba(205,145,55,.06)', border: '1px solid rgba(220,160,65,.16)', fontSize: 10, lineHeight: 1.55 }}>
                Сначала нажмите «Проверить связь». Dry-run теперь использует реальные свободные строки Google, а не условный <b>r</b>.
              </div>
            )}

            {liveLayout && liveLayout.safeForWritePreparation !== true && (
              <div style={{ padding: '10px 12px', borderRadius: 10, color: '#efc06c', background: 'rgba(205,145,55,.06)', border: '1px solid rgba(220,160,65,.18)', fontSize: 10, lineHeight: 1.55 }}>
                <b>Реальная запись пока заблокирована.</b> {String(liveLayout.warning || 'Три структуры Google пока расходятся.')}
                <br />
                Dry-run при этом можно смотреть: зарезервированный следующий блок — <b>{liveLayout.main?.nextBlock?.startRow ?? '—'}–{liveLayout.main?.nextBlock?.endRow ?? '—'}</b>, строка САЙТ — <b>{liveLayout.registry?.nextRow?.row ?? '—'}</b>.
              </div>
            )}

            {!donorAudit && (
              <div style={{ padding: '10px 12px', borderRadius: 10, color: '#d8b36c', background: 'rgba(205,145,55,.06)', border: '1px solid rgba(220,160,65,.16)', fontSize: 10, lineHeight: 1.55 }}>
                Сначала нажмите «Проверить всех доноров». Dry-run должен опираться на реально существующую рабочую анкету того же класса.
              </div>
            )}

            {donorAudit && !selectedDryRunDonor && (
              <div style={{ padding: '10px 12px', borderRadius: 10, color: '#ef9b9b', background: 'rgba(185,65,70,.06)', border: '1px solid rgba(220,90,95,.16)', fontSize: 10, lineHeight: 1.55 }}>
                Для класса «{selectedClassMatch?.name || payload.combat.className || payload.combat.classKey || '—'}» нет подтверждённого читаемого донора. Реальное создание для этого класса пока блокируем.
              </div>
            )}

            {selectedDryRunDonor && (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: selectedDonors.length > 1 ? 'minmax(210px, 1.2fr) minmax(180px, .8fr)' : '1fr',
                    gap: 10,
                    alignItems: 'end',
                  }}
                >
                  <div style={{ padding: 11, borderRadius: 11, background: 'rgba(255,255,255,.025)', border: '1px solid var(--admin-line-soft)' }}>
                    <small style={{ display: 'block', color: 'var(--admin-muted-2)', fontSize: 8, marginBottom: 4 }}>ДОНОР ДЛЯ СИМУЛЯЦИИ</small>
                    <strong style={{ display: 'block', color: '#d8e7dd', fontSize: 11 }}>
                      {selectedDryRunDonor.name}
                    </strong>
                    <span style={{ display: 'block', color: '#aeb4c0', fontSize: 9, marginTop: 4 }}>
                      ID: {selectedDryRunDonor.characterId} · classSkills: {selectedDryRunDonor.classSkillsCount} · заклинаний в ответе: {selectedDryRunDonor.spellsCount}
                    </span>
                  </div>

                  {selectedDonors.length > 1 && (
                    <label style={{ display: 'grid', gap: 5 }}>
                      <small style={{ color: 'var(--admin-muted-2)', fontSize: 8, fontWeight: 800 }}>ВЫБРАТЬ ДРУГОГО ДОНОРА</small>
                      <select
                        value={selectedDryRunDonor.characterId}
                        onChange={(event) => {
                          setSelectedDonorId(event.target.value);
                          setPrepareResult(null);
                          setPrepareError('');
                        }}
                        style={{
                          width: '100%',
                          border: '1px solid rgba(115,190,150,.22)',
                          background: '#111821',
                          color: '#d8e7dd',
                          borderRadius: 9,
                          padding: '8px 10px',
                          fontSize: 10,
                        }}
                      >
                        {selectedDonors.map((donor) => (
                          <option key={donor.characterId} value={donor.characterId}>
                            {donor.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {dryRunSteps.map((stepItem) => (
                    <article
                      key={stepItem.number}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '34px minmax(0, 1fr)',
                        gap: 10,
                        padding: 11,
                        borderRadius: 11,
                        background: 'rgba(255,255,255,.022)',
                        border: '1px solid var(--admin-line-soft)',
                      }}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 9,
                          display: 'grid',
                          placeItems: 'center',
                          background: 'rgba(80,190,135,.10)',
                          border: '1px solid rgba(95,205,150,.20)',
                          color: '#77dda7',
                          fontWeight: 900,
                          fontSize: 11,
                        }}
                      >
                        {stepItem.number}
                      </div>

                      <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
                        <div>
                          <strong style={{ display: 'block', color: '#e0e3e9', fontSize: 11 }}>
                            {stepItem.title}
                          </strong>
                          <code style={{ color: '#82c8ff', fontSize: 9, overflowWrap: 'anywhere' }}>
                            {stepItem.target}
                          </code>
                        </div>

                        <div style={{ display: 'grid', gap: 4 }}>
                          {stepItem.actions.map((action, actionIndex) => (
                            <div key={actionIndex} style={{ color: '#bfc4cd', fontSize: 9, lineHeight: 1.5 }}>
                              <span style={{ color: '#77dda7' }}>→</span> {action}
                            </div>
                          ))}
                        </div>

                        {stepItem.protected.length > 0 && (
                          <div style={{ display: 'grid', gap: 3, padding: '7px 9px', borderRadius: 8, background: 'rgba(135,85,190,.055)', border: '1px solid rgba(170,115,225,.14)' }}>
                            {stepItem.protected.map((rule, ruleIndex) => (
                              <div key={ruleIndex} style={{ color: '#c8aceb', fontSize: 8.5, lineHeight: 1.45 }}>
                                🟣 {rule}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>

                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(60,175,115,.055)', border: '1px solid rgba(80,195,135,.16)', color: '#a9d9be', fontSize: 9, lineHeight: 1.55 }}>
                  ✓ Симуляция использует реальные данные анкеты и выбранного донора. Запросов на создание, копирование, обновление или удаление Google-таблиц нет. Записей выполнено: 0.
                </div>


                <div
                  style={{
                    padding: 12,
                    borderRadius: 11,
                    background: 'rgba(70,160,115,.045)',
                    border: '1px solid rgba(85,195,140,.18)',
                    display: 'grid',
                    gap: 7,
                  }}
                >
                  <strong style={{ color: '#78dca8', fontSize: 11 }}>
                    🌱 Создание кандидата до экзамена
                  </strong>
                  <span style={{ color: '#c6cdd6', fontSize: 9, lineHeight: 1.55 }}>
                    Сейчас создаются только Google-структура персонажа, класс, магия, биография и стартовые заклинания. Орден, рыцарский ранг, проживание, баллы прокачки, ПЧК и стартовые сбережения НЕ выдаются. Они появятся отдельным действием после экзамена.
                  </span>
                  <div style={{ color: '#9eb3a7', fontSize: 8.5 }}>
                    До экзамена: Орден — пусто · Ранг — пусто · Проживание — пусто · EXP 0 · Баллы 0 · ПЧК 0/0/0 · Сбережения 0.
                  </div>
                </div>


                <div
                  style={{
                    padding: 12,
                    borderRadius: 11,
                    background: 'rgba(60,125,200,.055)',
                    border: '1px solid rgba(90,155,225,.18)',
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 3 }}>
                      <strong style={{ color: '#8bc9ff', fontSize: 11 }}>
                        🛡 Серверная подготовка перед записью
                      </strong>
                      <span style={{ color: 'var(--admin-muted-2)', fontSize: 9, lineHeight: 1.5 }}>
                        Сервер заново читает живую разметку Google, проверяет одобренную анкету и выбранного донора. Это последняя проверка перед созданием кандидата.
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={!dryRunReady || prepareBusy}
                      onClick={() => prepareGoogleCreation(payload, selectedDryRunDonor)}
                      style={{
                        border: '1px solid rgba(105,175,235,.28)',
                        background: !dryRunReady || prepareBusy
                          ? 'rgba(90,100,115,.08)'
                          : 'rgba(65,135,205,.14)',
                        color: !dryRunReady || prepareBusy ? '#87909d' : '#9ed4ff',
                        borderRadius: 10,
                        padding: '8px 11px',
                        fontSize: 9,
                        fontWeight: 900,
                        cursor: !dryRunReady || prepareBusy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {prepareBusy
                        ? 'Проверяю живую систему…'
                        : prepareResult
                          ? 'Проверить заново'
                          : 'Проверить готовность к записи'}
                    </button>
                  </div>

                  {questionnaireStatus !== 'approved' && (
                    <div style={{ color: '#efc06c', fontSize: 9, lineHeight: 1.5 }}>
                      ℹ Сейчас анкета имеет статус «{questionnaireStatus || '—'}». Серверная проверка сработает, но реальную запись разрешит только для статуса <b>approved</b>.
                    </div>
                  )}

                  {prepareError && (
                    <div style={{ padding: '9px 10px', borderRadius: 9, color: '#ef9b9b', background: 'rgba(185,65,70,.07)', border: '1px solid rgba(220,90,95,.18)', fontSize: 9, lineHeight: 1.5 }}>
                      {prepareError}
                    </div>
                  )}

                  {prepareResult && (
                    <div style={{ display: 'grid', gap: 9 }}>
                      <div
                        style={{
                          padding: '10px 11px',
                          borderRadius: 10,
                          background: prepareResult.prepared
                            ? 'rgba(55,175,115,.07)'
                            : 'rgba(205,145,55,.07)',
                          border: prepareResult.prepared
                            ? '1px solid rgba(80,195,135,.18)'
                            : '1px solid rgba(225,165,75,.20)',
                          color: prepareResult.prepared ? '#78dca8' : '#efc06c',
                          fontSize: 9,
                          lineHeight: 1.55,
                        }}
                      >
                        <b>
                          {prepareResult.prepared
                            ? '✓ Сервер подтвердил готовность плана.'
                            : '⚠ Сервер пока не разрешает будущую запись.'}
                        </b>{' '}
                        Записей выполнено: {prepareResult.writesPerformed ?? 0}.
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(150px, 1fr))', gap: 8 }}>
                        <div style={{ padding: 9, borderRadius: 9, border: '1px solid var(--admin-line-soft)', background: 'rgba(255,255,255,.022)', display: 'grid', gap: 3 }}>
                          <small style={{ color: 'var(--admin-muted-2)', fontSize: 8 }}>БУДУЩИЙ characterId</small>
                          <b style={{ color: '#9ed4ff', fontSize: 10, overflowWrap: 'anywhere' }}>
                            {prepareResult.proposed?.characterId || '—'}
                          </b>
                        </div>

                        <div style={{ padding: 9, borderRadius: 9, border: '1px solid var(--admin-line-soft)', background: 'rgba(255,255,255,.022)', display: 'grid', gap: 3 }}>
                          <small style={{ color: 'var(--admin-muted-2)', fontSize: 8 }}>ЦЕЛЕВЫЕ СТРОКИ</small>
                          <b style={{ color: '#d7dbe3', fontSize: 10 }}>
                            {prepareResult.targets?.main?.startRow ?? '—'}–{prepareResult.targets?.main?.endRow ?? '—'} / САЙТ {prepareResult.targets?.registry?.row ?? '—'}
                          </b>
                        </div>

                        <div style={{ padding: 9, borderRadius: 9, border: '1px solid var(--admin-line-soft)', background: 'rgba(255,255,255,.022)', display: 'grid', gap: 3 }}>
                          <small style={{ color: 'var(--admin-muted-2)', fontSize: 8 }}>ОТПЕЧАТОК ПЛАНА</small>
                          <code style={{ color: '#c8aceb', fontSize: 8.5, overflowWrap: 'anywhere' }}>
                            {prepareResult.fingerprint || '—'}
                          </code>
                        </div>
                      </div>

                      {Array.isArray(prepareResult.checks) && prepareResult.checks.length > 0 && (
                        <div style={{ display: 'grid', gap: 5 }}>
                          {prepareResult.checks.map((check) => (
                            <div
                              key={check.id}
                              style={{
                                padding: '7px 9px',
                                borderRadius: 8,
                                background: check.ok
                                  ? 'rgba(55,175,115,.045)'
                                  : 'rgba(190,75,75,.05)',
                                border: check.ok
                                  ? '1px solid rgba(80,195,135,.12)'
                                  : '1px solid rgba(220,90,95,.14)',
                                color: check.ok ? '#acd9bd' : '#efaaaa',
                                fontSize: 8.5,
                                lineHeight: 1.45,
                              }}
                            >
                              <b>{check.ok ? '✓' : '✕'} {check.label}</b> — {check.message}
                            </div>
                          ))}
                        </div>
                      )}

                      {Array.isArray(prepareResult.blockers) && prepareResult.blockers.length > 0 && (
                        <div style={{ padding: '9px 10px', borderRadius: 9, background: 'rgba(185,65,70,.055)', border: '1px solid rgba(220,90,95,.16)', color: '#efaaaa', fontSize: 8.5, lineHeight: 1.5 }}>
                          <b>Что блокирует запись:</b>
                          <div style={{ display: 'grid', gap: 3, marginTop: 5 }}>
                            {prepareResult.blockers.map((blocker, index) => (
                              <span key={index}>• {blocker}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}


                  {prepareResult?.prepared && (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 11,
                        border: '1px solid rgba(225,90,95,.24)',
                        background: 'rgba(185,55,65,.055)',
                        display: 'grid',
                        gap: 9,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'grid', gap: 3 }}>
                          <strong style={{ color: '#efaaaa', fontSize: 10.5 }}>
                            🔴 Настоящее создание кандидата
                          </strong>
                          <span style={{ color: '#c9ced6', fontSize: 8.5, lineHeight: 1.5 }}>
                            Эта кнопка создаст кандидата в живых Google-таблицах. Орден, ранг, проживание и экзаменационные награды останутся невыданными.
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={createBusy || Boolean(createResult?.created?.characterId)}
                          onClick={createGoogleCharacter}
                          style={{
                            borderRadius: 9,
                            border: '1px solid rgba(235,105,110,.35)',
                            background: createBusy || createResult?.created?.characterId
                              ? 'rgba(255,255,255,.04)'
                              : 'rgba(190,60,70,.16)',
                            color: createBusy || createResult?.created?.characterId
                              ? '#8d949f'
                              : '#ffb4b7',
                            padding: '8px 12px',
                            fontSize: 9,
                            fontWeight: 900,
                            cursor: createBusy || createResult?.created?.characterId
                              ? 'not-allowed'
                              : 'pointer',
                          }}
                        >
                          {createBusy
                            ? 'Создаю...'
                            : createResult?.created?.characterId
                              ? '✓ Кандидат создан'
                              : 'Создать кандидата'}
                        </button>
                      </div>

                      <div style={{ color: '#efc06c', fontSize: 8.5, lineHeight: 1.5 }}>
                        Перед записью Apps Script ещё раз проверит свободные строки и донора. Лист САЙТ записывается последним.
                      </div>

                      {createNotice && (
                        <div style={{ padding: '8px 9px', borderRadius: 8, background: 'rgba(65,145,215,.07)', border: '1px solid rgba(90,165,230,.20)', color: '#9fd0f5', fontSize: 8.5, lineHeight: 1.5 }}>
                          {createNotice}
                        </div>
                      )}

                      {createError && (
                        <div style={{ padding: '8px 9px', borderRadius: 8, background: 'rgba(185,65,70,.075)', border: '1px solid rgba(225,95,100,.20)', color: '#efaaaa', fontSize: 8.5, lineHeight: 1.5 }}>
                          {createError}
                        </div>
                      )}

                      {createResult?.created && (
                        <div style={{ padding: '9px 10px', borderRadius: 9, background: 'rgba(55,175,115,.07)', border: '1px solid rgba(80,195,135,.20)', display: 'grid', gap: 5 }}>
                          <b style={{ color: '#78dca8', fontSize: 9.5 }}>
                            ✓ Кандидат создан: {createResult.created.name || createResult.created.characterId}
                          </b>

                          <div style={{ color: '#c9d8cf', fontSize: 8.5, lineHeight: 1.55 }}>
                            characterId: <b>{createResult.created.characterId || '—'}</b> ·
                            Основная: <b>{createResult.created.mainRows?.start ?? '—'}–{createResult.created.mainRows?.end ?? '—'}</b> ·
                            Система: <b>{createResult.created.systemRows?.start ?? '—'}–{createResult.created.systemRows?.end ?? '—'}</b> ·
                            САЙТ: <b>{createResult.created.registryRow ?? '—'}</b>
                          </div>

                          {createResult.created.spreadsheetUrl && (
                            <a
                              href={createResult.created.spreadsheetUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#9ed4ff', fontSize: 8.5, overflowWrap: 'anywhere' }}
                            >
                              Открыть новую личную Google-таблицу
                            </a>
                          )}

                          <div style={{ color: createResult.verification?.ok ? '#78dca8' : '#efc06c', fontSize: 8.5 }}>
                            Контроль: {createResult.verification?.message || 'результат не получен'}
                          </div>

                          {Array.isArray(createResult.warnings) && createResult.warnings.length > 0 && (
                            <div style={{ display: 'grid', gap: 3, color: '#efc06c', fontSize: 8 }}>
                              {createResult.warnings.map((warning, index) => (
                                <span key={index}>• {warning}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ color: '#78dca8', fontSize: 8.5, fontWeight: 800 }}>
                    ✓ До нажатия красной кнопки этот этап только читает и проверяет · Google-записей: 0
                  </div>
                </div>
              </>
            )}
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: ready
                ? '1px solid rgba(85,200,135,.25)'
                : '1px solid rgba(230,170,70,.28)',
              background: ready
                ? 'rgba(50,175,115,.06)'
                : 'rgba(215,155,55,.07)',
            }}
          >
            <strong
              style={{
                display: 'block',
                color: ready ? '#78dca8' : '#efc06c',
                fontSize: 12,
                marginBottom: 5,
              }}
            >
              {ready
                ? '✓ Структурированные данные анкеты проходят текущую проверку.'
                : '⚠ В анкете есть данные, которые нужно исправить до реального переноса.'}
            </strong>

            <span
              style={{
                color: 'var(--admin-muted-2)',
                fontSize: 11,
                lineHeight: 1.55,
              }}
            >
              На этом этапе Google API не вызывается. Никакие таблицы, формулы, листы или ссылки не изменяются.
            </span>
          </div>

          {issues.length > 0 && (
            <div style={{ display: 'grid', gap: 7 }}>
              <strong style={{ fontSize: 12, color: '#efc06c' }}>
                Что мешает безопасному переносу
              </strong>

              {issues.map((issue, index) => (
                <div
                  key={`${issue.field}-${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(150px, 230px) 1fr',
                    gap: 10,
                    padding: '9px 11px',
                    borderRadius: 10,
                    background: 'rgba(210,145,55,.055)',
                    border: '1px solid rgba(220,160,65,.16)',
                  }}
                >
                  <code
                    style={{
                      color: '#e7b963',
                      fontSize: 10,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {issue.field}
                  </code>
                  <span style={{ color: '#c9cbd3', fontSize: 11 }}>
                    {issue.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(Object.keys(KIND_META) as PreviewKind[]).map((kind) => {
            const meta = KIND_META[kind];
            const items = grouped[kind];

            if (items.length === 0) return null;

            return (
              <div key={kind} style={{ display: 'grid', gap: 9 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <strong style={{ color: meta.color, fontSize: 12 }}>
                    {meta.icon} {meta.label}
                  </strong>
                  <span style={{ color: 'var(--admin-muted-2)', fontSize: 10 }}>
                    {items.length}
                  </span>
                </div>

                <div style={{ display: 'grid', gap: 7 }}>
                  {items.map((item, index) => (
                    <article
                      key={`${kind}-${item.source}-${index}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(135px, .8fr) minmax(180px, 1.15fr) minmax(190px, 1.15fr)',
                        gap: 12,
                        padding: 11,
                        borderRadius: 12,
                        background: meta.background,
                        border: `1px solid ${meta.color}25`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <small
                          style={{
                            display: 'block',
                            color: 'var(--admin-muted-2)',
                            fontSize: 9,
                            marginBottom: 4,
                          }}
                        >
                          ПОЛЕ
                        </small>
                        <strong
                          style={{
                            display: 'block',
                            color: 'var(--admin-text)',
                            fontSize: 11,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {item.source}
                        </strong>
                        <span
                          style={{
                            display: 'block',
                            color: '#bfc3cc',
                            fontSize: 10,
                            lineHeight: 1.45,
                            marginTop: 5,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {item.value || '—'}
                        </span>
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <small
                          style={{
                            display: 'block',
                            color: 'var(--admin-muted-2)',
                            fontSize: 9,
                            marginBottom: 4,
                          }}
                        >
                          ЦЕЛЬ
                        </small>
                        <code
                          style={{
                            color: meta.color,
                            fontSize: 10,
                            lineHeight: 1.5,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {item.target}
                        </code>
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <small
                          style={{
                            display: 'block',
                            color: 'var(--admin-muted-2)',
                            fontSize: 9,
                            marginBottom: 4,
                          }}
                        >
                          ПРАВИЛО
                        </small>
                        <span
                          style={{
                            color: '#bfc3cc',
                            fontSize: 10,
                            lineHeight: 1.5,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {item.note}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}

          <div
            style={{
              padding: '11px 13px',
              borderRadius: 12,
              background: 'rgba(120,85,185,.07)',
              border: '1px solid rgba(150,110,215,.16)',
              color: '#bfc3cc',
              fontSize: 10,
              lineHeight: 1.6,
            }}
          >
            <b style={{ color: '#cba4ff' }}>Важно:</b>{' '}
            символ <code>r</code> пока означает будущую первую строку нового блока персонажа.
            Точный номер строки будет вычисляться только на этапе реальной автоматизации после чтения живой Google-таблицы.
          </div>
        </div>
      )}
    </section>
  );
}
