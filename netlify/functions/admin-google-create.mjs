import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';


const PLAN_STORE =
  'gosmag-google-create-plans';

const CREATE_JOB_STORE =
  'gosmag-google-create-jobs';


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


function workerUrlForRequest(
  request
) {
  return new URL(
    '/.netlify/functions/admin-google-create-worker',
    request.url
  );
}


async function setJob(
  fingerprint,
  value
) {
  const store =
    getStore({
      name:
        CREATE_JOB_STORE,

      consistency:
        'strong',
    });

  await store.setJSON(
    `jobs/${fingerprint}`,
    {
      fingerprint,
      ...value,
      updatedAt:
        new Date().toISOString(),
    }
  );
}


async function getJob(
  fingerprint
) {
  const store =
    getStore({
      name:
        CREATE_JOB_STORE,

      consistency:
        'strong',
    });

  return await store.get(
    `jobs/${fingerprint}`,
    {
      type:
        'json',

      consistency:
        'strong',
    }
  );
}


async function getPlan(
  fingerprint
) {
  const store =
    getStore({
      name:
        PLAN_STORE,

      consistency:
        'strong',
    });

  return await store.get(
    `plans/${fingerprint}`,
    {
      type:
        'json',

      consistency:
        'strong',
    }
  );
}


export default async function (
  request
) {
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

    const body =
      await request
        .json()
        .catch(
          () => ({})
        );

    const fingerprint =
      cleanText(
        body?.fingerprint,
        64
      );

    if (
      !/^[a-f0-9]{24}$/i.test(
        fingerprint
      )
    ) {
      return json(
        {
          ok: false,
          error:
            'Некорректный отпечаток подготовленного плана',
        },
        400
      );
    }

    /*
      Проверяем, что prepare-план действительно существует.
      Сам worker повторит все write-side проверки ещё раз.
    */
    const plan =
      await getPlan(
        fingerprint
      );

    if (!plan) {
      return json(
        {
          ok: false,
          error:
            'Подготовленный план не найден. Нажмите «Проверить готовность» ещё раз.',
        },
        404
      );
    }

    if (
      cleanText(
        plan?.fingerprint
      ) !==
      fingerprint ||
      cleanText(
        plan?.mode
      ) !==
      'candidate'
    ) {
      return json(
        {
          ok: false,
          error:
            'Подготовленный план не соответствует текущей схеме создания кандидата.',
        },
        409
      );
    }

    const expiresAt =
      Date.parse(
        cleanText(
          plan?.expiresAt
        )
      );

    if (
      !Number.isFinite(
        expiresAt
      ) ||
      Date.now() >
        expiresAt
    ) {
      return json(
        {
          ok: false,
          error:
            'Подготовленный план устарел. Выполните серверную проверку заново.',
        },
        409
      );
    }

    /*
      Защита от двойного клика / повторной отправки.
      jobId намеренно равен fingerprint — worker уже использует этот ключ.
    */
    const existing =
      await getJob(
        fingerprint
      );

    if (
      existing?.status ===
        'queued' ||
      existing?.status ===
        'running' ||
      existing?.status ===
        'success'
    ) {
      return json({
        ok: true,
        jobId:
          fingerprint,
        status:
          existing.status,
        message:
          existing.status ===
          'success'
            ? 'Создание уже завершено. Загружаю результат.'
            : 'Создание уже запущено. Продолжаю ждать результат.',
      });
    }

    /*
      Ошибочный job не перезапускаем тем же кликом:
      при частичной записи в Google автоматический retry опасен.
    */
    if (
      existing?.status ===
      'error'
    ) {
      return json(
        {
          ok: false,
          error:
            cleanText(
              existing?.error
            ) ||
            'Предыдущая попытка завершилась ошибкой. Сначала проверьте статус анкеты и Google-таблицы, затем выполните «Проверить готовность» заново.',
        },
        409
      );
    }

    const queuedAt =
      new Date()
        .toISOString();

    await setJob(
      fingerprint,
      {
        status:
          'queued',
        queuedAt,
        startedAt:
          '',
        finishedAt:
          '',
        result:
          null,
        error:
          '',
      }
    );

    const headers = {
      accept:
        'application/json',

      'content-type':
        'application/json',
    };

    const cookie =
      cleanText(
        request.headers.get(
          'cookie'
        ),
        12000
      );

    if (cookie) {
      headers.cookie =
        cookie;
    }

    const authorization =
      cleanText(
        request.headers.get(
          'authorization'
        ),
        4000
      );

    if (authorization) {
      headers.authorization =
        authorization;
    }

    let workerResponse;

    try {
      workerResponse =
        await fetch(
          workerUrlForRequest(
            request
          ),
          {
            method:
              'POST',

            headers,

            cache:
              'no-store',

            body:
              JSON.stringify({
                fingerprint,
              }),
          }
        );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await setJob(
        fingerprint,
        {
          status:
            'error',
          finishedAt:
            new Date().toISOString(),
          error:
            `Не удалось запустить фоновую функцию: ${message}`,
        }
      );

      throw error;
    }

    /*
      Background Function обычно подтверждает запуск HTTP 202.
      Допускаем любой 2xx, чтобы одинаково работать и в Netlify Dev.
    */
    if (
      !workerResponse.ok
    ) {
      const text =
        await workerResponse
          .text()
          .catch(
            () => ''
          );

      const detail =
        cleanText(
          text,
          500
        );

      await setJob(
        fingerprint,
        {
          status:
            'error',
          finishedAt:
            new Date().toISOString(),
          error:
            detail
              ? `Фоновая функция не запустилась: HTTP ${workerResponse.status}: ${detail}`
              : `Фоновая функция не запустилась: HTTP ${workerResponse.status}`,
        }
      );

      return json(
        {
          ok: false,
          error:
            detail
              ? `Не удалось запустить фоновое создание: ${detail}`
              : `Не удалось запустить фоновое создание: HTTP ${workerResponse.status}`,
        },
        502
      );
    }

    return json({
      ok: true,
      jobId:
        fingerprint,
      status:
        'queued',
      message:
        'Создание кандидата поставлено в очередь.',
    });

  } catch (
    error
  ) {
    console.error(
      'admin-google-create start:',
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
}
