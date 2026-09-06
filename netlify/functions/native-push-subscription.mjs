import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  deleteNativePushDevice,
  isFirebasePushConfigured,
  listNativePushDevices,
  saveNativePushDevice,
} from './_shared/_notifications.mjs';


function sameOrigin(request) {
  const origin =
    request.headers.get('origin');

  if (!origin) return true;

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
        await listNativePushDevices({
          login:
            session.sub,
        });

      return json({
        ok: true,
        configured:
          isFirebasePushConfigured(),
        platform:
          'android',
        devices:
          records.filter(
            item =>
              item.platform === 'android'
          ).length,
      });
    }

    const body =
      await request.json()
        .catch(() => ({}));

    if (request.method === 'POST') {
      if (!isFirebasePushConfigured()) {
        return json(
          {
            ok: false,
            error:
              'Firebase Cloud Messaging ещё не настроен на сервере',
          },
          503
        );
      }

      const record =
        await saveNativePushDevice({
          login:
            session.sub,
          role:
            session.role,
          characterId:
            session.cid || '',
          platform:
            body?.platform ||
            'android',
          token:
            body?.token,
          userAgent:
            request.headers.get(
              'user-agent'
            ) || '',
        });

      return json({
        ok: true,
        subscribed: true,
        platform:
          record.platform,
        updatedAt:
          record.updatedAt,
      });
    }

    const removed =
      await deleteNativePushDevice({
        login:
          session.sub,
        platform:
          body?.platform ||
          'android',
        token:
          body?.token || '',
      });

    return json({
      ok: true,
      subscribed: false,
      removed,
    });

  } catch (error) {
    console.error(
      'native-push-subscription error:',
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
