import {
  json,
  readSession,
} from './_shared/_auth.mjs';


/* ============================================================
   ЦЕНТРАЛЬНЫЙ СЕРВИС ПЕРСОНАЖЕЙ
   ============================================================ */

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


/* ============================================================
   NETLIFY FUNCTION
   ============================================================ */

export default async (
  request
) => {

  /* ==========================================================
     ТОЛЬКО GET
     ========================================================== */

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
       ПЕРСОНАЖ ИЗ СЕССИИ
       ======================================================== */

    const characterId =
      String(
        session.cid ||
        ''
      )
        .trim()
        .toLowerCase();

    if (!characterId) {
      return json(
        {
          ok: false,
          error:
            'К этому аккаунту не привязан персонаж',
        },
        404
      );
    }


    /* ========================================================
       URL ЦЕНТРАЛЬНОГО СЕРВИСА
       ======================================================== */

    const serviceUrl =
      new URL(
        loadCharacterServiceUrl()
      );

    serviceUrl
      .searchParams
      .set(
        'characterId',
        characterId
      );

    /*
      Добавляем случайный параметр,
      чтобы не получить старый JSON
      из кэша.
    */

    serviceUrl
      .searchParams
      .set(
        '_',
        String(
          Date.now()
        )
      );


    /* ========================================================
       ЗАГРУЖАЕМ ПЕРСОНАЖА
       ======================================================== */

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


    /* ========================================================
       HTTP ОШИБКА
       ======================================================== */

    if (
      !response.ok
    ) {
      const text =
        await response
          .text();

      console.error(
        'character service HTTP error:',
        characterId,
        response.status,
        text.slice(
          0,
          500
        )
      );

      return json(
        {
          ok: false,
          error:
            'Не удалось получить данные персонажа',
        },
        502
      );
    }


    /* ========================================================
       ЧИТАЕМ JSON
       ======================================================== */

    let data;

    try {
      data =
        await response
          .json();

    } catch (
      error
    ) {
      console.error(
        'character service JSON error:',
        characterId,
        error
      );

      return json(
        {
          ok: false,
          error:
            'Источник персонажа вернул некорректные данные',
        },
        502
      );
    }


    /* ========================================================
       ОШИБКА ИЗ APPS SCRIPT
       ======================================================== */

    if (
      !data ||
      data.ok !==
      true
    ) {
      const sourceError =
        String(
          data?.error ||
          'Не удалось загрузить персонажа'
        );

      console.error(
        'character service error:',
        characterId,
        sourceError
      );

      const normalizedError =
        sourceError
          .toLowerCase();

      const isNotFound =
        normalizedError
          .includes(
            'не найден'
          ) ||
        normalizedError
          .includes(
            'отключён'
          );

      return json(
        {
          ok: false,
          error:
            sourceError,
        },
        isNotFound
          ? 404
          : 502
      );
    }


    /* ========================================================
       ГОТОВО
       ======================================================== */

    return json(
      data
    );

  } catch (
    error
  ) {
    console.error(
      'character-data function error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          'Не удалось загрузить личное дело',
      },
      500
    );
  }
};