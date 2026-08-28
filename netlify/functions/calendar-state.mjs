import {
  json,
} from './_shared/_auth.mjs';


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


async function readCalendarState() {
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
            action:
              'calendar-state',
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
    result.ok !== true ||
    !result.calendar
  ) {
    throw new Error(
      result?.error ||
      `Сервис персонажей вернул ${response.status}`
    );
  }

  return result.calendar;
}


export default async function(
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
    const calendar =
      await readCalendarState();

    /*
      Публичной главной странице отдаём
      только безопасную часть календаря.
      Секрет Google наружу не попадает.
    */
    return json(
      {
        ok: true,
        calendar: {
          initialized:
            Boolean(
              calendar.initialized
            ),
          season:
            String(
              calendar.season ||
              'summer'
            ),
          seasonLabel:
            String(
              calendar.seasonLabel ||
              'Лето'
            ),
          year:
            Number(
              calendar.year ||
              1
            ),
          updatedAt:
            String(
              calendar.updatedAt ||
              ''
            ),
        },
      },
      200,
      {
        /*
          Сезон меняется редко, но после
          переключения достаточно быстро
          обновится и на главной.
        */
        'cache-control':
          'public, max-age=15, must-revalidate',
      }
    );

  } catch (
    error
  ) {
    return json(
      {
        ok: false,
        error:
          error?.message ||
          String(
            error
          ),
      },
      500
    );
  }
}
