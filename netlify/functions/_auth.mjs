import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export const SESSION_COOKIE =
  'gosmag_session';

const SESSION_TTL_SECONDS =
  8 * 60 * 60;

export function normalizeLogin(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function requireEnv(name) {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `Не задана переменная ${name}`
    );
  }

  return value;
}

export function loadUsers() {
  const raw =
    requireEnv(
      'PORTAL_USERS_JSON'
    );

  const parsed =
    JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(
      'PORTAL_USERS_JSON должен быть JSON-массивом'
    );
  }

  return parsed;
}

export function verifyPassword(
  password,
  user
) {
  const salt =
    String(user?.salt || '');

  const storedHex =
    String(
      user?.passwordHash || ''
    );

  if (
    !salt ||
    !storedHex
  ) {
    return false;
  }

  let expected;

  try {
    expected =
      Buffer.from(
        storedHex,
        'hex'
      );
  } catch {
    return false;
  }

  const actual =
    scryptSync(
      String(password),
      salt,
      64
    );

  if (
    expected.length !==
    actual.length
  ) {
    return false;
  }

  return timingSafeEqual(
    expected,
    actual
  );
}

function signBody(body) {
  const secret =
    requireEnv(
      'SESSION_SECRET'
    );

  return createHmac(
    'sha256',
    secret
  )
    .update(body)
    .digest('base64url');
}

export function createSession(
  user
) {
  const now =
    Math.floor(
      Date.now() / 1000
    );

  const payload = {
    v: 1,
    sub:
      normalizeLogin(
        user.login
      ),
    cid:
      String(
        user.characterId
      ),
    exp:
      now +
      SESSION_TTL_SECONDS,
  };

  const body =
    Buffer
      .from(
        JSON.stringify(
          payload
        )
      )
      .toString(
        'base64url'
      );

  const signature =
    signBody(body);

  return `${body}.${signature}`;
}

function safeEqualText(
  a,
  b
) {
  const left =
    Buffer.from(
      String(a || '')
    );

  const right =
    Buffer.from(
      String(b || '')
    );

  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  return timingSafeEqual(
    left,
    right
  );
}

function cookieValue(
  request,
  name
) {
  const header =
    request.headers.get(
      'cookie'
    ) || '';

  const parts =
    header.split(';');

  for (
    const part of parts
  ) {
    const index =
      part.indexOf('=');

    if (index < 0) {
      continue;
    }

    const key =
      part
        .slice(0, index)
        .trim();

    const value =
      part
        .slice(index + 1)
        .trim();

    if (key === name) {
      return decodeURIComponent(
        value
      );
    }
  }

  return '';
}

export function readSession(
  request
) {
  const token =
    cookieValue(
      request,
      SESSION_COOKIE
    );

  if (!token) {
    return null;
  }

  const parts =
    token.split('.');

  if (
    parts.length !== 2
  ) {
    return null;
  }

  const [
    body,
    signature
  ] = parts;

  const expected =
    signBody(body);

  if (
    !safeEqualText(
      signature,
      expected
    )
  ) {
    return null;
  }

  let payload;

  try {
    payload =
      JSON.parse(
        Buffer
          .from(
            body,
            'base64url'
          )
          .toString(
            'utf8'
          )
      );
  } catch {
    return null;
  }

  const now =
    Math.floor(
      Date.now() / 1000
    );

  if (
    !payload ||
    payload.v !== 1 ||
    !payload.sub ||
    !payload.cid ||
    !payload.exp ||
    payload.exp <= now
  ) {
    return null;
  }

  return payload;
}

function isHttps(
  request
) {
  try {
    return (
      new URL(
        request.url
      ).protocol ===
      'https:'
    );
  } catch {
    return true;
  }
}

export function sessionCookie(
  token,
  request
) {
  const secure =
    isHttps(request)
      ? '; Secure'
      : '';

  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join('; ') + secure;
}

export function clearSessionCookie(
  request
) {
  const secure =
    isHttps(request)
      ? '; Secure'
      : '';

  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ') + secure;
}

export function json(
  data,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        'content-type':
          'application/json; charset=utf-8',
        'cache-control':
          'no-store',
        ...extraHeaders,
      },
    }
  );
}

export function randomSecret() {
  return randomBytes(32)
    .toString('hex');
}
