import {
  getStore,
} from '@netlify/blobs';

import {
  json,
} from './_shared/_auth.mjs';

import {
  requireEventManager,
} from './_shared/_event-permissions.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';

import {
  loadCharacterData,
} from './_shared/_event-access.mjs';


const EVENTS_STORE =
  'gosmag-events';

const SIGNUPS_STORE =
  'gosmag-event-signups';


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
  const raw =
    process.env
      .PORTAL_USERS_JSON;

  if (!raw) {
    return [];
  }

  const parsed =
    JSON.parse(raw);

  const users =
    Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed ===
            'object'
        ? Object.values(parsed)
        : [];

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

  url.searchParams.set(
    '_',
    String(
      Date.now()
    )
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

  return (
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
      })
    )
    .filter(
      item =>
        item.characterId &&
        item.active
    );
}


async function loadCharacterSnapshot(
  characterId,
  fallbackName = ''
) {
  try {
    const data =
      await loadCharacterData(
        characterId
      );

    return {
      name:
        cleanText(
          data
            ?.character
            ?.name ||
          fallbackName
        ),

      level:
        Number(
          data
            ?.level
            ?.current
        ) || 0,

      rank:
        cleanText(
          data
            ?.character
            ?.rank
        ),

      className:
        cleanText(
          data
            ?.character
            ?.className
        ),

      squad:
        cleanText(
          data
            ?.character
            ?.squad
        ),
    };

  } catch (
    error
  ) {
    console.warn(
      'admin participant character load:',
      characterId,
      error?.message ||
      error
    );

    return {
      name:
        cleanText(
          fallbackName ||
          characterId
        ),

      level:
        0,

      rank:
        '',

      className:
        '',

      squad:
        '',
    };
  }
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
              character =
                await loadCharacterSnapshot(
                  characterId,
                  signup.playerName
                );
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
    Раньше список собирался только из PORTAL_USERS_JSON.
    Поэтому ивентер видел лишь персонажей, привязанных к аккаунтам.

    Теперь источником является живой лист САЙТ через
    CHARACTER_SERVICE_URL?action=list — то есть ВСЕ активные персонажи.
    PORTAL_USERS_JSON используется только как дополнительная информация
    о логине/аккаунте, если такая привязка существует.
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

  const candidates =
    await Promise.all(
      registry.map(
        async item => {
          const user =
            usersByCharacterId.get(
              item.characterId
            );

          const character =
            await loadCharacterSnapshot(
              item.characterId,
              item.name
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

            character,
          };
        }
      )
    );

  return candidates.sort(
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

      const participants =
        await listParticipants(
          event
        );

      const candidates =
        await listCandidates(
          participants
        );

      return json({
        ok: true,

        event: {
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
        },

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

        signup:
          existing,
      });
    }


    const character =
      await loadCharacterSnapshot(
        characterId,
        user?.displayName ||
        registryCharacter.name
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

      signup,
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