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


const EVENTS_STORE =
  'gosmag-events';


const ALLOWED_STATUSES =
  new Set([
    'draft',
    'published',
    'active',
    'cancelled',
  ]);


/*
  ВАЖНО:

  completed здесь специально НЕТ.

  Позже завершение ивента будет отдельной
  серверной операцией, которая:

  1. проверит участников;
  2. начислит опыт;
  3. начислит баллы;
  4. начислит деньги;
  5. выдаст предметы;
  6. запишет историю наград;
  7. только после этого поставит completed.

  Поэтому обычной сменой статуса
  завершить ивент будет нельзя.
*/


function getEventsStore() {

  return getStore({
    name:
      EVENTS_STORE,

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
       ПРОВЕРЯЕМ АДМИНА
       ========================= */

    const access =
      await requireEventManager(
        request
      );

    if (access.error) {
      return access.error;
    }

    const session =
      access.session;


    /* =========================
       ЧИТАЕМ BODY
       ========================= */

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


    const status =
      cleanText(
        body?.status
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
      !ALLOWED_STATUSES.has(
        status
      )
    ) {

      return json(
        {
          ok: false,

          error:
            'Такой статус нельзя установить',
        },
        400
      );
    }


    /* =========================
       ПОЛУЧАЕМ ИВЕНТ
       ========================= */

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


    const previousStatus =
      cleanText(
        event.status ||
        'draft'
      );


    /*
      Если ивент уже был завершён старой
      версией системы — не разрешаем
      вернуть его обратно обычной кнопкой.
    */

    if (
      previousStatus ===
      'completed'
    ) {

      return json(
        {
          ok: false,

          error:
            'Завершённый ивент нельзя изменить этой операцией',
        },
        409
      );
    }


    /*
      Ничего не менялось.
    */

    if (
      previousStatus ===
      status
    ) {

      return json({
        ok: true,

        event,
      });
    }


    /* =========================
       ОБНОВЛЯЕМ
       ========================= */

    const updatedEvent = {
      ...event,

      status,

      updatedAt:
        new Date()
          .toISOString(),
    };


    await store.setJSON(
      key,
      updatedEvent
    );


    /* =========================
       АУДИТ
       ========================= */

    await tryWriteAdminLog({
      adminLogin:
        session.sub ||
        '',

      adminName:
        session.name ||
        session.sub ||
        '',

      action:
        'EDIT_EVENT',

      targetType:
        'event',

      targetId:
        String(
          event.id ||
          ''
        ),

      targetName:
        String(
          event.title ||
          ''
        ),

      details:
        `Статус ивента изменён: ${previousStatus} → ${status}`,
    });


    return json({
      ok: true,

      event:
        updatedEvent,
    });

  } catch (
    error
  ) {

    console.error(
      'admin-event-status error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          'Не удалось изменить статус ивента',
      },
      500
    );
  }
}