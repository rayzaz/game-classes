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


  spells.forEach(
    (
      rawSpell,
      index
    ) => {
      const spell =
        asRecord(
          rawSpell
        );

      const power =
        Number(
          spell.power
        );


      if (
        !cleanText(
          spell.name
        )
      ) {
        blockers.push(
          `Заклинание ${index + 1}: нет названия.`
        );
      }


      if (
        !cleanText(
          spell.powerType
        )
      ) {
        blockers.push(
          `Заклинание ${index + 1}: не указан тип силы.`
        );
      }


      if (
        !Number.isInteger(
          power
        ) ||
        power <
          1 ||
        power >
          20
      ) {
        blockers.push(
          `Заклинание ${index + 1}: результат d20 должен быть от 1 до 20.`
        );
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


    const donorCharacterId =
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


    if (
      !donorCharacterId
    ) {
      return json(
        {
          ok: false,

          error:
            'Не выбран персонаж-донор',
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
      donorResult,
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

        fetchServiceJson(
          serviceUrl,
          {
            characterId:
              donorCharacterId,
          },
          'Личное дело донора'
        ),
      ]);


    const registry =
      registryResult.data;


    const layout =
      layoutResult.data;


    const donorData =
      donorResult.data;


    const registryCharacters =
      Array.isArray(
        registry.characters
      )
        ? registry.characters
        : [];


    const donorRegistryEntry =
      registryCharacters.find(
        item =>
          normalizeCharacterId(
            item
              ?.characterId ||
            item?.id
          ) ===
          donorCharacterId
      ) ||
      null;


    const donorClassName =
      cleanText(
        donorData
          ?.character
          ?.className ||
        donorRegistryEntry
          ?.className
      );


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


    const questionnaireStatus =
      cleanText(
        questionnaire.status
      );


    const coreBlockers =
      validatePayload(
        payload
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
      cleanText(
        questionnaire
          ?.characterCreation
          ?.characterId
      );


    checks.push(
      makeCheck(
        'candidate-not-created',

        'Кандидат ещё не создавался',

        !alreadyCreatedId,

        alreadyCreatedId
          ? `Из этой анкеты уже создан кандидат ${alreadyCreatedId}. Повторное создание запрещено.`
          : 'В анкете ещё нет созданного Google-персонажа.'
      )
    );


    checks.push(
      makeCheck(
        'payload-valid',

        'Данные анкеты готовы',

        coreBlockers.length ===
          0,

        coreBlockers.length ===
          0
          ? 'Обязательные данные и броски d20 проходят серверную проверку.'
          : `${coreBlockers.length} проблем в структурированных данных.`
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
        'donor-active',

        'Донор есть в активном реестре',

        Boolean(
          donorRegistryEntry &&
          donorRegistryEntry
            .active !==
            false
        ),

        donorRegistryEntry
          ? `${cleanText(
              donorRegistryEntry
                .name
            ) || donorCharacterId} (${donorCharacterId}).`
          : `Персонаж ${donorCharacterId} не найден в активном реестре.`
      )
    );


    const donorClassIdentity =
      classIdentity(
        donorClassName
      );


    const targetClassIdentity =
      classIdentity(
        targetClassName
      );


    const donorClassMatches =
      Boolean(
        donorClassIdentity &&
        targetClassIdentity &&
        donorClassIdentity ===
          targetClassIdentity
      );


    checks.push(
      makeCheck(
        'donor-class',

        'Класс донора совпадает',

        donorClassMatches,

        donorClassMatches
          ? `Донор: ${donorClassName}. Класс распознан как ${donorClassIdentity}.`
          : `Донор «${donorClassName || 'класс не прочитан'}» (${donorClassIdentity || '—'}), анкета «${targetClassName || 'класс не указан'}» (${targetClassIdentity || '—'}).`
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
      chooseUniqueCharacterId(
        targetName,
        registryCharacters
      );


    const blockers = [
      ...coreBlockers,

      ...checks
        .filter(
          item =>
            !item.ok
        )
        .map(
          item =>
            `${item.label}: ${item.message}`
        ),
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
            2,

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
          'candidate-pending',
        examRequired:
          true,
      },


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