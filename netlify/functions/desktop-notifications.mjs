import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  deleteDesktopDevice,
  listDesktopNotifications,
  registerDesktopDevice,
} from './_shared/_notifications.mjs';


export default async function (request) {
  if (
    request.method !== 'GET' &&
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

    if (request.method === 'DELETE') {
      const removed =
        await deleteDesktopDevice({
          login:
            session.sub,
        });

      return json({
        ok: true,
        removed,
      });
    }

    const url =
      new URL(request.url);

    const since =
      Math.max(
        0,
        Number(
          url.searchParams.get('since') ||
          0
        ) || 0
      );

    await registerDesktopDevice({
      login:
        session.sub,
      role:
        session.role,
      characterId:
        session.cid || '',
      userAgent:
        request.headers.get(
          'user-agent'
        ) || '',
    });

    const notifications =
      await listDesktopNotifications({
        login:
          session.sub,
        since,
      });

    return json({
      ok: true,
      notifications,
      latest:
        notifications.length
          ? Math.max(
              ...notifications.map(
                item =>
                  Number(item.timestamp) || 0
              )
            )
          : since,
    });

  } catch (error) {
    console.error(
      'desktop-notifications error:',
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
