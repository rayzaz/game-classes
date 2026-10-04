import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  getCharacterDbStore,
  characterKey,
} from './_character-db/store.mjs';

import {
  withCharacterPortraitProxy,
} from './_character-db/portrait.mjs';


function cleanText(value) {
  return String(value ?? '').trim();
}


function normalizeCharacterId(value) {
  return cleanText(value).toLowerCase();
}


function loadCharacterServiceUrl() {
  const raw =
    cleanText(
      process.env.CHARACTER_SERVICE_URL
    );

  if (!raw) {
    throw new Error(
      'Не задан CHARACTER_SERVICE_URL'
    );
  }

  return raw;
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


async function readCharacterFromDb(
  characterId
) {
  const store =
    getCharacterDbStore();

  const document =
    await store.get(
      characterKey(characterId),
      {
        type: 'json',
        consistency: 'strong',
      }
    );

  return isUsableCharacterDocument(
    document,
    characterId
  )
    ? document
    : null;
}


async function fetchCharacterFromGoogle(
  characterId
) {
  const serviceUrl =
    new URL(
      loadCharacterServiceUrl()
    );

  serviceUrl.searchParams.set(
    'characterId',
    characterId
  );

  serviceUrl.searchParams.set(
    '_',
    String(Date.now())
  );

  const response =
    await fetch(
      serviceUrl,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
        cache: 'no-store',
        redirect: 'follow',
      }
    );

  if (!response.ok) {
    console.error(
      'admin character service HTTP error:',
      characterId,
      response.status
    );

    return {
      ok: false,
      status: 502,
      error:
        'Центральный сервис персонажей недоступен',
    };
  }

  let data;

  try {
    data =
      await response.json();
  } catch (error) {
    console.error(
      'admin character service JSON error:',
      characterId,
      error
    );

    return {
      ok: false,
      status: 502,
      error:
        'Центральный сервис вернул некорректные данные',
    };
  }

  if (
    !data ||
    data.ok !== true
  ) {
    const sourceError =
      cleanText(
        data?.error ||
        'Не удалось загрузить персонажа'
      );

    const normalizedError =
      sourceError.toLowerCase();

    const isNotFound =
      normalizedError.includes(
        'не найден'
      ) ||
      normalizedError.includes(
        'отключён'
      );

    return {
      ok: false,
      status:
        isNotFound
          ? 404
          : 502,
      error:
        sourceError,
    };
  }

  return {
    ok: true,
    data,
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

    const requestUrl =
      new URL(
        request.url
      );

    const characterId =
      normalizeCharacterId(
        requestUrl
          .searchParams
          .get(
            'characterId'
          )
      );

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

    try {
      const stored =
        await readCharacterFromDb(
          characterId
        );

      if (stored) {
        console.log(
          'admin-character-data DB HIT:',
          characterId
        );

        return json(
          withCharacterPortraitProxy(
            stored.data,
            characterId,
            stored.syncedAt ||
            stored.sourceVersion ||
            stored.data?.updatedAt ||
            ''
          )
        );
      }

      console.warn(
        'admin-character-data DB MISS -> Google fallback:',
        characterId
      );

    } catch (error) {
      console.error(
        'admin-character-data DB read error -> Google fallback:',
        characterId,
        error
      );
    }

    const fallback =
      await fetchCharacterFromGoogle(
        characterId
      );

    if (!fallback.ok) {
      return json(
        {
          ok: false,
          error:
            fallback.error,
        },
        fallback.status
      );
    }

    return json(
      fallback.data
    );

  } catch (error) {
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
