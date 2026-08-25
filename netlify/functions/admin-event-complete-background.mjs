import {
  getStore,
} from '@netlify/blobs';

import {
  json,
} from './_shared/_auth.mjs';

import {
  requireEventManager,
} from './_shared/_event-permissions.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';


const EVENTS_STORE =
  'gosmag-events';

const SIGNUPS_STORE =
  'gosmag-event-signups';

const JOBS_STORE =
  'gosmag-event-completion-jobs';


function store(
  name
) {
  return getStore({
    name,
    consistency:
      'strong',
  });
}


function cleanText(
  value,
  max = 10000
) {
  return String(
    value ?? ''
  )
    .trim()
    .slice(
      0,
      max
    );
}


function cleanSignedNumber(
  value,
  maxAbs = 999999999
) {
  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  return Math.max(
    -maxAbs,
    Math.min(
      maxAbs,
      Math.trunc(
        number
      )
    )
  );
}


function cleanRewardNumber(
  value
) {
  return Math.max(
    0,
    cleanSignedNumber(
      value
    )
  );
}


function validEventKey(
  key
) {
  return /^events\/[0-9]+_[a-f0-9-]{36}$/i
    .test(
      key
    );
}


function validJobId(
  value
) {
  return /^[a-zA-Z0-9_-]{8,100}$/
    .test(
      value
    );
}


async function listParticipants(
  event
) {
  const eventId =
    cleanText(
      event?.id,
      200
    );

  if (!eventId) {
    return [];
  }

  const signupStore =
    store(
      SIGNUPS_STORE
    );

  const {
    blobs,
  } =
    await signupStore.list({
      prefix:
        `signups/${eventId}/`,
    });

  const rows =
    await Promise.all(
      blobs.map(
        async blob => {
          try {
            const signup =
              await signupStore.get(
                blob.key,
                {
                  type:
                    'json',
                  consistency:
                    'strong',
                }
              );

            if (
              !signup ||
              signup.status !==
                'registered'
            ) {
              return null;
            }

            const characterId =
              cleanText(
                signup.characterId,
                200
              )
                .toLowerCase();

            if (!characterId) {
              return null;
            }

            return {
              characterId,
              name:
                cleanText(
                  signup.character?.name ||
                  signup.playerName ||
                  characterId,
                  300
                ),
            };

          } catch (
            error
          ) {
            console.warn(
              'completion participant read:',
              blob.key,
              error
            );

            return null;
          }
        }
      )
    );

  return rows
    .filter(
      Boolean
    );
}


async function callCharacterService(
  eventId,
  eventTitle,
  rewards
) {
  const serviceUrl =
    cleanText(
      process.env
        .CHARACTER_SERVICE_URL,
      2000
    );

  const writeSecret =
    cleanText(
      process.env
        .CHARACTER_WRITE_SECRET,
      1000
    );

  if (!serviceUrl) {
    throw new Error(
      'Не задан CHARACTER_SERVICE_URL'
    );
  }

  if (!writeSecret) {
    throw new Error(
      'Не задан CHARACTER_WRITE_SECRET'
    );
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      8 * 60 * 1000
    );

  try {
    const response =
      await fetch(
        serviceUrl,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',
            accept:
              'application/json',
          },

          body:
            JSON.stringify({
              action:
                'apply-event-rewards',

              writeSecret,

              eventRewards: {
                eventId,
                eventTitle,
                rewards,
              },
            }),

          redirect:
            'follow',

          cache:
            'no-store',

          signal:
            controller.signal,
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
        `Google вернул не JSON: ${text.slice(0, 300)}`
      );
    }

    if (
      !response.ok ||
      !data ||
      data.ok !==
        true
    ) {
      throw new Error(
        data?.error ||
        `Google HTTP ${response.status}`
      );
    }

    return data;

  } finally {
    clearTimeout(
      timeout
    );
  }
}


async function saveJob(
  jobId,
  data
) {
  await store(
    JOBS_STORE
  ).setJSON(
    `jobs/${jobId}`,
    {
      jobId,
      updatedAt:
        new Date()
          .toISOString(),
      ...data,
    }
  );
}


export default async function (
  request
) {
  let jobId =
    '';

  try {
    const access =
      await requireEventManager(
        request
      );

    if (access.error) {
      return access.error;
    }

    const session =
      access.session;

    const body =
      await request
        .json()
        .catch(
          () => ({})
        );

    jobId =
      cleanText(
        body?.jobId,
        100
      );

    const key =
      cleanText(
        body?.key,
        300
      );

    if (
      !validJobId(
        jobId
      )
    ) {
      return json(
        {
          ok: false,
          error:
            'Некорректный jobId',
        },
        400
      );
    }

    if (
      !validEventKey(
        key
      )
    ) {
      await saveJob(
        jobId,
        {
          state:
            'error',
          error:
            'Некорректный ключ ивента',
          requestedBy:
            session.sub ||
            '',
        }
      );

      return json({
        ok: true,
      });
    }

    await saveJob(
      jobId,
      {
        state:
          'running',
        requestedBy:
          session.sub ||
          '',
        eventKey:
          key,
        message:
          'Читаю участников и готовлю награды...',
      }
    );

    const eventStore =
      store(
        EVENTS_STORE
      );

    const event =
      await eventStore.get(
        key,
        {
          type:
            'json',
          consistency:
            'strong',
        }
      );

    if (!event) {
      throw new Error(
        'Ивент не найден'
      );
    }

    const repair =
      body?.repair ===
      true;

    if (
      event.status ===
      'completed'
    ) {
      if (!repair) {
        await saveJob(
          jobId,
          {
            state:
              'success',
            requestedBy:
              session.sub ||
              '',
            eventKey:
              key,
            message:
              'Ивент уже был завершён.',
            event,
          }
        );

        return json({
          ok: true,
        });
      }

      const completedReports =
        Array.isArray(
          event.completion
            ?.participantReports
        )
          ? event.completion
              .participantReports
          : [];

      if (
        completedReports.length ===
        0
      ) {
        throw new Error(
          'В завершённом ивенте нет сохранённых отчётов участников для повторной синхронизации'
        );
      }

      const completedMaterials =
        Array.isArray(
          event.completion
            ?.materialRewards
        )
          ? event.completion
              .materialRewards
          : (
              Array.isArray(
                event.rewards
                  ?.materials
              )
                ? event.rewards
                    .materials
                : []
            );

      await saveJob(
        jobId,
        {
          state:
            'running',
          requestedBy:
            session.sub ||
            '',
          eventKey:
            key,
          message:
            'Исправляю старые награды: карман и предметы...',
        }
      );

      const repairResult =
        await callCharacterService(
          cleanText(
            event.id,
            200
          ),
          cleanText(
            event.title,
            300
          ),
          completedReports.map(
            item => ({
              characterId:
                cleanText(
                  item.characterId,
                  200
                )
                  .toLowerCase(),

              experience:
                cleanRewardNumber(
                  item.finalReward
                    ?.experience
                ),

              points:
                cleanRewardNumber(
                  item.finalReward
                    ?.points
                ),

              money:
                cleanRewardNumber(
                  item.finalReward
                    ?.money
                ),

              hpSpent:
                cleanRewardNumber(
                  item.hpSpent
                ),

              manaSpent:
                cleanRewardNumber(
                  item.manaSpent
                ),

              materials:
                completedMaterials,

              specialReward:
                cleanText(
                  item.specialReward,
                  3000
                ),
            })
          )
        );

      const repairedAt =
        new Date()
          .toISOString();

      const repairedEvent = {
        ...event,

        updatedAt:
          repairedAt,

        completion: {
          ...event.completion,

          repairedAt,

          repairedBy: {
            login:
              session.sub ||
              '',
            name:
              session.name ||
              session.sub ||
              '',
          },

          repairResult,
        },
      };

      await eventStore.setJSON(
        key,
        repairedEvent
      );

      await saveJob(
        jobId,
        {
          state:
            'success',
          requestedBy:
            session.sub ||
            '',
          eventKey:
            key,
          message:
            'Награды завершённого ивента пересинхронизированы.',
          event:
            repairedEvent,
        }
      );

      return json({
        ok: true,
      });
    }

    if (
      event.status !==
      'active'
    ) {
      throw new Error(
        'Завершать можно только активный ивент'
      );
    }

    const participants =
      await listParticipants(
        event
      );

    const report =
      cleanText(
        body?.report,
        12000
      );

    if (!report) {
      throw new Error(
        'Заполните общий отчёт о проведении ивента'
      );
    }

    const drafts =
      Array.isArray(
        body?.participants
      )
        ? body.participants
        : [];

    const draftsById =
      new Map(
        drafts.map(
          item => [
            cleanText(
              item?.characterId,
              200
            )
              .toLowerCase(),
            item,
          ]
        )
      );

    const base = {
      experience:
        cleanRewardNumber(
          event.rewards?.experience
        ),

      points:
        cleanRewardNumber(
          event.rewards?.points
        ),

      money:
        cleanRewardNumber(
          event.rewards?.money?.amount
        ),
    };

    const participantReports =
      participants.map(
        participant => {
          const draft =
            draftsById.get(
              participant.characterId
            ) ||
            {};

          const adjustment = {
            experience:
              cleanSignedNumber(
                draft?.experienceDelta
              ),

            points:
              cleanSignedNumber(
                draft?.pointsDelta
              ),

            money:
              cleanSignedNumber(
                draft?.moneyDelta
              ),
          };

          const finalReward = {
            experience:
              Math.max(
                0,
                base.experience +
                adjustment.experience
              ),

            points:
              Math.max(
                0,
                base.points +
                adjustment.points
              ),

            money:
              Math.max(
                0,
                base.money +
                adjustment.money
              ),
          };

          const changed =
            adjustment.experience !==
              0 ||
            adjustment.points !==
              0 ||
            adjustment.money !==
              0;

          const rewardReason =
            cleanText(
              draft?.rewardReason,
              3000
            );

          if (
            changed &&
            !rewardReason
          ) {
            throw new Error(
              `Для ${participant.name} изменена фиксированная награда, но не указана причина`
            );
          }

          return {
            characterId:
              participant.characterId,

            name:
              participant.name,

            fixedReward:
              base,

            adjustment,

            finalReward,

            rewardReason,

            hpSpent:
              cleanRewardNumber(
                draft?.hpSpent
              ),

            manaSpent:
              cleanRewardNumber(
                draft?.manaSpent
              ),

            specialReward:
              cleanText(
                draft?.specialReward,
                3000
              ),

            praise:
              cleanText(
                draft?.praise,
                3000
              ),

            complaint:
              cleanText(
                draft?.complaint,
                3000
              ),
          };
        }
      );

    await saveJob(
      jobId,
      {
        state:
          'running',
        requestedBy:
          session.sub ||
          '',
        eventKey:
          key,
        message:
          'Начисляю опыт, баллы и деньги в Google...',
      }
    );

    const fixedMaterials =
      Array.isArray(
        event.rewards?.materials
      )
        ? event.rewards.materials
        : [];

    const googleResult =
      await callCharacterService(
        cleanText(
          event.id,
          200
        ),
        cleanText(
          event.title,
          300
        ),
        participantReports.map(
          item => ({
            characterId:
              item.characterId,

            experience:
              item.finalReward
                .experience,

            points:
              item.finalReward
                .points,

            money:
              item.finalReward
                .money,

            hpSpent:
              item.hpSpent,

            manaSpent:
              item.manaSpent,

            materials:
              fixedMaterials,

            specialReward:
              item.specialReward,
          })
        )
      );

    const completedAt =
      new Date()
        .toISOString();

    const completedEvent = {
      ...event,

      status:
        'completed',

      updatedAt:
        completedAt,

      completion: {
        completedAt,

        completedBy: {
          login:
            session.sub ||
            '',
          name:
            session.name ||
            session.sub ||
            '',
        },

        report,

        participantReports,

        materialRewards:
          fixedMaterials,

        googleResult,
      },
    };

    await eventStore.setJSON(
      key,
      completedEvent
    );

    await tryWriteAdminLog({
      adminLogin:
        session.sub ||
        '',

      adminName:
        session.name ||
        session.sub ||
        '',

      action:
        'COMPLETE_EVENT',

      targetType:
        'event',

      targetId:
        cleanText(
          event.id
        ),

      targetName:
        cleanText(
          event.title
        ),

      details:
        `Ивент завершён. Участников: ${participantReports.length}.`,
    });

    await saveJob(
      jobId,
      {
        state:
          'success',
        requestedBy:
          session.sub ||
          '',
        eventKey:
          key,
        message:
          'Ивент завершён, награды начислены, отчёт сохранён.',
        event:
          completedEvent,
      }
    );

    return json({
      ok: true,
    });

  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? error.message
        : String(
            error
          );

    console.error(
      'admin-event-complete-background error:',
      error
    );

    if (jobId) {
      try {
        await saveJob(
          jobId,
          {
            state:
              'error',
            error:
              message,
          }
        );
      } catch (_) {}
    }

    /*
      Background Function всегда отвечает без throw,
      чтобы Netlify не повторил опасную операцию автоматически.
    */
    return json({
      ok: true,
    });
  }
}
