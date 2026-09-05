import {
  getStore,
} from '@netlify/blobs';

import {
  createHash,
} from 'node:crypto';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';


const QUESTIONNAIRE_STORE =
  'gosmag-questionnaires';

const PLAN_STORE =
  'gosmag-google-create-plans';

const PLAN_LIFETIME_MS =
  15 * 60 * 1000;

const REQUEST_TIMEOUT_MS =
  50_000;


/*
  Класс больше не определяется по персонажу-донору.

  В системной таблице [🕸] Черный клевер СИСТЕМА → «Классы»
  формулы 19 игровых классов уже лежат в отдельных колонках E:W.
  Поэтому для создания достаточно знать canonical classId; существующий
  персонаж нужен только как технический каркас Google Spreadsheet.
*/
const CLASS_FORMULA_PROFILES = Object.freeze({
  tank: { number: 1, column: 'E' },
  assassin: { number: 2, column: 'F' },
  alchemist: { number: 3, column: 'G' },
  bruiser: { number: 4, column: 'H' },
  debuffer: { number: 5, column: 'I' },
  healer_buffer: { number: 6, column: 'J' },
  summoner_dps: { number: 7, column: 'K' },
  summoner_sup: { number: 8, column: 'L' },
  summoner_multi: { number: 9, column: 'M' },
  buffer: { number: 10, column: 'N' },
  support_x3: { number: 11, column: 'O' },
  support_x3_alchemist: { number: 12, column: 'P' },
  buffer_alchemist: { number: 13, column: 'Q' },
  debuffer_alchemist: { number: 14, column: 'R' },
  dps: { number: 15, column: 'S' },
  healer: { number: 16, column: 'T' },
  healer_debuffer: { number: 17, column: 'U' },
  healer_alchemist: { number: 18, column: 'V' },
  buffer_debuffer: { number: 19, column: 'W' },
});


function loadCharacterServiceUrl() {
  const value = String(
    process.env.CHARACTER_SERVICE_URL || ''
  ).trim();

  if (!value) {
    throw new Error(
      'Не задан CHARACTER_SERVICE_URL'
    );
  }

  return value;
}


function asRecord(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}


function cleanText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}


function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/ё/g, 'е');
}


function normalizeClassName(value) {
  let normalized =
    normalizeText(value)
      .replace(/хиллер/g, 'хилер')
      .replace(/бафер/g, 'баффер')
      .replace(/саппорт/g, 'сапорт');


  /*
    Если в русском названии класса случайно
    оказались латинские буквы, визуально
    похожие на кириллицу, исправляем их.

    Например:
    Дaмaгер -> Дамагер
  */
  if (
    /[а-я]/i.test(
      normalized
    )
  ) {
    normalized =
      normalized
        .replace(/a/g, 'а')
        .replace(/c/g, 'с')
        .replace(/e/g, 'е')
        .replace(/o/g, 'о')
        .replace(/p/g, 'р')
        .replace(/x/g, 'х')
        .replace(/y/g, 'у')
        .replace(/k/g, 'к')
        .replace(/m/g, 'м')
        .replace(/t/g, 'т');
  }


  return normalized
    .replace(
      /сапорт\s*[xх×]\s*3/g,
      'сапорт3'
    )
    .replace(
      /сапорт[хx]3/g,
      'сапорт3'
    )
    .replace(
      /[^a-zа-я0-9]+/gi,
      ''
    );
}


/* ============================================================
   КАНОНИЧЕСКИЙ ID КЛАССА

   Примеры:

   👊 Дамагер
   Дамагер
   Домагер
   dps

   -> всё это один класс: dps
   ============================================================ */

function classIdentity(value) {
  const rawId =
    cleanText(value)
      .toLowerCase();


  const directIds =
    new Set([
      'tank',
      'assassin',
      'alchemist',
      'bruiser',
      'debuffer',
      'healer_buffer',
      'summoner_dps',
      'summoner_sup',
      'summoner_multi',
      'buffer',
      'support_x3',
      'support_x3_alchemist',
      'buffer_alchemist',
      'debuffer_alchemist',
      'dps',
      'healer',
      'healer_debuffer',
      'healer_alchemist',
      'buffer_debuffer',
    ]);


  if (
    directIds.has(
      rawId
    )
  ) {
    return rawId;
  }


  const normalized =
    normalizeClassName(
      value
    );


  const aliases = {
    танк:
      'tank',

    убийца:
      'assassin',

    знахарь:
      'alchemist',

    брузер:
      'bruiser',

    дебаффер:
      'debuffer',

    хилербаффер:
      'healer_buffer',

    призывательдд:
      'summoner_dps',

    призывательсап:
      'summoner_sup',

    призывательмульти:
      'summoner_multi',

    баффер:
      'buffer',

    сапорт3:
      'support_x3',

    сапорт3знахарь:
      'support_x3_alchemist',

    бафферзнахарь:
      'buffer_alchemist',

    дебафферзнахарь:
      'debuffer_alchemist',

    дамагер:
      'dps',

    домагер:
      'dps',

    дд:
      'dps',

    хилер:
      'healer',

    хилердебаффер:
      'healer_debuffer',

    хилерзнахарь:
      'healer_alchemist',

    баффердебаффер:
      'buffer_debuffer',
  };


  return (
    aliases[
      normalized
    ] ||
    normalized
  );
}


function normalizeCharacterId(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(
      /[^a-z0-9_-]/g,
      ''
    );
}


const TRANSLIT = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};


function slugifyName(value) {
  const lower =
    cleanText(value)
      .toLowerCase();

  let transliterated =
    '';

  for (
    const char
    of lower
  ) {
    transliterated +=
      Object.prototype
        .hasOwnProperty
        .call(
          TRANSLIT,
          char
        )
        ? TRANSLIT[
            char
          ]
        : char;
  }

  return transliterated
    .replace(
      /[^a-z0-9]+/g,
      '-'
    )
    .replace(
      /^-+|-+$/g,
      ''
    )
    .slice(
      0,
      42
    ) ||
    'character';
}


function chooseUniqueCharacterId(
  name,
  registryCharacters
) {
  const used =
    new Set(
      registryCharacters
        .map(
          item =>
            normalizeCharacterId(
              item
                ?.characterId ||
              item?.id
            )
        )
        .filter(
          Boolean
        )
    );

  const base =
    slugifyName(
      name
    );

  if (
    !used.has(base)
  ) {
    return base;
  }

  for (
    let suffix = 2;
    suffix < 1000;
    suffix += 1
  ) {
    const candidate =
      `${base}-${suffix}`;

    if (
      !used.has(
        candidate
      )
    ) {
      return candidate;
    }
  }

  return (
    `${base}-${Date.now()}`
  );
}


function isValidQuestionnaireKey(
  key
) {
  /*
    Разрешаем любой безопасный ключ внутри namespace submissions/.
    Это сохраняет защиту от выхода в другие Blob-пространства,
    но не привязывает жизненный цикл/prepare к одному формату UUID.
  */
  return (
    /^submissions\/[A-Za-z0-9._-]+$/
      .test(
        cleanText(
          key
        )
      )
  );
}


async function fetchServiceJson(
  baseUrl,
  params,
  label
) {
  const url =
    new URL(
      baseUrl
    );

  Object.entries(
    params
  ).forEach(
    (
      [
        key,
        value,
      ]
    ) => {
      const clean =
        cleanText(
          value
        );

      if (clean) {
        url
          .searchParams
          .set(
            key,
            clean
          );
      }
    }
  );


  url.searchParams.set(
    '_',
    String(
      Date.now()
    )
  );


  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS
    );


  const startedAt =
    Date.now();


  try {
    const response =
      await fetch(
        url.toString(),
        {
          method:
            'GET',

          headers: {
            accept:
              'application/json',
          },

          cache:
            'no-store',

          redirect:
            'follow',

          signal:
            controller.signal,
        }
      );


    const text =
      await response.text();


    if (!response.ok) {
      throw new Error(
        `${label}: HTTP ${response.status}${
          text
            ? ` — ${text.slice(
                0,
                260
              )}`
            : ''
        }`
      );
    }


    let data;


    try {
      data =
        JSON.parse(
          text
        );
    } catch {
      throw new Error(
        `${label}: сервис вернул не JSON: ${
          text.slice(
            0,
            260
          ) ||
          'пустой ответ'
        }`
      );
    }


    if (
      data?.ok !==
      true
    ) {
      throw new Error(
        `${label}: ${cleanText(
          data?.error ||
          'неизвестная ошибка'
        )}`
      );
    }


    return {
      data,

      elapsedMs:
        Date.now() -
        startedAt,
    };

  } catch (
    error
  ) {

    if (
      error &&
      typeof error ===
        'object' &&
      error.name ===
        'AbortError'
    ) {
      throw new Error(
        `${label}: превышено время ожидания ${REQUEST_TIMEOUT_MS} мс`
      );
    }


    throw error;

  } finally {
    clearTimeout(
      timer
    );
  }
}


function integerValue(value, fallback = 0) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return fallback;
  }

  return Math.trunc(number);
}


function normalizeCreationSettings(value) {
  const source =
    asRecord(value);

  return {
    squad:
      cleanText(
        source.squad
      ),

    rank:
      cleanText(
        source.rank
      ),

    housing:
      cleanText(
        source.housing
      ) || 'Нахлебник',

    experience:
      integerValue(
        source.experience,
        0
      ),

    upgradePoints:
      integerValue(
        source.upgradePoints,
        0
      ),

    pchk: {
      protection:
        integerValue(
          asRecord(source.pchk)
            .protection,
          0
        ),

      senses:
        integerValue(
          asRecord(source.pchk)
            .senses,
          0
        ),

      control:
        integerValue(
          asRecord(source.pchk)
            .control,
          0
        ),
    },

    /*
      Эти значения при создании нового персонажа
      не наследуются от донора.
    */
    money: {
      extraIncome: 0,
      extraExpenses: 0,
      savings: 0,
    },

    active: true,
    theme: 'default',
  };
}


function validateCreationSettings(
  settings
) {
  const blockers = [];

  if (
    !cleanText(
      settings.squad
    )
  ) {
    blockers.push(
      'Параметры создания: не указан отряд.'
    );
  }

  if (
    !cleanText(
      settings.rank
    )
  ) {
    blockers.push(
      'Параметры создания: не указано звание.'
    );
  }

  if (
    !cleanText(
      settings.housing
    )
  ) {
    blockers.push(
      'Параметры создания: не указано проживание.'
    );
  }

  const integerRules = [
    [
      'Стартовый опыт',
      settings.experience,
      0,
      null,
    ],

    [
      'Баллы прокачки',
      settings.upgradePoints,
      0,
      null,
    ],

    [
      'Покров',
      settings.pchk.protection,
      0,
      100,
    ],

    [
      'Чувство',
      settings.pchk.senses,
      0,
      200,
    ],

    [
      'Контроль',
      settings.pchk.control,
      0,
      500,
    ],
  ];

  for (
    const [
      label,
      number,
      min,
      max,
    ] of integerRules
  ) {
    if (
      !Number.isInteger(number) ||
      number < min ||
      (
        max !== null &&
        number > max
      )
    ) {
      blockers.push(
        max === null
          ? `Параметры создания: «${label}» должно быть целым числом не меньше ${min}.`
          : `Параметры создания: «${label}» должно быть целым числом от ${min} до ${max}.`
      );
    }
  }

  return blockers;
}


function validatePayload(
  payload
) {
  const blockers =
    [];

  const character =
    asRecord(
      payload.character
    );

  const appearance =
    asRecord(
      payload.appearance
    );

  const magic =
    asRecord(
      payload.magic
    );

  const combat =
    asRecord(
      payload.combat
    );

  const spells =
    Array.isArray(
      payload.spells
    )
      ? payload.spells
      : [];


  const required = [
    [
      'Имя персонажа',
      character.name,
    ],

    [
      'Ссылка игрока',
      character.playerLink,
    ],

    [
      'Биография',
      character.biography,
    ],

    [
      'Весовая категория',
      appearance.weightCategory,
    ],

    [
      'Телосложение',
      appearance.bodyType,
    ],

    [
      'Название магии',
      magic.name,
    ],

    [
      'Класс',
      combat.className ||
      combat.classKey,
    ],
  ];


  for (
    const [
      label,
      value,
    ] of required
  ) {
    if (
      !cleanText(
        value
      )
    ) {
      blockers.push(
        `${label}: обязательное поле пустое.`
      );
    }
  }


  if (
    ![
      'худоба',
      'обычный',
      'плотный',
      'полнота',
      'ожирение',
    ].includes(
      normalizeText(
        appearance
          .weightCategory
      )
    )
  ) {
    blockers.push(
      'Весовая категория не соответствует значениям существующей Google-системы.'
    );
  }


  if (
    ![
      'слабое',
      'обычное',
      'подтянутое',
      'рельефное',
      'атлетическое',
    ].includes(
      normalizeText(
        appearance
          .bodyType
      )
    )
  ) {
    blockers.push(
      'Телосложение не соответствует значениям существующей Google-системы.'
    );
  }


  if (
    spells.length <
      1 ||
    spells.length >
      3
  ) {
    blockers.push(
      'Должно быть от 1 до 3 стартовых заклинаний.'
    );
  }


  const allowedCastTimes = [
    '1 действие',
    '1 реакция',
    '1 круг подготовки',
    '2 круга подготовки',
    '3 круга подготовки',
  ];

  const allowedTargets = [
    'На себя',
    '1 враг',
    '1 союзник',
    'Любая 1 цель',
    'Несколько целей',
    'Точка / область',
  ];

  const allowedAreas = [
    'Одна цель',
    'Круг',
    'Конус',
    'Линия',
    'Вокруг себя',
  ];

  const allowedDurations = [
    'Мгновенно',
    'Ходы',
    'До конца боя',
    'До снятия',
  ];

  const allowedForms = [
    'Направленное',
    'На себя',
    'Область',
    'Аура',
    'Трансформация',
    'Перемещение',
    'Призыв',
    'Создание / барьер',
    'Особое',
  ];

  const targetsByForm = {
    'На себя': ['На себя'],
    'Аура': ['На себя'],
    'Трансформация': ['На себя', '1 союзник', 'Любая 1 цель'],
    'Перемещение': ['На себя', '1 союзник', '1 враг', 'Любая 1 цель'],
    'Призыв': ['Точка / область', 'На себя'],
    'Область': ['Точка / область', 'На себя'],
    'Создание / барьер': ['На себя', '1 союзник', 'Любая 1 цель', 'Точка / область'],
    'Особое': allowedTargets,
    'Направленное': ['1 враг', '1 союзник', 'Любая 1 цель', 'Несколько целей'],
  };

  spells.forEach(
    (
      rawSpell,
      index
    ) => {
      const spell = asRecord(rawSpell);
      const prefix = `Заклинание ${index + 1}:`;
      const powerType = cleanText(spell.powerType);
      const form = cleanText(spell.form);
      const target = cleanText(spell.target);
      const area = cleanText(spell.area);

      if (
        Number(spell.schemaVersion) !== 3 ||
        spell.legacy === true
      ) {
        blockers.push(
          `${prefix} старый формат. Откройте анкету и сохраните заклинание в текущей версии.`
        );
      }

      if (!cleanText(spell.name)) {
        blockers.push(`${prefix} нет названия.`);
      }

      if (!powerType) {
        blockers.push(`${prefix} не указан тип.`);
      }

      if (!allowedForms.includes(form)) {
        blockers.push(`${prefix} не выбран способ применения.`);
      }

      if (!allowedCastTimes.includes(cleanText(spell.castTime))) {
        blockers.push(`${prefix} не выбрано стандартное время каста.`);
      }

      if (!allowedTargets.includes(target)) {
        blockers.push(`${prefix} не выбрана цель.`);
      } else if (allowedForms.includes(form)) {
        const allowedForForm = targetsByForm[form] || allowedTargets;
        if (!allowedForForm.includes(target)) {
          blockers.push(`${prefix} выбранная цель не подходит способу применения «${form}».`);
        }
      }

      const rangeMeters = Number(spell.rangeMeters);
      const needsRange = target !== 'На себя' && !['На себя', 'Аура', 'Особое'].includes(form);

      if (
        needsRange &&
        (!Number.isFinite(rangeMeters) || rangeMeters < 0)
      ) {
        blockers.push(`${prefix} не указана дальность в метрах.`);
      }

      if (!allowedAreas.includes(area)) {
        blockers.push(`${prefix} не выбрана область.`);
      }

      const areaMeters = Number(spell.areaMeters);
      const needsArea = form === 'Область' || form === 'Аура' || (form === 'Создание / барьер' && area !== 'Одна цель');

      if (
        needsArea &&
        (!Number.isFinite(areaMeters) || areaMeters <= 0)
      ) {
        blockers.push(`${prefix} для области нужен размер в метрах.`);
      }

      if (form === 'Перемещение') {
        const movementMeters = Number(spell.movementMeters);
        if (!Number.isFinite(movementMeters) || movementMeters <= 0) {
          blockers.push(`${prefix} укажите дистанцию перемещения в метрах.`);
        }
      }

      if (form === 'Призыв') {
        const summonCount = Number(spell.summonCount);
        if (!Number.isInteger(summonCount) || summonCount < 1) {
          blockers.push(`${prefix} укажите количество призываемых существ.`);
        }
      }

      const durationMode = cleanText(spell.durationMode);

      if (!allowedDurations.includes(durationMode)) {
        blockers.push(`${prefix} не выбрана длительность.`);
      }

      const durationRounds = Number(spell.durationRounds);

      if (
        durationMode === 'Ходы' &&
        (!Number.isInteger(durationRounds) || durationRounds < 1)
      ) {
        blockers.push(`${prefix} укажите количество ходов.`);
      }

      if (!cleanText(spell.effect)) {
        blockers.push(`${prefix} не описан эффект.`);
      }

      if (powerType !== 'Без расчёта') {
        const basePower = Number(spell.basePower);
        if (!Number.isInteger(basePower) || basePower < 1 || basePower > 20) {
          blockers.push(`${prefix} не закреплена базовая сила d20 (1–20).`);
        }
      }

      if (target !== 'На себя' && spell.hitReviewed !== true) {
        blockers.push(`${prefix} мастер не подтвердил правило попадания.`);
      }

      if (typeof spell.requiresHit !== 'boolean') {
        blockers.push(`${prefix} правило попадания сохранено некорректно.`);
      }
    }
  );


  return blockers;
}


function makeCheck(
  id,
  label,
  ok,
  message
) {
  return {
    id,
    label,

    ok:
      Boolean(
        ok
      ),

    message:
      cleanText(
        message
      ),
  };
}


export default async function (
  request
) {

  if (
    request.method !==
    'POST'
  ) {
    return json(
      {
        ok: false,

        error:
          'Метод не поддерживается',
      },
      405
    );
  }


  try {

    const session =
      readSession(
        request
      );


    if (!session) {
      return json(
        {
          ok: false,

          error:
            'Сначала войдите в систему',
        },
        401
      );
    }


    if (
      session.role !==
      'admin'
    ) {
      return json(
        {
          ok: false,

          error:
            'Недостаточно прав',
        },
        403
      );
    }


    const body =
      await request
        .json()
        .catch(
          () => ({})
        );


    const questionnaireKey =
      cleanText(
        body
          ?.questionnaireKey
      );


    const questionnaireId =
      cleanText(
        body
          ?.questionnaireId
      );


    const requestedTemplateCharacterId =
      normalizeCharacterId(
        body
          ?.donorCharacterId
      );


    const payload =
      asRecord(
        body?.payload
      );


    if (
      !isValidQuestionnaireKey(
        questionnaireKey
      )
    ) {
      return json(
        {
          ok: false,

          error:
            'Некорректный ключ анкеты',
        },
        400
      );
    }


    const questionnaireStore =
      getStore({
        name:
          QUESTIONNAIRE_STORE,

        consistency:
          'strong',
      });


    const questionnaire =
      await questionnaireStore.get(
        questionnaireKey,
        {
          type:
            'json',

          consistency:
            'strong',
        }
      );


    if (
      !questionnaire
    ) {
      return json(
        {
          ok: false,

          error:
            'Анкета не найдена',
        },
        404
      );
    }


    if (
      questionnaireId &&
      cleanText(
        questionnaire.id
      ) &&
      cleanText(
        questionnaire.id
      ) !==
        questionnaireId
    ) {
      return json(
        {
          ok: false,

          error:
            'ID анкеты не совпадает с сохранённой анкетой',
        },
        409
      );
    }


    const serviceUrl =
      loadCharacterServiceUrl();


    const [
      registryResult,
      layoutResult,
    ] =
      await Promise.all([
        fetchServiceJson(
          serviceUrl,
          {
            action:
              'list',
          },
          'Реестр'
        ),

        fetchServiceJson(
          serviceUrl,
          {
            action:
              'layout',
          },
          'Разметка таблиц'
        ),
      ]);


    const registry =
      registryResult.data;


    const layout =
      layoutResult.data;


    const registryCharacters =
      Array.isArray(
        registry.characters
      )
        ? registry.characters
        : [];


    const payloadCombat =
      asRecord(
        payload.combat
      );


    const payloadCharacter =
      asRecord(
        payload.character
      );


    const targetClassName =
      cleanText(
        payloadCombat
          .className ||
        payloadCombat
          .classKey
      );


    const targetClassIdentity =
      classIdentity(
        targetClassName
      );


    const templateClassOverrides = {
      anet: 'tank',
      evtida: 'dps',
    };


    /*
      v42.7: технический шаблон больше НЕ обязан быть того же класса.

      Сначала всё ещё предпочитаем шаблон того же класса — это самый
      консервативный путь для старых персонажей. Но если такого класса
      в реестре ещё нет, берём любой активный рабочий Spreadsheet.

      Класс нового персонажа задаётся отдельно через targetClassIdentity
      и CLASS_FORMULA_PROFILES. Поле donorCharacterId оставлено только
      как legacy-имя для совместимости с Google writer: фактически это
      templateCharacterId, а не источник класса.
    */
    const templateCandidates =
      registryCharacters
        .filter(
          item =>
            item?.active !== false &&
            Boolean(
              normalizeCharacterId(
                item?.characterId ||
                item?.id
              )
            )
        )
        .sort(
          (left, right) => {
            const leftId =
              normalizeCharacterId(
                left?.characterId ||
                left?.id
              );

            const rightId =
              normalizeCharacterId(
                right?.characterId ||
                right?.id
              );

            if (
              requestedTemplateCharacterId &&
              leftId === requestedTemplateCharacterId
            ) {
              return -1;
            }

            if (
              requestedTemplateCharacterId &&
              rightId === requestedTemplateCharacterId
            ) {
              return 1;
            }

            const leftClass =
              templateClassOverrides[leftId] ||
              classIdentity(left?.className);

            const rightClass =
              templateClassOverrides[rightId] ||
              classIdentity(right?.className);

            const leftSameClass =
              leftClass === targetClassIdentity;

            const rightSameClass =
              rightClass === targetClassIdentity;

            if (leftSameClass !== rightSameClass) {
              return leftSameClass ? -1 : 1;
            }

            /* Проверенные старые шаблоны используем как запасной каркас. */
            const stableOrder = ['anet', 'evtida'];
            const leftStable = stableOrder.indexOf(leftId);
            const rightStable = stableOrder.indexOf(rightId);

            if (leftStable !== rightStable) {
              if (leftStable >= 0) return -1;
              if (rightStable >= 0) return 1;
            }

            return cleanText(left?.name)
              .localeCompare(
                cleanText(right?.name),
                'ru'
              );
          }
        );


    let donorRegistryEntry =
      null;

    let donorResult = {
      data: {},
      elapsedMs: 0,
    };


    for (
      const candidate
      of templateCandidates
    ) {
      const candidateId =
        normalizeCharacterId(
          candidate?.characterId ||
          candidate?.id
        );

      if (!candidateId) {
        continue;
      }

      try {
        const detail =
          await fetchServiceJson(
            serviceUrl,
            {
              characterId:
                candidateId,
            },
            'Технический шаблон'
          );

        /*
          Для каркаса достаточно, что личное дело читается. Его класс
          больше не является условием выбора — целевой класс будет
          назначен отдельно после копирования Spreadsheet.
        */
        donorRegistryEntry =
          candidate;
        donorResult =
          detail;
        break;
      } catch (_) {
        /*
          Публичное чтение личного дела иногда даёт HTTP 500, хотя
          сама таблица доступна Apps Script на запись. Для технического
          каркаса этого достаточно: класс нового персонажа не наследуем.
        */
        donorRegistryEntry =
          candidate;
        donorResult = {
          data: {
            character: {
              name:
                cleanText(
                  candidate?.name
                ),
              className:
                cleanText(
                  candidate?.className
                ),
            },
          },
          elapsedMs: 0,
        };
        break;
      }
    }


    const donorCharacterId =
      normalizeCharacterId(
        donorRegistryEntry
          ?.characterId ||
        donorRegistryEntry
          ?.id
      );


    const donorData =
      donorResult.data;


    const donorClassName =
      cleanText(
        donorData
          ?.character
          ?.className ||
        donorRegistryEntry
          ?.className
      );


    const questionnaireStatus =
      cleanText(
        questionnaire.status
      );


    const payloadBlockers =
      validatePayload(
        payload
      );


    const masterDecisionBlockers =
      payloadBlockers.filter(
        item =>
          /мастер не подтвердил правило попадания/i.test(
            String(item || '')
          )
      );


    const coreBlockers =
      payloadBlockers.filter(
        item =>
          !/мастер не подтвердил правило попадания/i.test(
            String(item || '')
          )
      );


    const checks =
      [];


    checks.push(
      makeCheck(
        'questionnaire-approved',

        'Анкета одобрена',

        questionnaireStatus ===
          'approved',

        questionnaireStatus ===
          'approved'
          ? 'Статус анкеты: approved.'
          : `Текущий статус: ${questionnaireStatus || 'не указан'}. Перед созданием кандидата анкета должна быть одобрена.`
      )
    );


    const alreadyCreatedId =
      normalizeCharacterId(
        questionnaire
          ?.characterCreation
          ?.characterId
      );


    const liveCreatedEntry =
      alreadyCreatedId
        ? registryCharacters.find(
            item =>
              normalizeCharacterId(
                item?.characterId ||
                item?.id
              ) ===
                alreadyCreatedId
          ) || null
        : null;


    const recreatingMissingCandidate =
      Boolean(
        alreadyCreatedId &&
        !liveCreatedEntry
      );


    checks.push(
      makeCheck(
        'candidate-not-created',

        recreatingMissingCandidate
          ? 'Удалённого кандидата можно создать заново'
          : 'Кандидат ещё не создавался',

        !liveCreatedEntry,

        liveCreatedEntry
          ? `Кандидат ${alreadyCreatedId} существует в живом листе САЙТ. Для него доступна только повторная синхронизация.`
          : recreatingMissingCandidate
            ? `Старая публикация ${alreadyCreatedId} больше не существует в активном листе САЙТ. Разрешено полное создание заново с тем же characterId.`
            : 'В анкете ещё нет созданного Google-персонажа.'
      )
    );


    checks.push(
      makeCheck(
        'payload-valid',

        'Поля игрока и базовая сила d20',

        coreBlockers.length ===
          0,

        coreBlockers.length ===
          0
          ? 'Все данные, которые обязан заполнить игрок, сохранены корректно.'
          : `${coreBlockers.length} ошибок в полях игрока или структуре заклинаний.`
      )
    );


    checks.push(
      makeCheck(
        'spell-master-review',

        'Мастерские решения по заклинаниям',

        masterDecisionBlockers.length ===
          0,

        masterDecisionBlockers.length ===
          0
          ? 'Для всех заклинаний подтверждено правило попадания.'
          : `${masterDecisionBlockers.length} заклинание(я) ждут решения мастера о проверке попадания.`
      )
    );


    checks.push(
      makeCheck(
        'layout-safe',

        'Три Google-структуры согласованы',

        layout
          ?.safeForWritePreparation ===
          true,

        layout
          ?.safeForWritePreparation ===
          true
          ? `Основная ${layout?.consistency?.mainCount ?? '—'} · Система ${layout?.consistency?.systemCount ?? '—'} · САЙТ ${layout?.consistency?.registryCount ?? '—'}.`
          : cleanText(
              layout?.warning ||
              'Разметка не разрешает создание кандидата.'
            )
      )
    );


    checks.push(
      makeCheck(
        'main-free',

        'Блок основной таблицы свободен',

        layout
          ?.main
          ?.nextBlock
          ?.empty ===
          true,

        layout
          ?.main
          ?.nextBlock
          ?.a1
          ? layout
              .main
              .nextBlock
              .a1
          : 'Следующий блок не определён.'
      )
    );


    checks.push(
      makeCheck(
        'system-free',

        'Блок системной таблицы свободен',

        layout
          ?.system
          ?.nextBlock
          ?.empty ===
          true,

        layout
          ?.system
          ?.nextBlock
          ?.a1
          ? layout
              .system
              .nextBlock
              .a1
          : 'Следующий блок не определён.'
      )
    );


    checks.push(
      makeCheck(
        'registry-free',

        'Строка САЙТ свободна',

        layout
          ?.registry
          ?.nextRow
          ?.empty ===
          true,

        layout
          ?.registry
          ?.nextRow
          ?.a1
          ? layout
              .registry
              .nextRow
              .a1
          : 'Следующая строка не определена.'
      )
    );


    checks.push(
      makeCheck(
        'template-active',

        'Технический шаблон найден автоматически',

        Boolean(
          donorRegistryEntry &&
          donorRegistryEntry
            .active !==
            false
        ),

        donorRegistryEntry
          ? `Выбран ${cleanText(
              donorRegistryEntry
                .name
            ) || donorCharacterId} (${donorCharacterId}).`
          : 'В активном реестре не найден ни один доступный технический шаблон.'
      )
    );


    const donorClassIdentity =
      classIdentity(
        donorClassName
      );


    const donorClassMatches =
      Boolean(
        donorClassIdentity &&
        targetClassIdentity &&
        donorClassIdentity ===
          targetClassIdentity
      );


    const classFormulaProfile =
      CLASS_FORMULA_PROFILES[
        targetClassIdentity
      ] ||
      null;


    const templateMode =
      donorClassMatches
        ? 'same-class'
        : 'generic';


    checks.push(
      makeCheck(
        'class-formula-profile',

        'Формулы выбранного класса есть в центральном каталоге',

        Boolean(
          classFormulaProfile
        ),

        classFormulaProfile
          ? `Класс «${targetClassName}» распознан как ${targetClassIdentity}; формулы: лист «Классы», колонка ${classFormulaProfile.column} (№${classFormulaProfile.number}).`
          : `Для класса «${targetClassName || 'не указан'}» (${targetClassIdentity || '—'}) не найден центральный профиль формул.`
      )
    );


    checks.push(
      makeCheck(
        'template-class-independent',

        'Класс не зависит от класса технического шаблона',

        Boolean(
          donorRegistryEntry
        ),

        donorRegistryEntry
          ? donorClassMatches
            ? `Найден шаблон того же класса «${donorClassName}».`
            : `Будет использован универсальный каркас «${cleanText(donorRegistryEntry?.name) || donorCharacterId}» класса «${donorClassName || 'не определён'}»; новый персонаж получит класс «${targetClassName}» отдельно.`
          : 'Технический каркас не найден.'
      )
    );


    const targetName =
      cleanText(
        payloadCharacter
          .name
      );


    const duplicateName =
      registryCharacters.find(
        item =>
          normalizeText(
            item?.name
          ) ===
          normalizeText(
            targetName
          )
      ) ||
      null;


    checks.push(
      makeCheck(
        'name-unique',

        'Имя ещё не зарегистрировано на сайте',

        !duplicateName,

        duplicateName
          ? `В САЙТ уже есть «${cleanText(
              duplicateName
                .name
            )}» (${cleanText(
              duplicateName
                .characterId ||
              duplicateName
                .id
            )}).`
          : 'Совпадений по имени в активном реестре не найдено.'
      )
    );


    const proposedCharacterId =
      recreatingMissingCandidate
        ? alreadyCreatedId
        : chooseUniqueCharacterId(
            targetName,
            registryCharacters
          );


    const masterReviewBlockers =
      masterDecisionBlockers.map(
        item =>
          `${item} Откройте редактирование анкеты и выберите «Правило попадания · мастер».`
      );


    const systemBlockers =
      checks
        .filter(
          item =>
            !item.ok &&
            item.id !== 'payload-valid' &&
            item.id !== 'spell-master-review'
        )
        .map(
          item =>
            `${item.label}: ${item.message}`
        );


    const blockerGroups = {
      data:
        coreBlockers,

      masterDecisions:
        masterReviewBlockers,

      system:
        systemBlockers,
    };


    const blockers = [
      ...blockerGroups.data,

      ...blockerGroups.masterDecisions,

      ...blockerGroups.system,
    ];


    const targetPlan = {
      main: {
        block:
          layout
            ?.main
            ?.nextBlock
            ?.a1 ||
          '',

        startRow:
          layout
            ?.main
            ?.nextBlock
            ?.startRow ||
          null,

        endRow:
          layout
            ?.main
            ?.nextBlock
            ?.endRow ||
          null,

        cells:
          layout
            ?.main
            ?.nextBlock
            ?.cells ||
          {},
      },


      system: {
        block:
          layout
            ?.system
            ?.nextBlock
            ?.a1 ||
          '',

        startRow:
          layout
            ?.system
            ?.nextBlock
            ?.startRow ||
          null,

        endRow:
          layout
            ?.system
            ?.nextBlock
            ?.endRow ||
          null,

        cells:
          layout
            ?.system
            ?.nextBlock
            ?.cells ||
          {},
      },


      registry: {
        row:
          layout
            ?.registry
            ?.nextRow
            ?.row ||
          null,

        range:
          layout
            ?.registry
            ?.nextRow
            ?.a1 ||
          '',

        cells:
          layout
            ?.registry
            ?.nextRow
            ?.cells ||
          {},
      },
    };


    const fingerprintSource = {
      questionnaireKey,

      questionnaireId:
        cleanText(
          questionnaire.id
        ),

      questionnaireStatus,

      targetName,

      targetClassName,

      donorCharacterId,

      donorClassName,

      targetClassIdentity,

      classFormulaProfile,

      templateMode,

      proposedCharacterId,

      targetPlan,
    };


    const fingerprint =
      createHash(
        'sha256'
      )
        .update(
          JSON.stringify(
            fingerprintSource
          )
        )
        .digest(
          'hex'
        )
        .slice(
          0,
          24
        );


    const prepared =
      blockers.length ===
      0;


    if (prepared) {
      const planStore =
        getStore({
          name:
            PLAN_STORE,

          consistency:
            'strong',
        });


      const preparedAt =
        new Date();


      await planStore.setJSON(
        `plans/${fingerprint}`,
        {
          version:
            3,

          mode:
            'candidate',

          fingerprint,

          preparedAt:
            preparedAt.toISOString(),

          expiresAt:
            new Date(
              preparedAt.getTime() +
              PLAN_LIFETIME_MS
            ).toISOString(),

          questionnaireKey,

          questionnaireId:
            cleanText(
              questionnaire.id
            ),

          questionnaireStatus,

          recreateMissingCandidate:
            recreatingMissingCandidate,

          donorCharacterId,

          donorName:
            cleanText(
              donorData
                ?.character
                ?.name ||
              donorRegistryEntry
                ?.name
            ),

          donorClassName,

          templateMode,

          targetClassId:
            targetClassIdentity,

          classFormulaProfile:
            classFormulaProfile
              ? {
                  ...classFormulaProfile,
                  sheet: 'Классы',
                  personalClassCell: 'Лист персонажа!E38',
                }
              : null,

          proposedCharacterId,

          payload,

          targets:
            targetPlan,
        }
      );
    }


    return json({
      ok: true,

      prepared,

      writesPerformed:
        0,

      checkedAt:
        new Date()
          .toISOString(),


      questionnaire: {
        id:
          cleanText(
            questionnaire.id
          ),

        key:
          questionnaireKey,

        status:
          questionnaireStatus,

        name:
          targetName,
      },


      donor: {
        characterId:
          donorCharacterId,

        name:
          cleanText(
            donorData
              ?.character
              ?.name ||
            donorRegistryEntry
              ?.name
          ),

        className:
          donorClassName,

        templateMode,

        sameClass:
          donorClassMatches,

        targetClassId:
          targetClassIdentity,

        classFormulaProfile:
          classFormulaProfile
            ? {
                ...classFormulaProfile,
                sheet: 'Классы',
                personalClassCell: 'Лист персонажа!E38',
              }
            : null,

        classSkillsCount:
          Array.isArray(
            donorData
              ?.classSkills
          )
            ? donorData
                .classSkills
                .length
            : 0,
      },


      proposed: {
        characterId:
          proposedCharacterId,

        active:
          true,

        theme:
          'default',

        lifecycleStatus:
          'candidate',
      },


      lifecycle: {
        status:
          recreatingMissingCandidate
            ? 'candidate-missing-recreate-ready'
            : 'candidate-pending',
        examRequired:
          true,
      },


      recreateMissingCandidate:
        recreatingMissingCandidate,


      targets:
        targetPlan,


      timings: {
        registryMs:
          registryResult
            .elapsedMs,

        layoutMs:
          layoutResult
            .elapsedMs,

        donorMs:
          donorResult
            .elapsedMs,
      },


      checks,

      blockerGroups,

      blockers,

      fingerprint,
    });


  } catch (
    error
  ) {

    console.error(
      'admin-google-prepare:',
      error
    );


    return json(
      {
        ok: false,

        error:
          error instanceof
            Error
            ? error.message
            : String(
                error
              ),

        writesPerformed:
          0,
      },
      500
    );
  }
}
