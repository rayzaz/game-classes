import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  sendUnifiedNotification,
} from './_shared/_notifications.mjs';


export default async function (request) {
  if (request.method !== 'POST') {
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

    const result =
      await sendUnifiedNotification({
        logins: [session.sub],
        payload: {
          title:
            'Уведомления работают ✦',
          body:
            'Это тестовое сообщение от Гос.Маг.Услуг.',
          url: '/',
          tag:
            'gosmag-push-test',
        },
      });

    return json({
      ok: true,
      result,
    });

  } catch (error) {
    console.error(
      'push-test error:',
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
