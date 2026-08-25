function cleanText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}


function normalizeRank(value) {
  return cleanText(value)
    .replace(/ё/g, 'е')
    .toLowerCase();
}


/* ============================================================
   РАНГ РЫЦАРЯ-ЧАРОДЕЯ
   ============================================================ */

export function getKnightRank(value) {
  const normalized =
    normalizeRank(value);

  const match =
    normalized.match(
      /^(младший|средний|старший|великий)\s+рыцарь-чародей\s+([1-5])$/
    );

  if (!match) {
    return null;
  }

  const tier =
    match[1];

  const step =
    Number(match[2]);

  const tierOrder = {
    младший: 0,
    средний: 1,
    старший: 2,
    великий: 3,
  };

  const tierNames = {
    младший: 'Младший',
    средний: 'Средний',
    старший: 'Старший',
    великий: 'Великий',
  };

  return {
    id:
      `${tier}-${step}`,

    label:
      `${tierNames[tier]} рыцарь-чародей ${step}`,

    tier,

    step,

    order:
      tierOrder[tier] * 5 +
      step,
  };
}


/* ============================================================
   ЦЕНТРАЛЬНЫЙ СЕРВИС ПЕРСОНАЖЕЙ
   ============================================================ */

function loadCharacterServiceUrl() {
  const raw =
    cleanText(
      process.env
        .CHARACTER_SERVICE_URL
    );

  if (!raw) {
    throw new Error(
      'Не задан CHARACTER_SERVICE_URL'
    );
  }

  return raw;
}


/* ============================================================
   ЗАГРУЗКА ПЕРСОНАЖА
   ============================================================ */

export async function loadCharacterData(
  characterId
) {
  const cleanId =
    cleanText(
      characterId
    )
      .toLowerCase();

  if (!cleanId) {
    throw new Error(
      'Не указан персонаж'
    );
  }


  /* ==========================================================
     СОБИРАЕМ URL
     ========================================================== */

  const source =
    loadCharacterServiceUrl();

  const url =
    new URL(
      source
    );


  url.searchParams.set(
    'characterId',
    cleanId
  );


  /*
    Защита от старого ответа из кэша.
  */

  url.searchParams.set(
    '_',
    String(
      Date.now()
    )
  );


  /* ==========================================================
     ЗАПРОС
     ========================================================== */

  const response =
    await fetch(
      url,
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


  const text =
    await response.text();


  /* ==========================================================
     HTTP ОШИБКА
     ========================================================== */

  if (!response.ok) {
    console.error(
      'character service HTTP error:',
      cleanId,
      response.status,
      text.slice(
        0,
        500
      )
    );

    throw new Error(
      'Не удалось получить данные персонажа'
    );
  }


  /* ==========================================================
     JSON
     ========================================================== */

  let data;

  try {
    data =
      JSON.parse(
        text
      );

  } catch (
    error
  ) {
    console.error(
      'character service JSON error:',
      cleanId,
      error
    );

    throw new Error(
      'Центральный сервис персонажей вернул некорректные данные'
    );
  }


  /* ==========================================================
     ОШИБКА ИЗ APPS SCRIPT
     ========================================================== */

  if (
    !data ||
    data.ok ===
      false
  ) {
    throw new Error(
      data?.error ||
      'Центральный сервис персонажей вернул ошибку'
    );
  }


  return data;
}


/* ============================================================
   ПРОВЕРКА ДОПУСКА НА ИВЕНТ
   ============================================================ */

export function getEventEligibility(
  characterData,
  event
) {
  const playerLevel =
    Number(
      characterData
        ?.level
        ?.current
    ) || 0;


  const eventLevel =
    Number(
      event
        ?.difficulty
        ?.level
    ) || 1;


  const playerRankText =
    cleanText(
      characterData
        ?.character
        ?.rank
    );


  const requiredRankText =
    cleanText(
      event
        ?.difficulty
        ?.requiredKnightRank
    );


  const playerRank =
    getKnightRank(
      playerRankText
    );


  const requiredRank =
    getKnightRank(
      requiredRankText
    );


  const rankKnown =
    Boolean(
      playerRank
    );


  const requiredRankKnown =
    Boolean(
      requiredRank
    );


  const rankAllowed =
    Boolean(
      playerRank &&
      requiredRank &&
      playerRank.order >=
        requiredRank.order
    );


  let levelState =
    'normal';


  let levelWarning =
    '';


  /*
    Уровень ничего не запрещает.

    Он только предупреждает игрока.
  */

  if (
    playerLevel <
    eventLevel
  ) {
    levelState =
      'danger';

    levelWarning =
      `Уровень персонажа (${playerLevel}) ниже уровня ивента (${eventLevel}). Участие возможно, но событие может быть опасным.`;

  } else if (
    playerLevel >
    eventLevel
  ) {
    levelState =
      'low_reward';

    levelWarning =
      `Уровень персонажа (${playerLevel}) выше уровня ивента (${eventLevel}). Участие возможно, но награда может быть уменьшена.`;
  }


  let reason =
    '';


  if (
    !requiredRankKnown
  ) {
    reason =
      'unknown_required_rank';

  } else if (
    !rankKnown
  ) {
    reason =
      'unknown_player_rank';

  } else if (
    !rankAllowed
  ) {
    reason =
      'insufficient_rank';

  } else if (
    event.status !==
    'published'
  ) {
    reason =
      'registration_closed';
  }


  const canJoin =
    event.status ===
      'published' &&
    rankAllowed;


  return {
    canJoin,

    reason,

    rankAllowed,

    rankKnown,

    requiredRankKnown,


    playerRank:
      playerRank
        ? {
            id:
              playerRank.id,

            label:
              playerRank.label,

            order:
              playerRank.order,

            step:
              playerRank.step,
          }
        : null,


    requiredRank:
      requiredRank
        ? {
            id:
              requiredRank.id,

            label:
              requiredRank.label,

            order:
              requiredRank.order,

            step:
              requiredRank.step,
          }
        : null,


    playerLevel,

    eventLevel,

    levelState,

    levelWarning,
  };
}