import {
  createHash,
  randomBytes,
  sign,
} from 'node:crypto';

import {
  getStore,
} from '@netlify/blobs';

import {
  normalizeLogin,
} from './_auth.mjs';

import {
  isPushConfigured,
  listPushSubscriptions,
  sendPushNotification,
} from './_push.mjs';


const NATIVE_STORE_NAME =
  'gosmag-native-push-devices';

const DESKTOP_STORE_NAME =
  'gosmag-desktop-devices';

const INBOX_STORE_NAME =
  'gosmag-notification-inbox';

const INBOX_RETENTION_MS =
  30 * 24 * 60 * 60 * 1000;


function store(name) {
  return getStore({
    name,
    consistency: 'strong',
  });
}


function cleanText(value, maxLength = 500) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}


function normalizeCharacterId(value) {
  return cleanText(value, 150)
    .toLowerCase();
}


function tokenHash(value) {
  return createHash('sha256')
    .update(String(value || ''))
    .digest('base64url')
    .slice(0, 40);
}


function userPrefix(login) {
  return `users/${encodeURIComponent(
    normalizeLogin(login)
  )}/`;
}


function normalizeNotificationPayload(raw) {
  const title =
    cleanText(
      raw?.title ||
      'Гос.Маг.Услуги',
      120
    );

  const body =
    cleanText(raw?.body, 900);

  const rawUrl =
    cleanText(raw?.url, 500);

  return {
    title,
    body,
    url:
      rawUrl.startsWith('/')
        ? rawUrl
        : '/',
    tag:
      cleanText(raw?.tag, 100) ||
      'gosmag-update',
    timestamp:
      Date.now(),
  };
}


function recordMatchesTarget(
  record,
  {
    loginSet,
    characterSet,
    all,
    playersOnly,
    adminsOnly,
  }
) {
  const role =
    cleanText(record?.role, 30) ||
    'player';

  if (all) {
    if (
      playersOnly &&
      role !== 'player'
    ) {
      return false;
    }

    if (
      adminsOnly &&
      role !== 'admin'
    ) {
      return false;
    }

    return true;
  }

  return (
    loginSet.has(
      normalizeLogin(record?.login)
    ) ||
    characterSet.has(
      normalizeCharacterId(
        record?.characterId
      )
    )
  );
}


async function listJsonRecords(
  storeName,
  prefix = 'users/'
) {
  const targetStore =
    store(storeName);

  const { blobs } =
    await targetStore.list({ prefix });

  const result = [];

  for (const item of blobs) {
    const value =
      await targetStore.get(
        item.key,
        {
          type: 'json',
          consistency: 'strong',
        }
      );

    if (value) {
      result.push({
        key: item.key,
        ...value,
      });
    }
  }

  return result;
}


/* ==========================================================
   ANDROID / FCM DEVICES
   ========================================================== */

export function isFirebasePushConfigured() {
  return Boolean(
    cleanText(
      process.env.FIREBASE_PROJECT_ID,
      300
    ) &&
    cleanText(
      process.env.FIREBASE_CLIENT_EMAIL,
      500
    ) &&
    cleanText(
      process.env.FIREBASE_PRIVATE_KEY,
      10000
    )
  );
}


export async function saveNativePushDevice({
  login,
  role,
  characterId,
  platform,
  token,
  userAgent,
}) {
  const normalizedLogin =
    normalizeLogin(login);

  const normalizedToken =
    cleanText(token, 5000);

  const normalizedPlatform =
    cleanText(platform, 30)
      .toLowerCase();

  if (!normalizedLogin) {
    throw new Error(
      'Не указан логин устройства'
    );
  }

  if (
    normalizedPlatform !== 'android' ||
    !normalizedToken
  ) {
    throw new Error(
      'Некорректная нативная push-подписка'
    );
  }

  const record = {
    version: 1,
    login:
      normalizedLogin,
    role:
      cleanText(role, 30) ||
      'player',
    characterId:
      normalizeCharacterId(
        characterId
      ),
    platform:
      normalizedPlatform,
    token:
      normalizedToken,
    userAgent:
      cleanText(userAgent, 500),
    updatedAt:
      new Date().toISOString(),
  };

  const key =
    `${userPrefix(normalizedLogin)}${normalizedPlatform}/${tokenHash(normalizedToken)}`;

  await store(
    NATIVE_STORE_NAME
  ).setJSON(
    key,
    record
  );

  return {
    key,
    ...record,
  };
}


export async function deleteNativePushDevice({
  login,
  token,
  platform = 'android',
}) {
  const normalizedLogin =
    normalizeLogin(login);

  const normalizedPlatform =
    cleanText(platform, 30)
      .toLowerCase();

  const normalizedToken =
    cleanText(token, 5000);

  if (!normalizedLogin) {
    return 0;
  }

  const nativeStore =
    store(NATIVE_STORE_NAME);

  if (normalizedToken) {
    await nativeStore.delete(
      `${userPrefix(normalizedLogin)}${normalizedPlatform}/${tokenHash(normalizedToken)}`
    );

    return 1;
  }

  const prefix =
    `${userPrefix(normalizedLogin)}${normalizedPlatform}/`;

  const { blobs } =
    await nativeStore.list({ prefix });

  await Promise.all(
    blobs.map(item =>
      nativeStore.delete(item.key)
    )
  );

  return blobs.length;
}


export async function listNativePushDevices({
  login = '',
} = {}) {
  return listJsonRecords(
    NATIVE_STORE_NAME,
    login
      ? userPrefix(login)
      : 'users/'
  );
}


/* ==========================================================
   DESKTOP REGISTRY + NOTIFICATION INBOX
   ========================================================== */

export async function registerDesktopDevice({
  login,
  role,
  characterId,
  userAgent,
}) {
  const normalizedLogin =
    normalizeLogin(login);

  if (!normalizedLogin) {
    throw new Error(
      'Не указан логин desktop-приложения'
    );
  }

  const record = {
    version: 1,
    login:
      normalizedLogin,
    role:
      cleanText(role, 30) ||
      'player',
    characterId:
      normalizeCharacterId(
        characterId
      ),
    platform:
      'desktop',
    userAgent:
      cleanText(userAgent, 500),
    updatedAt:
      new Date().toISOString(),
  };

  await store(
    DESKTOP_STORE_NAME
  ).setJSON(
    `${userPrefix(normalizedLogin)}desktop`,
    record
  );

  return record;
}


export async function listDesktopDevices() {
  return listJsonRecords(
    DESKTOP_STORE_NAME,
    'users/'
  );
}


export async function deleteDesktopDevice({ login }) {
  const normalizedLogin =
    normalizeLogin(login);

  if (!normalizedLogin) {
    return 0;
  }

  await store(
    DESKTOP_STORE_NAME
  ).delete(
    `${userPrefix(normalizedLogin)}desktop`
  );

  return 1;
}


async function enqueueForLogin(
  login,
  payload
) {
  const normalizedLogin =
    normalizeLogin(login);

  if (!normalizedLogin) {
    return null;
  }

  const timestamp =
    Number(payload.timestamp) ||
    Date.now();

  const id =
    `${String(timestamp).padStart(13, '0')}-${randomBytes(6).toString('hex')}`;

  const record = {
    id,
    login:
      normalizedLogin,
    title:
      payload.title,
    body:
      payload.body,
    url:
      payload.url,
    tag:
      payload.tag,
    timestamp,
    createdAt:
      new Date(timestamp)
        .toISOString(),
  };

  await store(
    INBOX_STORE_NAME
  ).setJSON(
    `${userPrefix(normalizedLogin)}${id}`,
    record
  );

  return record;
}


export async function listDesktopNotifications({
  login,
  since = 0,
}) {
  const normalizedLogin =
    normalizeLogin(login);

  if (!normalizedLogin) {
    return [];
  }

  const inboxStore =
    store(INBOX_STORE_NAME);

  const prefix =
    userPrefix(normalizedLogin);

  const { blobs } =
    await inboxStore.list({ prefix });

  const cutoff =
    Date.now() -
    INBOX_RETENTION_MS;

  const wantedSince =
    Math.max(
      0,
      Number(since) || 0,
      cutoff
    );

  const result = [];
  const cleanup = [];

  for (const item of blobs) {
    const record =
      await inboxStore.get(
        item.key,
        {
          type: 'json',
          consistency: 'strong',
        }
      );

    const timestamp =
      Number(record?.timestamp) || 0;

    if (
      timestamp > 0 &&
      timestamp < cutoff
    ) {
      cleanup.push(
        inboxStore.delete(item.key)
      );
      continue;
    }

    if (
      record &&
      timestamp > wantedSince
    ) {
      result.push(record);
    }
  }

  if (cleanup.length) {
    await Promise.allSettled(cleanup);
  }

  result.sort(
    (a, b) =>
      Number(a.timestamp) -
      Number(b.timestamp)
  );

  return result.slice(-50);
}


/* ==========================================================
   FIREBASE CLOUD MESSAGING HTTP v1
   ========================================================== */

let cachedAccessToken = null;
let cachedAccessTokenUntil = 0;


function base64UrlJson(value) {
  return Buffer.from(
    JSON.stringify(value),
    'utf8'
  ).toString('base64url');
}


async function getFirebaseAccessToken() {
  if (!isFirebasePushConfigured()) {
    throw new Error(
      'Firebase Cloud Messaging не настроен на Netlify'
    );
  }

  if (
    cachedAccessToken &&
    Date.now() <
      cachedAccessTokenUntil
  ) {
    return cachedAccessToken;
  }

  const clientEmail =
    cleanText(
      process.env.FIREBASE_CLIENT_EMAIL,
      500
    );

  const privateKey =
    String(
      process.env.FIREBASE_PRIVATE_KEY ||
      ''
    )
      .replace(/\\n/g, '\n')
      .trim();

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const header =
    base64UrlJson({
      alg: 'RS256',
      typ: 'JWT',
    });

  const claims =
    base64UrlJson({
      iss: clientEmail,
      scope:
        'https://www.googleapis.com/auth/firebase.messaging',
      aud:
        'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    });

  const unsigned =
    `${header}.${claims}`;

  const signature =
    sign(
      'RSA-SHA256',
      Buffer.from(unsigned),
      privateKey
    ).toString('base64url');

  const assertion =
    `${unsigned}.${signature}`;

  const response =
    await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'content-type':
            'application/x-www-form-urlencoded',
        },
        body:
          new URLSearchParams({
            grant_type:
              'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
          }),
      }
    );

  const data =
    await response.json()
      .catch(() => ({}));

  if (
    !response.ok ||
    !data?.access_token
  ) {
    throw new Error(
      data?.error_description ||
      data?.error ||
      `Не удалось получить Firebase access token (HTTP ${response.status})`
    );
  }

  cachedAccessToken =
    String(data.access_token);

  const expiresIn =
    Math.max(
      60,
      Number(data.expires_in) || 3600
    );

  cachedAccessTokenUntil =
    Date.now() +
    Math.max(
      60,
      expiresIn - 300
    ) * 1000;

  return cachedAccessToken;
}


async function sendFcmOne(
  record,
  payload
) {
  const accessToken =
    await getFirebaseAccessToken();

  const projectId =
    cleanText(
      process.env.FIREBASE_PROJECT_ID,
      300
    );

  const response =
    await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization:
            `Bearer ${accessToken}`,
          'content-type':
            'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          message: {
            token:
              record.token,
            notification: {
              title:
                payload.title,
              body:
                payload.body,
            },
            data: {
              url:
                payload.url,
              tag:
                payload.tag,
            },
            android: {
              priority:
                'high',
              notification: {
                channel_id:
                  'gosmag-main',
                sound:
                  'default',
              },
            },
          },
        }),
      }
    );

  const text =
    await response.text()
      .catch(() => '');

  if (!response.ok) {
    const error =
      new Error(
        `FCM HTTP ${response.status}${
          text
            ? `: ${text.slice(0, 500)}`
            : ''
        }`
      );

    error.expired =
      response.status === 404 ||
      /UNREGISTERED|registration-token-not-registered/i
        .test(text);

    throw error;
  }

  return {
    ok: true,
    status:
      response.status,
  };
}


/* ==========================================================
   UNIFIED DISPATCH
   ========================================================== */

export async function notificationChannelStats() {
  const [web, native, desktop] =
    await Promise.all([
      listPushSubscriptions(),
      listNativePushDevices(),
      listDesktopDevices(),
    ]);

  return {
    webConfigured:
      isPushConfigured(),
    firebaseConfigured:
      isFirebasePushConfigured(),
    webDevices:
      web.length,
    androidDevices:
      native.filter(
        item =>
          item.platform === 'android'
      ).length,
    desktopDevices:
      desktop.length,
    records: {
      web,
      native,
      desktop,
    },
  };
}


export async function sendUnifiedNotification({
  payload,
  logins = [],
  characterIds = [],
  playersOnly = false,
  adminsOnly = false,
  all = false,
}) {
  const preparedPayload =
    normalizeNotificationPayload(
      payload
    );

  const stats =
    await notificationChannelStats();

  const loginSet =
    new Set(
      logins
        .map(normalizeLogin)
        .filter(Boolean)
    );

  const characterSet =
    new Set(
      characterIds
        .map(normalizeCharacterId)
        .filter(Boolean)
    );

  const matchOptions = {
    loginSet,
    characterSet,
    all,
    playersOnly,
    adminsOnly,
  };

  const allRecipientRecords = [
    ...stats.records.web,
    ...stats.records.native,
    ...stats.records.desktop,
  ].filter(record =>
    recordMatchesTarget(
      record,
      matchOptions
    )
  );

  const recipientLogins =
    Array.from(
      new Set(
        allRecipientRecords
          .map(record =>
            normalizeLogin(
              record.login
            )
          )
          .filter(Boolean)
      )
    );

  let inboxQueued = 0;

  await Promise.all(
    recipientLogins.map(
      async login => {
        const record =
          await enqueueForLogin(
            login,
            preparedPayload
          );

        if (record) {
          inboxQueued += 1;
        }
      }
    )
  );

  let webResult = {
    configured:
      stats.webConfigured,
    matched: 0,
    sent: 0,
    failed: 0,
    removed: 0,
    errors: [],
  };

  if (stats.webConfigured) {
    try {
      webResult = {
        configured: true,
        ...await sendPushNotification({
          payload:
            preparedPayload,
          logins,
          characterIds,
          playersOnly,
          adminsOnly,
          all,
        }),
      };
    } catch (error) {
      webResult = {
        ...webResult,
        configured: true,
        failed: 1,
        errors: [
          {
            message:
              error instanceof Error
                ? error.message
                : String(error),
          },
        ],
      };
    }
  }

  const nativeRecords =
    stats.records.native
      .filter(record =>
        record.platform === 'android'
      )
      .filter(record =>
        recordMatchesTarget(
          record,
          matchOptions
        )
      );

  const nativeStore =
    store(NATIVE_STORE_NAME);

  const androidResult = {
    configured:
      stats.firebaseConfigured,
    matched:
      nativeRecords.length,
    sent: 0,
    failed: 0,
    removed: 0,
    errors: [],
  };

  if (stats.firebaseConfigured) {
    for (const record of nativeRecords) {
      try {
        await sendFcmOne(
          record,
          preparedPayload
        );
        androidResult.sent += 1;
      } catch (error) {
        androidResult.failed += 1;

        if (error?.expired) {
          try {
            await nativeStore.delete(
              record.key
            );
            androidResult.removed += 1;
          } catch (_) {}
        }

        androidResult.errors.push({
          login:
            record.login,
          characterId:
            record.characterId,
          message:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }
  }

  const desktopMatched =
    stats.records.desktop
      .filter(record =>
        recordMatchesTarget(
          record,
          matchOptions
        )
      ).length;

  return {
    recipients:
      recipientLogins.length,
    inboxQueued,
    web:
      webResult,
    android:
      androidResult,
    desktop: {
      matched:
        desktopMatched,
      queued:
        inboxQueued,
    },
    sent:
      Number(webResult.sent || 0) +
      Number(androidResult.sent || 0) +
      desktopMatched,
    failed:
      Number(webResult.failed || 0) +
      Number(androidResult.failed || 0),
  };
}
