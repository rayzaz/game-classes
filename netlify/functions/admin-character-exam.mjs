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

const REQUEST_TIMEOUT_MS =
  55_000;


function cleanText(
  value,
  maxLength = 2000
) {
  return String(
    value ?? ''
  )
    .trim()
    .slice(
      0,
      maxLength
    );
}


function asRecord(
  value
) {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}


function integer(
  value,
  fallback = 0
) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? Math.trunc(number)
    : fallback;
}


function isValidQuestionnaireKey(
  key
) {
  /*
    Жизненный цикл должен работать и с обычными, и со служебными
    тестовыми анкетами. Ограничиваем namespace submissions/,
    но не требуем конкретный формат timestamp_UUID.
  */
  return (
    /^submissions\/[A-Za-z0-9._-]+$/
      .test(
        cleanText(
          key
        )
      )
  );
}


function normalizeCharacterId(
  value
) {
  return cleanText(value)
    .toLowerCase()
    .replace(
      /[^a-z0-9_-]/g,
      ''
    );
}


function normalizeText(
  value
) {
  return cleanText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}


async function readLiveRegistry() {
  const serviceUrl =
    new URL(
      loadRequiredEnv(
        'CHARACTER_SERVICE_URL'
      )
    );

  serviceUrl.searchParams.set(
    'action',
    'list'
  );

  serviceUrl.searchParams.set(
    '_',
    String(Date.now())
  );

  return readGoogleJson(
    serviceUrl.toString(),
    {
      method:
        'GET',
      headers: {
        accept:
          'application/json',
      },
    },
    'Чтение живого реестра'
  );
}


function findRegistryCharacter(
  registry,
  expectedCharacterId,
  characterName
) {
  const characters =
    Array.isArray(
      registry?.characters
    )
      ? registry.characters
      : [];

  const expectedId =
    normalizeCharacterId(
      expectedCharacterId
    );

  const expectedName =
    normalizeText(
      characterName
    );

  if (expectedId) {
    const byId =
      characters.find(
        item =>
          normalizeCharacterId(
            item?.characterId ||
            item?.id
          ) === expectedId
      );

    if (byId) {
      return byId;
    }
  }

  if (expectedName) {
    return (
      characters.find(
        item =>
          normalizeText(
            item?.name
          ) === expectedName
      ) ||
      null
    );
  }

  return null;
}


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


function loadRequiredEnv(
  name
) {
  const value =
    cleanText(
      process.env[name]
    );

  if (!value) {
    throw new Error(
      `Не задан ${name}`
    );
  }

  return value;
}


async function readGoogleJson(
  url,
  options,
  label
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        url,
        {
          ...options,
          signal:
            controller.signal,
          redirect:
            'follow',
          cache:
            'no-store',
        }
      );

    const text =
      await response.text();

    let data;

    try {
      data =
        JSON.parse(text);
    } catch {
      throw new Error(
        `${label}: Google вернул не JSON: ${text.slice(0, 350) || 'пустой ответ'}`
      );
    }

    if (
      !response.ok ||
      data?.ok !== true
    ) {
      throw new Error(
        cleanText(
          data?.error ||
          `${label}: HTTP ${response.status}`
        )
      );
    }

    return data;

  } catch (
    error
  ) {
    if (
      error &&
      typeof error ===
        'object' &&
      error.name ===
        'AbortError'
    ) {
      throw new Error(
        `${label}: превышено время ожидания ${REQUEST_TIMEOUT_MS} мс`
      );
    }

    throw error;

  } finally {
    clearTimeout(
      timer
    );
  }
}


async function readExamOptions(
  characterId
) {
  const serviceUrl =
    new URL(
      loadRequiredEnv(
        'CHARACTER_SERVICE_URL'
      )
    );

  serviceUrl.searchParams.set(
    'action',
    'exam-options'
  );

  serviceUrl.searchParams.set(
    'characterId',
    characterId
  );

  serviceUrl.searchParams.set(
    '_',
    String(Date.now())
  );

  return readGoogleJson(
    serviceUrl.toString(),
    {
      method:
        'GET',
      headers: {
        accept:
          'application/json',
      },
    },
    'Чтение чипов экзамена'
  );
}


async function writeExamToGoogle(
  exam
) {
  const serviceUrl =
    loadRequiredEnv(
      'CHARACTER_SERVICE_URL'
    );

  const writeSecret =
    loadRequiredEnv(
      'CHARACTER_WRITE_SECRET'
    );

  return readGoogleJson(
    serviceUrl,
    {
      method:
        'POST',
      headers: {
        accept:
          'application/json',
        'content-type':
          'application/json',
      },
      body:
        JSON.stringify({
          action:
            'complete-exam',
          writeSecret,
          exam,
        }),
    },
    'Запись результата экзамена'
  );
}


async function loadQuestionnaire(
  questionnaireKey
) {
  const store =
    getStore({
      name:
        QUESTIONNAIRE_STORE,
      consistency:
        'strong',
    });

  const questionnaire =
    await store.get(
      questionnaireKey,
      {
        type:
          'json',
        consistency:
          'strong',
      }
    );

  return {
    store,
    questionnaire,
  };
}


function validateExamNumbers(
  body
) {
  const pchk =
    asRecord(
      body?.pchk
    );

  const upgradePoints =
    integer(
      body?.upgradePoints,
      0
    );

  const protection =
    integer(
      pchk.protection,
      0
    );

  const senses =
    integer(
      pchk.senses,
      0
    );

  const control =
    integer(
      pchk.control,
      0
    );

  const startingMoney =
    integer(
      body?.startingMoney,
      0
    );

  const problems = [];

  if (upgradePoints < 0) {
    problems.push(
      'Баллы прокачки не могут быть отрицательными.'
    );
  }

  if (
    protection < 0 ||
    protection > 100
  ) {
    problems.push(
      'Покров должен быть от 0 до 100.'
    );
  }

  if (
    senses < 0 ||
    senses > 200
  ) {
    problems.push(
      'Чувство должно быть от 0 до 200.'
    );
  }

  if (
    control < 0 ||
    control > 500
  ) {
    problems.push(
      'Контроль должен быть от 0 до 500.'
    );
  }

  if (startingMoney < 0) {
    problems.push(
      'Стартовые сбережения не могут быть отрицательными.'
    );
  }

  return {
    problems,
    upgradePoints,
    protection,
    senses,
    control,
    startingMoney,
  };
}


export default async function (
  request
) {
  try {
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

    if (
      request.method ===
      'GET'
    ) {
      const requestUrl =
        new URL(
          request.url
        );

      const questionnaireKey =
        cleanText(
          requestUrl.searchParams.get(
            'questionnaireKey'
          )
        );

      if (
        !isValidQuestionnaireKey(
          questionnaireKey
        )
      ) {
        return json(
          {
            ok: false,
            error:
              'Некорректный ключ анкеты',
          },
          400
        );
      }

      const loaded =
        await loadQuestionnaire(
          questionnaireKey
        );

      const store =
        loaded.store;

      let questionnaire =
        loaded.questionnaire;

      if (!questionnaire) {
        return json(
          {
            ok: false,
            error:
              'Анкета не найдена',
          },
          404
        );
      }

      const characterName =
        cleanText(
          requestUrl.searchParams.get(
            'characterName'
          )
        );

      const expectedCharacterId =
        normalizeCharacterId(
          requestUrl.searchParams.get(
            'expectedCharacterId'
          )
        );

      let characterId =
        normalizeCharacterId(
          questionnaire
            ?.characterCreation
            ?.characterId
        );

      const recordedCharacterId =
        characterId;

      let liveRegistryChecked =
        false;

      let liveCharacterFound =
        false;

      /*
        В локальном Netlify Dev тяжёлый запрос создания может
        быть оборван интерфейсом через 30 секунд, хотя Google
        Apps Script продолжит работу и успеет зарегистрировать
        кандидата в листе САЙТ.

        Если анкета не успела сохранить characterCreation,
        восстанавливаем связь по живому реестру. Это также
        позволяет чинить старые анкеты кнопкой «Обновить статус».
      */
      if (
        !characterId ||
        characterName ||
        expectedCharacterId
      ) {
        try {
          const registry =
            await readLiveRegistry();

          liveRegistryChecked =
            true;

          const liveCharacter =
            findRegistryCharacter(
              registry,
              expectedCharacterId || characterId,
              characterName
            );

          const liveCharacterId =
            normalizeCharacterId(
              liveCharacter
                ?.characterId ||
              liveCharacter?.id
            );

          if (liveCharacterId) {
            liveCharacterFound =
              true;

            const currentCreation =
              asRecord(
                questionnaire
                  ?.characterCreation
              );

            const currentId =
              normalizeCharacterId(
                currentCreation
                  .characterId
              );

            const recoveredAt =
              new Date()
                .toISOString();

            if (
              !currentId ||
              currentId !==
                liveCharacterId
            ) {
              questionnaire = {
                ...questionnaire,

                characterCreation: {
                  ...currentCreation,
                  status:
                    currentCreation.status ||
                    'candidate_created_recovered',
                  lifecycleStatus:
                    'candidate',
                  createdAt:
                    currentCreation.createdAt ||
                    recoveredAt,
                  recoveredAt,
                  recoverySource:
                    'live_registry',
                  characterId:
                    liveCharacterId,
                },

                exam:
                  questionnaire?.exam ||
                  {
                    status:
                      'pending',
                    passed:
                      false,
                    updatedAt:
                      recoveredAt,
                  },
              };

              await store.setJSON(
                questionnaireKey,
                questionnaire
              );
            }

            characterId =
              liveCharacterId;
          }
        } catch (error) {
          /*
            Ошибка сверки реестра не должна ломать чтение уже
            сохранённого жизненного цикла. Если characterId ещё
            нет, ниже вернём candidateCreated:false.
          */
          console.warn(
            'lifecycle registry reconcile:',
            error
          );
        }
      }

      /*
        v42.6.1: старый characterCreation в анкете — это только история
        публикации, а не доказательство, что персонаж всё ещё существует.
        Если живой реестр прочитан успешно и записи там нет, интерфейс
        должен разрешить полное создание заново, а не предлагать resync.
      */
      if (
        liveRegistryChecked &&
        !liveCharacterFound
      ) {
        return json({
          ok: true,
          candidateCreated:
            false,
          candidateMissing:
            Boolean(
              recordedCharacterId
            ),
          missingCharacterId:
            recordedCharacterId ||
            '',
          characterCreation:
            questionnaire
              .characterCreation ||
            null,
          exam:
            questionnaire?.exam ||
            null,
          message:
            recordedCharacterId
              ? `Персонаж ${recordedCharacterId} был опубликован раньше, но сейчас отсутствует в активном листе САЙТ. Его можно создать заново из анкеты.`
              : 'Персонаж ещё не опубликован.',
        });
      }

      if (!characterId) {
        return json({
          ok: true,
          candidateCreated:
            false,
          exam:
            questionnaire?.exam ||
            null,
        });
      }

      let options = null;
      let optionsError = '';

      try {
        options =
          await readExamOptions(
            characterId
          );
      } catch (error) {
        optionsError =
          error instanceof Error
            ? error.message
            : String(error);
      }

      return json({
        ok: true,
        candidateCreated:
          true,
        characterCreation:
          questionnaire
            .characterCreation,
        exam:
          questionnaire?.exam ||
          {
            status:
              'pending',
            passed:
              false,
          },
        google:
          options,
        optionsError,
      });
    }

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

    const body =
      await request
        .json()
        .catch(
          () => ({})
        );

    const questionnaireKey =
      cleanText(
        body?.questionnaireKey
      );

    if (
      !isValidQuestionnaireKey(
        questionnaireKey
      )
    ) {
      return json(
        {
          ok: false,
          error:
            'Некорректный ключ анкеты',
        },
        400
      );
    }

    const {
      store,
      questionnaire,
    } =
      await loadQuestionnaire(
        questionnaireKey
      );

    if (!questionnaire) {
      return json(
        {
          ok: false,
          error:
            'Анкета не найдена',
        },
        404
      );
    }

    const characterId =
      normalizeCharacterId(
        questionnaire
          ?.characterCreation
          ?.characterId
      );

    if (!characterId) {
      return json(
        {
          ok: false,
          error:
            'Сначала создайте кандидата из одобренной анкеты.',
        },
        409
      );
    }

    if (
      questionnaire
        ?.exam
        ?.passed ===
      true
    ) {
      return json(
        {
          ok: false,
          error:
            'Экзамен для этого персонажа уже был применён.',
        },
        409
      );
    }

    const options =
      await readExamOptions(
        characterId
      );

    if (
      options?.examPassed ===
      true
    ) {
      return json(
        {
          ok: false,
          error:
            `В Google уже установлен ранг «${cleanText(options?.current?.rank)}». Повторная выдача экзамена заблокирована.`,
        },
        409
      );
    }

    const squad =
      cleanText(
        body?.squad
      );

    const housing =
      cleanText(
        body?.housing
      );

    const squads =
      Array.isArray(
        options?.options?.squads
      )
        ? options.options.squads
        : [];

    const housingOptions =
      Array.isArray(
        options?.options?.housing
      )
        ? options.options.housing
        : [];

    if (
      !squad ||
      !squads.includes(
        squad
      )
    ) {
      return json(
        {
          ok: false,
          error:
            'Выберите орден из живого списка Google.',
        },
        400
      );
    }

    if (
      !housing ||
      !housingOptions.includes(
        housing
      )
    ) {
      return json(
        {
          ok: false,
          error:
            'Выберите проживание из живого списка Google.',
        },
        400
      );
    }

    const numbers =
      validateExamNumbers(
        body
      );

    if (
      numbers.problems.length >
      0
    ) {
      return json(
        {
          ok: false,
          error:
            numbers.problems.join(
              ' '
            ),
        },
        400
      );
    }

    const googleResult =
      await writeExamToGoogle({
        characterId,
        squad,
        housing,
        upgradePoints:
          numbers.upgradePoints,
        pchk: {
          protection:
            numbers.protection,
          senses:
            numbers.senses,
          control:
            numbers.control,
        },
        startingMoney:
          numbers.startingMoney,
      });

    const passedAt =
      new Date()
        .toISOString();

    const updated = {
      ...questionnaire,
      exam: {
        status:
          'passed',
        passed:
          true,
        passedAt,
        passedBy:
          session.sub,
        squad:
          cleanText(
            googleResult
              ?.exam
              ?.squad
          ),
        rank:
          cleanText(
            googleResult
              ?.exam
              ?.rank
          ),
        housing:
          cleanText(
            googleResult
              ?.exam
              ?.housing
          ),
        upgradePoints:
          numbers.upgradePoints,
        pchk: {
          protection:
            numbers.protection,
          senses:
            numbers.senses,
          control:
            numbers.control,
        },
        startingMoney:
          numbers.startingMoney,
      },
    };

    await store.setJSON(
      questionnaireKey,
      updated
    );

    await tryWriteAdminLog({
      adminLogin:
        session.sub,
      adminName:
        getAdminName(
          session
        ),
      action:
        'CHARACTER_EXAM_PASSED',
      targetType:
        'character',
      targetId:
        characterId,
      targetName:
        cleanText(
          questionnaire
            ?.data
            ?.name ||
          googleResult?.name ||
          characterId
        ),
      details:
        `Экзамен пройден. Орден: ${squad}. Ранг: ${cleanText(googleResult?.exam?.rank)}. Проживание: ${housing}. Баллы: ${numbers.upgradePoints}. ПЧК: ${numbers.protection}/${numbers.senses}/${numbers.control}. Сбережения: ${numbers.startingMoney}.`,
    });

    return json({
      ok: true,
      characterId,
      exam:
        updated.exam,
      google:
        googleResult,
    });

  } catch (
    error
  ) {
    console.error(
      'admin-character-exam:',
      error
    );

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
}
