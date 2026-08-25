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
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';


const STORE_NAME =
  'gosmag-questionnaires';


const ALLOWED_STATUSES =
  new Set([
    'new',
    'review',
    'revision',
    'approved',
    'rejected',
  ]);


/* =========================
   ХРАНИЛИЩЕ
   ========================= */

function getQuestionnaireStore() {

  return getStore({
    name:
      STORE_NAME,

    consistency:
      'strong',
  });
}


/* =========================
   ИМЯ АДМИНА
   ========================= */

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


/* =========================
   НАЗВАНИЕ СТАТУСА
   ========================= */

function statusTitle(
  status
) {

  switch (
    status
  ) {

    case 'new':
      return 'Новая';

    case 'review':
      return 'На рассмотрении';

    case 'revision':
      return 'На доработке';

    case 'approved':
      return 'Одобрена';

    case 'rejected':
      return 'Отклонена';

    default:
      return String(
        status ||
        ''
      );
  }
}


/* =========================
   ИМЯ ПЕРСОНАЖА
   ========================= */

function getQuestionnaireName(
  entry
) {

  const data =
    entry?.data;


  if (
    data &&
    typeof data ===
      'object' &&
    !Array.isArray(
      data
    )
  ) {

    const possibleNames = [

      data.characterName,
      data.character_name,
      data.name,
      data.fullName,
      data.full_name,
      data.nickname,
      data.nick,

    ];


    for (
      const value of possibleNames
    ) {

      const clean =
        String(
          value ||
          ''
        )
          .trim();


      if (clean) {

        return clean.slice(
          0,
          200
        );
      }
    }
  }


  return `Анкета ${String(
    entry?.id ||
    ''
  ).slice(
    0,
    8
  )}`;
}


/* =========================
   FUNCTION
   ========================= */

export default async function (
  request
) {

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


  try {

    /* =========================
       ПРОВЕРКА АДМИНА
       ========================= */

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


    /* =========================
       ЧИТАЕМ ЗАПРОС
       ========================= */

    const body =
      await request
        .json()
        .catch(
          () => ({})
        );


    const key =
      String(
        body?.key ||
        ''
      )
        .trim();


    const nextStatus =
      String(
        body?.status ||
        ''
      )
        .trim()
        .toLowerCase();


    const feedback =
      String(
        body?.feedback ||
        ''
      )
        .trim()
        .slice(
          0,
          3000
        );


    if (!key) {

      return json(
        {
          ok: false,

          error:
            'Не указана анкета',
        },
        400
      );
    }


    if (
      !/^submissions\/[0-9]+_[a-f0-9-]{36}$/i
        .test(
          key
        )
    ) {

      return json(
        {
          ok: false,

          error:
            'Некорректный ID анкеты',
        },
        400
      );
    }


    if (
      !ALLOWED_STATUSES.has(
        nextStatus
      )
    ) {

      return json(
        {
          ok: false,

          error:
            'Некорректный статус',
        },
        400
      );
    }


    if (
      nextStatus ===
        'revision' &&
      !feedback
    ) {

      return json(
        {
          ok: false,

          error:
            'Напишите игроку, что именно нужно исправить',
        },
        400
      );
    }


    /* =========================
       ЧИТАЕМ АНКЕТУ
       ========================= */

    const store =
      getQuestionnaireStore();


    const entry =
      await store.get(
        key,
        {
          type:
            'json',

          consistency:
            'strong',
        }
      );


    if (!entry) {

      return json(
        {
          ok: false,

          error:
            'Анкета не найдена',
        },
        404
      );
    }


    const previousStatus =
      String(
        entry.status ||
        'new'
      );


    const updatedAt =
      new Date()
        .toISOString();


    /* =========================
       ОБНОВЛЯЕМ
       ========================= */

    const updatedEntry = {

      ...entry,

      status:
        nextStatus,

      updatedAt,
    };


    if (
      nextStatus ===
      'revision'
    ) {

      updatedEntry.applicantFeedback = {
        text:
          feedback,

        adminName:
          getAdminName(
            session
          ),

        updatedAt,
      };
    }


    await store.setJSON(
      key,
      updatedEntry
    );


    /* =========================
       ПИШЕМ В ЖУРНАЛ
       ========================= */

    const questionnaireName =
      getQuestionnaireName(
        updatedEntry
      );


    if (
      previousStatus !==
      nextStatus
    ) {

      await tryWriteAdminLog({

        adminLogin:
          session.sub,

        adminName:
          getAdminName(
            session
          ),

        action:
          'EDIT_QUESTIONNAIRE',

        targetType:
          'questionnaire',

        targetId:
          String(
            updatedEntry.id ||
            ''
          ),

        targetName:
          questionnaireName,

        details:
          nextStatus ===
            'revision'
            ? `Анкета отправлена на доработку. Сообщение игроку: ${feedback}`
            : `Статус анкеты изменён: «${statusTitle(
                previousStatus
              )}» → «${statusTitle(
                nextStatus
              )}»`,
      });
    }


    /* =========================
       ОТВЕТ
       ========================= */

    return json({
      ok: true,

      questionnaire: {

        key,

        id:
          String(
            updatedEntry.id ||
            ''
          ),

        status:
          nextStatus,

        updatedAt:
          updatedEntry.updatedAt,

        applicantFeedback:
          updatedEntry.applicantFeedback ||
          null,
      },
    });

  } catch (
    error
  ) {

    console.error(
      'admin-questionnaire-status error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          'Не удалось изменить статус анкеты',
      },
      500
    );
  }
}