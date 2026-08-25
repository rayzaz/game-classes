import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';


const STORE_NAME =
  'gosmag-questionnaires';


function getQuestionnaireStore() {

  return getStore({
    name:
      STORE_NAME,

    consistency:
      'strong',
  });
}


/* =========================
   NETLIFY FUNCTION
   ========================= */

export default async function (
  request
) {

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

    /* =========================
       ПРОВЕРКА ВХОДА
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


    /* =========================
       ТОЛЬКО АДМИНИСТРАТОРЫ
       ========================= */

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
       ЧИТАЕМ ХРАНИЛИЩЕ
       ========================= */

    const store =
      getQuestionnaireStore();


    const {
      blobs,
    } =
      await store.list({
        prefix:
          'submissions/',
      });


    /* =========================
       СНАЧАЛА НОВЫЕ
       ========================= */

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


    /* =========================
       ЧИТАЕМ АНКЕТЫ
       ========================= */

    const questionnaires =
      (
        await Promise.all(

          sorted.map(
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


                /*
                  В списке не отдаём
                  все ответы анкеты.

                  Полную анкету будем
                  открывать отдельной
                  функцией.
                */

                return {

                  key:
                    blob.key,

                  id:
                    String(
                      entry.id ||
                      ''
                    ),

                  createdAt:
                    String(
                      entry.createdAt ||
                      ''
                    ),

                  updatedAt:
                    String(
                      entry.updatedAt ||
                      entry.createdAt ||
                      ''
                    ),

                  status:
                    String(
                      entry.status ||
                      'new'
                    ),

                  assistant: {

                    id:
                      String(
                        entry.assistant?.id ||
                        ''
                      ),

                    name:
                      String(
                        entry.assistant?.name ||
                        ''
                      ),
                  },
                };

              } catch (
                error
              ) {

                console.error(
                  'questionnaire read error:',
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


    return json({
      ok: true,

      questionnaires,

      total:
        questionnaires.length,
    });

  } catch (
    error
  ) {

    console.error(
      'admin-questionnaires error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          'Не удалось загрузить анкеты',
      },
      500
    );
  }
}