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

const PLAN_STORE =
  'gosmag-google-create-plans';

const CREATE_JOB_STORE =
  'gosmag-google-create-jobs';

const REQUEST_TIMEOUT_MS =
  7 * 60 * 1000;


function cleanText(
  value,
  maxLength = 1000
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


async function postCreateToGoogle(
  plan
) {
  const serviceUrl =
    loadRequiredEnv(
      'CHARACTER_SERVICE_URL'
    );

  const writeSecret =
    loadRequiredEnv(
      'CHARACTER_WRITE_SECRET'
    );

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

          cache:
            'no-store',

          redirect:
            'follow',

          signal:
            controller.signal,

          body:
            JSON.stringify({
              action:
                'create-candidate',

              writeSecret,

              plan,
            }),
        }
      );

    const text =
      await response.text();

    let data;

    try {
      data =
        JSON.parse(
          text
        );
    } catch {
      throw new Error(
        `Google-сервис вернул не JSON: ${
          text.slice(
            0,
            400
          ) ||
          'пустой ответ'
        }`
      );
    }

    if (
      !response.ok ||
      data?.ok !== true
    ) {
      throw new Error(
        cleanText(
          data?.error ||
          `Google-сервис завершился с HTTP ${response.status}`
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
        `Создание кандидата превысило время ожидания ${REQUEST_TIMEOUT_MS} мс. Не нажимайте кнопку повторно, пока не проверите лист САЙТ и журнал создания.`
      );
    }

    if (
      cleanText(
        plan?.templateMode
      ) === 'generic'
    ) {
      const detail =
        error instanceof Error
          ? error.message
          : cleanText(error) || 'Google-сервис отклонил создание кандидата';

      throw new Error(
        `${detail} Использован универсальный технический шаблон другого класса. Если опубликованный Google Apps Script всё ещё проверяет класс шаблона по E38 до копирования, обновите обработчик create-candidate по инструкции GOOGLE_APPS_SCRIPT_CLASS_TEMPLATE_PATCH.md.`
      );
    }

    throw error;

  } finally {
    clearTimeout(
      timer
    );
  }
}


async function runCreateRequest(
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

    const body =
      await request
        .json()
        .catch(
          () => ({})
        );

    const fingerprint =
      cleanText(
        body?.fingerprint,
        64
      );

    if (
      !/^[a-f0-9]{24}$/i
        .test(
          fingerprint
        )
    ) {
      return json(
        {
          ok: false,

          error:
            'Некорректный отпечаток подготовленного плана',
        },
        400
      );
    }

    const planStore =
      getStore({
        name:
          PLAN_STORE,

        consistency:
          'strong',
      });

    const plan =
      await planStore.get(
        `plans/${fingerprint}`,
        {
          type:
            'json',

          consistency:
            'strong',
        }
      );

    if (!plan) {
      return json(
        {
          ok: false,

          error:
            'Подготовленный план не найден. Нажмите «Проверить готовность к записи» ещё раз.',
        },
        404
      );
    }

    if (
      cleanText(
        plan.fingerprint
      ) !==
      fingerprint
    ) {
      return json(
        {
          ok: false,

          error:
            'Отпечаток плана не совпадает',
        },
        409
      );
    }

    if (
      cleanText(
        plan.mode
      ) !==
      'candidate'
    ) {
      return json(
        {
          ok: false,
          error:
            'Этот план относится к старой схеме создания персонажа. Нажмите «Проверить готовность» заново.',
        },
        409
      );
    }

    const expiresAt =
      Date.parse(
        cleanText(
          plan.expiresAt
        )
      );

    if (
      !Number.isFinite(
        expiresAt
      ) ||
      Date.now() >
        expiresAt
    ) {
      await planStore.delete(
        `plans/${fingerprint}`
      );

      return json(
        {
          ok: false,

          error:
            'Подготовленный план устарел. Выполните серверную проверку заново.',
        },
        409
      );
    }

    const questionnaireKey =
      cleanText(
        plan.questionnaireKey
      );

    const questionnaireStore =
      getStore({
        name:
          QUESTIONNAIRE_STORE,

        consistency:
          'strong',
      });

    const questionnaire =
      await questionnaireStore.get(
        questionnaireKey,
        {
          type:
            'json',

          consistency:
            'strong',
        }
      );

    if (!questionnaire) {
      return json(
        {
          ok: false,

          error:
            'Анкета подготовленного плана больше не существует',
        },
        404
      );
    }

    if (
      cleanText(
        questionnaire.status
      ) !==
      'approved'
    ) {
      return json(
        {
          ok: false,

          error:
            'Анкета больше не имеет статус approved. Создание кандидата отменено.',
        },
        409
      );
    }

    const recordedCharacterId =
      cleanText(
        questionnaire
          ?.characterCreation
          ?.characterId
      );

    const recreatingMissingCandidate =
      plan
        ?.recreateMissingCandidate ===
        true &&
      recordedCharacterId ===
        cleanText(
          plan
            ?.proposedCharacterId
        );

    if (
      recordedCharacterId &&
      !recreatingMissingCandidate
    ) {
      return json(
        {
          ok: false,

          error:
            `Из этой анкеты уже создан кандидат ${recordedCharacterId}.`,
        },
        409
      );
    }

    if (
      cleanText(
        questionnaire.id
      ) &&
      cleanText(
        plan.questionnaireId
      ) &&
      cleanText(
        questionnaire.id
      ) !==
        cleanText(
          plan.questionnaireId
        )
    ) {
      return json(
        {
          ok: false,

          error:
            'Анкета изменилась после подготовки плана',
        },
        409
      );
    }

    const googleResult =
      await postCreateToGoogle(
        plan
      );

    const createdAt =
      new Date()
        .toISOString();

    const updatedQuestionnaire = {
      ...questionnaire,

      characterCreation: {
        status:
          googleResult?.verification?.ok === true
            ? 'candidate_created'
            : 'candidate_created_pending_verification',

        createdAt,

        lifecycleStatus:
          'candidate',

        fingerprint,

        characterId:
          cleanText(
            googleResult
              ?.created
              ?.characterId
          ),

        spreadsheetId:
          cleanText(
            googleResult
              ?.created
              ?.spreadsheetId
          ),

        spreadsheetUrl:
          cleanText(
            googleResult
              ?.created
              ?.spreadsheetUrl
          ),

        donorCharacterId:
          cleanText(
            plan.donorCharacterId
          ),

        templateMode:
          cleanText(
            plan.templateMode
          ) || 'same-class',

        targetClassId:
          cleanText(
            plan.targetClassId
          ),

        classFormulaProfile:
          plan.classFormulaProfile ||
          null,

        mainRows:
          googleResult
            ?.created
            ?.mainRows ||
          null,

        systemRows:
          googleResult
            ?.created
            ?.systemRows ||
          null,

        registryRow:
          googleResult
            ?.created
            ?.registryRow ||
          null,

        verification:
          googleResult
            ?.verification ||
          null,
      },

      exam: {
        status:
          'pending',
        passed:
          false,
        updatedAt:
          createdAt,
      },
    };

    await questionnaireStore.setJSON(
      questionnaireKey,
      updatedQuestionnaire
    );

    await planStore.delete(
      `plans/${fingerprint}`
    );

    await tryWriteAdminLog({
      adminLogin:
        session.sub,

      adminName:
        getAdminName(
          session
        ),

      action:
        'CREATE_CANDIDATE_FROM_QUESTIONNAIRE',

      targetType:
        'character',

      targetId:
        cleanText(
          googleResult
            ?.created
            ?.characterId
        ),

      targetName:
        cleanText(
          plan
            ?.payload
            ?.character
            ?.name
        ),

      details:
        `Создан кандидат из анкеты ${cleanText(
          questionnaire.id
        )}. Технический шаблон: ${cleanText(
          plan.donorCharacterId
        )}. Таблица: ${cleanText(
          googleResult
            ?.created
            ?.spreadsheetId
        )}.`,
    });

    return json({
      ok: true,

      created:
        googleResult.created,

      verification:
        googleResult.verification,

      warnings:
        Array.isArray(
          googleResult.warnings
        )
          ? googleResult.warnings
          : [],

      questionnaireUpdated:
        true,

      lifecycleStatus:
        'candidate',
    });

  } catch (
    error
  ) {
    console.error(
      'admin-google-create:',
      error
    );

    return json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : String(
                error
              ),
      },
      500
    );
  }
}


async function setCreateJobStatus(
  fingerprint,
  patch
) {
  if (
    !/^[a-f0-9]{24}$/i.test(
      String(fingerprint || '')
    )
  ) {
    return;
  }

  const store =
    getStore({
      name:
        CREATE_JOB_STORE,

      consistency:
        'strong',
    });

  const key =
    `jobs/${fingerprint}`;

  const current =
    await store.get(
      key,
      {
        type:
          'json',

        consistency:
          'strong',
      }
    ) || {};

  await store.setJSON(
    key,
    {
      ...current,
      ...patch,
      fingerprint,
      updatedAt:
        new Date().toISOString(),
    }
  );
}


async function readResponsePayload(
  response
) {
  try {
    const text =
      await response
        .clone()
        .text();

    if (!text.trim()) {
      return null;
    }

    return JSON.parse(text);

  } catch {
    return null;
  }
}


export default async function (
  request
) {
  let fingerprint = '';

  try {
    const probe =
      request.clone();

    const body =
      await probe
        .json()
        .catch(
          () => ({})
        );

    fingerprint =
      cleanText(
        body?.fingerprint,
        64
      );
  } catch {
    fingerprint = '';
  }

  if (
    /^[a-f0-9]{24}$/i.test(
      fingerprint
    )
  ) {
    await setCreateJobStatus(
      fingerprint,
      {
        status:
          'running',

        startedAt:
          new Date().toISOString(),

        error:
          '',
      }
    );
  }

  try {
    const response =
      await runCreateRequest(
        request
      );

    const payload =
      await readResponsePayload(
        response
      );

    if (
      /^[a-f0-9]{24}$/i.test(
        fingerprint
      )
    ) {
      if (
        response.ok &&
        payload?.ok === true
      ) {
        await setCreateJobStatus(
          fingerprint,
          {
            status:
              'success',

            finishedAt:
              new Date().toISOString(),

            result:
              payload,

            error:
              '',
          }
        );
      } else {
        await setCreateJobStatus(
          fingerprint,
          {
            status:
              'error',

            finishedAt:
              new Date().toISOString(),

            error:
              cleanText(
                payload?.error ||
                `Фоновое создание завершилось с HTTP ${response.status}`,
                2000
              ),
          }
        );
      }
    }

    return response;

  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      /^[a-f0-9]{24}$/i.test(
        fingerprint
      )
    ) {
      await setCreateJobStatus(
        fingerprint,
        {
          status:
            'error',

          finishedAt:
            new Date().toISOString(),

          error:
            cleanText(
              message,
              2000
            ),
        }
      );
    }

    console.error(
      'admin-google-create-worker:',
      error
    );

    /*
      ВАЖНО:
      не выбрасываем ошибку наружу.
      Background Functions автоматически повторяют
      неудачные invocation. Для операции записи в Google
      автоматический повтор нам не нужен.
    */
    return json(
      {
        ok: false,
        error:
          message,
      },
      200
    );
  }
}


export const config = {
  background:
    true,
};
