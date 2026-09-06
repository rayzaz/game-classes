import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  notificationChannelStats,
  sendUnifiedNotification,
} from './_shared/_notifications.mjs';


function requireAdmin(request) {
  const session =
    readSession(request);

  if (!session) {
    return {
      error: json(
        {
          ok: false,
          error:
            'Сначала войдите в систему',
        },
        401
      ),
    };
  }

  if (session.role !== 'admin') {
    return {
      error: json(
        {
          ok: false,
          error:
            'Недостаточно прав',
        },
        403
      ),
    };
  }

  return { session };
}


function compactUsers(records) {
  const users = {};

  for (const record of records) {
    const key =
      record.characterId ||
      record.login;

    if (!users[key]) {
      users[key] = {
        login:
          record.login,
        characterId:
          record.characterId,
        role:
          record.role,
        webDevices: 0,
        androidDevices: 0,
        desktopDevices: 0,
        devices: 0,
      };
    }

    if (record.channel === 'web') {
      users[key].webDevices += 1;
    }

    if (record.channel === 'android') {
      users[key].androidDevices += 1;
    }

    if (record.channel === 'desktop') {
      users[key].desktopDevices += 1;
    }

    users[key].devices += 1;
  }

  return Object.values(users);
}


export default async function (request) {
  if (
    request.method !== 'GET' &&
    request.method !== 'POST'
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

  const auth =
    requireAdmin(request);

  if (auth.error) {
    return auth.error;
  }

  try {
    if (request.method === 'GET') {
      const stats =
        await notificationChannelStats();

      const combined = [
        ...stats.records.web.map(
          record => ({
            ...record,
            channel: 'web',
          })
        ),
        ...stats.records.native.map(
          record => ({
            ...record,
            channel:
              record.platform ||
              'android',
          })
        ),
        ...stats.records.desktop.map(
          record => ({
            ...record,
            channel: 'desktop',
          })
        ),
      ];

      return json({
        ok: true,
        configured:
          stats.webConfigured ||
          stats.firebaseConfigured ||
          stats.desktopDevices > 0,
        webConfigured:
          stats.webConfigured,
        firebaseConfigured:
          stats.firebaseConfigured,
        subscriptions:
          stats.webDevices +
          stats.androidDevices +
          stats.desktopDevices,
        webDevices:
          stats.webDevices,
        androidDevices:
          stats.androidDevices,
        desktopDevices:
          stats.desktopDevices,
        users:
          compactUsers(combined),
      });
    }

    const body =
      await request.json()
        .catch(() => ({}));

    const title =
      String(
        body?.title || ''
      ).trim();

    const message =
      String(
        body?.body || ''
      ).trim();

    if (!title || !message) {
      return json(
        {
          ok: false,
          error:
            'Заполните заголовок и текст уведомления',
        },
        400
      );
    }

    const mode =
      String(
        body?.mode ||
        'all-players'
      ).trim();

    let sendOptions;

    if (mode === 'character') {
      const characterId =
        String(
          body?.characterId || ''
        )
          .trim()
          .toLowerCase();

      if (!characterId) {
        return json(
          {
            ok: false,
            error:
              'Не выбран персонаж',
          },
          400
        );
      }

      sendOptions = {
        characterIds: [
          characterId,
        ],
      };

    } else if (mode === 'all') {
      sendOptions = {
        all: true,
      };

    } else {
      sendOptions = {
        all: true,
        playersOnly: true,
      };
    }

    const result =
      await sendUnifiedNotification({
        ...sendOptions,
        payload: {
          title,
          body: message,
          url:
            String(
              body?.url || '/'
            ).trim(),
          tag:
            String(
              body?.tag ||
              'gosmag-admin-message'
            ).trim(),
        },
      });

    return json({
      ok: true,
      result,
    });

  } catch (error) {
    console.error(
      'admin-push-notifications error:',
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
