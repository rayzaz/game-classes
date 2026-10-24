import {
  json,
  loadUsers,
  normalizeLogin,
  normalizeRole,
  readSession,
} from './_shared/_auth.mjs';

import {
  getBankManagerPermissions,
  setBankerPermission,
} from './_shared/_bank-permissions.mjs';

import {
  listDynamicPortalAccessAdmin,
} from './_shared/_portal-users.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';


function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .trim();
}


function requireAdmin(
  request
) {
  const session =
    readSession(
      request
    );

  if (
    !session ||
    session.role !==
      'admin'
  ) {
    return {
      error:
        json(
          {
            ok: false,
            error:
              'Требуются права администратора',
          },
          403
        ),
    };
  }

  return {
    session,
  };
}


async function collectUsers() {
  const byLogin =
    new Map();

  const staticUsers =
    loadUsers();

  staticUsers.forEach(
    user => {
      const login =
        normalizeLogin(
          user?.login
        );

      if (!login) {
        return;
      }

      byLogin.set(
        login,
        {
          login,
          displayName:
            cleanText(
              user?.displayName ||
              user?.login
            ),
          role:
            normalizeRole(
              user?.role
            ),
          characterId:
            cleanText(
              user?.characterId
            )
              .toLowerCase(),
          source:
            'netlify',
        }
      );
    }
  );

  let dynamicWarning = '';

  try {
    const dynamic =
      await listDynamicPortalAccessAdmin();

    (
      Array.isArray(
        dynamic?.users
      )
        ? dynamic.users
        : []
    )
      .forEach(
        user => {
          const login =
            normalizeLogin(
              user?.login
            );

          if (!login) {
            return;
          }

          const previous =
            byLogin.get(
              login
            );

          byLogin.set(
            login,
            {
              login,
              displayName:
                cleanText(
                  user?.displayName ||
                  previous
                    ?.displayName ||
                  user?.login
                ),
              role:
                previous?.role ===
                  'admin'
                  ? 'admin'
                  : normalizeRole(
                      user?.role
                    ),
              characterId:
                cleanText(
                  user?.characterId ||
                  previous
                    ?.characterId
                )
                  .toLowerCase(),
              source:
                previous
                  ? 'netlify+google'
                  : 'google',
            }
          );
        }
      );

  } catch (
    error
  ) {
    dynamicWarning =
      error instanceof Error
        ? error.message
        : String(
            error
          );

    console.warn(
      'admin-banker-access dynamic user list unavailable:',
      error
    );
  }

  const users =
    await Promise.all(
      Array.from(
        byLogin.values()
      )
        .map(
          async user => {
            const permissions =
              await getBankManagerPermissions({
                login:
                  user.login,
                role:
                  user.role,
              });

            return {
              ...user,
              banker:
                permissions
                  .banker,
              canManageBank:
                permissions
                  .canManageBank,
              locked:
                user.role ===
                'admin',
            };
          }
        )
    );

  users.sort(
    (
      a,
      b
    ) =>
      String(
        a.displayName ||
        a.login
      )
        .localeCompare(
          String(
            b.displayName ||
            b.login
          ),
          'ru'
        )
  );

  return {
    users,
    warning:
      dynamicWarning,
  };
}


export default async function(
  request
) {
  try {
    const auth =
      requireAdmin(
        request
      );

    if (
      auth.error
    ) {
      return auth.error;
    }

    if (
      request.method ===
      'GET'
    ) {
      const result =
        await collectUsers();

      return json({
        ok: true,
        users:
          result.users,
        warning:
          result.warning,
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

      const login =
        normalizeLogin(
          body?.login
        );

      const enabled =
        Boolean(
          body?.enabled
        );

      if (!login) {
        return json(
          {
            ok: false,
            error:
              'Не указан пользователь',
          },
          400
        );
      }

      const current =
        await collectUsers();

      const target =
        current.users.find(
          user =>
            user.login ===
            login
        );

      if (!target) {
        return json(
          {
            ok: false,
            error:
              'Пользователь не найден',
          },
          404
        );
      }

      if (
        target.role ===
        'admin'
      ) {
        return json(
          {
            ok: false,
            error:
              'Администратор уже имеет все права банкира',
          },
          409
        );
      }

      const permission =
        await setBankerPermission({
          login,
          enabled,
          grantedBy:
            auth.session.sub,
        });

      await tryWriteAdminLog({
        adminLogin:
          auth.session.sub ||
          '',
        adminName:
          auth.session.sub ||
          '',
        action:
          enabled
            ? 'GRANT_BANKER_ACCESS'
            : 'REVOKE_BANKER_ACCESS',
        targetType:
          'user',
        targetId:
          login,
        targetName:
          cleanText(
            target
              .displayName ||
            login
          ),
        details:
          enabled
            ? 'Выданы права банкира'
            : 'Права банкира отозваны',
      });

      return json({
        ok: true,
        permission,
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

  } catch (
    error
  ) {
    console.error(
      'admin-banker-access error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось изменить права банкира',
      },
      500
    );
  }
}
