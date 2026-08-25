import {
  createSession,
  json,
  loadUsers,
  normalizeLogin,
  normalizeRole,
  sessionCookie,
  verifyPassword,
} from './_shared/_auth.mjs';

import {
  getEventManagerPermissions,
} from './_shared/_event-permissions.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';


const wait =
  (ms) =>
    new Promise(
      resolve =>
        setTimeout(
          resolve,
          ms
        )
    );


export default async (
  request
) => {

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


  const started =
    Date.now();


  try {

    const body =
      await request
        .json()
        .catch(
          () => ({})
        );


    const login =
      normalizeLogin(
        body?.login
      );


    const password =
      String(
        body?.password ||
        ''
      );


    if (
      !login ||
      !password
    ) {

      return json(
        {
          ok: false,

          error:
            'Введите логин и пароль',
        },
        400
      );
    }


    /* =========================
       ИЩЕМ ПОЛЬЗОВАТЕЛЯ
       ========================= */

    const users =
      loadUsers();


    const user =
      users.find(
        item =>
          normalizeLogin(
            item?.login
          ) === login
      );


    const valid =
      user
        ? verifyPassword(
            password,
            user
          )
        : false;


    /*
      Одинаковая небольшая
      задержка для неверного
      логина и неверного пароля.
    */

    const elapsed =
      Date.now() -
      started;


    if (
      elapsed < 350
    ) {

      await wait(
        350 -
        elapsed
      );
    }


    if (
      !user ||
      !valid
    ) {

      return json(
        {
          ok: false,

          error:
            'Неверный логин или пароль',
        },
        401
      );
    }


    /* =========================
       РОЛЬ
       ========================= */

    const role =
      normalizeRole(
        user?.role
      );


    const characterId =
      String(
        user?.characterId ||
        ''
      )
        .trim();


    /*
      Персонаж обязателен
      только обычному игроку.

      У администратора
      characterId может быть пустым.
    */

    if (
      role ===
        'player' &&
      !characterId
    ) {

      throw new Error(
        'У игрока не указан characterId'
      );
    }


    /* =========================
       ДАННЫЕ ДЛЯ БРАУЗЕРА
       ========================= */

    const permissions =
      await getEventManagerPermissions({
        login: normalizeLogin(user.login),
        role,
      });


    const publicUser = {

      login:
        normalizeLogin(
          user.login
        ),

      displayName:
        String(
          user.displayName ||
          user.login
        ),

      role,

      characterId,

      permissions,

      cabinetReady:
        role ===
        'admin'
          ? true
          : Boolean(
              user.cabinetReady
            ),
    };


    /* =========================
       НЕГОТОВЫЙ КАБИНЕТ ИГРОКА
       ========================= */

    if (
      role ===
        'player' &&
      !publicUser.cabinetReady
    ) {

      return json({
        ok: true,

        user:
          publicUser,
      });
    }


    /* =========================
       СОЗДАЁМ СЕССИЮ
       ========================= */

    const token =
      createSession(
        user
      );


    /* =========================
       ЛОГ ВХОДА АДМИНИСТРАТОРА
       ========================= */

    if (
      role ===
      'admin'
    ) {

      await tryWriteAdminLog({

        adminLogin:
          publicUser.login,

        adminName:
          publicUser.displayName,

        action:
          'ADMIN_LOGIN',

        targetType:
          'admin',

        targetId:
          publicUser.login,

        targetName:
          publicUser.displayName,

        details:
          'Вход в административный центр',
      });
    }


    /* =========================
       УСПЕШНЫЙ ВХОД
       ========================= */

    return json(
      {
        ok: true,

        user:
          publicUser,
      },
      200,
      {
        'set-cookie':
          sessionCookie(
            token,
            request
          ),
      }
    );

  } catch (
    error
  ) {

    console.error(
      'login function error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          'Сервер входа не настроен',
      },
      500
    );
  }
};