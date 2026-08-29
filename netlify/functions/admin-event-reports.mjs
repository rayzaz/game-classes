import {
  getStore,
} from '@netlify/blobs';

import {
  json,
  readSession,
} from './_shared/_auth.mjs';


const EVENTS_STORE =
  'gosmag-events';


function getEventsStore() {
  return getStore({
    name:
      EVENTS_STORE,

    consistency:
      'strong',
  });
}


function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .trim();
}


function safeNumber(
  value
) {
  const number =
    Number(
      value
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


function normalizeReportEvent(
  event,
  key
) {
  const completion =
    event?.completion &&
    typeof event.completion ===
      'object'
      ? event.completion
      : {};

  const participantReports =
    Array.isArray(
      completion.participantReports
    )
      ? completion.participantReports
      : [];

  return {
    key,

    id:
      cleanText(
        event?.id
      ),

    title:
      cleanText(
        event?.title
      ) ||
      'Без названия',

    description:
      cleanText(
        event?.description
      ),

    location:
      cleanText(
        event?.location
      ),

    startsAt:
      cleanText(
        event?.startsAt
      ),

    endsAt:
      cleanText(
        event?.endsAt
      ),

    createdAt:
      cleanText(
        event?.createdAt
      ),

    createdBy: {
      login:
        cleanText(
          event?.createdBy?.login
        ),

      name:
        cleanText(
          event?.createdBy?.name
        ),
    },

    completedAt:
      cleanText(
        completion.completedAt ||
        event?.updatedAt
      ),

    completedBy: {
      login:
        cleanText(
          completion.completedBy?.login
        ),

      name:
        cleanText(
          completion.completedBy?.name
        ),
    },

    report:
      cleanText(
        completion.report
      ),

    rewards: {
      experience:
        safeNumber(
          event?.rewards?.experience
        ),

      points:
        safeNumber(
          event?.rewards?.points
        ),

      money: {
        amount:
          safeNumber(
            event?.rewards?.money?.amount
          ),

        currency:
          cleanText(
            event?.rewards?.money?.currency
          ) ||
          'юли',
      },

      materials:
        Array.isArray(
          event?.rewards?.materials
        )
          ? event.rewards.materials
          : [],
    },

    participantReports:
      participantReports.map(
        item => ({
          characterId:
            cleanText(
              item?.characterId
            ),

          name:
            cleanText(
              item?.name
            ),

          fixedReward:
            item?.fixedReward ||
            {},

          adjustment:
            item?.adjustment ||
            {},

          finalReward:
            item?.finalReward ||
            {},

          rewardReason:
            cleanText(
              item?.rewardReason
            ),

          hpSpent:
            safeNumber(
              item?.hpSpent
            ),

          manaSpent:
            safeNumber(
              item?.manaSpent
            ),

          specialReward:
            cleanText(
              item?.specialReward
            ),

          praise:
            cleanText(
              item?.praise
            ),

          complaint:
            cleanText(
              item?.complaint
            ),
        })
      ),

    materialRewards:
      Array.isArray(
        completion.materialRewards
      )
        ? completion.materialRewards
        : [],
  };
}


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

    const store =
      getEventsStore();

    const {
      blobs,
    } =
      await store.list({
        prefix:
          'events/',
      });

    const reports =
      (
        await Promise.all(
          blobs.map(
            async blob => {
              try {
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
                  !event ||
                  event.status !==
                    'completed' ||
                  !event.completion
                ) {
                  return null;
                }

                return normalizeReportEvent(
                  event,
                  blob.key
                );

              } catch (
                error
              ) {
                console.error(
                  'event report read error:',
                  blob.key,
                  error
                );

                return null;
              }
            }
          )
        )
      )
        .filter(
          Boolean
        )
        .sort(
          (
            first,
            second
          ) =>
            String(
              second.completedAt ||
              second.startsAt ||
              ''
            )
              .localeCompare(
                String(
                  first.completedAt ||
                  first.startsAt ||
                  ''
                )
              )
        );

    return json({
      ok: true,

      reports,

      total:
        reports.length,
    });

  } catch (
    error
  ) {
    console.error(
      'admin-event-reports error:',
      error
    );

    return json(
      {
        ok: false,
        error:
          'Не удалось загрузить отчёты ивентеров',
      },
      500
    );
  }
};
