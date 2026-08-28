import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';


function requireAdmin(
  request
) {
  const session =
    readSession(
      request
    );

  if (
    !session ||
    session.role !==
      'admin'
  ) {
    return {
      error:
        json(
          {
            ok: false,
            error:
              'Требуются права администратора',
          },
          403
        ),
    };
  }

  return {
    session,
  };
}


function requireEnv(
  name
) {
  const value =
    String(
      process.env[
        name
      ] ||
      ''
    )
      .trim();

  if (!value) {
    throw new Error(
      `Не задана переменная ${name}`
    );
  }

  return value;
}


async function callCharacterService(
  payload
) {
  const serviceUrl =
    requireEnv(
      'CHARACTER_SERVICE_URL'
    );

  const writeSecret =
    requireEnv(
      'CHARACTER_WRITE_SECRET'
    );

  const response =
    await fetch(
      serviceUrl,
      {
        method:
          'POST',
        headers: {
          'content-type':
            'application/json; charset=utf-8',
        },
        body:
          JSON.stringify({
            ...payload,
            writeSecret,
          }),
        redirect:
          'follow',
      }
    );

  const text =
    await response.text();

  let result =
    null;

  try {
    result =
      JSON.parse(
        text
      );
  } catch {
    result =
      null;
  }

  if (
    !response.ok ||
    !result ||
    result.ok !==
      true
  ) {
    throw new Error(
      result?.error ||
      `Сервис персонажей вернул ${response.status}`
    );
  }

  return result;
}


export default async function(
  request
) {
  try {
    const auth =
      requireAdmin(
        request
      );

    if (
      auth.error
    ) {
      return auth.error;
    }


    if (
      request.method ===
      'GET'
    ) {
      const result =
        await callCharacterService({
          action:
            'calendar-state',
        });

      return json(
        result
      );
    }


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

      const action =
        String(
          body?.action ||
          ''
        )
          .trim()
          .toLowerCase();

      if (
        action ===
        'initialize'
      ) {
        const result =
          await callCharacterService({
            action:
              'calendar-initialize',
            calendar: {
              season:
                body?.season,
              year:
                body?.year,
            },
          });

        await tryWriteAdminLog({
          adminLogin:
            auth.session.sub ||
            '',
          adminName:
            auth.session.name ||
            auth.session.sub ||
            '',
          action:
            'CALENDAR_INITIALIZE',
          targetType:
            'calendar',
          targetId:
            'world',
          targetName:
            'Игровой календарь',
          details:
            `${result.calendar?.seasonLabel || ''}, ${result.calendar?.year || ''} год`,
        });

        return json(
          result
        );
      }


      if (
        action ===
        'advance'
      ) {
        const result =
          await callCharacterService({
            action:
              'calendar-advance',
            expectedRevision:
              body?.expectedRevision,
          });

        await tryWriteAdminLog({
          adminLogin:
            auth.session.sub ||
            '',
          adminName:
            auth.session.name ||
            auth.session.sub ||
            '',
          action:
            result.yearChanged
              ? 'CALENDAR_NEW_YEAR'
              : 'CALENDAR_ADVANCE',
          targetType:
            'calendar',
          targetId:
            'world',
          targetName:
            'Игровой календарь',
          details:
            result.yearChanged
              ? `Наступила ${result.calendar?.seasonLabel || ''}, ${result.calendar?.year || ''} год. Возраст обновлён у ${result.ageReport?.updatedCount || 0} персонажей.`
              : `Сезон: ${result.calendar?.seasonLabel || ''}, ${result.calendar?.year || ''} год`,
        });

        return json(
          result
        );
      }


      return json(
        {
          ok: false,
          error:
            'Неизвестное действие календаря',
        },
        400
      );
    }


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
      'admin-calendar error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось обновить календарь',
      },
      500
    );
  }
}
