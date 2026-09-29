import {
  json,
  readSession,
} from './_shared/_auth.mjs';


const REQUEST_TIMEOUT_MS =
  10_000;


function normalizeCharacterServiceUrl(
  raw
) {
  const value =
    String(
      raw || ''
    ).trim();

  if (!value) {
    return '';
  }

  try {
    const url =
      new URL(
        value
      );

    if (
      /\/dev\/?$/i.test(
        url.pathname
      )
    ) {
      url.pathname =
        url.pathname.replace(
          /\/dev\/?$/i,
          '/exec'
        );
    }

    return url.toString();

  } catch {
    return value.replace(
      /\/dev\/?$/i,
      '/exec'
    );
  }
}


function loadCharacterServiceUrl() {
  const value =
    normalizeCharacterServiceUrl(
      process.env.CHARACTER_SERVICE_URL
    );

  if (!value) {
    throw new Error(
      'Не задан CHARACTER_SERVICE_URL'
    );
  }

  return value;
}


function cleanText(
  value,
  maxLength = 1000
) {
  return String(
    value ?? ''
  )
    .trim()
    .slice(
      0,
      maxLength
    );
}


function networkErrorMessage(
  error
) {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  const cause =
    error &&
    typeof error === 'object'
      ? error.cause
      : null;

  const code =
    cause &&
    typeof cause === 'object'
      ? cleanText(
          cause.code
        )
      : '';

  const causeMessage =
    cause &&
    typeof cause === 'object'
      ? cleanText(
          cause.message
        )
      : '';

  return [
    message,
    code,
    causeMessage,
  ]
    .filter(Boolean)
    .filter(
      (item, index, all) =>
        all.indexOf(item) === index
    )
    .join(' · ');
}


async function fetchServiceJson(
  serviceUrl,
  params
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
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS
    );

  const startedAt =
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

    const text =
      await response
        .text();

    if (!response.ok) {
      const looksLikeHtml =
        /^\s*</.test(
          text
        );

      throw new Error(
        response.status === 404 &&
        looksLikeHtml
          ? 'CHARACTER_SERVICE_URL недоступен (HTTP 404). Нужен текущий Apps Script Web App URL с /exec.'
          : `HTTP ${response.status}${text ? ` — ${text.slice(0, 220)}` : ''}`
      );
    }

    let data;

    try {
      data =
        JSON.parse(
          text
        );
    } catch {
      throw new Error(
        `Apps Script вернул не JSON: ${text.slice(0, 220) || 'пустой ответ'}`
      );
    }

    if (
      data?.ok !==
      true
    ) {
      throw new Error(
        cleanText(
          data?.error ||
          'Apps Script вернул ok=false'
        )
      );
    }

    return {
      data,
      responseMs:
        Date.now() -
        startedAt,
    };

  } catch (
    error
  ) {
    if (
      error &&
      typeof error === 'object' &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        `Apps Script не ответил за ${REQUEST_TIMEOUT_MS} мс`
      );
    }

    throw new Error(
      networkErrorMessage(
        error
      ) ||
      'Ошибка сетевого запроса к Apps Script'
    );

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

    const serviceUrl =
      loadCharacterServiceUrl();

    const requestUrl =
      new URL(
        request.url
      );

    const mode =
      cleanText(
        requestUrl
          .searchParams
          .get('mode') ||
        'ping'
      )
        .toLowerCase();

    /*
      Старый mode=registry оставлен для совместимости
      с диагностическим экраном, но теперь использует registry-lite
      и не читает «Маги», портреты или полный layout.
    */
    if (
      mode ===
      'registry'
    ) {
      const result =
        await fetchServiceJson(
          serviceUrl,
          {
            action:
              'registry-lite',
          }
        );

      const characters =
        Array.isArray(
          result.data
            ?.characters
        )
          ? result.data.characters
          : [];

      return json({
        ok: true,
        mode:
          'registry-lite',
        serviceConfigured:
          true,
        checkedAt:
          new Date()
            .toISOString(),

        service: {
          ok: true,
          responseMs:
            result.responseMs,
          version:
            cleanText(
              result.data?.version
            ),
          runtimeUsesLiveDonor:
            result.data
              ?.runtimeUsesLiveDonor ===
              true,
        },

        registry: {
          ok: true,
          count:
            characters.length,
          responseMs:
            result.responseMs,
          elapsedMs:
            result.responseMs,
          sample:
            characters.slice(
              0,
              5
            ),
          characters,
        },

        writesPerformed:
          0,
      });
    }

    /*
      Обычная «Проверка связи» — настоящий лёгкий ping.
      Никаких таблиц Google здесь не читается вообще,
      поэтому функция не должна упираться в 30-секундный
      лимит локальной Netlify Lambda.
    */
    const result =
      await fetchServiceJson(
        serviceUrl,
        {
          action:
            'ping',
        }
      );

    return json({
      ok: true,
      mode:
        'ping',
      serviceConfigured:
        true,
      checkedAt:
        new Date()
          .toISOString(),

      service: {
        ok: true,
        responseMs:
          result.responseMs,
        version:
          cleanText(
            result.data?.version
          ),
        runtimeUsesLiveDonor:
          result.data
            ?.runtimeUsesLiveDonor ===
            true,
        donorCharacterIdRequired:
          result.data
            ?.donorCharacterIdRequired ===
            true,
      },

      writesPerformed:
        0,
    });

  } catch (
    error
  ) {
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
            : String(error),
        writesPerformed:
          0,
      },
      502
    );
  }
}
