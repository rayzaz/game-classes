import {
  json,
  loadUsers,
  normalizeLogin,
  readSession,
} from './_shared/_auth.mjs';

import {
  getDynamicPortalAccessAdmin,
  resetDynamicPortalPassword,
} from './_shared/_portal-users.mjs';


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


function findStaticUserByCharacterId(
  characterId
) {
  const wanted =
    cleanText(
      characterId,
      120
    )
      .toLowerCase();

  if (!wanted) {
    return null;
  }

  try {
    return (
      loadUsers().find(
        user =>
          cleanText(
            user?.characterId,
            120
          )
            .toLowerCase() ===
            wanted
      ) ||
      null
    );
  } catch {
    return null;
  }
}


export default async function (
  request
) {
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

    if (
      request.method ===
      'GET'
    ) {
      const url =
        new URL(
          request.url
        );

      const characterId =
        cleanText(
          url.searchParams.get(
            'characterId'
          ),
          120
        )
          .toLowerCase();

      if (!characterId) {
        return json(
          {
            ok: false,
            error:
              'Не указан characterId',
          },
          400
        );
      }

      const staticUser =
        findStaticUserByCharacterId(
          characterId
        );

      if (staticUser) {
        return json({
          ok: true,
          found: true,
          access: {
            login:
              normalizeLogin(
                staticUser.login
              ),
            password: '',
            characterId,
            displayName:
              cleanText(
                staticUser.displayName ||
                staticUser.login
              ),
            source:
              'netlify-env',
            active: true,
          },
          passwordAvailable:
            false,
          message:
            'Это старый аккаунт из PORTAL_USERS_JSON. Его исходный пароль хранится вне нового Google-реестра.',
        });
      }

      const access =
        await getDynamicPortalAccessAdmin({
          characterId,
        });

      if (!access) {
        return json({
          ok: true,
          found: false,
          access: null,
        });
      }

      return json({
        ok: true,
        found: true,
        access,
        passwordAvailable:
          Boolean(
            access.password
          ),
      });
    }

    if (
      request.method ===
      'POST'
    ) {
      const body =
        await request
          .json()
          .catch(
            () => ({})
          );

      const characterId =
        cleanText(
          body?.characterId,
          120
        )
          .toLowerCase();

      const action =
        cleanText(
          body?.action,
          80
        )
          .toLowerCase();

      if (!characterId) {
        return json(
          {
            ok: false,
            error:
              'Не указан characterId',
          },
          400
        );
      }

      if (
        action !==
        'reset-password'
      ) {
        return json(
          {
            ok: false,
            error:
              'Неизвестное действие',
          },
          400
        );
      }

      const staticUser =
        findStaticUserByCharacterId(
          characterId
        );

      if (staticUser) {
        return json(
          {
            ok: false,
            error:
              'Старые аккаунты из PORTAL_USERS_JSON нельзя сбросить автоматически. Сначала перенесите их в новый реестр доступа.',
          },
          409
        );
      }

      const access =
        await resetDynamicPortalPassword({
          characterId,
        });

      return json({
        ok: true,
        found: true,
        reset: true,
        access,
      });
    }

    return json(
      {
        ok: false,
        error:
          'Метод не поддерживается',
      },
      405
    );

  } catch (error) {
    console.error(
      'admin-character-access:',
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
