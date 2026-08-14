import {
  createSession,
  json,
  loadUsers,
  normalizeLogin,
  sessionCookie,
  verifyPassword,
} from './_auth.mjs';

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
      Небольшая одинаковая задержка
      усложняет перебор и не позволяет
      легко отличить "логина нет"
      от "пароль неверный".
    */
    const elapsed =
      Date.now() -
      started;

    if (
      elapsed < 350
    ) {
      await wait(
        350 - elapsed
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

      characterId:
        String(
          user.characterId ||
          ''
        ),

      cabinetReady:
        Boolean(
          user.cabinetReady
        ),
    };


    if (
      !publicUser.characterId
    ) {
      throw new Error(
        'У пользователя не указан characterId'
      );
    }


    /*
      Если персонаж уже зарегистрирован,
      но кабинет ещё не готов, пароль
      считается верным, однако сессию
      к данным мы пока не выдаём.
    */
    if (
      !publicUser.cabinetReady
    ) {
      return json({
        ok: true,
        user:
          publicUser,
      });
    }


    const token =
      createSession(user);


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

  } catch (error) {

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
