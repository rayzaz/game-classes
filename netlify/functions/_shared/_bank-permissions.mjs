import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  normalizeLogin,
  readSession,
} from './_auth.mjs';


const STORE_NAME =
  'gosmag-bank-permissions';


function getStoreInstance() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong',
  });
}


function permissionKey(login) {
  return `bankers/${encodeURIComponent(normalizeLogin(login))}`;
}


export async function isBankerLogin(login) {
  const normalized =
    normalizeLogin(login);

  if (!normalized) {
    return false;
  }

  const record =
    await getStoreInstance().get(
      permissionKey(normalized),
      {
        type: 'json',
        consistency: 'strong',
      }
    );

  return Boolean(
    record?.enabled
  );
}


export async function getBankManagerPermissions({
  login,
  role,
}) {
  const normalizedRole =
    String(role || '')
      .trim()
      .toLowerCase();

  const isAdmin =
    normalizedRole ===
    'admin';

  let banker =
    isAdmin;

  if (!isAdmin) {
    try {
      banker =
        await isBankerLogin(
          login
        );
    } catch (
      error
    ) {
      console.error(
        'bank permission lookup failed:',
        error
      );

      /*
        Сбой банка не должен ломать логин/сессию всего портала.
        В сомнительной ситуации обычному игроку права банкира не выдаём.
      */
      banker =
        false;
    }
  }

  return {
    banker,
    canManageBank:
      isAdmin ||
      banker,
  };
}


export async function requireBankManager(
  request
) {
  const session =
    readSession(
      request
    );

  if (!session) {
    return {
      error:
        json(
          {
            ok: false,
            error:
              'Требуется авторизация',
          },
          401
        ),
    };
  }

  const permissions =
    await getBankManagerPermissions({
      login:
        session.sub,
      role:
        session.role,
    });

  if (
    !permissions
      .canManageBank
  ) {
    return {
      error:
        json(
          {
            ok: false,
            error:
              'Требуются права администратора или банкира',
          },
          403
        ),
    };
  }

  return {
    session,
    permissions,
  };
}


export async function setBankerPermission({
  login,
  enabled,
  grantedBy,
}) {
  const normalized =
    normalizeLogin(
      login
    );

  if (!normalized) {
    throw new Error(
      'Не указан логин'
    );
  }

  const store =
    getStoreInstance();

  const key =
    permissionKey(
      normalized
    );

  if (!enabled) {
    await store.delete(
      key
    );

    return {
      login:
        normalized,
      enabled:
        false,
    };
  }

  const record = {
    login:
      normalized,
    enabled:
      true,
    grantedAt:
      new Date()
        .toISOString(),
    grantedBy:
      normalizeLogin(
        grantedBy
      ),
  };

  await store.setJSON(
    key,
    record
  );

  return record;
}
