import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  loadUsers,
} from './_shared/_auth.mjs';

import {
  loadCharacterData,
} from './_shared/_event-access.mjs';

import {
  requireEventManager,
} from './_shared/_event-permissions.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';


const EVENTS_STORE =
  'gosmag-events';

const SIGNUPS_STORE =
  'gosmag-event-signups';

const REGISTRY_CACHE_TTL_MS =
  60 * 1000;

let registryCache = {
  expiresAt: 0,
  characters: [],
};


function getEventsStore() {
  return getStore({
    name:
      EVENTS_STORE,

    consistency:
      'strong',
  });
}


function getSignupsStore() {
  return getStore({
    name:
      SIGNUPS_STORE,

    consistency:
      'strong',
  });
}


function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .trim();
}


function validEventKey(
  key
) {
  return /^events\/[0-9]+_[a-f0-9-]{36}$/i
    .test(
      key
    );
}


function loadPortalUsers() {
  let users = [];

  try {
    users =
      loadUsers();
  } catch (
    error
  ) {
    console.error(
      'portal users read error:',
      error
    );

    users = [];
  }

  return users
    .filter(
      user =>
        user &&
        typeof user ===
          'object'
    )
    .map(
      user => ({
        login:
          cleanText(
            user.login
          ),

        displayName:
          cleanText(
            user.displayName
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
      })
    )
    .filter(
      user =>
        user.characterId
    );
}

async function loadLiveCharacterRegistry() {
  const now =
    Date.now();

  if (
    registryCache.expiresAt >
      now &&
    Array.isArray(
      registryCache.characters
    )
  ) {
    return registryCache.characters;
  }

  const raw =
    cleanText(
      process.env
        .CHARACTER_SERVICE_URL
    );

  if (!raw) {
    throw new Error(
      'Не задан CHARACTER_SERVICE_URL'
    );
  }

  const url =
    new URL(
      raw
    );

  url.searchParams.set(
    'action',
    'list'
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

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Не удалось прочитать реестр персонажей: HTTP ${response.status}`
    );
  }

  let data;

  try {
    data =
      JSON.parse(
        text
      );
  } catch {
    throw new Error(
      'Реестр персонажей вернул некорректный JSON'
    );
  }

  if (
    !data ||
    data.ok !==
      true
  ) {
    throw new Error(
      data?.error ||
      'Не удалось прочитать реестр персонажей'
    );
  }

  const characters =
    (
      Array.isArray(
        data.characters
      )
        ? data.characters
        : []
    )
      .map(
        item => ({
          characterId:
            cleanText(
              item?.characterId ||
              item?.id
            )
              .toLowerCase(),

          name:
            cleanText(
              item?.name
            ),

          player:
            cleanText(
              item?.player
            ),

          active:
            item?.active !==
              false,

          level:
            Number(
              item?.level
            ) || 0,

          rank:
            cleanText(
              item?.rank
            ),

          className:
            cleanText(
              item?.className ||
              item?.class
            ),

          squad:
            cleanText(
              item?.squad
            ),
        })
      )
      .filter(
        item =>
          item.characterId &&
          item.active
      );

  registryCache = {
    expiresAt:
      now +
      REGISTRY_CACHE_TTL_MS,

    characters,
  };

  return characters;
}


function characterSnapshotFromFullData(
  data,
  fallback = {}
) {
  return {
    name:
      cleanText(
        data?.character?.name ||
        fallback?.name
      ),

    level:
      Number(
        data?.level?.current ||
        fallback?.level
      ) || 0,

    rank:
      cleanText(
        data?.character?.rank ||
        fallback?.rank
      ),

    className:
      cleanText(
        data?.character?.className ||
        fallback?.className
      ),

    squad:
      cleanText(
        data?.character?.squad ||
        fallback?.squad
      ),
  };
}


function cleanIncomingSnapshot(
  value,
  fallback = {}
) {
  const source =
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value
    )
      ? value
      : {};

  const level =
    Number(
      source.level
    );

  return {
    name:
      cleanText(
        source.name ||
        fallback?.name
      ),

    level:
      Number.isFinite(
        level
      ) &&
      level >
        0
        ? Math.trunc(
            level
          )
        : Number(
            fallback?.level
          ) || 0,

    rank:
      cleanText(
        source.rank ||
        fallback?.rank
      ),

    className:
      cleanText(
        source.className ||
        fallback?.className
      ),

    squad:
      cleanText(
        source.squad ||
        fallback?.squad
      ),
  };
}


async function getEventByKey(
  key
) {
  const store =
    getEventsStore();

  const event =
    await store.get(
      key,
      {
        type:
          'json',

        consistency:
          'strong',
      }
    );

  return {
    store,
    event,
  };
}


async function listParticipants(
  event
) {
  const eventId =
    cleanText(
      event?.id
    );

  if (!eventId) {
    return [];
  }

  const store =
    getSignupsStore();

  const {
    blobs,
  } =
    await store.list({
      prefix:
        `signups/${eventId}/`,
    });

  const items =
    await Promise.all(
      blobs.map(
        async blob => {
          try {
            const signup =
              await store.get(
                blob.key,
                {
                  type:
                    'json',

                  consistency:
                    'strong',
                }
              );

            if (
              !signup ||
              signup.status !==
                'registered'
            ) {
              return null;
            }

            const characterId =
              cleanText(
                signup.characterId
              )
                .toLowerCase();

            let character =
              signup.character &&
              typeof signup.character ===
                'object'
                ? {
                    name:
                      cleanText(
                        signup.character.name
                      ),

                    level:
                      Number(
                        signup.character.level
                      ) || 0,

                    rank:
                      cleanText(
                        signup.character.rank
                      ),

                    className:
                      cleanText(
                        signup.character.className
                      ),

                    squad:
                      cleanText(
                        signup.character.squad
                      ),
                  }
                : null;

            if (
              !character ||
              !character.name
            ) {
              /*
                ВАЖНО: раскрытие состава ивента не должно
                ходить в Google вообще. Старые signup без
                snapshot показываем с безопасным лёгким
                fallback, а не тормозим весь интерфейс.
              */
              character = {
                name:
                  cleanText(
                    signup.playerName ||
                    characterId
                  ),

                level: 0,
                rank: '',
                className: '',
                squad: '',
              };
            }

            return {
              key:
                blob.key,

              characterId,

              source:
                cleanText(
                  signup.source ||
                  (
                    signup.addedBy
                      ? 'admin'
                      : 'player'
                  )
                ),

              joinedAt:
                cleanText(
                  signup.createdAt
                ),

              character,

              loadout:
                signup.loadout &&
                typeof signup.loadout ===
                  'object'
                  ? signup.loadout
                  : {
                      equipment: [],
                      inventory: [],
                    },
            };

          } catch (
            error
          ) {
            console.error(
              'participant read error:',
              blob.key,
              error
            );

            return null;
          }
        }
      )
    );

  return items
    .filter(Boolean)
    .sort(
      (
        first,
        second
      ) =>
        String(
          first.character?.name ||
          ''
        )
          .localeCompare(
            String(
              second.character?.name ||
              ''
            ),
            'ru'
          )
    );
}


async function listCandidates(
  participants
) {
  /*
    Кандидаты теперь формируются из лёгкого реестра САЙТ.

    Раньше для КАЖДОГО активного персонажа здесь вызывался
    loadCharacterData(), из-за чего одно раскрытие состава могло
    породить десятки Google-запросов.

    Полный снимок персонажа читаем только один раз — когда ивентер
    действительно добавляет выбранного персонажа.
  */
  const registry =
    await loadLiveCharacterRegistry();

  const users =
    loadPortalUsers();

  const usersByCharacterId =
    new Map(
      users.map(
        user => [
          user.characterId,
          user,
        ]
      )
    );

  const registered =
    new Set(
      participants.map(
        participant =>
          participant.characterId
      )
    );

  return registry
    .map(
      item => {
        const user =
          usersByCharacterId.get(
            item.characterId
          );

        return {
          characterId:
            item.characterId,

          login:
            user?.login ||
            '',

          accountName:
            user?.displayName ||
            item.player ||
            '',

          role:
            user?.role ||
            'player',

          registered:
            registered.has(
              item.characterId
            ),

          character: {
            name:
              item.name ||
              item.characterId,

            level:
              item.level ||
              0,

            rank:
              item.rank ||
              '',

            className:
              item.className ||
              '',

            squad:
              item.squad ||
              '',
          },
        };
      }
    )
    .sort(
      (
        first,
        second
      ) =>
        String(
          first.character?.name ||
          first.accountName ||
          ''
        )
          .localeCompare(
            String(
              second.character?.name ||
              second.accountName ||
              ''
            ),
            'ru'
          )
    );
}


export default async function (
  request
) {
  try {
    const access =
      await requireEventManager(
        request
      );

    if (access.error) {
      return access.error;
    }

    const session =
      access.session;


    // =====================================================
    // GET — СПИСОК УЧАСТНИКОВ
    // =====================================================

    if (
      request.method ===
      'GET'
    ) {
      const url =
        new URL(
          request.url
        );

      const key =
        cleanText(
          url.searchParams.get(
            'key'
          )
        );

      if (
        !validEventKey(
          key
        )
      ) {
        return json(
          {
            ok: false,

            error:
              'Некорректный ключ ивента',
          },
          400
        );
      }

      const {
        event,
      } =
        await getEventByKey(
          key
        );

      if (!event) {
        return json(
          {
            ok: false,

            error:
              'Ивент не найден',
          },
          404
        );
      }

      const mode =
        cleanText(
          url.searchParams.get(
            'mode'
          )
        )
          .toLowerCase();

      if (
        mode ===
          'candidate-detail'
      ) {
        const characterId =
          cleanText(
            url.searchParams.get(
              'characterId'
            )
          )
            .toLowerCase();

        if (!characterId) {
          return json(
            {
              ok: false,
              error:
                'Не указан персонаж',
            },
            400
          );
        }

        const registry =
          await loadLiveCharacterRegistry();

        const registryCharacter =
          registry.find(
            item =>
              item.characterId ===
              characterId
          );

        if (!registryCharacter) {
          return json(
            {
              ok: false,
              error:
                'Персонаж не найден в активном реестре',
            },
            404
          );
        }

        const data =
          await loadCharacterData(
            characterId
          );

        return json({
          ok: true,

          candidateDetail:
            characterSnapshotFromFullData(
              data,
              registryCharacter
            ),
        });
      }


      const participants =
        await listParticipants(
          event
        );

      const eventInfo = {
        key,

        id:
          cleanText(
            event.id
          ),

        title:
          cleanText(
            event.title
          ),

        status:
          cleanText(
            event.status
          ),
      };

      /*
        mode=participants — быстрый путь.
        Только Netlify Blob, БЕЗ Google.

        mode=candidates — тяжёлый реестр Google загружается
        только тогда, когда ивентер реально открыл добавление
        персонажа. Он больше не блокирует показ состава.
      */
      if (
        mode ===
          'participants'
      ) {
        return json({
          ok: true,
          event: eventInfo,
          participants,
        });
      }

      const candidates =
        await listCandidates(
          participants
        );

      if (
        mode ===
          'candidates'
      ) {
        return json({
          ok: true,
          event: eventInfo,
          candidates,
        });
      }

      /*
        Старое поведение оставляем для обратной совместимости
        других возможных клиентов API.
      */
      return json({
        ok: true,
        event: eventInfo,
        participants,
        candidates,
      });
    }


    // =====================================================
    // POST — ДОБАВИТЬ / УДАЛИТЬ
    // =====================================================

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


    let body;

    try {
      body =
        await request.json();
    } catch {
      return json(
        {
          ok: false,

          error:
            'Некорректный JSON',
        },
        400
      );
    }


    const key =
      cleanText(
        body?.key
      );

    const action =
      cleanText(
        body?.action
      )
        .toLowerCase();

    const characterId =
      cleanText(
        body?.characterId
      )
        .toLowerCase();


    if (
      !validEventKey(
        key
      )
    ) {
      return json(
        {
          ok: false,

          error:
            'Некорректный ключ ивента',
        },
        400
      );
    }


    if (
      ![
        'add',
        'remove',
      ].includes(
        action
      )
    ) {
      return json(
        {
          ok: false,

          error:
            'Некорректное действие',
        },
        400
      );
    }


    if (!characterId) {
      return json(
        {
          ok: false,

          error:
            'Не указан персонаж',
        },
        400
      );
    }


    const {
      event,
    } =
      await getEventByKey(
        key
      );


    if (!event) {
      return json(
        {
          ok: false,

          error:
            'Ивент не найден',
        },
        404
      );
    }


    if (
      [
        'completed',
        'cancelled',
      ].includes(
        event.status
      )
    ) {
      return json(
        {
          ok: false,

          error:
            'Состав завершённого или отменённого ивента менять нельзя',
        },
        409
      );
    }


    const eventId =
      cleanText(
        event.id
      );


    if (!eventId) {
      return json(
        {
          ok: false,

          error:
            'У ивента отсутствует ID',
        },
        500
      );
    }


    const signupStore =
      getSignupsStore();

    const signupKey =
      `signups/${eventId}/${characterId}`;


    // =====================================================
    // УДАЛЕНИЕ
    // =====================================================

    if (
      action ===
      'remove'
    ) {
      const existing =
        await signupStore.get(
          signupKey,
          {
            type:
              'json',

            consistency:
              'strong',
          }
        );

      await signupStore.delete(
        signupKey
      );

      await tryWriteAdminLog({
        adminLogin:
          session.sub ||
          '',

        adminName:
          session.name ||
          session.sub ||
          '',

        action:
          'REMOVE_EVENT_MEMBER',

        targetType:
          'event',

        targetId:
          eventId,

        targetName:
          cleanText(
            event.title
          ),

        details:
          `Удалён участник: ${
            cleanText(
              existing?.character?.name ||
              existing?.playerName ||
              characterId
            )
          }`,
      });

      return json({
        ok: true,

        removedCharacterId:
          characterId,
      });
    }


    // =====================================================
    // ДОБАВЛЕНИЕ АДМИНОМ
    // =====================================================

    const portalUsers =
      loadPortalUsers();

    const user =
      portalUsers.find(
        item =>
          item.characterId ===
          characterId
      );

    const liveRegistry =
      await loadLiveCharacterRegistry();

    const registryCharacter =
      liveRegistry.find(
        item =>
          item.characterId ===
          characterId
      );


    if (!registryCharacter) {
      return json(
        {
          ok: false,

          error:
            'Персонаж не найден в живом листе САЙТ',
        },
        404
      );
    }


    const existing =
      await signupStore.get(
        signupKey,
        {
          type:
            'json',

          consistency:
            'strong',
        }
      );


    if (
      existing &&
      existing.status ===
        'registered'
    ) {
      return json({
        ok: true,

        alreadyRegistered:
          true,

        participant: {
          key:
            signupKey,

          characterId,

          source:
            cleanText(
              existing.source ||
              'admin'
            ),

          joinedAt:
            cleanText(
              existing.createdAt
            ),

          character:
            existing.character ||
            {
              name:
                cleanText(
                  existing.playerName ||
                  registryCharacter.name ||
                  characterId
                ),

              level:
                Number(
                  registryCharacter.level
                ) || 0,

              rank:
                cleanText(
                  registryCharacter.rank
                ),

              className:
                cleanText(
                  registryCharacter.className
                ),

              squad:
                cleanText(
                  registryCharacter.squad
                ),
            },

          loadout:
            existing.loadout ||
            {
              equipment: [],
              inventory: [],
            },
        },
      });
    }


    /*
      Уровень не входит в лёгкий action=list текущего Apps Script,
      поэтому frontend перед добавлением загружает один точный снимок
      выбранного персонажа через mode=candidate-detail.

      Здесь сохраняем этот снимок в signup, чтобы уровень не исчезал
      после обновления страницы. Если старый клиент снимок не прислал,
      остаётся безопасный fallback из реестра.
    */
    const character =
      cleanIncomingSnapshot(
        body?.character,
        {
          name:
            registryCharacter.name ||
            user?.displayName ||
            characterId,

          level:
            registryCharacter.level,

          rank:
            registryCharacter.rank,

          className:
            registryCharacter.className,

          squad:
            registryCharacter.squad,
        }
      );

    const now =
      new Date()
        .toISOString();

    const signup = {
      eventId,

      eventKey:
        key,

      eventTitle:
        cleanText(
          event.title
        ),

      characterId,

      status:
        'registered',

      source:
        'admin',

      character,

      loadout: {
        equipment: [],
        inventory: [],
      },

      addedBy: {
        login:
          session.sub ||
          '',

        name:
          session.name ||
          session.sub ||
          '',
      },

      createdAt:
        now,

      updatedAt:
        now,
    };


    await signupStore.setJSON(
      signupKey,
      signup
    );


    await tryWriteAdminLog({
      adminLogin:
        session.sub ||
        '',

      adminName:
        session.name ||
        session.sub ||
        '',

      action:
        'ADD_EVENT_MEMBER',

      targetType:
        'event',

      targetId:
        eventId,

      targetName:
        cleanText(
          event.title
        ),

      details:
        `Добавлен участник: ${
          character.name ||
          characterId
        }`,
    });


    return json({
      ok: true,

      alreadyRegistered:
        false,

      participant: {
        key:
          signupKey,

        characterId,

        source:
          'admin',

        joinedAt:
          now,

        character,

        loadout:
          signup.loadout,
      },
    });

  } catch (
    error
  ) {
    console.error(
      'admin-event-participants error:',
      error
    );

    return json(
      {
        ok: false,

        error:
          error?.message ||
          'Не удалось изменить состав ивента',
      },
      500
    );
  }
}