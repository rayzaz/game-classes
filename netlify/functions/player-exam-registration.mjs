import {
  getStore,
} from '@netlify/blobs';

import {
  randomUUID,
} from 'node:crypto';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  getEventEligibility,
  loadCharacterData,
} from './_shared/_event-access.mjs';


const EVENTS_STORE =
  'gosmag-events';

const SIGNUPS_STORE =
  'gosmag-event-signups';

const EXAM_TEMPLATE_KEY =
  'knight-exam-v1';


function getEventsStore() {
  return getStore({
    name:
      EVENTS_STORE,

    consistency:
      'strong',
  });
}


function getSignupsStore() {
  return getStore({
    name:
      SIGNUPS_STORE,

    consistency:
      'strong',
  });
}


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


function isExamEvent(
  event
) {
  return (
    cleanText(
      event?.template?.key,
      100
    ) ===
      EXAM_TEMPLATE_KEY ||
    cleanText(
      event?.eligibilityRule?.kind,
      100
    ) ===
      'knight-exam'
  );
}


function makeExamEvent() {
  const id =
    randomUUID();

  const now =
    new Date()
      .toISOString();

  return {
    id,

    title:
      'Экзамен в рыцари-чародеи',

    description:
      'Вступительный экзамен для кандидатов без рыцарского звания. Участие доступно только персонажам 0 уровня, которые ещё не получили первый ранг.',

    location:
      'Экзаменационный полигон',

    startsAt:
      '',

    endsAt:
      '',

    status:
      'published',

    difficulty: {
      level:
        0,

      requiredKnightRank:
        'Нулевой карьерный ранг',
    },

    eligibilityRule: {
      kind:
        'knight-exam',

      exactLevel:
        0,

      requiresNoKnightRank:
        true,
    },

    rewards: {
      experience:
        0,

      points:
        0,

      money: {
        amount:
          0,

        currency:
          'юли',
      },

      materials:
        [],
    },

    template: {
      key:
        EXAM_TEMPLATE_KEY,

      version:
        1,

      autoCreated:
        true,
    },

    createdAt:
      now,

    updatedAt:
      now,

    createdBy: {
      login:
        'system',

      name:
        'ГосМаг · экзаменационный шаблон',
    },

    participants:
      [],
  };
}


async function findPublishedExam() {
  const store =
    getEventsStore();

  const {
    blobs,
  } =
    await store.list({
      prefix:
        'events/',
    });

  const sorted =
    [...blobs]
      .sort(
        (
          left,
          right
        ) =>
          String(
            right.key || ''
          ).localeCompare(
            String(
              left.key || ''
            )
          )
      );

  for (
    const blob of
      sorted
  ) {
    const event =
      await store.get(
        blob.key,
        {
          type:
            'json',

          consistency:
            'strong',
        }
      );

    if (
      event &&
      event.status ===
        'published' &&
      isExamEvent(
        event
      )
    ) {
      return {
        key:
          blob.key,

        event,
      };
    }
  }

  return null;
}


async function ensurePublishedExam() {
  const existing =
    await findPublishedExam();

  if (existing) {
    return {
      ...existing,

      created:
        false,
    };
  }

  const store =
    getEventsStore();

  const event =
    makeExamEvent();

  const key =
    `events/${Date.now()}_${event.id}`;

  await store.setJSON(
    key,
    event
  );

  return {
    key,
    event,
    created:
      true,
  };
}


function candidateState(
  characterData
) {
  const level =
    Number(
      characterData
        ?.level
        ?.current
    ) || 0;

  const rank =
    cleanText(
      characterData
        ?.character
        ?.rank,
      150
    );

  return {
    level,
    rank,
    eligible:
      level === 0 &&
      !rank,
  };
}


async function signupForExam({
  session,
  characterId,
  characterData,
  eventKey,
  event,
}) {
  const eligibility =
    getEventEligibility(
      characterData,
      event
    );

  if (
    !eligibility.canJoin
  ) {
    return {
      ok:
        false,

      status:
        409,

      error:
        eligibility.reason ===
          'wrong_exam_level'
          ? 'Экзамен доступен только персонажам 0 уровня.'
          : eligibility.reason ===
            'exam_rank_already_received'
            ? 'Персонаж уже получил рыцарский ранг и не может записаться на вступительный экзамен.'
            : 'Сейчас записаться на экзамен нельзя.',

      eligibility,
    };
  }

  const signups =
    getSignupsStore();

  const signupKey =
    `signups/${event.id}/${characterId}`;

  const existing =
    await signups.get(
      signupKey,
      {
        type:
          'json',

        consistency:
          'strong',
      }
    );

  if (
    existing &&
    existing.status ===
      'registered'
  ) {
    return {
      ok:
        true,

      alreadyRegistered:
        true,

      signup:
        existing,

      eligibility,
    };
  }

  const now =
    new Date()
      .toISOString();

  const signup = {
    eventId:
      event.id,

    eventKey,

    eventTitle:
      cleanText(
        event.title,
        200
      ),

    characterId,

    status:
      'registered',

    character: {
      name:
        cleanText(
          characterData
            ?.character
            ?.name,
          250
        ),

      level:
        Number(
          characterData
            ?.level
            ?.current
        ) || 0,

      rank:
        cleanText(
          characterData
            ?.character
            ?.rank,
          150
        ),

      className:
        cleanText(
          characterData
            ?.character
            ?.className,
          150
        ),

      squad:
        cleanText(
          characterData
            ?.character
            ?.squad,
          150
        ),
    },

    eligibility,

    loadout: {
      equipment:
        [],

      inventory:
        [],
    },

    registeredBy: {
      role:
        cleanText(
          session.role,
          50
        ),

      login:
        cleanText(
          session.sub,
          150
        ),
    },

    source:
      'exam-button',

    createdAt:
      now,

    updatedAt:
      now,
  };

  await signups.setJSON(
    signupKey,
    signup
  );

  return {
    ok:
      true,

    alreadyRegistered:
      false,

    signup,

    eligibility,
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
          ok:
            false,

          error:
            'Сначала войдите в личный кабинет',
        },
        401
      );
    }

    if (
      session.role !==
      'player'
    ) {
      return json(
        {
          ok:
            false,

          error:
            'Запись на экзамен доступна только игроку из его личного кабинета',
        },
        403
      );
    }

    const characterId =
      cleanText(
        session.cid,
        120
      )
        .toLowerCase();

    if (!characterId) {
      return json(
        {
          ok:
            false,

          error:
            'К аккаунту не привязан персонаж',
        },
        400
      );
    }

    const characterData =
      await loadCharacterData(
        characterId
      );

    const candidate =
      candidateState(
        characterData
      );

    if (
      request.method ===
      'GET'
    ) {
      const exam =
        await findPublishedExam();

      let joined =
        false;

      let signup =
        null;

      if (
        exam &&
        exam.event?.id
      ) {
        signup =
          await getSignupsStore()
            .get(
              `signups/${exam.event.id}/${characterId}`,
              {
                type:
                  'json',

                consistency:
                  'strong',
              }
            );

        joined =
          signup?.status ===
          'registered';
      }

      return json({
        ok:
          true,

        candidate,

        joined,

        signup,

        event:
          exam
            ? {
                key:
                  exam.key,

                id:
                  exam.event.id,

                title:
                  exam.event.title,

                status:
                  exam.event.status,
              }
            : null,
      });
    }

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

    if (
      !candidate.eligible
    ) {
      return json(
        {
          ok:
            false,

          error:
            candidate.rank
              ? 'Персонаж уже получил рыцарский ранг.'
              : 'Вступительный экзамен доступен только на 0 уровне.',

          candidate,
        },
        409
      );
    }

    const exam =
      await ensurePublishedExam();

    const result =
      await signupForExam({
        session,
        characterId,
        characterData,
        eventKey:
          exam.key,
        event:
          exam.event,
      });

    if (
      !result.ok
    ) {
      return json(
        {
          ...result,

          eventCreated:
            exam.created,
        },
        result.status || 409
      );
    }

    return json({
      ...result,

      eventCreated:
        exam.created,

      event: {
        key:
          exam.key,

        id:
          exam.event.id,

        title:
          exam.event.title,

        status:
          exam.event.status,
      },
    });

  } catch (
    error
  ) {
    console.error(
      'player-exam-registration:',
      error
    );

    return json(
      {
        ok:
          false,

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
