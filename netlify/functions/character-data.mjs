import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  getCharacterDbStore,
  characterKey,
} from './_character-db/store.mjs';


/* ============================================================
   PLAYER CHARACTER DATA — CHARACTER DB FIRST V1

   Normal path:
     session -> Netlify Blobs -> response

   Google Sheets / Apps Script remains SOURCE OF TRUTH.
   If the cached document is older than REFRESH_AFTER_MS, the
   response is still returned immediately from Character DB and a
   refresh from Google is scheduled with context.waitUntil().

   If Character DB has no usable document, Google is used
   synchronously as a safe fallback and the result is written back
   into Character DB.
   ============================================================ */

const REFRESH_AFTER_MS = 30 * 1000;


function cleanText(value) {
  return String(value ?? '').trim();
}


function normalizeCharacterId(value) {
  return cleanText(value)
    .toLowerCase();
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


function documentAgeMs(document) {
  const raw =
    cleanText(
      document?.syncedAt ||
      document?.data?.updatedAt
    );

  const time =
    Date.parse(raw);

  if (!Number.isFinite(time)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(
    0,
    Date.now() - time
  );
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


function stablePortraitForRefresh(
  data,
  existingDocument,
  characterId
) {
  if (
    !data ||
    typeof data !== 'object' ||
    !data.character ||
    typeof data.character !== 'object'
  ) {
    return data;
  }

  const incoming =
    cleanText(
      data.character.portrait
    );

  if (
    incoming &&
    !incoming.includes('/sheetsz/')
  ) {
    return data;
  }

  const stored =
    cleanText(
      existingDocument?.data?.character?.portrait
    );

  const fallback =
    stored &&
    !stored.includes('/sheetsz/')
      ? stored
      : `/cards/characters/${normalizeCharacterId(characterId)}.jpg`;

  return {
    ...data,
    character: {
      ...data.character,
      portrait: fallback,
    },
  };
}


async function readCharacterFromDb(
  characterId
) {
  try {
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

  } catch (error) {
    console.error(
      'character DB read error:',
      characterId,
      error
    );

    return null;
  }
}


async function writeCharacterToDb(
  characterId,
  data,
  existingDocument = null
) {
  const safeData =
    stablePortraitForRefresh(
      data,
      existingDocument,
      characterId
    );

  const now =
    new Date().toISOString();

  const document = {
    ok: true,
    schemaVersion: 1,
    source: 'google-sheets',
    characterId:
      normalizeCharacterId(
        characterId
      ),
    sourceVersion:
      cleanText(
        safeData?.updatedAt || now
      ),
    syncedAt:
      now,
    data:
      safeData,
  };

  const store =
    getCharacterDbStore();

  await store.setJSON(
    characterKey(characterId),
    document
  );

  return document;
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

  /*
    Не разрешаем внешнему кэшу вернуть старый JSON.
  */
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
    const text =
      await response.text();

    console.error(
      'character service HTTP error:',
      characterId,
      response.status,
      text.slice(0, 500)
    );

    const error =
      new Error(
        'Не удалось получить данные персонажа'
      );

    error.status = 502;
    throw error;
  }

  let data;

  try {
    data =
      await response.json();
  } catch (error) {
    console.error(
      'character service JSON error:',
      characterId,
      error
    );

    const invalidJsonError =
      new Error(
        'Источник персонажа вернул некорректные данные'
      );

    invalidJsonError.status = 502;
    throw invalidJsonError;
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

    console.error(
      'character service error:',
      characterId,
      sourceError
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

    const upstreamError =
      new Error(sourceError);

    upstreamError.status =
      isNotFound
        ? 404
        : 502;

    throw upstreamError;
  }

  return data;
}


async function refreshCharacterDb(
  characterId,
  existingDocument = null
) {
  const data =
    await fetchCharacterFromGoogle(
      characterId
    );

  return writeCharacterToDb(
    characterId,
    data,
    existingDocument
  );
}


function scheduleBackgroundRefresh(
  context,
  characterId,
  existingDocument
) {
  if (
    !context ||
    typeof context.waitUntil !== 'function'
  ) {
    console.warn(
      'character DB refresh skipped: context.waitUntil unavailable',
      characterId
    );
    return;
  }

  context.waitUntil(
    refreshCharacterDb(
      characterId,
      existingDocument
    )
      .then(() => {
        console.log(
          'character DB background refresh pass:',
          characterId
        );
      })
      .catch((error) => {
        console.error(
          'character DB background refresh error:',
          characterId,
          error
        );
      })
  );
}


/* ============================================================
   NETLIFY FUNCTION
   ============================================================ */

export default async (
  request,
  context
) => {

  /* ==========================================================
     ONLY GET
     ========================================================== */

  if (
    request.method !== 'GET'
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
       SESSION
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
       CHARACTER FROM SESSION
       ======================================================== */

    const characterId =
      normalizeCharacterId(
        session.cid
      );

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
       FAST PATH: CHARACTER DB
       ======================================================== */

    const stored =
      await readCharacterFromDb(
        characterId
      );

    if (stored) {
      const ageMs =
        documentAgeMs(stored);

      console.log(
        'character-data DB HIT:',
        characterId,
        'ageMs=',
        ageMs
      );

      /*
        Пользователь получает Character DB сразу.
        Если запись уже не совсем свежая — Google обновляет её
        после отправки ответа и не задерживает открытие кабинета.
      */
      if (
        ageMs >=
        REFRESH_AFTER_MS
      ) {
        scheduleBackgroundRefresh(
          context,
          characterId,
          stored
        );
      }

      return json(
        stored.data
      );
    }


    /* ========================================================
       SAFE FALLBACK: GOOGLE

       Это должно происходить только если Character DB ещё не
       содержит персонажа или чтение Blobs временно не удалось.
       ======================================================== */

    console.warn(
      'character-data DB MISS -> Google fallback:',
      characterId
    );

    const data =
      await fetchCharacterFromGoogle(
        characterId
      );

    try {
      await writeCharacterToDb(
        characterId,
        data,
        null
      );
    } catch (error) {
      /*
        Даже если кэш не удалось обновить, живые данные Google
        всё равно можно отдать пользователю.
      */
      console.error(
        'character DB fallback write error:',
        characterId,
        error
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

    const status =
      Number(error?.status) ||
      500;

    const message =
      status === 404
        ? cleanText(
            error?.message ||
            'Персонаж не найден'
          )
        : status === 502
          ? cleanText(
              error?.message ||
              'Не удалось получить данные персонажа'
            )
          : 'Не удалось загрузить личное дело';

    return json(
      {
        ok: false,
        error:
          message,
      },
      status
    );
  }
};
