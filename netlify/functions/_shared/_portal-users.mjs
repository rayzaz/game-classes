import {
  randomBytes,
  randomInt,
  scryptSync,
} from 'node:crypto';

import {
  loadUsers,
  normalizeLogin,
} from './_auth.mjs';


const PORTAL_AUTH_TIMEOUT_MS =
  15_000;


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


function loadRequiredEnv(
  name
) {
  const value =
    cleanText(
      process.env[name]
    );

  if (!value) {
    throw new Error(
      `Не задан ${name}`
    );
  }

  return value;
}


async function postPortalUserAction(
  action,
  payload = {}
) {
  const serviceUrl =
    loadRequiredEnv(
      'CHARACTER_SERVICE_URL'
    );

  const writeSecret =
    loadRequiredEnv(
      'CHARACTER_WRITE_SECRET'
    );

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      PORTAL_AUTH_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        serviceUrl,
        {
          method: 'POST',
          headers: {
            accept:
              'application/json',
            'content-type':
              'application/json',
          },
          cache: 'no-store',
          redirect: 'follow',
          signal:
            controller.signal,
          body:
            JSON.stringify({
              action,
              writeSecret,
              ...payload,
            }),
        }
      );

    const text =
      await response.text();

    let data;

    try {
      data =
        JSON.parse(text);
    } catch {
      throw new Error(
        `Google-сервис доступа вернул не JSON: ${
          text.slice(0, 300) ||
          'пустой ответ'
        }`
      );
    }

    if (
      !response.ok ||
      data?.ok !== true
    ) {
      throw new Error(
        cleanText(
          data?.error ||
          `Google-сервис доступа завершился с HTTP ${response.status}`
        )
      );
    }

    return data;

  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        'Google-сервис доступа не ответил вовремя'
      );
    }

    throw error;

  } finally {
    clearTimeout(timer);
  }
}


function makeNumericPassword() {
  return String(
    randomInt(
      10_000_000,
      100_000_000
    )
  );
}


function makePasswordRecord(
  password
) {
  const salt =
    randomBytes(16)
      .toString('hex');

  const passwordHash =
    scryptSync(
      String(password),
      salt,
      64
    )
      .toString('hex');

  return {
    salt,
    passwordHash,
  };
}


export async function loadDynamicPortalUser(
  login
) {
  const normalizedLogin =
    normalizeLogin(login);

  if (!normalizedLogin) {
    return null;
  }

  const result =
    await postPortalUserAction(
      'portal-user-get',
      {
        login:
          normalizedLogin,
      }
    );

  if (!result?.found) {
    return null;
  }

  const user =
    result.user &&
    typeof result.user === 'object'
      ? result.user
      : null;

  if (!user) {
    return null;
  }

  return {
    login:
      normalizeLogin(
        user.login
      ),
    displayName:
      cleanText(
        user.displayName ||
        user.login
      ),
    role:
      cleanText(
        user.role ||
        'player'
      ),
    characterId:
      cleanText(
        user.characterId
      )
        .toLowerCase(),
    cabinetReady:
      user.cabinetReady !== false,
    salt:
      cleanText(
        user.salt,
        500
      ),
    passwordHash:
      cleanText(
        user.passwordHash,
        500
      ),
    dynamic:
      true,
  };
}


export async function provisionDynamicPortalUser({
  characterId,
  displayName,
  questionnaireId = '',
}) {
  const normalizedCharacterId =
    cleanText(
      characterId,
      120
    )
      .toLowerCase();

  const login =
    normalizeLogin(
      normalizedCharacterId
    );

  if (!login) {
    throw new Error(
      'Не удалось сформировать логин нового игрока'
    );
  }

  const password =
    makeNumericPassword();

  const {
    salt,
    passwordHash,
  } =
    makePasswordRecord(
      password
    );

  const result =
    await postPortalUserAction(
      'portal-user-create',
      {
        user: {
          login,
          password,
          salt,
          passwordHash,
          role:
            'player',
          characterId:
            normalizedCharacterId,
          displayName:
            cleanText(
              displayName,
              250
            ) ||
            normalizedCharacterId,
          cabinetReady:
            true,
          active:
            true,
          questionnaireId:
            cleanText(
              questionnaireId,
              250
            ),
        },
      }
    );

  return {
    login:
      normalizeLogin(
        result?.user?.login ||
        login
      ),
    password:
      cleanText(
        result?.user?.password ||
        password,
        250
      ),
    characterId:
      cleanText(
        result?.user?.characterId ||
        normalizedCharacterId
      )
        .toLowerCase(),
    displayName:
      cleanText(
        result?.user?.displayName ||
        displayName
      ),
    source:
      'google',
    created:
      result?.created === true,
    reused:
      result?.reused === true,
    spreadsheetUrl:
      cleanText(
        result?.spreadsheetUrl
      ),
  };
}


export async function getDynamicPortalAccessAdmin({
  characterId = '',
  login = '',
}) {
  const result =
    await postPortalUserAction(
      'portal-user-admin-get',
      {
        characterId:
          cleanText(
            characterId,
            120
          )
            .toLowerCase(),
        login:
          normalizeLogin(login),
      }
    );

  if (!result?.found) {
    return null;
  }

  return {
    login:
      normalizeLogin(
        result?.user?.login
      ),
    password:
      cleanText(
        result?.user?.password,
        250
      ),
    characterId:
      cleanText(
        result?.user?.characterId
      )
        .toLowerCase(),
    displayName:
      cleanText(
        result?.user?.displayName
      ),
    active:
      result?.user?.active !== false,
    source:
      'google',
    spreadsheetUrl:
      cleanText(
        result?.spreadsheetUrl
      ),
  };
}


export async function resetDynamicPortalPassword({
  characterId = '',
  login = '',
}) {
  const password =
    makeNumericPassword();

  const {
    salt,
    passwordHash,
  } =
    makePasswordRecord(
      password
    );

  const result =
    await postPortalUserAction(
      'portal-user-reset',
      {
        characterId:
          cleanText(
            characterId,
            120
          )
            .toLowerCase(),
        login:
          normalizeLogin(login),
        password,
        salt,
        passwordHash,
      }
    );

  return {
    login:
      normalizeLogin(
        result?.user?.login
      ),
    password:
      cleanText(
        result?.user?.password ||
        password,
        250
      ),
    characterId:
      cleanText(
        result?.user?.characterId
      )
        .toLowerCase(),
    displayName:
      cleanText(
        result?.user?.displayName
      ),
    active:
      result?.user?.active !== false,
    source:
      'google',
    spreadsheetUrl:
      cleanText(
        result?.spreadsheetUrl
      ),
  };
}


export async function provisionPortalAccessForCharacter({
  characterId,
  displayName,
  questionnaireId = '',
}) {
  const normalizedCharacterId =
    cleanText(
      characterId,
      120
    )
      .toLowerCase();

  const wantedLogin =
    normalizeLogin(
      normalizedCharacterId
    );

  if (!wantedLogin) {
    throw new Error(
      'У созданного персонажа отсутствует characterId для выдачи доступа'
    );
  }

  const staticUsers =
    loadUsers();

  const staticUser =
    staticUsers.find(
      user =>
        normalizeLogin(
          user?.login
        ) === wantedLogin ||
        cleanText(
          user?.characterId,
          120
        )
          .toLowerCase() ===
          normalizedCharacterId
    );

  if (staticUser) {
    return {
      login:
        normalizeLogin(
          staticUser.login
        ),
      password: '',
      characterId:
        cleanText(
          staticUser.characterId ||
          normalizedCharacterId
        )
          .toLowerCase(),
      displayName:
        cleanText(
          staticUser.displayName ||
          displayName
        ),
      source:
        'netlify-env',
      created:
        false,
      reused:
        true,
      spreadsheetUrl: '',
      message:
        'Для персонажа уже существует старый аккаунт в PORTAL_USERS_JSON. Новый пароль не создавался.',
    };
  }

  return provisionDynamicPortalUser({
    characterId:
      normalizedCharacterId,
    displayName,
    questionnaireId,
  });
}
