import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';


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

    const url =
      new URL(
        request.url
      );

    const jobId =
      cleanText(
        url.searchParams.get(
          'jobId'
        ),
        64
      );

    if (
      !/^[a-f0-9]{24}$/i
        .test(
          jobId
        )
    ) {
      return json(
        {
          ok: false,
          error:
            'Некорректный jobId',
        },
        400
      );
    }

    const store =
      getStore({
        name:
          CREATE_JOB_STORE,
        consistency:
          'strong',
      });

    const job =
      await store.get(
        `jobs/${jobId}`,
        {
          type:
            'json',
          consistency:
            'strong',
        }
      );

    if (!job) {
      return json(
        {
          ok: true,
          job: {
            fingerprint:
              jobId,
            status:
              'queued',
          },
        }
      );
    }

    return json({
      ok: true,
      job,
    });

  } catch (
    error
  ) {
    console.error(
      'admin-google-create-status:',
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
