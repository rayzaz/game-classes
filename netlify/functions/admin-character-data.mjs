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
   ФУНКЦИЯ NETLIFY
   ============================================================ */

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

    /* ========================================================
       ПРОВЕРЯЕМ СЕССИЮ
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
            'Сначала войдите в систему',
        },
        401
      );
    }


    /* ========================================================
       ТОЛЬКО АДМИНИСТРАТОР
       ======================================================== */

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


    /* ========================================================
       CHARACTER ID
       ======================================================== */

    const requestUrl =
      new URL(
        request.url
      );

    const characterId =
      String(
        requestUrl
          .searchParams
          .get(
            'characterId'
          ) ||
        ''
      )
        .trim()
        .toLowerCase();

    if (!characterId) {
      return json(
        {
          ok: false,
          error:
            'Не указан characterId',
        },
        400
      );
    }


    /* ========================================================
       СОБИРАЕМ URL ЦЕНТРАЛЬНОГО APPS SCRIPT
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
      Не даём браузеру/прокси
      вернуть старый JSON.
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
       ЗАПРАШИВАЕМ ПЕРСОНАЖА
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

    if (
      !response.ok
    ) {
      console.error(
        'character service HTTP error:',
        characterId,
        response.status
      );

      return json(
        {
          ok: false,
          error:
            'Центральный сервис персонажей недоступен',
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
        await response.json();
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
            'Центральный сервис вернул некорректные данные',
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
       ВСЁ ХОРОШО
       ======================================================== */

    return json(
      data
    );

  } catch (
    error
  ) {
    console.error(
      'admin-character-data function error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          'Не удалось загрузить данные персонажа',
      },
      500
    );
  }
};