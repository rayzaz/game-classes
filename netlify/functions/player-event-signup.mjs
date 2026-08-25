import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  getEventEligibility,
  loadCharacterData,
} from './_shared/_event-access.mjs';


const EVENTS_STORE =
  'gosmag-events';

const SIGNUPS_STORE =
  'gosmag-event-signups';


function getEventsStore() {
  return getStore({
    name:
      EVENTS_STORE,

    consistency:
      'strong',
  });
}


function getSignupsStore() {
  return getStore({
    name:
      SIGNUPS_STORE,

    consistency:
      'strong',
  });
}


function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .trim();
}


function validEventKey(
  key
) {
  return /^events\/[0-9]+_[a-f0-9-]{36}$/i
    .test(key);
}


/* ============================================================
   КАКОГО ПЕРСОНАЖА ЗАПИСЫВАЕМ
   ============================================================ */

function resolveCharacterId(
  session,
  body
) {
  const sessionCharacterId =
    cleanText(
      session?.cid
    )
      .toLowerCase();


  /*
    Обычный игрок всегда
    записывает только своего персонажа.

    Даже если он вручную отправит
    characterId другого персонажа,
    сервер его проигнорирует.
  */

  if (
    session?.role !==
    'admin'
  ) {
    return sessionCharacterId;
  }


  /*
    Администратор может записать
    выбранного персонажа из его анкеты.
  */

  const requestedCharacterId =
    cleanText(
      body?.characterId
    )
      .toLowerCase();


  return (
    requestedCharacterId ||
    sessionCharacterId
  );
}


export default async function (
  request
) {

  /* ==========================================================
     ТОЛЬКО POST
     ========================================================== */

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

    /* ========================================================
       СЕССИЯ
       ======================================================== */

    const session =
      readSession(
        request
      );


    if (!session) {
      return json(
        {
          ok: false,

          error:
            'Сначала войдите в личный кабинет',
        },
        401
      );
    }


    /* ========================================================
       BODY
       ======================================================== */

    let body;


    try {

      body =
        await request.json();

    } catch {

      return json(
        {
          ok: false,

          error:
            'Некорректный JSON',
        },
        400
      );

    }


    /* ========================================================
       ПЕРСОНАЖ
       ======================================================== */

    const characterId =
      resolveCharacterId(
        session,
        body
      );


    if (!characterId) {

      return json(
        {
          ok: false,

          error:
            session.role ===
            'admin'
              ? 'Не указан персонаж для записи на ивент'
              : 'У аккаунта не указан персонаж',
        },
        400
      );

    }


    /* ========================================================
       КЛЮЧ ИВЕНТА
       ======================================================== */

    const key =
      cleanText(
        body?.key
      );


    if (
      !validEventKey(
        key
      )
    ) {

      return json(
        {
          ok: false,

          error:
            'Некорректный ключ ивента',
        },
        400
      );

    }


    /* ========================================================
       ЗАГРУЖАЕМ ИВЕНТ
       ======================================================== */

    const eventsStore =
      getEventsStore();


    const event =
      await eventsStore.get(
        key,
        {
          type:
            'json',

          consistency:
            'strong',
        }
      );


    if (!event) {

      return json(
        {
          ok: false,

          error:
            'Ивент не найден',
        },
        404
      );

    }


    /* ========================================================
       ПРОВЕРЯЕМ СТАТУС
       ======================================================== */

    if (
      event.status !==
      'published'
    ) {

      return json(
        {
          ok: false,

          error:
            'Запись на этот ивент закрыта',
        },
        409
      );

    }


    /* ========================================================
       ДАННЫЕ ПЕРСОНАЖА
       ======================================================== */

    const characterData =
      await loadCharacterData(
        characterId
      );


    const eligibility =
      getEventEligibility(
        characterData,
        event
      );


    /* ========================================================
       ПРОВЕРКА ПРОХОДНОГО РАНГА
       ======================================================== */

    if (
      !eligibility
        .requiredRankKnown
    ) {

      return json(
        {
          ok: false,

          error:
            'Для ивента указан некорректный проходной ранг. Обратитесь к администратору.',

          eligibility,
        },
        409
      );

    }


    /* ========================================================
       ПРОВЕРКА РАНГА ПЕРСОНАЖА
       ======================================================== */

    if (
      !eligibility
        .rankKnown
    ) {

      return json(
        {
          ok: false,

          error:
            'Система не смогла определить ранг персонажа.',

          eligibility,
        },
        409
      );

    }


    /* ========================================================
       ДОСТАТОЧЕН ЛИ РАНГ
       ======================================================== */

    if (
      !eligibility
        .rankAllowed
    ) {

      return json(
        {
          ok: false,

          error:
            `Недостаточный ранг. Требуется минимум: ${eligibility.requiredRank.label}.`,

          eligibility,
        },
        403
      );

    }


    /* ========================================================
       ID ИВЕНТА
       ======================================================== */

    const eventId =
      cleanText(
        event.id
      );


    if (!eventId) {

      return json(
        {
          ok: false,

          error:
            'У ивента отсутствует ID',
        },
        500
      );

    }


    /* ========================================================
       КЛЮЧ ЗАПИСИ ПЕРСОНАЖА
       ======================================================== */

    const signupKey =
      `signups/${eventId}/${characterId}`;


    const signupsStore =
      getSignupsStore();


    /* ========================================================
       ПРОВЕРЯЕМ, НЕ ЗАПИСАН ЛИ УЖЕ
       ======================================================== */

    const existing =
      await signupsStore.get(
        signupKey,
        {
          type:
            'json',

          consistency:
            'strong',
        }
      );


    if (
      existing &&
      existing.status ===
        'registered'
    ) {

      return json({
        ok:
          true,

        alreadyRegistered:
          true,

        signup:
          existing,

        eligibility,
      });

    }


    /* ========================================================
       СОЗДАЁМ ЗАПИСЬ
       ======================================================== */

    const now =
      new Date()
        .toISOString();


    const signup = {

      eventId,


      eventKey:
        key,


      eventTitle:
        cleanText(
          event.title
        ),


      characterId,


      status:
        'registered',


      /* ======================================================
         СНИМОК ПЕРСОНАЖА НА МОМЕНТ ЗАПИСИ
         ====================================================== */

      character: {

        name:
          cleanText(
            characterData
              ?.character
              ?.name
          ),


        level:
          Number(
            characterData
              ?.level
              ?.current
          ) ||
          0,


        rank:
          cleanText(
            characterData
              ?.character
              ?.rank
          ),


        className:
          cleanText(
            characterData
              ?.character
              ?.className
          ),


        squad:
          cleanText(
            characterData
              ?.character
              ?.squad
          ),

      },


      eligibility,


      /* ======================================================
         СНАРЯЖЕНИЕ НА ИВЕНТ

         Позже сюда подключим
         выбор вещей игроком.
         ====================================================== */

      loadout: {

        equipment:
          [],

        inventory:
          [],

      },


      /* ======================================================
         КТО СОЗДАЛ ЗАПИСЬ
         ====================================================== */

      registeredBy: {

        role:
          cleanText(
            session.role
          ),

        login:
          cleanText(
            session.login
          ),

      },


      createdAt:
        now,


      updatedAt:
        now,

    };


    /* ========================================================
       СОХРАНЯЕМ
       ======================================================== */

    await signupsStore.setJSON(
      signupKey,
      signup
    );


    /* ========================================================
       ГОТОВО
       ======================================================== */

    return json({

      ok:
        true,


      alreadyRegistered:
        false,


      signup,


      eligibility,

    });


  } catch (
    error
  ) {

    console.error(
      'player-event-signup error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          error?.message ||
          'Не удалось записаться на ивент',
      },
      500
    );

  }
}