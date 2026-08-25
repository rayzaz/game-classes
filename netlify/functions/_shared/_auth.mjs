import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';


export const SESSION_COOKIE =
  'gosmag_session';


/*
  30 дней.

  Пользователь может:
  - закрыть браузер;
  - перезагрузить страницу;
  - уйти в каталог;
  - вернуться на сайт позже.

  Пока сам не нажмёт "Выйти"
  или пока не истекут 30 дней.
*/
const SESSION_TTL_SECONDS =
  30 * 24 * 60 * 60;


/* =========================
   ЛОГИН
   ========================= */

export function normalizeLogin(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase();
}


/* =========================
   РОЛЬ
   ========================= */

export function normalizeRole(
  value
) {
  const role =
    String(
      value || ''
    )
      .trim()
      .toLowerCase();


  if (
    role ===
    'admin'
  ) {
    return 'admin';
  }


  return 'player';
}


/* =========================
   ENV
   ========================= */

function requireEnv(
  name
) {
  const value =
    process.env[
      name
    ];


  if (!value) {
    throw new Error(
      `Не задана переменная ${name}`
    );
  }


  return value;
}


/* =========================
   ПОЛЬЗОВАТЕЛИ
   ========================= */

export function loadUsers() {
  const part1 =
    String(
      process.env.PORTAL_USERS_JSON_1 ||
      ''
    )
      .trim();


  const part2 =
    String(
      process.env.PORTAL_USERS_JSON_2 ||
      ''
    )
      .trim();


  /*
    Новая схема:
    пользователи разбиты на две
    переменные Netlify.
  */
  if (
    part1 ||
    part2
  ) {
    if (
      !part1 ||
      !part2
    ) {
      throw new Error(
        'PORTAL_USERS_JSON_1 и PORTAL_USERS_JSON_2 должны быть заданы вместе'
      );
    }


    const users1 =
      JSON.parse(
        part1
      );


    const users2 =
      JSON.parse(
        part2
      );


    if (
      !Array.isArray(
        users1
      ) ||
      !Array.isArray(
        users2
      )
    ) {
      throw new Error(
        'PORTAL_USERS_JSON_1 и PORTAL_USERS_JSON_2 должны быть JSON-массивами'
      );
    }


    return [
      ...users1,
      ...users2,
    ];
  }


  /*
    Старая схема остаётся запасной.

    Поэтому пока мы добавляем
    новые переменные в Netlify,
    старые входы не ломаются.
  */
  const raw =
    requireEnv(
      'PORTAL_USERS_JSON'
    );


  const parsed =
    JSON.parse(
      raw
    );


  if (
    !Array.isArray(
      parsed
    )
  ) {
    throw new Error(
      'PORTAL_USERS_JSON должен быть JSON-массивом'
    );
  }


  return parsed;
}


/* =========================
   ПАРОЛЬ
   ========================= */

export function verifyPassword(
  password,
  user
) {
  const salt =
    String(
      user?.salt ||
      ''
    );


  const storedHex =
    String(
      user?.passwordHash ||
      ''
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
      String(
        password
      ),
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


/* =========================
   ПОДПИСЬ СЕССИИ
   ========================= */

function signBody(
  body
) {
  const secret =
    requireEnv(
      'SESSION_SECRET'
    );


  return createHmac(
    'sha256',
    secret
  )
    .update(
      body
    )
    .digest(
      'base64url'
    );
}


/* =========================
   СОЗДАНИЕ СЕССИИ
   ========================= */

export function createSession(
  user
) {
  const now =
    Math.floor(
      Date.now() /
      1000
    );


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
    Игрок обязательно
    должен иметь персонажа.

    Администратор может
    существовать без characterId.
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


  const payload = {
    v:
      1,

    sub:
      normalizeLogin(
        user?.login
      ),

    role,

    cid:
      characterId,

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
    signBody(
      body
    );


  return (
    `${body}.${signature}`
  );
}


/* =========================
   БЕЗОПАСНОЕ СРАВНЕНИЕ
   ========================= */

function safeEqualText(
  a,
  b
) {
  const left =
    Buffer.from(
      String(
        a || ''
      )
    );


  const right =
    Buffer.from(
      String(
        b || ''
      )
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


/* =========================
   COOKIE
   ========================= */

function cookieValue(
  request,
  name
) {
  const header =
    request.headers.get(
      'cookie'
    ) || '';


  const parts =
    header.split(
      ';'
    );


  for (
    const part of
    parts
  ) {
    const index =
      part.indexOf(
        '='
      );


    if (
      index <
      0
    ) {
      continue;
    }


    const key =
      part
        .slice(
          0,
          index
        )
        .trim();


    const value =
      part
        .slice(
          index + 1
        )
        .trim();


    if (
      key ===
      name
    ) {
      return decodeURIComponent(
        value
      );
    }
  }


  return '';
}


/* =========================
   ЧТЕНИЕ СЕССИИ
   ========================= */

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
    token.split(
      '.'
    );


  if (
    parts.length !==
    2
  ) {
    return null;
  }


  const [
    body,
    signature,
  ] =
    parts;


  const expected =
    signBody(
      body
    );


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
      Date.now() /
      1000
    );


  if (
    !payload ||
    payload.v !==
      1 ||
    !payload.sub ||
    !payload.exp ||
    payload.exp <=
      now
  ) {
    return null;
  }


  /*
    Старые cookie,
    где role отсутствует,
    считаются player.
  */
  const role =
    normalizeRole(
      payload.role
    );


  const characterId =
    String(
      payload.cid ||
      ''
    )
      .trim();


  if (
    role ===
      'player' &&
    !characterId
  ) {
    return null;
  }


  return {
    ...payload,

    role,

    cid:
      characterId,
  };
}


/* =========================
   HTTPS
   ========================= */

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


/* =========================
   СОЗДАТЬ COOKIE
   ========================= */

export function sessionCookie(
  token,
  request
) {
  const secure =
    isHttps(
      request
    )
      ? '; Secure'
      : '';


  return [
    `${SESSION_COOKIE}=${encodeURIComponent(
      token
    )}`,

    'Path=/',

    'HttpOnly',

    'SameSite=Lax',

    `Max-Age=${SESSION_TTL_SECONDS}`,

  ].join(
    '; '
  ) + secure;
}


/* =========================
   УДАЛИТЬ COOKIE
   ========================= */

export function clearSessionCookie(
  request
) {
  const secure =
    isHttps(
      request
    )
      ? '; Secure'
      : '';


  return [
    `${SESSION_COOKIE}=`,

    'Path=/',

    'HttpOnly',

    'SameSite=Lax',

    'Max-Age=0',

  ].join(
    '; '
  ) + secure;
}


/* =========================
   JSON RESPONSE
   ========================= */

export function json(
  data,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    JSON.stringify(
      data
    ),

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


/* =========================
   СЛУЧАЙНЫЙ СЕКРЕТ
   ========================= */

export function randomSecret() {
  return randomBytes(
    32
  )
    .toString(
      'hex'
    );
}