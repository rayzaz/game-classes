import {
  json,
  readSession,
} from './_shared/_auth.mjs';


/* ============================================================
   ЦЕНТРАЛЬНЫЙ СЕРВИС ПЕРСОНАЖЕЙ
   ============================================================ */

function loadCharacterServiceUrl() {
  const raw =
    String(
      process.env.CHARACTER_SERVICE_URL ||
      ''
    ).trim();

  if (!raw) {
    throw new Error(
      'Не задан CHARACTER_SERVICE_URL'
    );
  }

  return raw;
}


/* ============================================================
   NETLIFY FUNCTION
   ============================================================ */

export default async (
  request
) => {

  /* ==========================================================
     GET — список; POST — пол персонажа для родословной
     ========================================================== */

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ ok: false, error: 'Метод не поддерживается' }, 405);
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
       ТОЛЬКО АДМИНИСТРАТОР
       ======================================================== */

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


    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const characterId = String(body?.characterId || '').trim().toLowerCase();
      const gender = ['male', 'female'].includes(String(body?.gender || '').trim().toLowerCase())
        ? String(body.gender).trim().toLowerCase()
        : '';

      if (!characterId) {
        return json({ ok: false, error: 'Не указан characterId' }, 400);
      }

      const response = await fetch(loadCharacterServiceUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          action: 'character-gender-update',
          characterId,
          gender,
          writeSecret: String(process.env.CHARACTER_WRITE_SECRET || '').trim(),
        }),
        cache: 'no-store',
        redirect: 'follow',
      });

      const text = await response.text();
      let result = null;
      try { result = JSON.parse(text); } catch (_) { result = null; }
      if (!response.ok || !result || result.ok !== true) {
        return json({ ok: false, error: result?.error || 'Не удалось сохранить пол персонажа' }, 502);
      }
      return json(result);
    }

    /* ========================================================
       СОБИРАЕМ URL ЦЕНТРАЛЬНОГО СЕРВИСА
       ======================================================== */

    const serviceUrl =
      new URL(
        loadCharacterServiceUrl()
      );

    serviceUrl
      .searchParams
      .set(
        'action',
        'list'
      );

    /*
      Чтобы не получить старый список
      из кэша после изменений таблицы.
    */

    serviceUrl
      .searchParams
      .set(
        '_',
        String(
          Date.now()
        )
      );


    /* ========================================================
       ЗАПРАШИВАЕМ РЕЕСТР
       ======================================================== */

    const response =
      await fetch(
        serviceUrl,
        {
          method:
            'GET',

          headers: {
            accept:
              'application/json',
          },

          cache:
            'no-store',

          redirect:
            'follow',
        }
      );


    /* ========================================================
       HTTP ОШИБКА
       ======================================================== */

    if (
      !response.ok
    ) {
      const text =
        await response
          .text();

      console.error(
        'character registry HTTP error:',
        response.status,
        text.slice(
          0,
          500
        )
      );

      return json(
        {
          ok: false,
          error:
            'Не удалось загрузить реестр персонажей',
        },
        502
      );
    }


    /* ========================================================
       ЧИТАЕМ JSON
       ======================================================== */

    let data;

    try {
      data =
        await response
          .json();

    } catch (
      error
    ) {
      console.error(
        'character registry JSON error:',
        error
      );

      return json(
        {
          ok: false,
          error:
            'Центральный сервис вернул некорректный реестр',
        },
        502
      );
    }


    /* ========================================================
       ОШИБКА ИЗ APPS SCRIPT
       ======================================================== */

    if (
      !data ||
      data.ok !==
      true
    ) {
      const sourceError =
        String(
          data?.error ||
          'Не удалось загрузить реестр персонажей'
        );

      console.error(
        'character registry service error:',
        sourceError
      );

      return json(
        {
          ok: false,
          error:
            sourceError,
        },
        502
      );
    }


    /* ========================================================
       НОРМАЛИЗУЕМ СПИСОК
       ======================================================== */

    const sourceCharacters =
      Array.isArray(
        data.characters
      )
        ? data.characters
        : [];


    const characters =
      sourceCharacters
        .map(
          (character) => {

            const characterId =
              String(
                character?.characterId ||
                character?.id ||
                ''
              )
                .trim()
                .toLowerCase();


            if (!characterId) {
              return null;
            }


            return {
              id:
                characterId,

              characterId,

              name:
                String(
                  character?.name ||
                  characterId
                ),

              player:
                String(
                  character?.player ||
                  ''
                ),

              rank:
                String(
                  character?.rank ||
                  ''
                ),

              squad:
                String(
                  character?.squad ||
                  ''
                ),

              className:
                String(
                  character?.className ||
                  ''
                ),

              magicType:
                String(
                  character?.magicType ||
                  ''
                ),

              theme:
                String(
                  character?.theme ||
                  'default'
                ),

              portrait:
                String(
                  character?.portrait ||
                  `/cards/characters/${characterId}.jpg`
                ),

              active:
                character?.active !==
                false,

              cabinetReady:
                character?.cabinetReady !==
                false,

              gender:
                ['male', 'female'].includes(String(character?.gender || '').trim().toLowerCase())
                  ? String(character.gender).trim().toLowerCase()
                  : '',
            };
          }
        )
        .filter(
          Boolean
        );


    characters.sort(
      (
        a,
        b
      ) =>
        String(
          a.name
        )
          .localeCompare(
            String(
              b.name
            ),
            'ru'
          )
    );


    /* ========================================================
       ГОТОВО
       ======================================================== */

    return json({
      ok: true,

      characters,

      count:
        characters.length,
    });

  } catch (
    error
  ) {
    console.error(
      'admin-characters function error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          'Не удалось загрузить реестр персонажей',
      },
      500
    );
  }
};