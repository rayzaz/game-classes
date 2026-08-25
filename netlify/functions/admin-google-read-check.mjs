import {
  json,
  readSession,
} from './_shared/_auth.mjs';


const REQUEST_TIMEOUT_MS =
  55_000;


function loadCharacterServiceUrl() {
  const raw = String(
    process.env.CHARACTER_SERVICE_URL || ''
  ).trim();

  if (!raw) {
    throw new Error(
      'Не задан CHARACTER_SERVICE_URL'
    );
  }

  return raw;
}


function compactCharacter(character) {
  const characterId = String(
    character?.characterId ||
    character?.id ||
    ''
  )
    .trim()
    .toLowerCase();

  return {
    characterId,
    id: characterId,

    name: String(
      character?.name ||
      characterId ||
      'Без имени'
    ).trim(),

    className: String(
      character?.className ||
      ''
    ).trim(),

    squad: String(
      character?.squad ||
      ''
    ).trim(),

    active:
      character?.active !== false,
  };
}


async function readJson(response) {
  const text = await response
    .text()
    .catch(() => '');

  if (!text) {
    throw new Error(
      'Сервис вернул пустой ответ'
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Сервис вернул не JSON: ${text.slice(0, 220)}`
    );
  }
}


async function fetchServiceJson(
  serviceUrl,
  params,
  timeoutMs = REQUEST_TIMEOUT_MS
) {
  const url =
    new URL(
      serviceUrl
    );

  Object.entries(
    params || {}
  ).forEach(
    ([key, value]) => {
      if (
        value === undefined ||
        value === null ||
        value === ''
      ) {
        return;
      }

      url.searchParams.set(
        key,
        String(value)
      );
    }
  );

  url.searchParams.set(
    '_',
    String(Date.now())
  );

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  const started =
    Date.now();

  try {
    const response =
      await fetch(
        url.toString(),
        {
          method: 'GET',

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

    const responseMs =
      Date.now() -
      started;

    if (!response.ok) {
      const text = await response
        .text()
        .catch(() => '');

      return {
        ok: false,
        responseMs,
        status:
          response.status,
        data: null,
        error:
          `HTTP ${response.status}${
            text
              ? ` — ${text.slice(0, 220)}`
              : ''
          }`,
      };
    }

    try {
      const data =
        await readJson(
          response
        );

      return {
        ok:
          data?.ok === true,
        responseMs,
        status:
          response.status,
        data,
        error:
          data?.ok === true
            ? ''
            : String(
                data?.error ||
                'Сервис вернул ok=false'
              ),
      };
    } catch (error) {
      return {
        ok: false,
        responseMs,
        status:
          response.status,
        data: null,
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось прочитать JSON',
      };
    }
  } catch (error) {
    const responseMs =
      Date.now() -
      started;

    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      return {
        ok: false,
        responseMs,
        status: 0,
        data: null,
        error:
          `Превышено время ожидания ${timeoutMs} мс`,
      };
    }

    return {
      ok: false,
      responseMs,
      status: 0,
      data: null,
      error:
        error instanceof Error
          ? error.message
          : 'Ошибка запроса к Google-сервису',
    };
  } finally {
    clearTimeout(
      timer
    );
  }
}


export default async function (
  request
) {
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
      session.role !== 'admin'
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

    const serviceUrl =
      loadCharacterServiceUrl();

    const requestUrl =
      new URL(
        request.url
      );

    const mode = String(
      requestUrl.searchParams.get('mode') ||
      'full'
    )
      .trim()
      .toLowerCase();


    /* ========================================================
       ТОЛЬКО РЕЕСТР ДЛЯ АУДИТА ДОНОРОВ

       Это отдельный быстрый режим. Layout здесь вообще
       не вызывается, поэтому аудит доноров больше не зависит
       от старой admin-characters function и не тащит лишнюю
       тяжёлую проверку разметки.
       ======================================================== */

    if (
      mode === 'registry'
    ) {
      const listResult =
        await fetchServiceJson(
          serviceUrl,
          {
            action:
              'list',
          }
        );

      if (!listResult.ok) {
        return json(
          {
            ok: false,
            mode:
              'registry',
            error:
              `Не удалось прочитать реестр: ${listResult.error}`,
            writesPerformed: 0,
          },
          502
        );
      }

      const sourceCharacters =
        Array.isArray(
          listResult.data?.characters
        )
          ? listResult.data.characters
          : [];

      const characters =
        sourceCharacters
          .map(
            compactCharacter
          )
          .filter(
            character =>
              character.characterId
          );

      return json({
        ok: true,
        mode:
          'registry',
        serviceConfigured:
          true,
        checkedAt:
          new Date()
            .toISOString(),

        registry: {
          ok: true,
          count:
            characters.length,
          responseMs:
            listResult.responseMs,
          elapsedMs:
            listResult.responseMs,
          sample:
            characters.slice(
              0,
              5
            ),
          characters,
        },

        writesPerformed: 0,
      });
    }


    /* ========================================================
       ОБЫЧНАЯ ПРОВЕРКА СВЯЗИ
       ======================================================== */

    const [
      listResult,
      layoutResult,
    ] =
      await Promise.all([
        fetchServiceJson(
          serviceUrl,
          {
            action:
              'list',
          }
        ),

        fetchServiceJson(
          serviceUrl,
          {
            action:
              'layout',
          }
        ),
      ]);


    if (!listResult.ok) {
      return json(
        {
          ok: false,
          error:
            `Не удалось прочитать реестр: ${listResult.error}`,
          writesPerformed: 0,
        },
        502
      );
    }


    const sourceCharacters =
      Array.isArray(
        listResult.data?.characters
      )
        ? listResult.data.characters
        : [];


    const characters =
      sourceCharacters
        .map(
          compactCharacter
        )
        .filter(
          character =>
            character.characterId
        );


    const layout =
      layoutResult.ok
        ? {
            ...layoutResult.data,
            responseMs:
              layoutResult.responseMs,
            elapsedMs:
              layoutResult.responseMs,
          }
        : {
            ok: false,
            mode:
              'read-only',
            responseMs:
              layoutResult.responseMs,
            elapsedMs:
              layoutResult.responseMs,
            error:
              layoutResult.error,
            writesPerformed: 0,
          };


    return json({
      ok: true,
      mode:
        'read-only',
      serviceConfigured:
        true,
      checkedAt:
        new Date()
          .toISOString(),

      registry: {
        ok: true,
        count:
          characters.length,
        responseMs:
          listResult.responseMs,
        elapsedMs:
          listResult.responseMs,
        sample:
          characters.slice(
            0,
            5
          ),
      },

      detailProbe: {
        ok: true,
        skipped: true,
        characterId: '',
        name:
          'Проверяется отдельно в аудите доноров',
        responseMs: 0,
        fields: [],
        error: '',
      },

      layout,

      writesPerformed: 0,
    });

  } catch (error) {
    console.error(
      'admin-google-read-check error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось проверить связь с Google-сервисом',
        writesPerformed: 0,
      },
      500
    );
  }
}