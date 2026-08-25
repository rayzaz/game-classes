import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  normalizeLogin,
  readSession,
} from './_auth.mjs';


const STORE_NAME =
  'gosmag-event-permissions';


function getStoreInstance() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong',
  });
}


function permissionKey(login) {
  return `eventers/${encodeURIComponent(normalizeLogin(login))}`;
}


export async function isEventerLogin(login) {
  const normalized = normalizeLogin(login);
  if (!normalized) return false;

  const record = await getStoreInstance().get(
    permissionKey(normalized),
    {
      type: 'json',
      consistency: 'strong',
    }
  );

  return Boolean(record?.enabled);
}


export async function getEventManagerPermissions({
  login,
  role,
}) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const isAdmin = normalizedRole === 'admin';
  const eventer = isAdmin
    ? true
    : await isEventerLogin(login);

  return {
    eventer,
    canManageEvents:
      isAdmin || eventer,
  };
}


export async function requireEventManager(request) {
  const session = readSession(request);

  if (!session) {
    return {
      error: json(
        {
          ok: false,
          error: 'Сначала войдите в систему',
        },
        401
      ),
    };
  }

  const permissions =
    await getEventManagerPermissions({
      login: session.sub,
      role: session.role,
    });

  if (!permissions.canManageEvents) {
    return {
      error: json(
        {
          ok: false,
          error: 'Требуются права администратора или ивентера',
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


export async function setEventerPermission({
  login,
  enabled,
  grantedBy,
}) {
  const normalized = normalizeLogin(login);
  if (!normalized) {
    throw new Error('Не указан логин');
  }

  const store = getStoreInstance();
  const key = permissionKey(normalized);

  if (!enabled) {
    await store.delete(key);
    return {
      login: normalized,
      enabled: false,
    };
  }

  const record = {
    login: normalized,
    enabled: true,
    grantedAt: new Date().toISOString(),
    grantedBy: normalizeLogin(grantedBy),
  };

  await store.setJSON(key, record);

  return record;
}
