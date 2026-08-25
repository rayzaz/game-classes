import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  getEventEligibility,
  loadCharacterData,
} from './_shared/_event-access.mjs';


const EVENTS_STORE =
  'gosmag-events';

const SIGNUPS_STORE =
  'gosmag-event-signups';


function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .trim();
}


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


function numberValue(
  value
) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


/* ============================================================
   КАКОГО ПЕРСОНАЖА ПОКАЗЫВАЕМ
   ============================================================ */

function resolveCharacterId(
  request,
  session
) {
  const sessionCharacterId =
    cleanText(
      session?.cid
    )
      .toLowerCase();

  /*
    Обычный игрок всегда работает
    только со своим персонажем.

    Даже если вручную подставить
    characterId в URL, сервер
    его проигнорирует.
  */

  if (
    session?.role !==
    'admin'
  ) {
    return sessionCharacterId;
  }

  /*
    Администратор может открыть
    ивенты конкретного персонажа.
  */

  const url =
    new URL(
      request.url
    );

  const requestedCharacterId =
    cleanText(
      url.searchParams.get(
        'characterId'
      )
    )
      .toLowerCase();

  return (
    requestedCharacterId ||
    sessionCharacterId
  );
}


export default async function (
  request
) {

  /* ==========================================================
     ТОЛЬКО GET
     ========================================================== */

  if (
    request.method !==
    'GET'
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


  try {

    /* ========================================================
       СЕССИЯ
       ======================================================== */

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


    /* ========================================================
       ВЫБИРАЕМ ПЕРСОНАЖА
       ======================================================== */

    const characterId =
      resolveCharacterId(
        request,
        session
      );

    if (!characterId) {
      return json(
        {
          ok: false,

          error:
            session.role ===
            'admin'
              ? 'Не указан персонаж для просмотра ивентов'
              : 'У аккаунта не указан персонаж',
        },
        400
      );
    }


    /* ========================================================
       ДАННЫЕ ПЕРСОНАЖА
       ======================================================== */

    const characterData =
      await loadCharacterData(
        characterId
      );


    const player = {
      characterId,

      name:
        cleanText(
          characterData
            ?.character
            ?.name
        ),

      level:
        numberValue(
          characterData
            ?.level
            ?.current
        ),

      rank:
        cleanText(
          characterData
            ?.character
            ?.rank
        ),

      className:
        cleanText(
          characterData
            ?.character
            ?.className
        ),

      squad:
        cleanText(
          characterData
            ?.character
            ?.squad
        ),
    };


    /* ========================================================
       ЗАГРУЖАЕМ ИВЕНТЫ
       ======================================================== */

    const eventStore =
      getEventsStore();


    const {
      blobs,
    } =
      await eventStore.list({
        prefix:
          'events/',
      });


    const rawEvents =
      (
        await Promise.all(
          blobs.map(
            async blob => {

              try {

                const event =
                  await eventStore.get(
                    blob.key,
                    {
                      type:
                        'json',

                      consistency:
                        'strong',
                    }
                  );


                if (!event) {
                  return null;
                }


                /*
                  В анкете персонажа
                  показываем только:

                  published
                  active

                  Не показываем:

                  draft
                  cancelled
                  completed
                */

                if (
                  event.status !==
                    'published' &&
                  event.status !==
                    'active'
                ) {
                  return null;
                }


                return {
                  key:
                    blob.key,

                  event,
                };

              } catch (
                error
              ) {

                console.error(
                  'player event read error:',
                  blob.key,
                  error
                );

                return null;
              }

            }
          )
        )
      )
        .filter(
          Boolean
        );


    /* ========================================================
       ЗАПИСИ ВЫБРАННОГО ПЕРСОНАЖА
       ======================================================== */

    const signupStore =
      getSignupsStore();


    const events =
      await Promise.all(
        rawEvents.map(
          async item => {

            const event =
              item.event;


            const eventId =
              cleanText(
                event.id
              );


            let signup =
              null;


            if (eventId) {

              try {

                signup =
                  await signupStore.get(
                    `signups/${eventId}/${characterId}`,
                    {
                      type:
                        'json',

                      consistency:
                        'strong',
                    }
                  );

              } catch (
                error
              ) {

                console.error(
                  'signup read error:',
                  error
                );
              }

            }


            const eligibility =
              getEventEligibility(
                characterData,
                event
              );


            return {

              key:
                item.key,


              id:
                eventId,


              title:
                cleanText(
                  event.title
                ),


              description:
                cleanText(
                  event.description
                ),


              location:
                cleanText(
                  event.location
                ),


              startsAt:
                cleanText(
                  event.startsAt
                ),


              endsAt:
                cleanText(
                  event.endsAt
                ),


              status:
                cleanText(
                  event.status
                ),


              difficulty: {

                level:
                  numberValue(
                    event.difficulty
                      ?.level
                  ),

                requiredKnightRank:
                  cleanText(
                    event.difficulty
                      ?.requiredKnightRank
                  ),

              },


              rewards: {

                experience:
                  numberValue(
                    event.rewards
                      ?.experience
                  ),

                points:
                  numberValue(
                    event.rewards
                      ?.points
                  ),

                money: {

                  amount:
                    numberValue(
                      event.rewards
                        ?.money
                        ?.amount
                    ),

                  currency:
                    cleanText(
                      event.rewards
                        ?.money
                        ?.currency
                    ),

                },

                materials:
                  Array.isArray(
                    event.rewards
                      ?.materials
                  )
                    ? event.rewards.materials
                    : [],

              },


              eligibility,


              registration: {

                joined:
                  Boolean(
                    signup &&
                    signup.status ===
                      'registered'
                  ),

                status:
                  cleanText(
                    signup?.status
                  ),

                joinedAt:
                  cleanText(
                    signup?.createdAt
                  ),

              },

            };

          }
        )
      );


    /* ========================================================
       СОРТИРОВКА ПО ДАТЕ
       ======================================================== */

    events.sort(
      (
        first,
        second
      ) => {

        const firstTime =
          new Date(
            first.startsAt ||
            0
          )
            .getTime();


        const secondTime =
          new Date(
            second.startsAt ||
            0
          )
            .getTime();


        if (
          !Number.isFinite(
            firstTime
          )
        ) {
          return 1;
        }


        if (
          !Number.isFinite(
            secondTime
          )
        ) {
          return -1;
        }


        return (
          firstTime -
          secondTime
        );

      }
    );


    /* ========================================================
       ГОТОВО
       ======================================================== */

    return json({

      ok:
        true,


      player,


      events,


      total:
        events.length,


      adminView:
        session.role ===
        'admin',

    });


  } catch (
    error
  ) {

    console.error(
      'player-events error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          error?.message ||
          'Не удалось загрузить ивенты',
      },
      500
    );

  }
}