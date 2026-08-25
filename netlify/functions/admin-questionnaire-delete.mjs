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


const QUESTIONNAIRE_STORE =
  'gosmag-questionnaires';

const NOTES_STORE =
  'gosmag-questionnaire-notes';


/* =========================
   ХРАНИЛИЩА
   ========================= */

function getQuestionnaireStore() {

  return getStore({
    name:
      QUESTIONNAIRE_STORE,

    consistency:
      'strong',
  });
}


function getNotesStore() {

  return getStore({
    name:
      NOTES_STORE,

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
   ПРОВЕРКА КЛЮЧА
   ========================= */

function isValidQuestionnaireKey(
  key
) {

  return (
    /^submissions\/[A-Za-z0-9._-]+$/
      .test(
        key
      )
  );
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
       ПРОВЕРКА СЕССИИ
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
      !isValidQuestionnaireKey(
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


    /* =========================
       ЧИТАЕМ АНКЕТУ
       ========================= */

    const questionnaireStore =
      getQuestionnaireStore();


    const entry =
      await questionnaireStore.get(
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


    const questionnaireId =
      String(
        entry.id ||
        ''
      );


    const questionnaireName =
      getQuestionnaireName(
        entry
      );


    /* =========================
       УДАЛЯЕМ КОММЕНТАРИИ
       ========================= */

    let notesDeleted =
      0;


    if (questionnaireId) {

      const notesStore =
        getNotesStore();


      const {
        blobs,
      } =
        await notesStore.list({
          prefix:
            `notes/${questionnaireId}/`,
        });


      if (
        blobs.length >
        0
      ) {

        await Promise.all(
          blobs.map(
            blob =>
              notesStore.delete(
                blob.key
              )
          )
        );


        notesDeleted =
          blobs.length;
      }
    }


    /* =========================
       УДАЛЯЕМ САМУ АНКЕТУ
       ========================= */

    await questionnaireStore.delete(
      key
    );


    /* =========================
       ЖУРНАЛ АДМИНА
       ========================= */

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
        questionnaireId,

      targetName:
        questionnaireName,

      details:
        notesDeleted > 0
          ? `Анкета удалена навсегда. Вместе с ней удалено внутренних комментариев: ${notesDeleted}.`
          : 'Анкета удалена навсегда.',
    });


    return json({
      ok: true,

      deleted: {
        key,
        id:
          questionnaireId,
        notesDeleted,
      },
    });

  } catch (
    error
  ) {

    console.error(
      'admin-questionnaire-delete error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          'Не удалось удалить анкету',
      },
      500
    );
  }
}
