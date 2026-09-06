import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  deletePushSubscription,
  getPublicVapidKey,
  isPushConfigured,
  listPushSubscriptions,
  savePushSubscription,
} from './_shared/_push.mjs';


function sameOrigin(request) {
  const origin =
    request.headers.get('origin');

  if (!origin) {
    return true;
  }

  try {
    return (
      new URL(origin).origin ===
      new URL(request.url).origin
    );
  } catch {
    return false;
  }
}


export default async function (request) {
  if (
    request.method !== 'GET' &&
    request.method !== 'POST' &&
    request.method !== 'DELETE'
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
      readSession(request);

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
      request.method !== 'GET' &&
      !sameOrigin(request)
    ) {
      return json(
        {
          ok: false,
          error:
            'Запрос с другого сайта отклонён',
        },
        403
      );
    }

    if (request.method === 'GET') {
      const records =
        await listPushSubscriptions({
          login: session.sub,
        });

      return json({
        ok: true,
        configured:
          isPushConfigured(),
        publicKey:
          getPublicVapidKey(),
        devices:
          records.length,
      });
    }

    const body =
      await request.json()
        .catch(() => ({}));

    if (request.method === 'POST') {
      if (!isPushConfigured()) {
        return json(
          {
            ok: false,
            error:
              'Push-уведомления ещё не настроены на сервере',
          },
          503
        );
      }

      const record =
        await savePushSubscription({
          login: session.sub,
          role: session.role,
          characterId:
            session.cid || '',
          subscription:
            body?.subscription,
          userAgent:
            request.headers.get(
              'user-agent'
            ) || '',
        });

      return json({
        ok: true,
        subscribed: true,
        deviceUpdatedAt:
          record.updatedAt,
      });
    }

    const removed =
      await deletePushSubscription({
        login: session.sub,
        endpoint:
          String(
            body?.endpoint ||
            ''
          ).trim(),
      });

    return json({
      ok: true,
      subscribed: false,
      removed,
    });

  } catch (error) {
    console.error(
      'push-subscription error:',
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
