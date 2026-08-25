import {
  getStore,
} from '@netlify/blobs';

import {
  createHash,
  timingSafeEqual,
} from 'node:crypto';

import {
  json,
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


function isPlainObject(
  value
) {
  return Boolean(
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value
    )
  );
}


function isValidKey(
  key
) {
  return /^submissions\/[0-9]+_[a-f0-9-]{36}$/i
    .test(
      String(key || '')
    );
}


function hashToken(
  token
) {
  return createHash(
    'sha256'
  )
    .update(
      String(token || '')
    )
    .digest();
}


function tokenMatches(
  entry,
  token
) {
  const stored =
    String(
      entry?.editTokenHash ||
      ''
    )
      .trim();

  if (
    !/^[a-f0-9]{64}$/i.test(
      stored
    ) ||
    !token
  ) {
    return false;
  }

  const expected =
    Buffer.from(
      stored,
      'hex'
    );

  const actual =
    hashToken(
      token
    );

  return (
    expected.length ===
      actual.length &&
    timingSafeEqual(
      expected,
      actual
    )
  );
}


function getName(
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
    const candidates = [
      data.name,
      data.characterName,
      data.character_name,
      data.fullName,
      data.full_name,
      data.nickname,
      data.nick,
    ];

    for (
      const candidate of candidates
    ) {
      const clean =
        String(
          candidate ||
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
  ).slice(0, 8)}`;
}


function publicFeedback(
  feedback
) {
  if (
    !feedback ||
    typeof feedback !==
      'object'
  ) {
    return null;
  }

  const text =
    String(
      feedback.text ||
      ''
    )
      .trim();

  if (!text) {
    return null;
  }

  return {
    text,

    adminName:
      String(
        feedback.adminName ||
        'Администрация'
      ),

    updatedAt:
      String(
        feedback.updatedAt ||
        ''
      ),
  };
}


function publicQuestionnaire(
  key,
  entry
) {
  return {
    key,

    id:
      String(
        entry?.id ||
        ''
      ),

    name:
      getName(
        entry
      ),

    status:
      String(
        entry?.status ||
        'new'
      ),

    createdAt:
      String(
        entry?.createdAt ||
        ''
      ),

    updatedAt:
      String(
        entry?.updatedAt ||
        entry?.createdAt ||
        ''
      ),

    revisionCount:
      Number(
        entry?.revisionCount ||
        0
      ),

    applicantFeedback:
      publicFeedback(
        entry?.applicantFeedback
      ),

    assistant: {
      id:
        String(
          entry?.assistant?.id ||
          ''
        ),

      name:
        String(
          entry?.assistant?.name ||
          ''
        ),
    },

    data:
      isPlainObject(
        entry?.data
      )
        ? entry.data
        : {},
  };
}


async function readAuthorizedEntry(
  key,
  token
) {
  if (
    !key ||
    !isValidKey(
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

  if (!token) {
    return {
      error:
        'Нет ключа доступа к анкете',

      status:
        401,
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

  if (
    !tokenMatches(
      entry,
      token
    )
  ) {
    return {
      error:
        'Нет доступа к этой анкете',

      status:
        403,
    };
  }

  return {
    store,
    entry,
  };
}


export default async function (
  request
) {
  try {
    /* ========================================================
       GET — ПРОСМОТР СВОЕЙ АНКЕТЫ
       ======================================================== */

    if (
      request.method ===
      'GET'
    ) {
      const url =
        new URL(
          request.url
        );

      const key =
        String(
          url.searchParams.get(
            'key'
          ) ||
          ''
        )
          .trim();

      const token =
        String(
          url.searchParams.get(
            'token'
          ) ||
          ''
        )
          .trim();

      const loaded =
        await readAuthorizedEntry(
          key,
          token
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

      return json({
        ok: true,

        questionnaire:
          publicQuestionnaire(
            key,
            loaded.entry
          ),
      });
    }


    /* ========================================================
       POST — ОТПРАВКА ИСПРАВЛЕННОЙ АНКЕТЫ
       ======================================================== */

    if (
      request.method ===
      'POST'
    ) {
      const body =
        await request
          .json()
          .catch(
            () => null
          );

      if (
        !body ||
        !isPlainObject(
          body
        )
      ) {
        return json(
          {
            ok: false,
            error:
              'Некорректный запрос',
          },
          400
        );
      }

      const key =
        String(
          body.key ||
          ''
        )
          .trim();

      const token =
        String(
          body.token ||
          ''
        )
          .trim();

      const data =
        body.data;

      if (
        !isPlainObject(
          data
        )
      ) {
        return json(
          {
            ok: false,
            error:
              'В анкете отсутствуют данные',
          },
          400
        );
      }

      const serialized =
        JSON.stringify(
          data
        );

      if (
        serialized.length >
        1_500_000
      ) {
        return json(
          {
            ok: false,
            error:
              'Анкета слишком большая. Уменьшите изображения и попробуйте снова.',
          },
          413
        );
      }

      const loaded =
        await readAuthorizedEntry(
          key,
          token
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

      const currentStatus =
        String(
          loaded.entry.status ||
          'new'
        );

      if (
        currentStatus !==
        'revision'
      ) {
        return json(
          {
            ok: false,
            error:
              'Сейчас эта анкета не открыта для исправления',
          },
          409
        );
      }

      const updatedAt =
        new Date()
          .toISOString();

      const updatedEntry = {
        ...loaded.entry,

        data,

        status:
          'review',

        updatedAt,

        revisionCount:
          Number(
            loaded.entry.revisionCount ||
            0
          ) + 1,

        lastApplicantRevisionAt:
          updatedAt,
      };

      await loaded.store.setJSON(
        key,
        updatedEntry
      );

      return json({
        ok: true,

        questionnaire:
          publicQuestionnaire(
            key,
            updatedEntry
          ),
      });
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
      'questionnaire-self error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          'Не удалось обработать анкету',
      },
      500
    );
  }
}
