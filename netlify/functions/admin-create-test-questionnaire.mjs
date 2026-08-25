import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';


const STORE_NAME =
  'gosmag-questionnaires';

const TEST_KEY =
  'submissions/zzzz_test_pes_testovich';

const TEST_ID =
  'test-pes-testovich';


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
  maxLength = 2_000_000
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


function dataUrlMeta(
  dataUrl,
  fileName
) {

  const clean =
    cleanText(
      dataUrl
    );

  if (!clean) {
    return null;
  }

  const match =
    clean.match(
      /^data:([^;]+);base64,(.+)$/s
    );

  if (!match) {
    throw new Error(
      `Тестовое изображение ${fileName} имеет некорректный data URL`
    );
  }

  const mime =
    cleanText(
      match[1],
      100
    );

  if (
    !mime.startsWith(
      'image/'
    )
  ) {
    throw new Error(
      `Файл ${fileName} не является изображением`
    );
  }

  const approxSize =
    Math.floor(
      match[2].length *
      0.75
    );

  return {
    name:
      cleanText(
        fileName,
        200
      ),
    mime,
    size:
      approxSize,
    dataUrl:
      clean,
  };
}


function buildTestData(
  portrait,
  grimoire
) {

  return {
    isTest:
      true,
    testFixtureId:
      'pes-testovich-v1',
    testFixtureLabel:
      'Пёс Тестович',

    name:
      'Пёс Тестович',
    age:
      18,
    suit:
      'Клевер',
    bio:
      'Пёс Тестович — системный испытатель ГосМАГ-услуг. Он существует специально для проверки полного пути анкеты: одобрение, перенос в Google, картинки, формулы, создание кандидата и экзамен. В бою действует быстро, любит находить след цели и совершенно серьёзно относится к магическим косточкам.',
    race:
      'зверолюд',
    playerLink:
      'https://vk.com/pes_testovich',

    height:
      '175 см',
    weight:
      '72 кг',
    weightCategory:
      'обычный',
    body:
      'подтянутое',
    hairColor:
      'рыжая шерсть',
    hairLength:
      'короткая',
    eyes:
      'карие',
    marks:
      'одно ухо слегка загнуто; на ошейнике маленький клевер',

    hasGrimoire:
      true,
    plannedAge:
      null,
    noviceNote:
      'Тестовый персонаж. Создаётся приложением, а не игроком.',

    magicName:
      'Магия следа',
    magicInspiration:
      'Своя идея',
    magicDescription:
      'Магия позволяет Псу Тестовичу считывать следы маны, отмечать цель и совершать короткие резкие рывки по найденному магическому следу.',

    classKey:
      'assassin',
    universalRoll:
      12,

    elements: [
      'земля',
    ],
    elementKeys: [
      'earth',
    ],

    spells: [
      {
        name:
          'Кусь за штанину',
        castTime:
          '1 действие',
        radius:
          'ближний бой',
        effect:
          'Пёс резко сокращает дистанцию по следу маны и наносит точечную атаку выбранной цели.',
        duration:
          'мгновенно',
        powerType:
          'Урон',
        power:
          12,
        powerDie:
          'd20',
      },
      {
        name:
          'След взят',
        castTime:
          '1 действие',
        radius:
          '30 м',
        effect:
          'Помечает заметный магический след цели, облегчая Псу Тестовичу её поиск и последующее преследование.',
        duration:
          '3 раунда',
        powerType:
          'Контроль',
        power:
          12,
        powerDie:
          'd20',
      },
    ],

    combatNotes:
      'Системная тестовая анкета. d20 заранее зафиксирован на 12, чтобы одинаковые тесты давали одинаковый результат.',

    photo:
      portrait,
    grimoirePhoto:
      grimoire,
  };
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
        ok:
          false,
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
          ok:
            false,
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
          ok:
            false,
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
          () => null
        );

    if (
      !body ||
      typeof body !==
        'object' ||
      Array.isArray(
        body
      )
    ) {

      return json(
        {
          ok:
            false,
          error:
            'Некорректный запрос',
        },
        400
      );
    }


    const portrait =
      dataUrlMeta(
        body.portraitDataUrl,
        cleanText(
          body.portraitFileName,
          200
        ) ||
        'pes-testovich-portrait.png'
      );

    if (!portrait) {

      return json(
        {
          ok:
            false,
          error:
            'Для Пса Тестовича нужен портрет',
        },
        400
      );
    }

    const grimoire =
      dataUrlMeta(
        body.grimoireDataUrl,
        cleanText(
          body.grimoireFileName,
          200
        ) ||
        'pes-testovich-grimoire.png'
      );


    const store =
      getQuestionnaireStore();

    const existing =
      await store.get(
        TEST_KEY,
        {
          type:
            'json',
          consistency:
            'strong',
        }
      );


    if (
      existing
        ?.characterCreation
        ?.characterId
    ) {

      return json(
        {
          ok:
            false,
          error:
            `Пёс Тестович уже был перенесён в Google как ${cleanText(
              existing
                .characterCreation
                .characterId,
              200
            )}. Сначала удалите/откатите тестового персонажа и удалите тестовую анкету, если хотите прогнать сценарий заново.`,
        },
        409
      );
    }


    const now =
      new Date()
        .toISOString();

    const createdAt =
      cleanText(
        existing?.createdAt,
        100
      ) ||
      now;

    const entry = {
      ...(existing || {}),

      id:
        TEST_ID,
      createdAt,
      updatedAt:
        now,
      status:
        'approved',

      isTest:
        true,
      testFixtureId:
        'pes-testovich-v1',

      revisionCount:
        Number(
          existing?.revisionCount ||
          0
        ),

      applicantFeedback:
        null,

      assistant: {
        id:
          'mereo',
        name:
          'Системный тест',
      },

      data:
        buildTestData(
          portrait,
          grimoire
        ),
    };


    await store.setJSON(
      TEST_KEY,
      entry
    );


    return json(
      {
        ok:
          true,
        created:
          !existing,
        updated:
          Boolean(
            existing
          ),
        questionnaire: {
          key:
            TEST_KEY,
          id:
            TEST_ID,
          status:
            'approved',
          name:
            'Пёс Тестович',
          hasPortrait:
            true,
          hasGrimoire:
            Boolean(
              grimoire
            ),
        },
      },
      existing
        ? 200
        : 201
    );

  } catch (
    error
  ) {

    console.error(
      'admin-create-test-questionnaire error:',
      error
    );

    return json(
      {
        ok:
          false,
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось создать тестовую анкету',
      },
      500
    );
  }
}
