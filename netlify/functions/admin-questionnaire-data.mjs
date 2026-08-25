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


/* =========================
   ХРАНИЛИЩЕ АНКЕТ
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
   ИМЯ АДМИНИСТРАТОРА
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
   НАЗВАНИЕ АНКЕТЫ
   ========================= */

function getQuestionnaireName(
  entry
) {

  const data =
    entry?.data;


  if (
    !data ||
    typeof data !==
      'object' ||
    Array.isArray(
      data
    )
  ) {

    return `Анкета ${String(
      entry?.id ||
      ''
    ).slice(0, 8)}`;
  }


  /*
    Пробуем найти имя персонажа
    в наиболее вероятных полях.

    Если у конкретной анкеты
    структура другая — ничего
    не сломается, просто будет
    показан ID анкеты.
  */

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


  return `Анкета ${String(
    entry?.id ||
    ''
  ).slice(0, 8)}`;
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


    /* =========================
       ТОЛЬКО АДМИНЫ
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
       ПОЛУЧАЕМ КЛЮЧ АНКЕТЫ
       ========================= */

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


    /*
      Разрешаем читать только
      реальные ключи нашего
      раздела submissions.

      Нельзя передать произвольный
      путь в Blob-хранилище.
    */

    /*
      Раньше здесь принимались ТОЛЬКО ключи вида:
      submissions/<timestamp>_<UUID>

      Это оказалось слишком жёстко:
      старые/служебные/тестовые анкеты могут иметь другой безопасный
      хвост ключа, хотя всё равно лежат внутри submissions/.

      Разрешаем любой безопасный ключ внутри submissions/,
      но по-прежнему запрещаем переход в другой namespace.
    */
    if (
      !/^submissions\/[A-Za-z0-9._-]+$/
        .test(
          key
        )
    ) {

      return json(
        {
          ok: false,

          error:
            `Некорректный ключ анкеты: ${key}`,
        },
        400
      );
    }


    /* =========================
       ЧИТАЕМ АНКЕТУ
       ========================= */

    const store =
      getQuestionnaireStore();


    let resolvedKey =
      key;

    let entry =
      await store.get(
        resolvedKey,
        {
          type:
            'json',

          consistency:
            'strong',
        }
      );


    /*
      Дополнительная страховка для старых карточек:
      если фронт каким-то образом передал не полный blob-key,
      а UUID/ID анкеты, пробуем найти запись по entry.id.

      Обычно этот fallback вообще не понадобится,
      но он позволяет открывать старые анкеты после миграций.
    */
    if (!entry) {

      const {
        blobs,
      } =
        await store.list({
          prefix:
            'submissions/',
        });


      for (
        const blob of blobs
      ) {

        try {

          const candidate =
            await store.get(
              blob.key,
              {
                type:
                  'json',

                consistency:
                  'strong',
              }
            );


          if (!candidate) {
            continue;
          }


          const candidateId =
            String(
              candidate.id ||
              ''
            )
              .trim();


          if (
            candidateId ===
              key ||
            blob.key.endsWith(
              `_${key}`
            )
          ) {

            resolvedKey =
              blob.key;

            entry =
              candidate;

            break;
          }

        } catch (
          fallbackError
        ) {

          console.warn(
            'questionnaire fallback read error:',
            blob.key,
            fallbackError
          );
        }
      }
    }


    if (!entry) {

      return json(
        {
          ok: false,

          error:
            `Анкета не найдена. Ключ: ${key}`,
        },
        404
      );
    }


    /* =========================
       ЗАПИСЫВАЕМ ПРОСМОТР
       ========================= */

    const questionnaireName =
      getQuestionnaireName(
        entry
      );


    await tryWriteAdminLog({

      adminLogin:
        session.sub,

      adminName:
        getAdminName(
          session
        ),

      action:
        'VIEW_QUESTIONNAIRE',

      targetType:
        'questionnaire',

      targetId:
        String(
          entry.id ||
          ''
        ),

      targetName:
        questionnaireName,

      details:
        `Открыта анкета «${questionnaireName}»`,
    });


    /* =========================
       ВОЗВРАЩАЕМ ПОЛНУЮ АНКЕТУ
       ========================= */

    const questionnaireData =
      entry.data &&
      typeof entry.data ===
        'object'
        ? {
            ...entry.data,
          }
        : {};

    /*
      Тестовая метка могла сохраниться как на верхнем уровне записи,
      так и внутри data. Возвращаем её в обоих местах, чтобы фронт
      гарантированно распознал служебную анкету.
    */
    if (
      entry.isTest ||
      questionnaireData.isTest
    ) {
      questionnaireData.isTest =
        true;
    }

    if (
      entry.testFixtureId &&
      !questionnaireData.testFixtureId
    ) {
      questionnaireData.testFixtureId =
        String(
          entry.testFixtureId
        );
    }

    return json({
      ok: true,

      questionnaire: {

        key:
          resolvedKey,

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

        isTest:
          Boolean(
            entry.isTest ||
            questionnaireData.isTest
          ),

        testFixtureId:
          String(
            entry.testFixtureId ||
            questionnaireData.testFixtureId ||
            ''
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

        name:
          questionnaireName,

        data:
          questionnaireData,
      },
    });

  } catch (
    error
  ) {

    console.error(
      'admin-questionnaire-data error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          `Не удалось открыть анкету: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
      },
      500
    );
  }
}