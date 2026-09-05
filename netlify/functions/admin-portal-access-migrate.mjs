import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  loadUsers,
  normalizeLogin,
  readSession,
} from './_shared/_auth.mjs';

import {
  importLegacyPortalUsers,
  provisionDynamicPortalUsersBatch,
} from './_shared/_portal-users.mjs';


const QUESTIONNAIRE_STORE =
  'gosmag-questionnaires';


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


function normalizeCharacterId(
  value
) {
  return cleanText(
    value,
    120
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9_-]/g,
      ''
    );
}


function isPublishedQuestionnaire(
  entry
) {
  const creation =
    entry?.characterCreation &&
    typeof entry.characterCreation === 'object'
      ? entry.characterCreation
      : {};

  const characterId =
    normalizeCharacterId(
      creation.characterId
    );

  if (!characterId) {
    return false;
  }

  if (
    entry?.isTest === true ||
    cleanText(entry?.id) ===
      'test-pes-testovich'
  ) {
    return false;
  }

  const status =
    cleanText(
      creation.status,
      120
    )
      .toLowerCase();

  const lifecycleStatus =
    cleanText(
      creation.lifecycleStatus,
      120
    )
      .toLowerCase();

  if (
    status.includes('deleted') ||
    status.includes('missing') ||
    lifecycleStatus === 'missing' ||
    lifecycleStatus === 'deleted'
  ) {
    return false;
  }

  return true;
}


async function loadLiveRegistryNames() {
  const rawUrl =
    cleanText(
      process.env.CHARACTER_SERVICE_URL,
      2000
    );

  if (!rawUrl) {
    return new Map();
  }

  try {
    const url =
      new URL(rawUrl);

    url.searchParams.set(
      'action',
      'list'
    );
    url.searchParams.set(
      '_',
      String(Date.now())
    );

    const response =
      await fetch(
        url,
        {
          method:
            'GET',
          headers: {
            accept:
              'application/json',
          },
          cache:
            'no-store',
          redirect:
            'follow',
        }
      );

    if (!response.ok) {
      return new Map();
    }

    const data =
      await response
        .json()
        .catch(
          () => null
        );

    if (
      !data ||
      data.ok !== true ||
      !Array.isArray(
        data.characters
      )
    ) {
      return new Map();
    }

    return new Map(
      data.characters
        .map(
          character => {
            const characterId =
              normalizeCharacterId(
                character?.characterId ||
                character?.id
              );

            if (!characterId) {
              return null;
            }

            return [
              characterId,
              cleanText(
                character?.name ||
                characterId,
                250
              ),
            ];
          }
        )
        .filter(Boolean)
    );

  } catch (
    error
  ) {
    console.warn(
      'portal access migration registry warning:',
      error
    );

    return new Map();
  }
}


export default async function (
  request
) {
  try {
    const session =
      readSession(
        request
      );

    if (!session) {
      return json(
        {
          ok: false,
          error:
            'Сначала войдите в систему',
        },
        401
      );
    }

    if (
      session.role !==
      'admin'
    ) {
      return json(
        {
          ok: false,
          error:
            'Недостаточно прав',
        },
        403
      );
    }

    if (
      request.method !==
      'POST'
    ) {
      return json(
        {
          ok: false,
          error:
            'Метод не поддерживается',
        },
        405
      );
    }

    let staticUsers = [];
    let legacyMigration = {
      spreadsheetUrl: '',
      archiveTotal: 0,
      imported: [],
      reused: [],
      skipped: [],
      importedCount: 0,
      reusedCount: 0,
      skippedCount: 0,
    };

    try {
      staticUsers =
        loadUsers();

      legacyMigration =
        await importLegacyPortalUsers(
          staticUsers
        );

    } catch (
      legacyError
    ) {
      console.warn(
        'legacy portal access migration warning:',
        legacyError
      );
    }

    const staticByCharacterId =
      new Map();

    staticUsers.forEach(
      user => {
        const characterId =
          normalizeCharacterId(
            user?.characterId
          );

        if (characterId) {
          staticByCharacterId.set(
            characterId,
            user
          );
        }
      }
    );

    const store =
      getStore({
        name:
          QUESTIONNAIRE_STORE,
        consistency:
          'strong',
      });

    const {
      blobs,
    } =
      await store.list({
        prefix:
          'submissions/',
      });

    const entries =
      (
        await Promise.all(
          blobs.map(
            async blob => {
              try {
                const entry =
                  await store.get(
                    blob.key,
                    {
                      type:
                        'json',
                      consistency:
                        'strong',
                    }
                  );

                if (!entry) {
                  return null;
                }

                return {
                  key:
                    blob.key,
                  entry,
                };

              } catch (
                error
              ) {
                console.warn(
                  'portal access migration questionnaire warning:',
                  blob.key,
                  error
                );
                return null;
              }
            }
          )
        )
      )
        .filter(Boolean)
        .filter(
          item =>
            isPublishedQuestionnaire(
              item.entry
            )
        );

    const registryNames =
      await loadLiveRegistryNames();

    const seen =
      new Set();

    const published =
      entries
        .map(
          item => {
            const characterId =
              normalizeCharacterId(
                item.entry
                  ?.characterCreation
                  ?.characterId
              );

            if (
              !characterId ||
              seen.has(characterId)
            ) {
              return null;
            }

            seen.add(
              characterId
            );

            const staticUser =
              staticByCharacterId.get(
                characterId
              ) ||
              null;

            const displayName =
              registryNames.get(
                characterId
              ) ||
              cleanText(
                staticUser?.displayName,
                250
              ) ||
              characterId;

            return {
              key:
                item.key,
              entry:
                item.entry,
              characterId,
              displayName,
              questionnaireId:
                cleanText(
                  item.entry?.id,
                  250
                ),
              staticUser,
            };
          }
        )
        .filter(Boolean);

    /*
      Старые пользователи не получают новый пароль: их исходные данные
      уже импортированы выше из PORTAL_USERS_JSON + приватного архива.
      Для остальных опубликованных анкет создаём недостающие аккаунты
      одним пакетным запросом в Apps Script.
    */
    const dynamicTargets =
      published
        .filter(
          item =>
            !item.staticUser
        )
        .map(
          item => ({
            characterId:
              item.characterId,
            displayName:
              item.displayName,
            questionnaireId:
              item.questionnaireId,
          })
        );

    const dynamicMigration =
      dynamicTargets.length > 0
        ? await provisionDynamicPortalUsersBatch(
            dynamicTargets
          )
        : {
            created: [],
            reused: [],
            skipped: [],
            createdCount: 0,
            reusedCount: 0,
            skippedCount: 0,
            spreadsheetUrl:
              legacyMigration.spreadsheetUrl,
          };

    const accessByCharacterId =
      new Map();

    legacyMigration.imported
      .concat(
        legacyMigration.reused
      )
      .forEach(
        user => {
          const characterId =
            normalizeCharacterId(
              user?.characterId
            );

          if (characterId) {
            accessByCharacterId.set(
              characterId,
              {
                login:
                  normalizeLogin(
                    user?.login
                  ),
                password:
                  cleanText(
                    user?.password,
                    250
                  ),
                source:
                  'google',
                legacy:
                  true,
              }
            );
          }
        }
      );

    dynamicMigration.created
      .concat(
        dynamicMigration.reused
      )
      .forEach(
        user => {
          const characterId =
            normalizeCharacterId(
              user?.characterId
            );

          if (characterId) {
            accessByCharacterId.set(
              characterId,
              {
                login:
                  normalizeLogin(
                    user?.login
                  ),
                password:
                  cleanText(
                    user?.password,
                    250
                  ),
                source:
                  'google',
                legacy:
                  false,
              }
            );
          }
        }
      );

    /*
      Если старый пользователь не был сопоставлен с приватным архивом,
      его старый вход через PORTAL_USERS_JSON не ломаем и не заменяем.
    */
    published.forEach(
      item => {
        if (
          item.staticUser &&
          !accessByCharacterId.has(
            item.characterId
          )
        ) {
          accessByCharacterId.set(
            item.characterId,
            {
              login:
                normalizeLogin(
                  item.staticUser.login
                ),
              password: '',
              source:
                'netlify-env',
              legacy:
                true,
            }
          );
        }
      }
    );

    let updatedQuestionnaires = 0;

    await Promise.all(
      entries.map(
        async item => {
          const characterId =
            normalizeCharacterId(
              item.entry
                ?.characterCreation
                ?.characterId
            );

          const access =
            accessByCharacterId.get(
              characterId
            );

          if (!access?.login) {
            return;
          }

          const currentCreation =
            item.entry
              .characterCreation &&
            typeof item.entry.characterCreation === 'object'
              ? item.entry.characterCreation
              : {};

          if (
            cleanText(
              currentCreation.portalLogin
            ) === access.login &&
            cleanText(
              currentCreation.portalAccessSource
            ) === access.source
          ) {
            return;
          }

          await store.setJSON(
            item.key,
            {
              ...item.entry,
              characterCreation: {
                ...currentCreation,
                portalLogin:
                  access.login,
                portalAccessSource:
                  access.source,
              },
            }
          );

          updatedQuestionnaires += 1;
        }
      )
    );

    const generated =
      dynamicMigration.created
        .map(
          user => ({
            characterId:
              normalizeCharacterId(
                user?.characterId
              ),
            displayName:
              cleanText(
                user?.displayName,
                250
              ),
            login:
              normalizeLogin(
                user?.login
              ),
            password:
              cleanText(
                user?.password,
                250
              ),
          })
        );

    return json({
      ok: true,
      spreadsheetUrl:
        dynamicMigration.spreadsheetUrl ||
        legacyMigration.spreadsheetUrl,
      legacyArchiveTotal:
        legacyMigration.archiveTotal,
      legacyImported:
        legacyMigration.importedCount,
      legacyReused:
        legacyMigration.reusedCount,
      legacySkipped:
        legacyMigration.skipped,
      publishedQuestionnaires:
        published.length,
      generated,
      generatedCount:
        generated.length,
      existingDynamicCount:
        dynamicMigration.reusedCount,
      dynamicSkipped:
        dynamicMigration.skipped,
      updatedQuestionnaires,
    });

  } catch (
    error
  ) {
    console.error(
      'admin-portal-access-migrate:',
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
}
