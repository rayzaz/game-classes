import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  getCharacterDbStore,
  characterKey,
  REGISTRY_KEY,
} from './_character-db/store.mjs';

import {
  characterPortraitProxyUrl,
} from './_character-db/portrait.mjs';


function loadCharacterServiceUrl() {
  const raw =
    String(
      process.env.CHARACTER_SERVICE_URL ||
      ''
    ).trim();

  if (!raw) {
    throw new Error(
      'Не задан CHARACTER_SERVICE_URL'
    );
  }

  return raw;
}


function cleanText(
  value
) {
  return String(
    value ??
    ''
  ).trim();
}


function safeNumber(
  value
) {
  const number =
    Number(
      value
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


function normalizeCharacterId(
  value
) {
  return cleanText(value)
    .toLowerCase();
}


function canonicalClassName(
  value
) {
  const original =
    cleanText(value);

  if (!original) {
    return '';
  }

  const directNames = {
    tank: 'Танк',
    assassin: 'Убийца',
    alchemist: 'Знахарь',
    bruiser: 'Брузер',
    debuffer: 'Дебаффер',
    healer_buffer: 'Хилер-Баффер',
    summoner_dps: 'Призыватель (ДД)',
    summoner_sup: 'Призыватель (Сап)',
    summoner_multi: 'Призыватель (Мульти)',
    buffer: 'Баффер',
    support_x3: 'Сапорт ×3',
    support_x3_alchemist: 'Сапорт ×3 (Знахарь)',
    buffer_alchemist: 'Баффер-Знахарь',
    debuffer_alchemist: 'Дебаффер-Знахарь',
    dps: 'Дамагер',
    healer: 'Хилер',
    healer_debuffer: 'Хилер-Дебаффер',
    healer_alchemist: 'Хилер-Знахарь',
    buffer_debuffer: 'Баффер-Дебаффер',
  };

  const rawId =
    original.toLowerCase();

  if (directNames[rawId]) {
    return directNames[rawId];
  }

  let normalized =
    original
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/хиллер/g, 'хилер')
      .replace(/бафер/g, 'баффер')
      .replace(/саппорт/g, 'сапорт');

  if (/[а-я]/i.test(normalized)) {
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

  normalized =
    normalized
      .replace(/сапорт\s*[xх×]\s*3/g, 'сапорт3')
      .replace(/сапорт[хx]3/g, 'сапорт3')
      .replace(/[^a-zа-я0-9]+/gi, '');

  const aliases = {
    танк: 'Танк',
    убийца: 'Убийца',
    знахарь: 'Знахарь',
    брузер: 'Брузер',
    дебаффер: 'Дебаффер',
    хилербаффер: 'Хилер-Баффер',
    призывательдд: 'Призыватель (ДД)',
    призывательсап: 'Призыватель (Сап)',
    призывательмульти: 'Призыватель (Мульти)',
    баффер: 'Баффер',
    сапорт3: 'Сапорт ×3',
    сапорт3знахарь: 'Сапорт ×3 (Знахарь)',
    бафферзнахарь: 'Баффер-Знахарь',
    дебафферзнахарь: 'Дебаффер-Знахарь',
    дамагер: 'Дамагер',
    домагер: 'Дамагер',
    дд: 'Дамагер',
    хилер: 'Хилер',
    хилердебаффер: 'Хилер-Дебаффер',
    хилерзнахарь: 'Хилер-Знахарь',
    баффердебаффер: 'Баффер-Дебаффер',
  };

  return (
    aliases[normalized] ||
    original
  );
}


function normalizePchkStat(
  source,
  fallbackMax
) {
  const stat =
    source &&
    typeof source === 'object'
      ? source
      : {};

  const current =
    safeNumber(
      stat.current
    );

  const max =
    safeNumber(
      stat.max
    ) ||
    fallbackMax;

  const explicitPercent =
    safeNumber(
      stat.percent
    );

  const percent =
    explicitPercent ||
    (
      max > 0
        ? Number(
            (
              current /
              max *
              100
            ).toFixed(2)
          )
        : 0
    );

  return {
    current,
    max,
    percent,
  };
}


function normalizePchk(
  source
) {
  const pchk =
    source &&
    typeof source === 'object'
      ? source
      : {};

  const protection =
    normalizePchkStat(
      pchk.protection,
      100
    );

  const senses =
    normalizePchkStat(
      pchk.senses,
      200
    );

  const control =
    normalizePchkStat(
      pchk.control,
      500
    );

  return {
    protection,
    senses,
    control,
    overall:
      Number(
        (
          (
            protection.percent +
            senses.percent +
            control.percent
          ) /
          3
        ).toFixed(2)
      ),
  };
}


function normalizedRadarLabel(
  value
) {
  return cleanText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
}


function radarActual(
  battleRadar,
  wantedLabels
) {
  const points =
    Array.isArray(
      battleRadar
    )
      ? battleRadar
      : [];

  const wanted =
    wantedLabels.map(
      normalizedRadarLabel
    );

  for (
    const point of points
  ) {
    const label =
      normalizedRadarLabel(
        point?.label
      );

    if (
      wanted.includes(
        label
      )
    ) {
      return safeNumber(
        point?.actual
      );
    }
  }

  return 0;
}


function rankingBattleFromCharacterData(
  data
) {
  const radar =
    data?.battleRadar;

  /*
    Рейтинг исторически использует именно фактические H4:H13,
    а не рабочие коэффициенты E5:E15 из data.battle.
    battleRadar в полном личном деле содержит эти же H-значения.
  */
  return {
    attack:
      radarActual(
        radar,
        ['Атака']
      ),

    defense:
      radarActual(
        radar,
        ['Защита']
      ),

    healing:
      radarActual(
        radar,
        ['Лечение']
      ),

    buff:
      radarActual(
        radar,
        ['Баф', 'Бафф']
      ),

    debuff:
      radarActual(
        radar,
        ['Дебаф', 'Дебафф']
      ),

    potions:
      radarActual(
        radar,
        ['Зелья']
      ),

    summon:
      radarActual(
        radar,
        ['Призыв']
      ),

    movement:
      radarActual(
        radar,
        ['Скорость', 'Подвижность']
      ),

    speedModifier:
      0,

    physical:
      radarActual(
        radar,
        ['Физ. сила', 'Физическая сила']
      ),

    other:
      0,
  };
}


function isUsableCharacterDocument(
  document,
  characterId
) {
  if (
    !document ||
    document.ok !== true ||
    document.data?.ok !== true
  ) {
    return false;
  }

  const storedId =
    normalizeCharacterId(
      document.characterId ||
      document.data?.registry?.characterId
    );

  return (
    storedId ===
    normalizeCharacterId(characterId)
  );
}


async function ratingsFromCharacterDb() {
  const startedAt =
    Date.now();

  const store =
    getCharacterDbStore();

  const registry =
    await store.get(
      REGISTRY_KEY,
      {
        type: 'json',
        consistency: 'strong',
      }
    );

  if (
    !registry ||
    registry.ok !== true ||
    !Array.isArray(
      registry.characters
    )
  ) {
    throw new Error(
      'Character DB registry unavailable'
    );
  }

  const registryCharacters =
    registry.characters
      .map(
        item => {
          const characterId =
            normalizeCharacterId(
              item?.characterId ||
              item?.id
            );

          if (!characterId) {
            return null;
          }

          return {
            ...item,
            characterId,
          };
        }
      )
      .filter(Boolean)
      .filter(
        item =>
          item.active !==
          false
      );

  const loaded =
    await Promise.all(
      registryCharacters.map(
        async registryCharacter => {
          const characterId =
            registryCharacter.characterId;

          try {
            const document =
              await store.get(
                characterKey(
                  characterId
                ),
                {
                  type: 'json',
                  consistency: 'strong',
                }
              );

            if (
              !isUsableCharacterDocument(
                document,
                characterId
              )
            ) {
              return {
                ok: false,
                characterId,
              };
            }

            return {
              ok: true,
              registryCharacter,
              document,
            };

          } catch (error) {
            console.error(
              'character-rankings DB character read error:',
              characterId,
              error
            );

            return {
              ok: false,
              characterId,
            };
          }
        }
      )
    );

  let unavailable = 0;

  const characters =
    loaded
      .map(
        item => {
          if (
            !item ||
            item.ok !== true
          ) {
            unavailable += 1;
            return null;
          }

          const registryCharacter =
            item.registryCharacter;

          const document =
            item.document;

          const data =
            document.data || {};

          const character =
            data.character || {};

          const money =
            data.money || {};

          const id =
            registryCharacter.characterId;

          return {
            id,

            name:
              cleanText(
                character.name
              ) ||
              cleanText(
                registryCharacter.name
              ) ||
              id,

            rank:
              cleanText(
                character.rank
              ) ||
              cleanText(
                registryCharacter.rank
              ),

            squad:
              cleanText(
                character.squad
              ) ||
              cleanText(
                registryCharacter.squad
              ),

            className:
              canonicalClassName(
                character.className ||
                registryCharacter.className
              ),

            magicType:
              cleanText(
                character.magicType
              ),

            portrait:
              characterPortraitProxyUrl(
                id,
                document.syncedAt ||
                document.sourceVersion ||
                data?.updatedAt ||
                registry.updatedAt ||
                ''
              ),

            portraitSource:
              cleanText(
                character.portraitSource ||
                character.portrait
              ) ||
              cleanText(
                registryCharacter.portraitSource ||
                registryCharacter.portrait
              ),

            level:
              safeNumber(
                data?.level?.current
              ),

            battle:
              rankingBattleFromCharacterData(
                data
              ),

            pchk:
              normalizePchk(
                data.pchk
              ),

            finance: {
              /*
                Точная семантика старого рейтинга:
                wealth = AD32 = money.juli
                bank   = BJ = money.savings
              */
              wealth:
                safeNumber(
                  money.juli
                ),

              bank:
                safeNumber(
                  money.savings
                ),
            },
          };
        }
      )
      .filter(Boolean);

  characters.sort(
    (a, b) =>
      String(a.name)
        .localeCompare(
          String(b.name),
          'ru'
        )
  );

  console.log(
    'character-rankings DB HIT:',
    'count=',
    characters.length,
    'unavailable=',
    unavailable,
    'ms=',
    Date.now() -
    startedAt
  );

  return {
    ok: true,
    characters,
    count:
      characters.length,
    unavailable,
    updatedAt:
      cleanText(
        registry.updatedAt
      ) ||
      new Date()
        .toISOString(),
    cached: true,
    source:
      'character-db',
  };
}


async function ratingsFromGoogle() {
  const serviceUrl =
    new URL(
      loadCharacterServiceUrl()
    );

  serviceUrl
    .searchParams
    .set(
      'action',
      'ratings'
    );

  serviceUrl
    .searchParams
    .set(
      '_',
      String(
        Date.now()
      )
    );

  const response =
    await fetch(
      serviceUrl,
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
      }
    );

  if (!response.ok) {
    const text =
      await response.text();

    console.error(
      'character ratings HTTP error:',
      response.status,
      text.slice(0, 500)
    );

    throw new Error(
      'Не удалось загрузить рейтинг персонажей'
    );
  }

  const data =
    await response.json();

  if (
    !data ||
    data.ok !== true
  ) {
    throw new Error(
      cleanText(
        data?.error
      ) ||
      'Не удалось загрузить рейтинг персонажей'
    );
  }

  return {
    ok: true,
    characters:
      Array.isArray(
        data.characters
      )
        ? data.characters
        : [],
    count:
      safeNumber(
        data.count
      ),
    unavailable:
      safeNumber(
        data.unavailable
      ),
    updatedAt:
      cleanText(
        data.updatedAt
      ),
    cached:
      data.cached === true,
    source:
      'google-fallback',
  };
}


export default async (
  request
) => {
  if (
    request.method !==
    'GET'
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

    try {
      return json(
        await ratingsFromCharacterDb()
      );

    } catch (error) {
      console.error(
        'character-rankings DB error -> Google fallback:',
        error
      );
    }

    return json(
      await ratingsFromGoogle()
    );

  } catch (error) {
    console.error(
      'character-rankings function error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          cleanText(
            error?.message
          ) ||
          'Не удалось загрузить рейтинг персонажей',
      },
      500
    );
  }
};
