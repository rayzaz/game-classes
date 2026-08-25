import {
  getStore,
} from '@netlify/blobs';

import {
  json,
} from './_shared/_auth.mjs';

import {
  requireEventManager,
} from './_shared/_event-permissions.mjs';


const JOBS_STORE =
  'gosmag-event-completion-jobs';


function cleanText(
  value
) {
  return String(
    value ?? ''
  ).trim();
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

  const access =
    await requireEventManager(
      request
    );

  if (access.error) {
    return access.error;
  }

  const url =
    new URL(
      request.url
    );

  const jobId =
    cleanText(
      url.searchParams.get(
        'jobId'
      )
    );

  if (
    !/^[a-zA-Z0-9_-]{8,100}$/
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

  const job =
    await getStore({
      name:
        JOBS_STORE,
      consistency:
        'strong',
    }).get(
      `jobs/${jobId}`,
      {
        type:
          'json',
        consistency:
          'strong',
      }
    );

  if (!job) {
    return json({
      ok: true,
      job: {
        jobId,
        state:
          'queued',
        message:
          'Задача поставлена в очередь...',
      },
    });
  }

  return json({
    ok: true,
    job,
  });
}
