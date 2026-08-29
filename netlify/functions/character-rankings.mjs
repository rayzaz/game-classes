import {
  json,
  readSession,
} from './_shared/_auth.mjs';


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


function normalizeBattle(
  source
) {
  const battle =
    source &&
    typeof source === 'object'
      ? source
      : {};

  return {
    attack:
      safeNumber(
        battle.attack
      ),

    defense:
      safeNumber(
        battle.defense
      ),

    healing:
      safeNumber(
        battle.healing
      ),

    buff:
      safeNumber(
        battle.buff
      ),

    debuff:
      safeNumber(
        battle.debuff
      ),

    potions:
      safeNumber(
        battle.potions
      ),

    summon:
      safeNumber(
        battle.summon
      ),

    movement:
      safeNumber(
        battle.movement
      ),

    speedModifier:
      safeNumber(
        battle.speedModifier
      ),

    physical:
      safeNumber(
        battle.physical
      ),

    other:
      safeNumber(
        battle.other
      ),
  };
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

  return {
    current:
      safeNumber(
        stat.current
      ),

    max:
      safeNumber(
        stat.max
      ) ||
      fallbackMax,

    percent:
      safeNumber(
        stat.percent
      ),
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

  return {
    protection:
      normalizePchkStat(
        pchk.protection,
        100
      ),

    senses:
      normalizePchkStat(
        pchk.senses,
        200
      ),

    control:
      normalizePchkStat(
        pchk.control,
        500
      ),

    overall:
      safeNumber(
        pchk.overall
      ),
  };
}


function normalizeFinance(
  source
) {
  const finance =
    source &&
    typeof source === 'object'
      ? source
      : {};

  return {
    wealth:
      safeNumber(
        finance.wealth
      ),

    bank:
      safeNumber(
        finance.bank
      ),
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

      return json(
        {
          ok: false,
          error:
            'Не удалось загрузить рейтинг персонажей',
        },
        502
      );
    }

    let data;

    try {
      data =
        await response.json();
    } catch (error) {
      console.error(
        'character ratings JSON error:',
        error
      );

      return json(
        {
          ok: false,
          error:
            'Источник рейтинга вернул некорректные данные',
        },
        502
      );
    }

    if (
      !data ||
      data.ok !== true
    ) {
      return json(
        {
          ok: false,
          error:
            cleanText(
              data?.error
            ) ||
            'Не удалось загрузить рейтинг персонажей',
        },
        502
      );
    }

    const characters =
      (
        Array.isArray(
          data.characters
        )
          ? data.characters
          : []
      )
        .map(
          character => {
            const id =
              cleanText(
                character?.id ||
                character?.characterId
              )
                .toLowerCase();

            if (!id) {
              return null;
            }

            return {
              id,

              name:
                cleanText(
                  character?.name
                ) ||
                id,

              rank:
                cleanText(
                  character?.rank
                ),

              squad:
                cleanText(
                  character?.squad
                ),

              className:
                canonicalClassName(
                  character?.className
                ),

              magicType:
                cleanText(
                  character?.magicType
                ),

              portrait:
                cleanText(
                  character?.portrait
                ) ||
                `/cards/characters/${id}.jpg`,

              level:
                safeNumber(
                  character?.level
                ),

              battle:
                normalizeBattle(
                  character?.battle
                ),

              pchk:
                normalizePchk(
                  character?.pchk
                ),

              finance:
                normalizeFinance(
                  character?.finance
                ),
            };
          }
        )
        .filter(Boolean);

    return json({
      ok: true,
      characters,
      count:
        characters.length,
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
    });

  } catch (error) {
    console.error(
      'character-rankings function error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          'Не удалось загрузить рейтинг персонажей',
      },
      500
    );
  }
};
