import {
  getStore,
} from '@netlify/blobs';

import {
  randomUUID,
} from 'node:crypto';

import {
  json,
  loadUsers,
  normalizeLogin,
} from './_shared/_auth.mjs';

import {
  requireEventManager,
} from './_shared/_event-permissions.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';


const STORE_NAME =
  'gosmag-events';


const ALLOWED_STATUSES =
  new Set([
    'draft',
    'published',
    'active',
    'completed',
    'cancelled',
  ]);


/* ============================================================
   ХРАНИЛИЩЕ
   ============================================================ */

function getEventStore() {

  return getStore({
    name:
      STORE_NAME,

    consistency:
      'strong',
  });
}


/* ============================================================
   БЕЗОПАСНЫЙ ТЕКСТ
   ============================================================ */

function cleanText(
  value,
  maxLength = 500
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


/* ============================================================
   БЕЗОПАСНОЕ ЧИСЛО
   ============================================================ */

function cleanNumber(
  value,
  {
    min = 0,
    max = 999999999,
  } = {}
) {

  const number =
    Number(
      value
    );


  if (
    !Number.isFinite(
      number
    )
  ) {

    return min;
  }


  return Math.min(
    max,
    Math.max(
      min,
      Math.floor(
        number
      )
    )
  );
}


/* ============================================================
   МАТЕРИАЛЬНЫЕ НАГРАДЫ
   ============================================================ */

function cleanMaterialRewards(
  value
) {

  if (
    !Array.isArray(
      value
    )
  ) {

    return [];
  }


  return value
    .map(
      item => {

        /*
          Можно прислать просто строку:

          "Огненный кристалл"

          либо объект:

          {
            name: "Огненный кристалл",
            count: 2,
            description: "..."
          }
        */

        if (
          typeof item ===
          'string'
        ) {

          const name =
            cleanText(
              item,
              200
            );


          if (!name) {

            return null;
          }


          return {
            id:
              randomUUID(),

            name,

            count:
              1,

            description:
              '',
          };
        }


        if (
          !item ||
          typeof item !==
            'object' ||
          Array.isArray(
            item
          )
        ) {

          return null;
        }


        const name =
          cleanText(
            item.name,
            200
          );


        if (!name) {

          return null;
        }


        return {

          id:
            randomUUID(),

          name,

          count:
            cleanNumber(
              item.count,
              {
                min:
                  1,

                max:
                  9999,
              }
            ),

          description:
            cleanText(
              item.description,
              1000
            ),
        };
      }
    )
    .filter(
      Boolean
    )
    .slice(
      0,
      50
    );
}


/* ============================================================
   ИМЯ АДМИНИСТРАТОРА
   ============================================================ */

function getAdminName(
  session
) {

  try {

    const users =
      loadUsers();


    const admin =
      users.find(
        user =>
          normalizeLogin(
            user?.login
          ) ===
          normalizeLogin(
            session?.sub
          )
      );


    return String(
      admin?.displayName ||
      session?.sub ||
      'Администратор'
    );

  } catch {

    return String(
      session?.sub ||
      'Администратор'
    );
  }
}


/* ============================================================
   ПРОВЕРКА АДМИНА
   ============================================================ */


/* ============================================================
   ПОЛУЧИТЬ ВСЕ ИВЕНТЫ
   ============================================================ */

async function listEvents() {

  const store =
    getEventStore();


  const {
    blobs,
  } =
    await store.list({
      prefix:
        'events/',
    });


  const sorted =
    [...blobs]
      .sort(
        (
          a,
          b
        ) =>
          b.key.localeCompare(
            a.key
          )
      );


  const events =
    (
      await Promise.all(

        sorted.map(
          async blob => {

            try {

              const event =
                await store.get(
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


              return {

                key:
                  blob.key,

                id:
                  String(
                    event.id ||
                    ''
                  ),

                title:
                  String(
                    event.title ||
                    ''
                  ),

                description:
                  String(
                    event.description ||
                    ''
                  ),

                location:
                  String(
                    event.location ||
                    ''
                  ),

                startsAt:
                  String(
                    event.startsAt ||
                    ''
                  ),

                endsAt:
                  String(
                    event.endsAt ||
                    ''
                  ),

                status:
                  String(
                    event.status ||
                    'draft'
                  ),


                /* =========================
                   СЛОЖНОСТЬ
                   ========================= */

                difficulty: {

                  level:
                    cleanNumber(
                      event.difficulty?.level,
                      {
                        min:
                          1,

                        max:
                          999,
                      }
                    ),

                  requiredKnightRank:
                    String(
                      event.difficulty
                        ?.requiredKnightRank ||
                      ''
                    ),
                },


                /* =========================
                   НАГРАДЫ
                   ========================= */

                rewards: {

                  experience:
                    cleanNumber(
                      event.rewards?.experience
                    ),

                  points:
                    cleanNumber(
                      event.rewards?.points
                    ),

                  money: {

                    amount:
                      cleanNumber(
                        event.rewards?.money
                          ?.amount
                      ),

                    currency:
                      String(
                        event.rewards?.money
                          ?.currency ||
                        ''
                      ),
                  },

                  materials:
                    Array.isArray(
                      event.rewards?.materials
                    )
                      ? event.rewards.materials
                      : [],
                },


                createdAt:
                  String(
                    event.createdAt ||
                    ''
                  ),

                updatedAt:
                  String(
                    event.updatedAt ||
                    event.createdAt ||
                    ''
                  ),

                createdBy:
                  event.createdBy &&
                  typeof event.createdBy ===
                    'object'
                    ? event.createdBy
                    : null,

                participants:
                  Array.isArray(
                    event.participants
                  )
                    ? event.participants
                    : [],
              };

            } catch (
              error
            ) {

              console.error(
                'event read error:',
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


  return events;
}


/* ============================================================
   СОЗДАТЬ ИВЕНТ
   ============================================================ */

async function createEvent(
  request,
  session
) {

  const body =
    await request
      .json()
      .catch(
        () => ({})
      );


  /* =========================
     ОСНОВНОЕ
     ========================= */

  const title =
    cleanText(
      body?.title,
      200
    );


  if (!title) {

    return json(
      {
        ok: false,

        error:
          'Введите название ивента',
      },
      400
    );
  }


  const description =
    cleanText(
      body?.description,
      10000
    );


  if (!description) {

    return json(
      {
        ok: false,

        error:
          'Введите описание ивента',
      },
      400
    );
  }


  const location =
    cleanText(
      body?.location,
      300
    );


  const startsAt =
    cleanText(
      body?.startsAt,
      100
    );


  const endsAt =
    cleanText(
      body?.endsAt,
      100
    );


  /* =========================
     СТАТУС
     ========================= */

  const requestedStatus =
    cleanText(
      body?.status,
      50
    )
      .toLowerCase();


  const status =
    ALLOWED_STATUSES.has(
      requestedStatus
    )
      ? requestedStatus
      : 'draft';


  /* =========================
     СЛОЖНОСТЬ ИВЕНТА
     ========================= */

  const difficultyLevel =
    cleanNumber(
      body?.difficultyLevel,
      {
        min:
          1,

        max:
          999,
      }
    );


  if (
    !difficultyLevel
  ) {

    return json(
      {
        ok: false,

        error:
          'Укажите уровень сложности ивента',
      },
      400
    );
  }


  /* =========================
     ПРОХОДНОЙ РАНГ
     ========================= */

  const requiredKnightRank =
    cleanText(
      body?.requiredKnightRank,
      100
    );


  if (
    !requiredKnightRank
  ) {

    return json(
      {
        ok: false,

        error:
          'Укажите минимальный ранг рыцаря для участия',
      },
      400
    );
  }


  /* =========================
     ОПЫТ
     ========================= */

  const experienceReward =
    cleanNumber(
      body?.experienceReward,
      {
        min:
          0,

        max:
          999999999,
      }
    );


  /* =========================
     БАЛЛЫ
     ========================= */

  const pointsReward =
    cleanNumber(
      body?.pointsReward,
      {
        min:
          0,

        max:
          999999999,
      }
    );


  /* =========================
     ДЕНЬГИ
     ========================= */

  const moneyReward =
    cleanNumber(
      body?.moneyReward,
      {
        min:
          0,

        max:
          999999999,
      }
    );


  /*
    Валюту специально не
    прибиваем гвоздями.

    Если у вас поменяется
    денежная система,
    сервер переделывать
    не придётся.
  */

  const moneyCurrency =
    cleanText(
      body?.moneyCurrency,
      100
    );


  /* =========================
     МАТЕРИАЛЬНЫЕ НАГРАДЫ
     ========================= */

  const materialRewards =
    cleanMaterialRewards(
      body?.materialRewards
    );


  /* =========================
     СОЗДАЁМ ИВЕНТ
     ========================= */

  const id =
    randomUUID();


  const createdAt =
    new Date()
      .toISOString();


  const adminName =
    getAdminName(
      session
    );


  const event = {

    id,

    title,

    description,

    location,

    startsAt,

    endsAt,

    status,


    /* =========================
       СЛОЖНОСТЬ
       ========================= */

    difficulty: {

      /*
        Числовой уровень
        сложности самого ивента.
      */

      level:
        difficultyLevel,


      /*
        Минимальный ранг
        рыцаря, который имеет
        право попасть на ивент.
      */

      requiredKnightRank,
    },


    /* =========================
       НАГРАДЫ
       ========================= */

    rewards: {

      /*
        Любое из этих значений
        может быть 0.

        Поэтому можно выдавать:
        только опыт,
        только баллы,
        опыт + баллы,
        деньги,
        предметы,
        или всё вместе.
      */

      experience:
        experienceReward,

      points:
        pointsReward,

      money: {

        amount:
          moneyReward,

        currency:
          moneyCurrency,
      },

      materials:
        materialRewards,
    },


    /* =========================
       СЛУЖЕБНОЕ
       ========================= */

    createdAt,

    updatedAt:
      createdAt,

    createdBy: {

      login:
        normalizeLogin(
          session.sub
        ),

      name:
        adminName,
    },


    /*
      Сюда следующим шагом
      будем прикреплять
      персонажей-участников.
    */

    participants:
      [],
  };


  /* =========================
     СОХРАНЕНИЕ
     ========================= */

  const key =
    `events/${Date.now()}_${id}`;


  const store =
    getEventStore();


  await store.setJSON(
    key,
    event
  );


  /* =========================
     ЖУРНАЛ АДМИНОВ
     ========================= */

  await tryWriteAdminLog({

    adminLogin:
      session.sub,

    adminName,

    action:
      'CREATE_EVENT',

    targetType:
      'event',

    targetId:
      id,

    targetName:
      title,

    details:
      `Создан ивент «${title}». Уровень сложности: ${difficultyLevel}. Минимальный ранг: ${requiredKnightRank}.`,
  });


  /* =========================
     ОТВЕТ
     ========================= */

  return json(
    {
      ok: true,

      event: {

        key,

        ...event,
      },
    },
    201
  );
}


/* ============================================================
   NETLIFY FUNCTION
   ============================================================ */

export default async function (
  request
) {

  try {

    const auth =
      await requireEventManager(
        request
      );


    if (
      auth.error
    ) {

      return auth.error;
    }


    const session =
      auth.session;


    /* =========================
       GET — ВСЕ ИВЕНТЫ
       ========================= */

    if (
      request.method ===
      'GET'
    ) {

      const events =
        await listEvents();


      return json({
        ok: true,

        events,

        total:
          events.length,
      });
    }


    /* =========================
       POST — СОЗДАТЬ ИВЕНТ
       ========================= */

    if (
      request.method ===
      'POST'
    ) {

      return await createEvent(
        request,
        session
      );
    }


    /* =========================
       ОСТАЛЬНЫЕ МЕТОДЫ
       ========================= */

    return json(
      {
        ok: false,

        error:
          'Метод не поддерживается',
      },
      405
    );

  } catch (
    error
  ) {

    console.error(
      'admin-events error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          'Не удалось обработать ивенты',
      },
      500
    );
  }
}