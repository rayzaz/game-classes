import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';


const STORE_NAME =
  'gosmag-admin-audit';


function getAuditStore() {

  return getStore({
    name:
      STORE_NAME,

    consistency:
      'strong',
  });
}


export default async (
  request
) => {

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
       ЧИТАЕМ ЖУРНАЛ
       ========================= */

    const store =
      getAuditStore();


    const {
      blobs,
    } =
      await store.list({
        prefix:
          'entries/',
      });


    /*
      Ключ содержит Date.now(),
      поэтому сортировка ключей
      уже почти соответствует
      времени создания.
    */

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
        )
        .slice(
          0,
          200
        );


    const entries =
      (
        await Promise.all(

          sorted.map(
            async item => {

              try {

                return await store.get(
                  item.key,
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
                  'audit entry read error:',
                  item.key,
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


    /*
      Дополнительно сортируем
      уже по реальному createdAt.
    */

    entries.sort(
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


    return json({
      ok: true,

      entries,

      total:
        entries.length,
    });

  } catch (
    error
  ) {

    console.error(
      'admin-audit-log function error:',
      error
    );


    return json(
      {
        ok: false,
        error:
          'Не удалось загрузить журнал действий',
      },
      500
    );
  }
};