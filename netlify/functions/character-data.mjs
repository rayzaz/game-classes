import {
  json,
  readSession,
} from './_auth.mjs';

function loadCharacterUrls() {
  const raw =
    process.env
      .CHARACTER_DATA_URLS_JSON;

  if (!raw) {
    throw new Error(
      'Не задана CHARACTER_DATA_URLS_JSON'
    );
  }

  const parsed =
    JSON.parse(raw);

  if (
    !parsed ||
    typeof parsed !==
    'object' ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      'CHARACTER_DATA_URLS_JSON должен быть JSON-объектом'
    );
  }

  return parsed;
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
            'Сначала войдите в личный кабинет',
        },
        401
      );
    }


    const urls =
      loadCharacterUrls();


    const source =
      urls[
        session.cid
      ];


    if (!source) {
      return json(
        {
          ok: false,
          error:
            'Кабинет этого персонажа ещё не подключён',
        },
        404
      );
    }


    const url =
      new URL(
        String(source)
      );


    url.searchParams.set(
      '_',
      String(Date.now())
    );


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


    if (!response.ok) {
      console.error(
        'character source error',
        response.status,
        text.slice(0, 300)
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


    let data;

    try {
      data =
        JSON.parse(text);
    } catch {
      return json(
        {
          ok: false,
          error:
            'Источник персонажа вернул некорректные данные',
        },
        502
      );
    }


    return json(
      data
    );

  } catch (error) {

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
