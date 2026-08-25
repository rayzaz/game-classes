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
   ПРОВЕРКА КЛЮЧА АНКЕТЫ
   ========================= */

function isValidQuestionnaireKey(
  key
) {

  return (
    /^submissions\/[0-9]+_[a-f0-9-]{36}$/i
      .test(
        key
      )
  );
}


/* =========================
   ЧИТАЕМ АНКЕТУ
   ========================= */

async function loadQuestionnaire(
  key
) {

  if (
    !isValidQuestionnaireKey(
      key
    )
  ) {

    return {
      error:
        'Некорректный ID анкеты',

      status:
        400,
    };
  }


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

    return {
      error:
        'Анкета не найдена',

      status:
        404,
    };
  }


  return {
    entry,
  };
}


/* =========================
   ПОЛУЧИТЬ КОММЕНТАРИИ
   ========================= */

async function getNotes(
  questionnaire
) {

  const questionnaireId =
    String(
      questionnaire?.id ||
      ''
    );


  if (!questionnaireId) {

    return [];
  }


  const store =
    getNotesStore();


  const {
    blobs,
  } =
    await store.list({
      prefix:
        `notes/${questionnaireId}/`,
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


  const notes =
    (
      await Promise.all(

        sorted.map(
          async blob => {

            try {

              return await store.get(
                blob.key,
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
                'questionnaire note read error:',
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


  notes.sort(
    (
      a,
      b
    ) =>
      String(
        b?.createdAt ||
        ''
      )
        .localeCompare(
          String(
            a?.createdAt ||
            ''
          )
        )
  );


  return notes;
}


/* =========================
   NETLIFY FUNCTION
   ========================= */

export default async function (
  request
) {

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
       GET — ЧИТАЕМ КОММЕНТАРИИ
       ========================= */

    if (
      request.method ===
      'GET'
    ) {

      const requestUrl =
        new URL(
          request.url
        );


      const key =
        String(
          requestUrl
            .searchParams
            .get(
              'key'
            ) ||
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


      const loaded =
        await loadQuestionnaire(
          key
        );


      if (
        loaded.error
      ) {

        return json(
          {
            ok: false,

            error:
              loaded.error,
          },
          loaded.status
        );
      }


      const notes =
        await getNotes(
          loaded.entry
        );


      return json({
        ok: true,

        notes,

        total:
          notes.length,
      });
    }


    /* =========================
       POST — ДОБАВЛЯЕМ КОММЕНТАРИЙ
       ========================= */

    if (
      request.method ===
      'POST'
    ) {

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


      const text =
        String(
          body?.text ||
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


      if (!text) {

        return json(
          {
            ok: false,

            error:
              'Комментарий пуст',
          },
          400
        );
      }


      if (
        text.length >
        3000
      ) {

        return json(
          {
            ok: false,

            error:
              'Комментарий слишком длинный',
          },
          400
        );
      }


      const loaded =
        await loadQuestionnaire(
          key
        );


      if (
        loaded.error
      ) {

        return json(
          {
            ok: false,

            error:
              loaded.error,
          },
          loaded.status
        );
      }


      const questionnaire =
        loaded.entry;


      const questionnaireId =
        String(
          questionnaire?.id ||
          ''
        );


      if (!questionnaireId) {

        return json(
          {
            ok: false,

            error:
              'У анкеты отсутствует ID',
          },
          500
        );
      }


      /* =========================
         СОЗДАЁМ КОММЕНТАРИЙ
         ========================= */

      const id =
        randomUUID();


      const createdAt =
        new Date()
          .toISOString();


      const note = {

        id,

        questionnaireId,

        createdAt,

        admin: {

          login:
            normalizeLogin(
              session.sub
            ),

          name:
            getAdminName(
              session
            ),
        },

        text:
          text.slice(
            0,
            3000
          ),
      };


      /*
        Каждый комментарий —
        отдельный Blob.

        Поэтому Рен и Люмин
        могут оставить комментарии
        почти одновременно и не
        перезапишут друг друга.
      */

      const noteKey =
        `notes/${questionnaireId}/${Date.now()}_${id}`;


      const store =
        getNotesStore();


      await store.setJSON(
        noteKey,
        note
      );


      /* =========================
         ЗАПИСЫВАЕМ В ЖУРНАЛ
         ========================= */

      const questionnaireName =
        getQuestionnaireName(
          questionnaire
        );


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
          `Добавлен внутренний комментарий к анкете «${questionnaireName}»`,
      });


      return json(
        {
          ok: true,

          note,
        },
        201
      );
    }


    /* =========================
       ДРУГИЕ МЕТОДЫ
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
      'admin-questionnaire-notes error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          'Не удалось обработать комментарии анкеты',
      },
      500
    );
  }
}