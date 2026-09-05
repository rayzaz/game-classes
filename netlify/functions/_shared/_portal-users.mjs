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


export async function provisionDynamicPortalUsersBatch(
  characters
) {
  const source =
    Array.isArray(characters)
      ? characters
      : [];

  const seen =
    new Set();

  const users =
    source
      .map(
        character => {
          const characterId =
            cleanText(
              character?.characterId,
              120
            )
              .toLowerCase();

          if (
            !characterId ||
            seen.has(characterId)
          ) {
            return null;
          }

          seen.add(
            characterId
          );

          const login =
            normalizeLogin(
              characterId
            );

          const password =
            makeNumericPassword();

          const {
            salt,
            passwordHash,
          } =
            makePasswordRecord(
              password
            );

          return {
            login,
            password,
            salt,
            passwordHash,
            role:
              'player',
            characterId,
            displayName:
              cleanText(
                character?.displayName,
                250
              ) ||
              characterId,
            cabinetReady:
              true,
            active:
              true,
            questionnaireId:
              cleanText(
                character?.questionnaireId,
                250
              ),
          };
        }
      )
      .filter(Boolean);

  const result =
    await postPortalUserAction(
      'portal-user-create-batch',
      {
        users,
      }
    );

  return {
    created:
      Array.isArray(
        result?.created
      )
        ? result.created
        : [],
    reused:
      Array.isArray(
        result?.reused
      )
        ? result.reused
        : [],
    skipped:
      Array.isArray(
        result?.skipped
      )
        ? result.skipped
        : [],
    createdCount:
      Number(
        result?.createdCount
      ) || 0,
    reusedCount:
      Number(
        result?.reusedCount
      ) || 0,
    skippedCount:
      Number(
        result?.skippedCount
      ) || 0,
    spreadsheetUrl:
      cleanText(
        result?.spreadsheetUrl
      ),
  };
}


export async function listDynamicPortalAccessAdmin() {
  const result =
    await postPortalUserAction(
      'portal-user-admin-list'
    );

  const sourceUsers =
    Array.isArray(
      result?.users
    )
      ? result.users
      : [];

  return {
    users:
      sourceUsers.map(
        user => ({
          login:
            normalizeLogin(
              user?.login
            ),
          password:
            cleanText(
              user?.password,
              250
            ),
          characterId:
            cleanText(
              user?.characterId,
              120
            )
              .toLowerCase(),
          displayName:
            cleanText(
              user?.displayName,
              250
            ),
          role:
            cleanText(
              user?.role ||
              'player',
              50
            ),
          active:
            user?.active !== false,
          source:
            'google',
        })
      ),
    spreadsheetUrl:
      cleanText(
        result?.spreadsheetUrl
      ),
    legacyArchiveTotal:
      Number(
        result?.legacyArchiveTotal
      ) || 0,
  };
}


export async function importLegacyPortalUsers(
  users = null
) {
  const sourceUsers =
    Array.isArray(users)
      ? users
      : loadUsers();

  const payloadUsers =
    sourceUsers
      .map(
        user => ({
          login:
            normalizeLogin(
              user?.login
            ),
          characterId:
            cleanText(
              user?.characterId,
              120
            )
              .toLowerCase(),
          displayName:
            cleanText(
              user?.displayName ||
              user?.login,
              250
            ),
          role:
            cleanText(
              user?.role ||
              'player',
              50
            ),
          salt:
            cleanText(
              user?.salt,
              500
            ),
          passwordHash:
            cleanText(
              user?.passwordHash,
              500
            ),
          cabinetReady:
            user?.cabinetReady !== false,
          active:
            user?.active !== false,
        })
      )
      .filter(
        user => user.login
      );

  const result =
    await postPortalUserAction(
      'portal-user-import-legacy',
      {
        users:
          payloadUsers,
      }
    );

  return {
    spreadsheetUrl:
      cleanText(
        result?.spreadsheetUrl
      ),
    archiveTotal:
      Number(
        result?.archiveTotal
      ) || 0,
    imported:
      Array.isArray(
        result?.imported
      )
        ? result.imported
        : [],
    reused:
      Array.isArray(
        result?.reused
      )
        ? result.reused
        : [],
    skipped:
      Array.isArray(
        result?.skipped
      )
        ? result.skipped
        : [],
    importedCount:
      Number(
        result?.importedCount
      ) || 0,
    reusedCount:
      Number(
        result?.reusedCount
      ) || 0,
    skippedCount:
      Number(
        result?.skippedCount
      ) || 0,
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

  /*
    Сначала смотрим новый Google-реестр. Это важно после миграции:
    старый пользователь уже может быть перенесён туда вместе со своим
    исходным паролем, хотя PORTAL_USERS_JSON всё ещё существует в Netlify.
  */
  const existingDynamic =
    await getDynamicPortalAccessAdmin({
      characterId:
        normalizedCharacterId,
    });

  if (existingDynamic) {
    return {
      ...existingDynamic,
      created: false,
      reused: true,
      source: 'google',
    };
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
    /*
      Переносим старый аккаунт в Google. Сам пароль НЕ лежит в GitHub:
      Character Service берёт его из закрытого исторического списка,
      а salt/passwordHash приходят из существующего PORTAL_USERS_JSON.
    */
    const migration =
      await importLegacyPortalUsers([
        staticUser,
      ]);

    const migrated =
      await getDynamicPortalAccessAdmin({
        characterId:
          normalizedCharacterId,
        login:
          normalizeLogin(
            staticUser.login
          ),
      });

    if (migrated) {
      return {
        ...migrated,
        created:
          migration.importedCount > 0,
        reused:
          migration.importedCount === 0,
        source:
          'google',
        message:
          'Старый аккаунт перенесён в закрытый Google-реестр с исходным паролем.',
      };
    }

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
      spreadsheetUrl:
        migration.spreadsheetUrl,
      message:
        'Старый аккаунт найден, но не удалось сопоставить его с исходным паролем из архивного списка. Вход через старый PORTAL_USERS_JSON сохранён.',
    };
  }

  return provisionDynamicPortalUser({
    characterId:
      normalizedCharacterId,
    displayName,
    questionnaireId,
  });
}
