import {
  json,
  loadUsers,
  normalizeLogin,
  normalizeRole,
  readSession,
} from './_shared/_auth.mjs';

import {
  getEventManagerPermissions,
} from './_shared/_event-permissions.mjs';


function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .trim();
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


    /*
      Отсутствие сессии —
      не ошибка.

      Просто посетитель
      является гостем.
    */
    if (!session) {
      return json({
        ok: true,

        user:
          null,
      });
    }


    const users =
      loadUsers();


    const user =
      users.find(
        item =>
          normalizeLogin(
            item?.login
          ) ===
          session.sub
      );


    /*
      Например, аккаунт удалили
      из PORTAL_USERS_JSON,
      а старая cookie осталась.
    */
    if (!user) {
      return json({
        ok: true,

        user:
          null,
      });
    }


    const role =
      normalizeRole(
        user.role
      );


    const characterId =
      cleanText(
        user.characterId
      );


    const permissions =
      await getEventManagerPermissions({
        login: normalizeLogin(user.login),
        role,
      });


    const cabinetReady =
      role ===
      'admin'
        ? true
        : Boolean(
            user.cabinetReady &&
            characterId
          );


    return json({
      ok: true,

      user: {
        login:
          normalizeLogin(
            user.login
          ),

        displayName:
          cleanText(
            user.displayName ||
            user.login
          ),

        role,

        characterId,

        cabinetReady,

        permissions,
      },
    });

  } catch (
    error
  ) {
    console.error(
      'session function error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          'Не удалось проверить текущую сессию',
      },
      500
    );
  }
}