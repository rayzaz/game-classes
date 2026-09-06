import {
  createCipheriv,
  createECDH,
  createHash,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
} from 'node:crypto';

import {
  getStore,
} from '@netlify/blobs';

import {
  normalizeLogin,
} from './_auth.mjs';


const STORE_NAME =
  'gosmag-push-subscriptions';

const MAX_PAYLOAD_BYTES =
  3500;


function pushStore() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong',
  });
}


function cleanText(
  value,
  maxLength = 500
) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}


function base64UrlBuffer(value) {
  return Buffer.from(
    cleanText(value),
    'base64url'
  );
}


function base64Url(value) {
  return Buffer.from(value)
    .toString('base64url');
}


function hmac(key, data) {
  return createHmac(
    'sha256',
    key
  )
    .update(data)
    .digest();
}


function hkdfExpandOnce(
  prk,
  info,
  length
) {
  return hmac(
    prk,
    Buffer.concat([
      info,
      Buffer.from([1]),
    ])
  ).subarray(0, length);
}


function normalizeSubscription(raw) {
  const endpoint =
    cleanText(raw?.endpoint, 2000);

  const p256dh =
    cleanText(raw?.keys?.p256dh, 500);

  const auth =
    cleanText(raw?.keys?.auth, 500);

  if (
    !endpoint ||
    !/^https:\/\//i.test(endpoint) ||
    !p256dh ||
    !auth
  ) {
    throw new Error(
      'Некорректная push-подписка'
    );
  }

  return {
    endpoint,
    expirationTime:
      raw?.expirationTime ?? null,
    keys: {
      p256dh,
      auth,
    },
  };
}


function subscriptionHash(endpoint) {
  return createHash('sha256')
    .update(String(endpoint || ''))
    .digest('base64url')
    .slice(0, 40);
}


function subscriptionKey(
  login,
  endpoint
) {
  return `users/${encodeURIComponent(
    normalizeLogin(login)
  )}/${subscriptionHash(endpoint)}`;
}


export function getPublicVapidKey() {
  return cleanText(
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
    500
  );
}


function getPrivateVapidKey() {
  return cleanText(
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
    500
  );
}


function getVapidSubject() {
  const configured =
    cleanText(
      process.env.WEB_PUSH_VAPID_SUBJECT,
      500
    );

  if (configured) {
    return configured;
  }

  const siteUrl =
    cleanText(
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL,
      500
    );

  return siteUrl ||
    'mailto:webpush@example.invalid';
}


export function isPushConfigured() {
  return Boolean(
    getPublicVapidKey() &&
    getPrivateVapidKey()
  );
}


export async function savePushSubscription({
  login,
  role,
  characterId,
  subscription,
  userAgent,
}) {
  const normalizedLogin =
    normalizeLogin(login);

  if (!normalizedLogin) {
    throw new Error('Не указан логин');
  }

  const normalized =
    normalizeSubscription(subscription);

  const record = {
    version: 1,
    login: normalizedLogin,
    role:
      cleanText(role, 30) || 'player',
    characterId:
      cleanText(characterId, 150)
        .toLowerCase(),
    subscription: normalized,
    userAgent:
      cleanText(userAgent, 500),
    updatedAt:
      new Date().toISOString(),
  };

  await pushStore().setJSON(
    subscriptionKey(
      normalizedLogin,
      normalized.endpoint
    ),
    record
  );

  return record;
}


export async function deletePushSubscription({
  login,
  endpoint,
}) {
  const normalizedLogin =
    normalizeLogin(login);

  if (!normalizedLogin) {
    return 0;
  }

  const store = pushStore();

  if (endpoint) {
    await store.delete(
      subscriptionKey(
        normalizedLogin,
        endpoint
      )
    );

    return 1;
  }

  const prefix =
    `users/${encodeURIComponent(
      normalizedLogin
    )}/`;

  const { blobs } =
    await store.list({ prefix });

  await Promise.all(
    blobs.map(item =>
      store.delete(item.key)
    )
  );

  return blobs.length;
}


export async function listPushSubscriptions({
  login = '',
} = {}) {
  const store = pushStore();

  const prefix = login
    ? `users/${encodeURIComponent(
        normalizeLogin(login)
      )}/`
    : 'users/';

  const { blobs } =
    await store.list({ prefix });

  const records = [];

  for (const item of blobs) {
    const record =
      await store.get(
        item.key,
        {
          type: 'json',
          consistency: 'strong',
        }
      );

    if (
      record?.subscription?.endpoint &&
      record?.subscription?.keys?.p256dh &&
      record?.subscription?.keys?.auth
    ) {
      records.push({
        key: item.key,
        ...record,
      });
    }
  }

  return records;
}


function makeVapidPrivateKey(
  publicKeyText,
  privateKeyText
) {
  const publicKey =
    base64UrlBuffer(publicKeyText);

  const privateKey =
    base64UrlBuffer(privateKeyText);

  if (
    publicKey.length !== 65 ||
    publicKey[0] !== 4 ||
    privateKey.length !== 32
  ) {
    throw new Error(
      'WEB_PUSH_VAPID_PUBLIC_KEY / PRIVATE_KEY имеют неверный формат'
    );
  }

  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: base64Url(
        publicKey.subarray(1, 33)
      ),
      y: base64Url(
        publicKey.subarray(33, 65)
      ),
      d: base64Url(privateKey),
    },
    format: 'jwk',
  });
}


function buildVapidAuthorization(endpoint) {
  const publicKeyText =
    getPublicVapidKey();

  const privateKeyText =
    getPrivateVapidKey();

  if (
    !publicKeyText ||
    !privateKeyText
  ) {
    throw new Error(
      'Web Push не настроен: отсутствуют VAPID-ключи'
    );
  }

  const endpointUrl =
    new URL(endpoint);

  const audience =
    endpointUrl.origin;

  const header =
    base64Url(
      Buffer.from(
        JSON.stringify({
          typ: 'JWT',
          alg: 'ES256',
        })
      )
    );

  const payload =
    base64Url(
      Buffer.from(
        JSON.stringify({
          aud: audience,
          exp:
            Math.floor(Date.now() / 1000) +
            12 * 60 * 60,
          sub: getVapidSubject(),
        })
      )
    );

  const signingInput =
    `${header}.${payload}`;

  const signature =
    sign(
      'sha256',
      Buffer.from(signingInput),
      {
        key: makeVapidPrivateKey(
          publicKeyText,
          privateKeyText
        ),
        dsaEncoding: 'ieee-p1363',
      }
    );

  const token =
    `${signingInput}.${base64Url(
      signature
    )}`;

  return (
    `vapid t=${token}, k=${publicKeyText}`
  );
}


function encryptPushPayload(
  subscription,
  payloadBuffer
) {
  if (
    payloadBuffer.length >
    MAX_PAYLOAD_BYTES
  ) {
    throw new Error(
      'Push-сообщение слишком длинное'
    );
  }

  const uaPublic =
    base64UrlBuffer(
      subscription.keys.p256dh
    );

  const authSecret =
    base64UrlBuffer(
      subscription.keys.auth
    );

  if (
    uaPublic.length !== 65 ||
    uaPublic[0] !== 4 ||
    authSecret.length < 16
  ) {
    throw new Error(
      'Push-подписка содержит неверные ключи'
    );
  }

  const ecdh =
    createECDH('prime256v1');

  const asPublic =
    ecdh.generateKeys();

  const sharedSecret =
    ecdh.computeSecret(uaPublic);

  const prkKey =
    hmac(
      authSecret,
      sharedSecret
    );

  const keyInfo =
    Buffer.concat([
      Buffer.from('WebPush: info'),
      Buffer.from([0]),
      uaPublic,
      asPublic,
    ]);

  const ikm =
    hkdfExpandOnce(
      prkKey,
      keyInfo,
      32
    );

  const salt =
    randomBytes(16);

  const prk =
    hmac(salt, ikm);

  const cek =
    hkdfExpandOnce(
      prk,
      Buffer.concat([
        Buffer.from(
          'Content-Encoding: aes128gcm'
        ),
        Buffer.from([0]),
      ]),
      16
    );

  const nonce =
    hkdfExpandOnce(
      prk,
      Buffer.concat([
        Buffer.from(
          'Content-Encoding: nonce'
        ),
        Buffer.from([0]),
      ]),
      12
    );

  const plaintext =
    Buffer.concat([
      payloadBuffer,
      Buffer.from([2]),
    ]);

  const cipher =
    createCipheriv(
      'aes-128-gcm',
      cek,
      nonce
    );

  const ciphertext =
    Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
      cipher.getAuthTag(),
    ]);

  const recordSize =
    Buffer.alloc(4);

  recordSize.writeUInt32BE(
    4096,
    0
  );

  const header =
    Buffer.concat([
      salt,
      recordSize,
      Buffer.from([
        asPublic.length,
      ]),
      asPublic,
    ]);

  return Buffer.concat([
    header,
    ciphertext,
  ]);
}


async function sendOne(
  record,
  payload
) {
  const subscription =
    normalizeSubscription(
      record.subscription
    );

  const payloadBuffer =
    Buffer.from(
      JSON.stringify(payload),
      'utf8'
    );

  const body =
    encryptPushPayload(
      subscription,
      payloadBuffer
    );

  const response =
    await fetch(
      subscription.endpoint,
      {
        method: 'POST',
        headers: {
          TTL: '86400',
          Urgency: 'normal',
          'Content-Encoding':
            'aes128gcm',
          'Content-Type':
            'application/octet-stream',
          Authorization:
            buildVapidAuthorization(
              subscription.endpoint
            ),
        },
        body,
        redirect: 'follow',
      }
    );

  const expired =
    response.status === 404 ||
    response.status === 410;

  if (!response.ok) {
    const responseText =
      await response.text()
        .catch(() => '');

    const error =
      new Error(
        `Push service HTTP ${response.status}${
          responseText
            ? `: ${responseText.slice(0, 300)}`
            : ''
        }`
      );

    error.statusCode =
      response.status;

    error.expired =
      expired;

    throw error;
  }

  return {
    ok: true,
    status:
      response.status,
  };
}


function normalizePayload(raw) {
  const title =
    cleanText(
      raw?.title ||
      'Гос.Маг.Услуги',
      120
    );

  const body =
    cleanText(raw?.body, 800);

  const urlRaw =
    cleanText(raw?.url, 500);

  const url =
    urlRaw.startsWith('/')
      ? urlRaw
      : '/';

  return {
    title,
    body,
    url,
    icon:
      '/icons/push-192.png',
    badge:
      '/icons/push-192.png',
    tag:
      cleanText(raw?.tag, 100) ||
      'gosmag-update',
    timestamp:
      Date.now(),
  };
}


export async function sendPushNotification({
  payload,
  logins = [],
  characterIds = [],
  playersOnly = false,
  adminsOnly = false,
  all = false,
}) {
  if (!isPushConfigured()) {
    throw new Error(
      'Web Push не настроен на Netlify'
    );
  }

  const allRecords =
    await listPushSubscriptions();

  const loginSet =
    new Set(
      logins
        .map(normalizeLogin)
        .filter(Boolean)
    );

  const characterSet =
    new Set(
      characterIds
        .map(value =>
          cleanText(value, 150)
            .toLowerCase()
        )
        .filter(Boolean)
    );

  const records =
    allRecords.filter(record => {
      if (all) {
        if (
          playersOnly &&
          record.role !== 'player'
        ) {
          return false;
        }

        if (
          adminsOnly &&
          record.role !== 'admin'
        ) {
          return false;
        }

        return true;
      }

      return (
        loginSet.has(
          normalizeLogin(record.login)
        ) ||
        characterSet.has(
          cleanText(
            record.characterId,
            150
          ).toLowerCase()
        )
      );
    });

  const preparedPayload =
    normalizePayload(payload);

  const store = pushStore();

  let sent = 0;
  let failed = 0;
  let removed = 0;

  const errors = [];

  for (const record of records) {
    try {
      await sendOne(
        record,
        preparedPayload
      );

      sent += 1;

    } catch (error) {
      failed += 1;

      if (error?.expired) {
        try {
          await store.delete(
            record.key
          );
          removed += 1;
        } catch (_) {}
      }

      errors.push({
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

  return {
    matched:
      records.length,
    sent,
    failed,
    removed,
    errors:
      errors.slice(0, 20),
  };
}
