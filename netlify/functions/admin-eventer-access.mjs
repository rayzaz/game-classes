import {
  json,
  loadUsers,
  normalizeLogin,
  normalizeRole,
  readSession,
} from './_shared/_auth.mjs';

import {
  getEventManagerPermissions,
  setEventerPermission,
} from './_shared/_event-permissions.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';


function cleanText(value) {
  return String(value ?? '').trim();
}


function requireAdmin(request) {
  const session = readSession(request);

  if (!session || session.role !== 'admin') {
    return {
      error: json(
        {
          ok: false,
          error: 'Требуются права администратора',
        },
        403
      ),
    };
  }

  return { session };
}


async function listUsers() {
  const users = loadUsers();

  return await Promise.all(
    users.map(async user => {
      const login = normalizeLogin(user?.login);
      const role = normalizeRole(user?.role);
      const permissions = await getEventManagerPermissions({
        login,
        role,
      });

      return {
        login,
        displayName: cleanText(user?.displayName || user?.login),
        role,
        characterId: cleanText(user?.characterId).toLowerCase(),
        eventer: permissions.eventer,
        canManageEvents: permissions.canManageEvents,
        locked: role === 'admin',
      };
    })
  );
}


export default async function(request) {
  try {
    const auth = requireAdmin(request);
    if (auth.error) return auth.error;

    if (request.method === 'GET') {
      const users = await listUsers();
      return json({
        ok: true,
        users,
      });
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const login = normalizeLogin(body?.login);
      const enabled = Boolean(body?.enabled);

      if (!login) {
        return json(
          {
            ok: false,
            error: 'Не указан пользователь',
          },
          400
        );
      }

      const users = loadUsers();
      const target = users.find(
        user => normalizeLogin(user?.login) === login
      );

      if (!target) {
        return json(
          {
            ok: false,
            error: 'Пользователь не найден',
          },
          404
        );
      }

      if (normalizeRole(target?.role) === 'admin') {
        return json(
          {
            ok: false,
            error: 'Администратор уже имеет все права ивентера',
          },
          409
        );
      }

      const permission = await setEventerPermission({
        login,
        enabled,
        grantedBy: auth.session.sub,
      });

      await tryWriteAdminLog({
        adminLogin: auth.session.sub || '',
        adminName: auth.session.name || auth.session.sub || '',
        action: enabled
          ? 'GRANT_EVENTER_ACCESS'
          : 'REVOKE_EVENTER_ACCESS',
        targetType: 'user',
        targetId: login,
        targetName: cleanText(target?.displayName || login),
        details: enabled
          ? 'Выданы права ивентера'
          : 'Права ивентера отозваны',
      });

      return json({
        ok: true,
        permission,
      });
    }

    return json(
      {
        ok: false,
        error: 'Метод не поддерживается',
      },
      405
    );
  } catch (error) {
    console.error('admin-eventer-access error:', error);
    return json(
      {
        ok: false,
        error: error instanceof Error
          ? error.message
          : 'Не удалось изменить права ивентера',
      },
      500
    );
  }
}
