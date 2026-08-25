import {
  getStore,
} from '@netlify/blobs';

import {
  createHash,
  randomBytes,
  randomUUID,
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


function cleanText(
  value,
  maxLength = 300
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


function hashEditToken(
  token
) {

  return createHash(
    'sha256'
  )
    .update(
      String(token)
    )
    .digest(
      'hex'
    );
}


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
            'Некорректная анкета',
        },
        400
      );
    }


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


    const serializedData =
      JSON.stringify(
        data
      );


    if (
      serializedData.length >
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


    const assistantId =
      cleanText(
        body.assistantId,
        50
      )
        .toLowerCase();


    const allowedAssistants =
      new Set([
        'mereo',
        'ren',
        'lumin',
      ]);


    if (
      !allowedAssistants.has(
        assistantId
      )
    ) {

      return json(
        {
          ok: false,

          error:
            'Неизвестный помощник',
        },
        400
      );
    }


    const id =
      randomUUID();


    const editToken =
      randomBytes(
        32
      )
        .toString(
          'hex'
        );


    const createdAt =
      new Date()
        .toISOString();


    const entry = {

      id,

      createdAt,

      updatedAt:
        createdAt,

      status:
        'new',

      editTokenHash:
        hashEditToken(
          editToken
        ),

      revisionCount:
        0,

      applicantFeedback:
        null,

      assistant: {

        id:
          assistantId,

        name:
          cleanText(
            body.assistantName,
            150
          ),
      },

      data,
    };


    const store =
      getQuestionnaireStore();


    const key =
      `submissions/${Date.now()}_${id}`;


    await store.setJSON(
      key,
      entry
    );


    return json(
      {
        ok: true,

        submission: {
          id:
            entry.id,

          key,

          editToken,

          createdAt:
            entry.createdAt,

          status:
            entry.status,
        },
      },
      201
    );

  } catch (
    error
  ) {

    console.error(
      'questionnaire-submit error:',
      error
    );


    return json(
      {
        ok: false,

        error:
          'Не удалось сохранить анкету',
      },
      500
    );
  }
}
