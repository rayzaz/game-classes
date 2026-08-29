import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  KNIGHT_RANKS,
  getKnightRank,
} from '../../data/ranks';

import AdminEventParticipants from './AdminEventParticipants';
import './admin-events-ranks.css';
import './admin-event-completion.css';


type MaterialReward = {
  id?: string;
  name: string;
  count: number;
  description: string;
};


type EventParticipant = {
  characterId?: string;
  name?: string;
};


type EventData = {
  key: string;
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  status: string;

  difficulty: {
    level: number;
    requiredKnightRank: string;
  };

  rewards: {
    experience: number;
    points: number;

    money: {
      amount: number;
      currency: string;
    };

    materials:
      MaterialReward[];
  };

  participants:
    EventParticipant[];

  participantCount?:
    number;

  createdBy?: {
    login?: string;
    name?: string;
  };

  createdAt?: string;
  updatedAt?: string;
};


type EventsResponse = {
  ok: boolean;

  events?: EventData[];

  error?: string;
};


type CreateResponse = {
  ok: boolean;

  event?: EventData;

  error?: string;
};


type StatusResponse = {
  ok: boolean;

  event?: EventData;

  error?: string;
};


type DeleteResponse = {
  ok: boolean;

  deleted?: {
    key: string;
    id?: string;
    title?: string;
  };

  removedSignups?: number;

  error?: string;
};


type MaterialDraft = {
  tempId: string;
  name: string;
  count: string;
  description: string;
};


const EVENTS_API =
  '/.netlify/functions/admin-events';

const EVENT_STATUS_API =
  '/.netlify/functions/admin-event-status';


const STATUS_LABELS:
  Record<
    string,
    string
  > = {
    draft:
      'Черновик',

    published:
      'Опубликован',

    active:
      'Идёт',

    completed:
      'Завершён',

    cancelled:
      'Отменён',
  };


function makeMaterialDraft():
  MaterialDraft {
  return {
    tempId:
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,

    name: '',

    count: '1',

    description: '',
  };
}


function formatNumber(
  value: number
) {
  return new Intl.NumberFormat(
    'ru-RU',
    {
      maximumFractionDigits:
        0,
    }
  ).format(
    Number.isFinite(
      value
    )
      ? value
      : 0
  );
}


function formatDateTime(
  value: string
) {
  if (!value) {
    return 'Не указано';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'ru-RU',
    {
      dateStyle:
        'medium',

      timeStyle:
        'short',
    }
  ).format(date);
}


function statusLabel(
  status: string
) {
  return (
    STATUS_LABELS[
      status
    ] ||
    status ||
    'Неизвестно'
  );
}


function AdminEventStatusActions({
  event,
  busy,
  onChange,
  onComplete,
  onRepair,
}: {
  event: EventData;

  busy: boolean;

  onChange: (
    event:
      EventData,

    status:
      string
  ) => void;

  onComplete: (
    event:
      EventData
  ) => void;

  onRepair: (
    event:
      EventData
  ) => void;
}) {
  if (
    event.status ===
    'completed'
  ) {
    return (
      <div className="admin-event-actions">
        <span className="admin-event-action-note">
          Ивент завершён.
        </span>

        <button
          type="button"
          className="admin-button"
          disabled={
            busy
          }
          onClick={() =>
            onRepair(
              event
            )
          }
        >
          {busy
            ? 'Синхронизирую...'
            : 'Пересинхронизировать награды'}
        </button>
      </div>
    );
  }


  if (
    event.status ===
    'draft'
  ) {
    return (
      <div className="admin-event-actions">
        <button
          type="button"
          className="admin-button admin-button-primary"
          disabled={
            busy
          }
          onClick={() =>
            onChange(
              event,
              'published'
            )
          }
        >
          {busy
            ? 'Сохраняем...'
            : 'Опубликовать'}
        </button>

        <button
          type="button"
          className="admin-button admin-button-danger"
          disabled={
            busy
          }
          onClick={() =>
            onChange(
              event,
              'cancelled'
            )
          }
        >
          Отменить
        </button>
      </div>
    );
  }


  if (
    event.status ===
    'published'
  ) {
    return (
      <div className="admin-event-actions">
        <button
          type="button"
          className="admin-button admin-button-primary"
          disabled={
            busy
          }
          onClick={() =>
            onChange(
              event,
              'active'
            )
          }
        >
          {busy
            ? 'Сохраняем...'
            : 'Начать ивент'}
        </button>

        <button
          type="button"
          className="admin-button"
          disabled={
            busy
          }
          onClick={() =>
            onChange(
              event,
              'draft'
            )
          }
        >
          В черновик
        </button>

        <button
          type="button"
          className="admin-button admin-button-danger"
          disabled={
            busy
          }
          onClick={() =>
            onChange(
              event,
              'cancelled'
            )
          }
        >
          Отменить
        </button>
      </div>
    );
  }


  if (
    event.status ===
    'active'
  ) {
    return (
      <div className="admin-event-actions">
        <button
          type="button"
          className="admin-button admin-button-primary"
          disabled={
            busy
          }
          onClick={() =>
            onComplete(
              event
            )
          }
        >
          Завершить ивент
        </button>

        <button
          type="button"
          className="admin-button admin-button-danger"
          disabled={
            busy
          }
          onClick={() =>
            onChange(
              event,
              'cancelled'
            )
          }
        >
          Отменить
        </button>
      </div>
    );
  }


  if (
    event.status ===
    'cancelled'
  ) {
    return (
      <div className="admin-event-actions">
        <button
          type="button"
          className="admin-button"
          disabled={
            busy
          }
          onClick={() =>
            onChange(
              event,
              'draft'
            )
          }
        >
          Вернуть в черновик
        </button>

        <button
          type="button"
          className="admin-button admin-button-primary"
          disabled={
            busy
          }
          onClick={() =>
            onChange(
              event,
              'published'
            )
          }
        >
          Опубликовать заново
        </button>
      </div>
    );
  }


  return null;
}


type CompletionMaterialReward = {
  name: string;
  count: number;
  description?: string;
};


type EventForCompletion = {
  key: string;
  id: string;
  title: string;

  rewards: {
    experience: number;
    points: number;

    money: {
      amount: number;
      currency: string;
    };

    materials:
      CompletionMaterialReward[];
  };
};


type CompletionParticipant = {
  characterId: string;

  character: {
    name: string;
  };
};


type ParticipantDraft = {
  experienceDelta: string;
  pointsDelta: string;
  moneyDelta: string;
  hpSpent: string;
  manaSpent: string;
  rewardReason: string;
  specialReward: string;
  praise: string;
  complaint: string;
};


type AdminEventCompletionProps = {
  event:
    EventForCompletion;

  onClose:
    () => void;

  onCompleted:
    () => void;
};


const PARTICIPANTS_API =
  '/.netlify/functions/admin-event-participants';

const COMPLETE_API =
  '/.netlify/functions/admin-event-complete-background';

const COMPLETE_STATUS_API =
  '/.netlify/functions/admin-event-complete-status';


function completionFreshDraft():
  ParticipantDraft {
  return {
    experienceDelta:
      '0',

    pointsDelta:
      '0',

    moneyDelta:
      '0',

    hpSpent:
      '0',

    manaSpent:
      '0',

    rewardReason:
      '',

    specialReward:
      '',

    praise:
      '',

    complaint:
      '',
  };
}


function completionSignedNumber(
  value:
    string
) {
  const parsed =
    Number(
      value
    );

  return Number.isFinite(
    parsed
  )
    ? Math.trunc(
        parsed
      )
    : 0;
}


function completionFormatNumber(
  value:
    number
) {
  return new Intl.NumberFormat(
    'ru-RU',
    {
      maximumFractionDigits:
        0,
    }
  ).format(
    value || 0
  );
}


function completionMakeJobId() {
  if (
    typeof crypto !==
      'undefined' &&
    typeof crypto.randomUUID ===
      'function'
  ) {
    return crypto
      .randomUUID()
      .replace(
        /-/g,
        ''
      );
  }

  return (
    Date.now()
      .toString(36) +
    Math.random()
      .toString(36)
      .slice(2)
  );
}


function completionSleep(
  ms:
    number
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function AdminEventCompletion({
  event,
  onClose,
  onCompleted,
}: AdminEventCompletionProps) {
  const [
    participants,
    setParticipants,
  ] =
    useState<
      CompletionParticipant[]
    >(
      []
    );

  const [
    drafts,
    setDrafts,
  ] =
    useState<
      Record<
        string,
        ParticipantDraft
      >
    >(
      {}
    );

  const [
    report,
    setReport,
  ] =
    useState(
      ''
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false
    );

  const [
    message,
    setMessage,
  ] =
    useState(
      ''
    );

  const [
    error,
    setError,
  ] =
    useState(
      ''
    );


  useEffect(
    () => {
      let cancelled =
        false;

      setLoading(
        true
      );

      setError(
        ''
      );

      fetch(
        `${PARTICIPANTS_API}?key=${encodeURIComponent(event.key)}&t=${Date.now()}`,
        {
          cache:
            'no-store',
        }
      )
        .then(
          async response => {
            const result =
              await response
                .json();

            if (
              !response.ok ||
              !result?.ok
            ) {
              throw new Error(
                result?.error ||
                `Ошибка HTTP ${response.status}`
              );
            }

            return result;
          }
        )
        .then(
          result => {
            if (
              cancelled
            ) {
              return;
            }

            const list =
              Array.isArray(
                result.participants
              )
                ? result.participants
                : [];

            setParticipants(
              list
            );

            const next:
              Record<
                string,
                ParticipantDraft
              > =
              {};

            list.forEach(
              (
                participant:
                  CompletionParticipant
              ) => {
                next[
                  participant.characterId
                ] =
                  completionFreshDraft();
              }
            );

            setDrafts(
              next
            );

            setLoading(
              false
            );
          }
        )
        .catch(
          err => {
            if (
              cancelled
            ) {
              return;
            }

            setError(
              err instanceof Error
                ? err.message
                : String(
                    err
                  )
            );

            setLoading(
              false
            );
          }
        );

      return () => {
        cancelled =
          true;
      };
    },
    [
      event.key,
    ]
  );


  const baseReward =
    useMemo(
      () => ({
        experience:
          Math.max(
            0,
            Number(
              event.rewards
                ?.experience
            ) ||
            0
          ),

        points:
          Math.max(
            0,
            Number(
              event.rewards
                ?.points
            ) ||
            0
          ),

        money:
          Math.max(
            0,
            Number(
              event.rewards
                ?.money
                ?.amount
            ) ||
            0
          ),
      }),
      [
        event,
      ]
    );


  const patchDraft =
    (
      characterId:
        string,

      patch:
        Partial<
          ParticipantDraft
        >
    ) => {
      setDrafts(
        current => ({
          ...current,

          [characterId]: {
            ...(
              current[
                characterId
              ] ||
              completionFreshDraft()
            ),

            ...patch,
          },
        })
      );
    };


  const submit =
    async (
      formEvent:
        FormEvent
    ) => {
      formEvent
        .preventDefault();

      if (
        !report.trim()
      ) {
        setError(
          'Заполни общий отчёт: как прошёл ивент.'
        );

        return;
      }

      for (
        const participant of
          participants
      ) {
        const draft =
          drafts[
            participant.characterId
          ] ||
          completionFreshDraft();

        const changed =
          completionSignedNumber(
            draft.experienceDelta
          ) !==
            0 ||
          completionSignedNumber(
            draft.pointsDelta
          ) !==
            0 ||
          completionSignedNumber(
            draft.moneyDelta
          ) !==
            0;

        if (
          changed &&
          !draft.rewardReason
            .trim()
        ) {
          setError(
            `Для ${participant.character?.name || participant.characterId} изменена награда — укажи причину.`
          );

          return;
        }
      }

      setBusy(
        true
      );

      setError(
        ''
      );

      setMessage(
        'Ставлю завершение ивента в очередь...'
      );

      try {
        const jobId =
          completionMakeJobId();

        const response =
          await fetch(
            COMPLETE_API,
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  jobId,

                  key:
                    event.key,

                  report:
                    report.trim(),

                  participants:
                    participants.map(
                      participant => {
                        const draft =
                          drafts[
                            participant.characterId
                          ] ||
                          completionFreshDraft();

                        return {
                          characterId:
                            participant.characterId,

                          experienceDelta:
                            completionSignedNumber(
                              draft.experienceDelta
                            ),

                          pointsDelta:
                            completionSignedNumber(
                              draft.pointsDelta
                            ),

                          moneyDelta:
                            completionSignedNumber(
                              draft.moneyDelta
                            ),

                          hpSpent:
                            Math.max(
                              0,
                              completionSignedNumber(
                                draft.hpSpent
                              )
                            ),

                          manaSpent:
                            Math.max(
                              0,
                              completionSignedNumber(
                                draft.manaSpent
                              )
                            ),

                          rewardReason:
                            draft.rewardReason
                              .trim(),

                          specialReward:
                            draft.specialReward
                              .trim(),

                          praise:
                            draft.praise
                              .trim(),

                          complaint:
                            draft.complaint
                              .trim(),
                        };
                      }
                    ),
                }),
            }
          );

        if (
          !response.ok &&
          response.status !==
            202
        ) {
          const result =
            await response
              .json()
              .catch(
                () => null
              );

          throw new Error(
            result?.error ||
            `Ошибка HTTP ${response.status}`
          );
        }

        const startedAt =
          Date.now();

        while (
          Date.now() -
            startedAt <
          10 * 60 * 1000
        ) {
          await completionSleep(
            2200
          );

          const statusResponse =
            await fetch(
              `${COMPLETE_STATUS_API}?jobId=${encodeURIComponent(jobId)}&t=${Date.now()}`,
              {
                cache:
                  'no-store',
              }
            );

          const statusResult =
            await statusResponse
              .json();

          if (
            !statusResponse.ok ||
            !statusResult?.ok
          ) {
            throw new Error(
              statusResult?.error ||
              `Ошибка проверки статуса HTTP ${statusResponse.status}`
            );
          }

          const job =
            statusResult.job ||
            {};

          setMessage(
            job.message ||
            'Завершаю ивент...'
          );

          if (
            job.state ===
            'error'
          ) {
            throw new Error(
              job.error ||
              'Не удалось завершить ивент'
            );
          }

          if (
            job.state ===
            'success'
          ) {
            setMessage(
              'Готово: награды начислены, отчёт сохранён.'
            );

            await completionSleep(
              500
            );

            onCompleted();

            return;
          }
        }

        throw new Error(
          'Завершение ивента не закончилось за 10 минут. Проверь журнал и статус ивента перед повтором.'
        );

      } catch (
        err
      ) {
        setError(
          err instanceof Error
            ? err.message
            : String(
                err
              )
        );

      } finally {
        setBusy(
          false
        );
      }
    };


  return (
    <div
      className="admin-event-completion-backdrop"
      role="presentation"
    >
      <form
        className="admin-event-completion"
        onSubmit={
          submit
        }
      >
        <div className="admin-event-completion-head">
          <div>
            <span className="admin-kicker">
              ЗАВЕРШЕНИЕ ИВЕНТА
            </span>

            <h3>
              {event.title}
            </h3>

            <p>
              Фиксированная награда применяется ко всем. Ниже можно отдельно увеличить или уменьшить награду конкретному участнику.
            </p>
          </div>

          <button
            type="button"
            className="admin-button"
            onClick={
              onClose
            }
            disabled={
              busy
            }
          >
            Закрыть
          </button>
        </div>


        <div className="admin-event-completion-fixed">
          <strong>
            Фиксированная награда
          </strong>

          <span>
            {completionFormatNumber(
              baseReward.experience
            )}{' '}
            EXP
          </span>

          <span>
            {completionFormatNumber(
              baseReward.points
            )}{' '}
            баллов
          </span>

          <span>
            {completionFormatNumber(
              baseReward.money
            )}{' '}
            {event.rewards?.money?.currency || 'юли'}
          </span>

          {
            Array.isArray(
              event.rewards
                ?.materials
            ) &&
            event.rewards
              .materials
              .length >
              0
              ? (
                  <span>
                    Предметов:{' '}
                    {
                      event.rewards
                        .materials
                        .length
                    }
                  </span>
                )
              : null
          }
        </div>


        <label className="admin-event-completion-report">
          <span>
            Общий отчёт для МерыМеры *
          </span>

          <textarea
            rows={
              6
            }
            value={
              report
            }
            onChange={
              event =>
                setReport(
                  event.target.value
                )
            }
            placeholder="Как прошёл ивент, что получилось, где были проблемы, что стоит учесть в следующий раз..."
            disabled={
              busy
            }
          />
        </label>


        {
          loading
            ? (
                <div className="admin-event-completion-state">
                  Загружаю участников...
                </div>
              )
            : null
        }


        {
          !loading &&
          participants.length ===
            0
            ? (
                <div className="admin-event-completion-state">
                  В ивенте нет участников. Его всё равно можно завершить с общим отчётом.
                </div>
              )
            : null
        }


        <div className="admin-event-completion-members">
          {
            participants.map(
              participant => {
                const characterId =
                  participant.characterId;

                const draft =
                  drafts[
                    characterId
                  ] ||
                  completionFreshDraft();

                const finalExperience =
                  Math.max(
                    0,
                    baseReward.experience +
                    completionSignedNumber(
                      draft.experienceDelta
                    )
                  );

                const finalPoints =
                  Math.max(
                    0,
                    baseReward.points +
                    completionSignedNumber(
                      draft.pointsDelta
                    )
                  );

                const finalMoney =
                  Math.max(
                    0,
                    baseReward.money +
                    completionSignedNumber(
                      draft.moneyDelta
                    )
                  );

                return (
                  <article
                    key={
                      characterId
                    }
                    className="admin-event-completion-member"
                  >
                    <div className="admin-event-completion-member-head">
                      <div>
                        <strong>
                          {participant.character?.name || characterId}
                        </strong>

                        <small>
                          {characterId}
                        </small>
                      </div>

                      <div className="admin-event-completion-total">
                        Итого: {completionFormatNumber(finalExperience)} EXP · {completionFormatNumber(finalPoints)} бал. · {completionFormatNumber(finalMoney)} {event.rewards?.money?.currency || 'юли'}
                      </div>
                    </div>


                    <div className="admin-event-completion-grid">
                      <label>
                        <span>
                          ± EXP
                        </span>

                        <input
                          type="number"
                          value={
                            draft.experienceDelta
                          }
                          onChange={
                            event =>
                              patchDraft(
                                characterId,
                                {
                                  experienceDelta:
                                    event.target.value,
                                }
                              )
                          }
                          disabled={
                            busy
                          }
                        />
                      </label>

                      <label>
                        <span>
                          ± Баллы
                        </span>

                        <input
                          type="number"
                          value={
                            draft.pointsDelta
                          }
                          onChange={
                            event =>
                              patchDraft(
                                characterId,
                                {
                                  pointsDelta:
                                    event.target.value,
                                }
                              )
                          }
                          disabled={
                            busy
                          }
                        />
                      </label>

                      <label>
                        <span>
                          ± Деньги
                        </span>

                        <input
                          type="number"
                          value={
                            draft.moneyDelta
                          }
                          onChange={
                            event =>
                              patchDraft(
                                characterId,
                                {
                                  moneyDelta:
                                    event.target.value,
                                }
                              )
                          }
                          disabled={
                            busy
                          }
                        />
                      </label>
                    </div>


                    <div className="admin-event-completion-grid">
                      <label>
                        <span>
                          Потрачено HP
                        </span>

                        <input
                          type="number"
                          min="0"
                          value={
                            draft.hpSpent
                          }
                          onChange={
                            event =>
                              patchDraft(
                                characterId,
                                {
                                  hpSpent:
                                    event.target.value,
                                }
                              )
                          }
                          disabled={
                            busy
                          }
                        />
                      </label>

                      <label>
                        <span>
                          Потрачено маны
                        </span>

                        <input
                          type="number"
                          min="0"
                          value={
                            draft.manaSpent
                          }
                          onChange={
                            event =>
                              patchDraft(
                                characterId,
                                {
                                  manaSpent:
                                    event.target.value,
                                }
                              )
                          }
                          disabled={
                            busy
                          }
                        />
                      </label>
                    </div>


                    <label>
                      <span>
                        Почему награда больше / меньше
                      </span>

                      <textarea
                        rows={
                          2
                        }
                        value={
                          draft.rewardReason
                        }
                        onChange={
                          event =>
                            patchDraft(
                              characterId,
                              {
                                rewardReason:
                                  event.target.value,
                              }
                            )
                        }
                        placeholder="Обязательно, если менялись EXP / баллы / деньги."
                        disabled={
                          busy
                        }
                      />
                    </label>


                    <label>
                      <span>
                        Индивидуальная награда
                      </span>

                      <input
                        value={
                          draft.specialReward
                        }
                        onChange={
                          event =>
                            patchDraft(
                              characterId,
                              {
                                specialReward:
                                  event.target.value,
                              }
                            )
                        }
                        placeholder="Например: редкий предмет, титул, дополнительный материал..."
                        disabled={
                          busy
                        }
                      />
                    </label>


                    <div className="admin-event-completion-grid admin-event-completion-grid-notes">
                      <label>
                        <span>
                          Похвала игроку
                        </span>

                        <textarea
                          rows={
                            3
                          }
                          value={
                            draft.praise
                          }
                          onChange={
                            event =>
                              patchDraft(
                                characterId,
                                {
                                  praise:
                                    event.target.value,
                                }
                              )
                          }
                          disabled={
                            busy
                          }
                        />
                      </label>

                      <label>
                        <span>
                          Жалоба / проблема
                        </span>

                        <textarea
                          rows={
                            3
                          }
                          value={
                            draft.complaint
                          }
                          onChange={
                            event =>
                              patchDraft(
                                characterId,
                                {
                                  complaint:
                                    event.target.value,
                                }
                              )
                          }
                          disabled={
                            busy
                          }
                        />
                      </label>
                    </div>
                  </article>
                );
              }
            )
          }
        </div>


        {
          message
            ? (
                <div className="admin-event-completion-message">
                  {message}
                </div>
              )
            : null
        }

        {
          error
            ? (
                <div className="admin-error">
                  {error}
                </div>
              )
            : null
        }


        <div className="admin-event-completion-actions">
          <button
            type="button"
            className="admin-button"
            onClick={
              onClose
            }
            disabled={
              busy
            }
          >
            Отмена
          </button>

          <button
            type="submit"
            className="admin-button admin-button-primary"
            disabled={
              busy ||
              loading
            }
          >
            {
              busy
                ? 'Завершаю...'
                : 'Завершить и начислить награды'
            }
          </button>
        </div>
      </form>
    </div>
  );
}



export default function AdminEvents() {
  const [
    events,
    setEvents,
  ] =
    useState<
      EventData[]
    >(
      []
    );


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    error,
    setError,
  ] =
    useState('');


  const [
    formOpen,
    setFormOpen,
  ] =
    useState(false);


  const [
    eventFilter,
    setEventFilter,
  ] =
    useState<
      'all' |
      'draft' |
      'published' |
      'active' |
      'completed'
    >(
      'all'
    );


  const [
    saving,
    setSaving,
  ] =
    useState(false);


  const [
    statusBusyKey,
    setStatusBusyKey,
  ] =
    useState('');


  const [
    openParticipantsKey,
    setOpenParticipantsKey,
  ] =
    useState('');


  const [
    completionEvent,
    setCompletionEvent,
  ] =
    useState<
      EventData |
      null
    >(
      null
    );


  const [
    title,
    setTitle,
  ] =
    useState('');


  const [
    description,
    setDescription,
  ] =
    useState('');


  const [
    location,
    setLocation,
  ] =
    useState('');


  const [
    startsAt,
    setStartsAt,
  ] =
    useState('');


  const [
    endsAt,
    setEndsAt,
  ] =
    useState('');


  const [
    difficultyLevel,
    setDifficultyLevel,
  ] =
    useState('1');


  const [
    requiredKnightRank,
    setRequiredKnightRank,
  ] =
    useState('');


  const [
    experienceReward,
    setExperienceReward,
  ] =
    useState('0');


  const [
    pointsReward,
    setPointsReward,
  ] =
    useState('0');


  const [
    moneyReward,
    setMoneyReward,
  ] =
    useState('0');


  const [
    moneyCurrency,
    setMoneyCurrency,
  ] =
    useState('юли');


  const [
    materialRewards,
    setMaterialRewards,
  ] =
    useState<
      MaterialDraft[]
    >(
      []
    );


  const selectedRank =
    getKnightRank(
      requiredKnightRank
    );


  const loadEvents =
    useCallback(
      async () => {
        setLoading(
          true
        );

        setError(
          ''
        );

        try {
          const response =
            await fetch(
              `${EVENTS_API}?t=${Date.now()}`,
              {
                cache:
                  'no-store',
              }
            );

          const result:
            EventsResponse =
              await response.json();

          if (
            !response.ok ||
            !result.ok
          ) {
            throw new Error(
              result.error ||
              `Ошибка HTTP: ${response.status}`
            );
          }

          setEvents(
            Array.isArray(
              result.events
            )
              ? result.events
              : []
          );

        } catch (
          err
        ) {
          setError(
            err instanceof Error
              ? err.message
              : String(err)
          );

        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );


  useEffect(
    () => {
      void loadEvents();
    },
    [
      loadEvents,
    ]
  );


  const updateParticipantCount =
    useCallback(
      (
        eventKey: string,
        count: number
      ) => {
        setEvents(
          current =>
            current.map(
              event =>
                event.key ===
                eventKey
                  ? {
                      ...event,
                      participantCount:
                        count,
                    }
                  : event
            )
        );
      },
      []
    );


  const resetForm =
    () => {
      setTitle('');
      setDescription('');
      setLocation('');
      setStartsAt('');
      setEndsAt('');
      setDifficultyLevel('1');
      setRequiredKnightRank('');
      setExperienceReward('0');
      setPointsReward('0');
      setMoneyReward('0');
      setMoneyCurrency('юли');
      setMaterialRewards([]);
    };


  const closeForm =
    () => {
      setFormOpen(
        false
      );

      resetForm();
    };


  const updateMaterial =
    (
      tempId:
        string,

      patch:
        Partial<MaterialDraft>
    ) => {
      setMaterialRewards(
        current =>
          current.map(
            material =>
              material.tempId ===
              tempId
                ? {
                    ...material,
                    ...patch,
                  }
                : material
          )
      );
    };


  const removeMaterial =
    (
      tempId:
        string
    ) => {
      setMaterialRewards(
        current =>
          current.filter(
            material =>
              material.tempId !==
              tempId
          )
      );
    };


  const createEvent =
    async (
      event:
        FormEvent<HTMLFormElement>
    ) => {
      event.preventDefault();


      if (
        !title.trim() ||
        !description.trim()
      ) {
        window.alert(
          'Укажи название и описание ивента.'
        );

        return;
      }


      if (
        !requiredKnightRank
      ) {
        window.alert(
          'Выбери минимальный ранг рыцаря-чародея.'
        );

        return;
      }


      const level =
        Math.max(
          1,

          Math.floor(
            Number(
              difficultyLevel
            ) ||
            1
          )
        );


      const cleanMaterials =
        materialRewards
          .map(
            material => ({
              name:
                material.name.trim(),

              count:
                Math.max(
                  1,

                  Math.floor(
                    Number(
                      material.count
                    ) ||
                    1
                  )
                ),

              description:
                material.description.trim(),
            })
          )
          .filter(
            material =>
              material.name
          );


      setSaving(
        true
      );


      try {
        const response =
          await fetch(
            EVENTS_API,
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  title:
                    title.trim(),

                  description:
                    description.trim(),

                  location:
                    location.trim(),

                  startsAt:
                    startsAt ||
                    '',

                  endsAt:
                    endsAt ||
                    '',

                  difficultyLevel:
                    level,

                  requiredKnightRank,

                  experienceReward:
                    Math.max(
                      0,

                      Math.floor(
                        Number(
                          experienceReward
                        ) ||
                        0
                      )
                    ),

                  pointsReward:
                    Math.max(
                      0,

                      Math.floor(
                        Number(
                          pointsReward
                        ) ||
                        0
                      )
                    ),

                  moneyReward:
                    Math.max(
                      0,

                      Math.floor(
                        Number(
                          moneyReward
                        ) ||
                        0
                      )
                    ),

                  moneyCurrency:
                    moneyCurrency.trim() ||
                    'юли',

                  materialRewards:
                    cleanMaterials,

                  status:
                    'draft',
                }),
            }
          );


        const result:
          CreateResponse =
            await response.json();


        if (
          !response.ok ||
          !result.ok
        ) {
          throw new Error(
            result.error ||
            `Ошибка HTTP: ${response.status}`
          );
        }


        closeForm();

        await loadEvents();

      } catch (
        err
      ) {
        window.alert(
          err instanceof Error
            ? err.message
            : String(err)
        );

      } finally {
        setSaving(
          false
        );
      }
    };


  const changeStatus =
    async (
      event:
        EventData,

      status:
        string
    ) => {
      if (
        !event.key
      ) {
        window.alert(
          'У ивента нет ключа хранилища.'
        );

        return;
      }


      let question =
        `Изменить статус «${event.title}» на «${statusLabel(status)}»?`;


      if (
        status ===
        'published'
      ) {
        question =
          `Опубликовать «${event.title}»?\n\nПосле этого ивент станет виден игрокам.`;
      }


      if (
        status ===
        'active'
      ) {
        question =
          `Начать ивент «${event.title}»?`;
      }


      if (
        status ===
        'cancelled'
      ) {
        question =
          `Отменить ивент «${event.title}»?`;
      }


      if (
        !window.confirm(
          question
        )
      ) {
        return;
      }


      setStatusBusyKey(
        event.key
      );


      try {
        const response =
          await fetch(
            EVENT_STATUS_API,
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  key:
                    event.key,

                  status,
                }),
            }
          );


        const result:
          StatusResponse =
            await response.json();


        if (
          !response.ok ||
          !result.ok ||
          !result.event
        ) {
          throw new Error(
            result.error ||
            `Ошибка HTTP: ${response.status}`
          );
        }


        setEvents(
          current =>
            current.map(
              item =>
                item.key ===
                event.key
                  ? {
                      ...item,
                      ...result.event,
                    }
                  : item
            )
        );

      } catch (
        err
      ) {
        window.alert(
          err instanceof Error
            ? err.message
            : String(err)
        );

      } finally {
        setStatusBusyKey(
          ''
        );
      }
    };


  const removeEvent =
    async (
      event:
        EventData
    ) => {
      if (
        !event.key
      ) {
        window.alert(
          'У ивента нет ключа хранилища.'
        );

        return;
      }

      if (
        event.status ===
          'active'
      ) {
        window.alert(
          'Идущий ивент сначала нужно отменить или завершить.'
        );

        return;
      }

      if (
        event.status ===
          'completed'
      ) {
        window.alert(
          'Завершённые ивенты сохраняются как история отчётов и наград и не удаляются.'
        );

        return;
      }

      const participantCount =
        Number.isFinite(
          Number(
            event.participantCount
          )
        )
          ? Number(
              event.participantCount
            )
          : Array.isArray(
              event.participants
            )
            ? event.participants.length
            : 0;

      const participantWarning =
        participantCount > 0
          ? `\n\nЗаписано участников: ${participantCount}. Их записи на этот ивент тоже будут удалены.`
          : '';

      if (
        !window.confirm(
          `Удалить ивент «${event.title}» навсегда?${participantWarning}\n\nЭто действие нельзя отменить.`
        )
      ) {
        return;
      }

      setStatusBusyKey(
        event.key
      );

      try {
        const response =
          await fetch(
            EVENTS_API,
            {
              method:
                'DELETE',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  key:
                    event.key,
                }),
            }
          );

        const result:
          DeleteResponse =
            await response.json();

        if (
          !response.ok ||
          !result.ok
        ) {
          throw new Error(
            result.error ||
            `Ошибка HTTP: ${response.status}`
          );
        }

        setEvents(
          current =>
            current.filter(
              item =>
                item.key !==
                event.key
            )
        );

        setOpenParticipantsKey(
          current =>
            current ===
            event.key
              ? ''
              : current
        );

      } catch (
        err
      ) {
        window.alert(
          err instanceof Error
            ? err.message
            : String(err)
        );

      } finally {
        setStatusBusyKey(
          ''
        );
      }
    };


  const repairCompletedRewards =
    async (
      event:
        EventData
    ) => {
      if (
        !event.key
      ) {
        window.alert(
          'У ивента нет ключа хранилища.'
        );

        return;
      }

      if (
        !window.confirm(
          `Пересинхронизировать награды ивента «${event.title}»?\n\n` +
          'EXP и баллы повторно не начислятся. Старые денежные награды будут перенесены в карман, а предметы — в личный инвентарь.'
        )
      ) {
        return;
      }

      setStatusBusyKey(
        event.key
      );

      try {
        const jobId =
          completionMakeJobId();

        const response =
          await fetch(
            COMPLETE_API,
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  jobId,

                  key:
                    event.key,

                  repair:
                    true,
                }),
            }
          );

        if (
          !response.ok &&
          response.status !==
            202
        ) {
          const result =
            await response
              .json()
              .catch(
                () => null
              );

          throw new Error(
            result?.error ||
            `Ошибка HTTP ${response.status}`
          );
        }

        const startedAt =
          Date.now();

        while (
          Date.now() -
            startedAt <
          10 * 60 * 1000
        ) {
          await completionSleep(
            2200
          );

          const statusResponse =
            await fetch(
              `${COMPLETE_STATUS_API}?jobId=${encodeURIComponent(jobId)}&t=${Date.now()}`,
              {
                cache:
                  'no-store',
              }
            );

          const statusResult =
            await statusResponse
              .json();

          if (
            !statusResponse.ok ||
            !statusResult?.ok
          ) {
            throw new Error(
              statusResult?.error ||
              `Ошибка проверки статуса HTTP ${statusResponse.status}`
            );
          }

          const job =
            statusResult.job ||
            {};

          if (
            job.state ===
            'error'
          ) {
            throw new Error(
              job.error ||
              'Не удалось пересинхронизировать награды'
            );
          }

          if (
            job.state ===
            'success'
          ) {
            window.alert(
              'Готово. Старые награды проверены: деньги перенесены в карман, предметы добавлены в личный инвентарь.'
            );

            await loadEvents();

            return;
          }
        }

        throw new Error(
          'Пересинхронизация не завершилась за 10 минут.'
        );

      } catch (
        err
      ) {
        window.alert(
          err instanceof Error
            ? err.message
            : String(
                err
              )
        );

      } finally {
        setStatusBusyKey(
          ''
        );
      }
    };


  const sortedEvents =
    useMemo(
      () =>
        [
          ...events,
        ].sort(
          (
            first,
            second
          ) => {
            const firstTime =
              new Date(
                first.startsAt ||
                first.createdAt ||
                0
              )
                .getTime();


            const secondTime =
              new Date(
                second.startsAt ||
                second.createdAt ||
                0
              )
                .getTime();


            return (
              secondTime -
              firstTime
            );
          }
        ),
      [
        events,
      ]
    );


  const eventCounts =
    useMemo(
      () => ({
        all:
          sortedEvents.length,

        draft:
          sortedEvents.filter(
            event =>
              event.status ===
              'draft'
          ).length,

        published:
          sortedEvents.filter(
            event =>
              event.status ===
              'published'
          ).length,

        active:
          sortedEvents.filter(
            event =>
              event.status ===
              'active'
          ).length,

        completed:
          sortedEvents.filter(
            event =>
              event.status ===
              'completed'
          ).length,
      }),
      [
        sortedEvents,
      ]
    );


  const visibleEvents =
    useMemo(
      () =>
        eventFilter ===
        'all'
          ? sortedEvents
          : sortedEvents.filter(
              event =>
                event.status ===
                eventFilter
            ),
      [
        eventFilter,
        sortedEvents,
      ]
    );


  return (
    <section className="admin-events">
      <div className="admin-section-head">
        <div>
          <div className="admin-kicker">
            ИВЕНТЫ
          </div>

          <h2>
            Управление событиями
          </h2>

          <p>
            Создание, публикация, запуск и состав игровых ивентов.
          </p>
        </div>

        <button
          type="button"
          className="admin-button admin-button-primary"
          onClick={() =>
            setFormOpen(
              current =>
                !current
            )
          }
        >
          {formOpen
            ? 'Закрыть форму'
            : '+ Создать ивент'}
        </button>
      </div>


      {formOpen ? (
        <form
          className="admin-event-form"
          onSubmit={
            createEvent
          }
        >
          <div className="admin-event-form-head">
            <div>
              <span className="admin-kicker">
                НОВЫЙ ИВЕНТ
              </span>

              <h3>
                Основные данные
              </h3>
            </div>

            <button
              type="button"
              className="admin-button"
              onClick={
                closeForm
              }
              disabled={
                saving
              }
            >
              Закрыть
            </button>
          </div>


          <div className="admin-event-form-grid">
            <label className="admin-event-field admin-event-field-wide">
              <span>
                Название *
              </span>

              <input
                value={
                  title
                }
                onChange={
                  event =>
                    setTitle(
                      event.target.value
                    )
                }
                placeholder="Например: Летающий храм"
              />
            </label>


            <label className="admin-event-field admin-event-field-wide">
              <span>
                Описание *
              </span>

              <textarea
                value={
                  description
                }
                onChange={
                  event =>
                    setDescription(
                      event.target.value
                    )
                }
                rows={
                  6
                }
                placeholder="Что происходит, куда отправляются игроки и чего ожидать."
              />
            </label>


            <label className="admin-event-field">
              <span>
                Место
              </span>

              <input
                value={
                  location
                }
                onChange={
                  event =>
                    setLocation(
                      event.target.value
                    )
                }
                placeholder="Пустошь, столица..."
              />
            </label>


            <label className="admin-event-field">
              <span>
                Уровень сложности *
              </span>

              <input
                type="number"
                min="1"
                step="1"
                value={
                  difficultyLevel
                }
                onChange={
                  event =>
                    setDifficultyLevel(
                      event.target.value
                    )
                }
              />
            </label>


            <label className="admin-event-field">
              <span>
                Начало
              </span>

              <input
                type="datetime-local"
                value={
                  startsAt
                }
                onChange={
                  event =>
                    setStartsAt(
                      event.target.value
                    )
                }
              />
            </label>


            <label className="admin-event-field">
              <span>
                Конец
              </span>

              <input
                type="datetime-local"
                value={
                  endsAt
                }
                onChange={
                  event =>
                    setEndsAt(
                      event.target.value
                    )
                }
              />
            </label>


            <label className="admin-event-field admin-event-field-wide">
              <span>
                Минимальный ранг рыцаря-чародея *
              </span>

              <select
                value={
                  requiredKnightRank
                }
                onChange={
                  event =>
                    setRequiredKnightRank(
                      event.target.value
                    )
                }
              >
                <option value="">
                  Выберите ранг
                </option>

                {KNIGHT_RANKS.map(
                  rank => (
                    <option
                      key={
                        rank.id
                      }
                      value={
                        rank.label
                      }
                    >
                      {rank.label}
                    </option>
                  )
                )}
              </select>
            </label>


            {selectedRank ? (
              <div className="admin-event-rank-preview admin-event-field-wide">
                <span>
                  Так ранг будет выглядеть в ивенте
                </span>

                <div className="admin-event-rank">
                  <img
                    src={
                      selectedRank.image
                    }
                    alt=""
                  />

                  <strong>
                    {selectedRank.label}
                  </strong>
                </div>
              </div>
            ) : null}
          </div>


          <div className="admin-event-reward-section">
            <div className="admin-event-subhead">
              <span className="admin-kicker">
                НАГРАДЫ
              </span>

              <h3>
                Числовые награды
              </h3>
            </div>


            <div className="admin-event-form-grid">
              <label className="admin-event-field">
                <span>
                  Опыт
                </span>

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={
                    experienceReward
                  }
                  onChange={
                    event =>
                      setExperienceReward(
                        event.target.value
                      )
                  }
                />
              </label>


              <label className="admin-event-field">
                <span>
                  Баллы прокачки
                </span>

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={
                    pointsReward
                  }
                  onChange={
                    event =>
                      setPointsReward(
                        event.target.value
                      )
                  }
                />
              </label>


              <label className="admin-event-field">
                <span>
                  Деньги
                </span>

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={
                    moneyReward
                  }
                  onChange={
                    event =>
                      setMoneyReward(
                        event.target.value
                      )
                  }
                />
              </label>


              <label className="admin-event-field">
                <span>
                  Валюта
                </span>

                <input
                  value={
                    moneyCurrency
                  }
                  onChange={
                    event =>
                      setMoneyCurrency(
                        event.target.value
                      )
                  }
                  placeholder="юли"
                />
              </label>
            </div>
          </div>


          <div className="admin-event-materials">
            <div className="admin-event-materials-head">
              <div>
                <span className="admin-kicker">
                  МАТЕРИАЛЬНЫЕ НАГРАДЫ
                </span>

                <h3>
                  Предметы и артефакты
                </h3>
              </div>

              <button
                type="button"
                className="admin-button"
                onClick={() =>
                  setMaterialRewards(
                    current => [
                      ...current,
                      makeMaterialDraft(),
                    ]
                  )
                }
              >
                + Добавить предмет
              </button>
            </div>


            {materialRewards.length >
            0 ? (
              <div className="admin-event-material-list">
                {materialRewards.map(
                  (
                    material,
                    index
                  ) => (
                    <article
                      className="admin-event-material-row"
                      key={
                        material.tempId
                      }
                    >
                      <div className="admin-event-material-number">
                        {index +
                          1}
                      </div>

                      <div className="admin-event-material-fields">
                        <label className="admin-event-field">
                          <span>
                            Название
                          </span>

                          <input
                            value={
                              material.name
                            }
                            onChange={
                              event =>
                                updateMaterial(
                                  material.tempId,
                                  {
                                    name:
                                      event.target.value,
                                  }
                                )
                            }
                            placeholder="Древний кристалл"
                          />
                        </label>


                        <label className="admin-event-field">
                          <span>
                            Количество
                          </span>

                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={
                              material.count
                            }
                            onChange={
                              event =>
                                updateMaterial(
                                  material.tempId,
                                  {
                                    count:
                                      event.target.value,
                                  }
                                )
                            }
                          />
                        </label>


                        <label className="admin-event-field admin-event-field-wide">
                          <span>
                            Описание
                          </span>

                          <textarea
                            rows={
                              3
                            }
                            value={
                              material.description
                            }
                            onChange={
                              event =>
                                updateMaterial(
                                  material.tempId,
                                  {
                                    description:
                                      event.target.value,
                                  }
                                )
                            }
                            placeholder="Что это за предмет и для чего он нужен."
                          />
                        </label>
                      </div>

                      <button
                        type="button"
                        className="admin-button admin-button-danger"
                        onClick={() =>
                          removeMaterial(
                            material.tempId
                          )
                        }
                      >
                        Удалить
                      </button>
                    </article>
                  )
                )}
              </div>
            ) : (
              <div className="admin-empty">
                Материальных наград пока нет.
              </div>
            )}
          </div>


          <div className="admin-event-form-actions">
            <button
              type="submit"
              className="admin-button admin-button-primary"
              disabled={
                saving
              }
            >
              {saving
                ? 'Создаём...'
                : 'Создать черновик'}
            </button>

            <button
              type="button"
              className="admin-button"
              onClick={
                closeForm
              }
              disabled={
                saving
              }
            >
              Отмена
            </button>
          </div>
        </form>
      ) : null}


      {!loading &&
      !error &&
      sortedEvents.length >
        0 ? (
        <div className="admin-event-filterbar">
          {[
            ['all', 'Все'],
            ['active', 'Идут'],
            ['published', 'Опубликованы'],
            ['draft', 'Черновики'],
            ['completed', 'Завершённые'],
          ].map(
            item => {
              const key =
                item[0] as
                  | 'all'
                  | 'draft'
                  | 'published'
                  | 'active'
                  | 'completed';

              return (
                <button
                  key={
                    key
                  }
                  type="button"
                  className={
                    eventFilter ===
                    key
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setEventFilter(
                      key
                    )
                  }
                >
                  {item[1]}
                  <span>
                    {eventCounts[
                      key
                    ]}
                  </span>
                </button>
              );
            }
          )}
        </div>
      ) : null}


      {loading ? (
        <div className="admin-empty">
          Загружаем ивенты...
        </div>
      ) : null}


      {!loading &&
      error ? (
        <div className="admin-error">
          <strong>
            Не удалось загрузить ивенты
          </strong>

          <p>
            {error}
          </p>

          <button
            type="button"
            className="admin-button"
            onClick={() =>
              void loadEvents()
            }
          >
            Повторить
          </button>
        </div>
      ) : null}


      {!loading &&
      !error &&
      sortedEvents.length ===
        0 ? (
        <div className="admin-empty">
          Ивентов пока нет.
        </div>
      ) : null}


      {!loading &&
      !error &&
      sortedEvents.length >
        0 &&
      visibleEvents.length ===
        0 ? (
        <div className="admin-empty">
          В этом разделе ивентов пока нет.
        </div>
      ) : null}


      {!loading &&
      !error &&
      visibleEvents.length >
        0 ? (
        <div className="admin-event-list">
          {visibleEvents.map(
            event => {
              const rewards =
                event.rewards || {
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
                };


              const materials =
                Array.isArray(
                  rewards.materials
                )
                  ? rewards.materials
                  : [];


              const participantCount =
                Number.isFinite(
                  Number(
                    event.participantCount
                  )
                )
                  ? Number(
                      event.participantCount
                    )
                  : Array.isArray(
                      event.participants
                    )
                    ? event.participants.length
                    : 0;


              const busy =
                statusBusyKey ===
                event.key;


              const eventRank =
                getKnightRank(
                  event.difficulty
                    ?.requiredKnightRank ||
                    ''
                );


              return (
                <article
                  className="admin-event-card"
                  key={
                    event.key ||
                    event.id
                  }
                >
                  <div className="admin-event-card-head">
                    <div>
                      <div className="admin-event-card-meta">
                        <span
                          className={`admin-event-status admin-event-status-${event.status}`}
                        >
                          {statusLabel(
                            event.status
                          )}
                        </span>

                        <span>
                          Ур.{' '}
                          {event.difficulty
                            ?.level ||
                            1}
                        </span>
                      </div>

                      <h3>
                        {event.title}
                      </h3>
                    </div>
                  </div>


                  <p className="admin-event-description">
                    {event.description}
                  </p>


                  <div className="admin-event-rank-card">
                    <span className="admin-event-rank-caption">
                      Минимальный ранг
                    </span>

                    <div className="admin-event-rank">
                      {eventRank ? (
                        <img
                          src={
                            eventRank.image
                          }
                          alt=""
                        />
                      ) : null}

                      <strong>
                        {event.difficulty
                          ?.requiredKnightRank ||
                          '—'}
                      </strong>
                    </div>
                  </div>


                  <div className="admin-event-info-grid">
                    <div>
                      <span>
                        Место
                      </span>

                      <strong>
                        {event.location ||
                          '—'}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Начало
                      </span>

                      <strong>
                        {formatDateTime(
                          event.startsAt
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Конец
                      </span>

                      <strong>
                        {formatDateTime(
                          event.endsAt
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Участников
                      </span>

                      <strong>
                        {participantCount}
                      </strong>
                    </div>
                  </div>


                  <div className="admin-event-rewards">
                    {Number(
                      rewards.experience
                    ) >
                    0 ? (
                      <span>
                        ✦{' '}
                        {formatNumber(
                          rewards.experience
                        )}{' '}
                        опыта
                      </span>
                    ) : null}


                    {Number(
                      rewards.points
                    ) >
                    0 ? (
                      <span>
                        ★{' '}
                        {formatNumber(
                          rewards.points
                        )}{' '}
                        баллов прокачки
                      </span>
                    ) : null}


                    {Number(
                      rewards.money
                        ?.amount
                    ) >
                    0 ? (
                      <span>
                        💰{' '}
                        {formatNumber(
                          rewards.money.amount
                        )}{' '}
                        {rewards.money
                          .currency ||
                          'юли'}
                      </span>
                    ) : null}


                    {materials.map(
                      material => (
                        <span
                          key={
                            material.id ||
                            `${material.name}-${material.count}`
                          }
                        >
                          🎁{' '}
                          {material.name}{' '}
                          ×
                          {material.count}
                        </span>
                      )
                    )}
                  </div>


                  <AdminEventStatusActions
                    event={
                      event
                    }
                    busy={
                      busy
                    }
                    onChange={
                      changeStatus
                    }
                    onComplete={
                      setCompletionEvent
                    }
                    onRepair={
                      repairCompletedRewards
                    }
                  />


                  <div className="admin-event-actions">
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() =>
                        setOpenParticipantsKey(
                          current =>
                            current ===
                            event.key
                              ? ''
                              : event.key
                        )
                      }
                    >
                      {openParticipantsKey ===
                      event.key
                        ? 'Скрыть участников'
                        : `Участники · ${participantCount}`}
                    </button>


                    {event.status !==
                      'active' &&
                    event.status !==
                      'completed' ? (
                      <button
                        type="button"
                        className="admin-button admin-button-danger"
                        disabled={
                          busy
                        }
                        onClick={() =>
                          void removeEvent(
                            event
                          )
                        }
                      >
                        {busy
                          ? 'Удаляем...'
                          : 'Удалить ивент'}
                      </button>
                    ) : null}
                  </div>


                  {openParticipantsKey ===
                  event.key ? (
                    <AdminEventParticipants
                      eventKey={
                        event.key
                      }
                      onCountChange={
                        count =>
                          updateParticipantCount(
                            event.key,
                            count
                          )
                      }
                    />
                  ) : null}


                  <div className="admin-event-card-footer">
                    <span>
                      Создал:{' '}
                      {event.createdBy
                        ?.name ||
                        event.createdBy
                          ?.login ||
                        '—'}
                    </span>

                    <span>
                      {formatDateTime(
                        event.createdAt ||
                        ''
                      )}
                    </span>
                  </div>
                </article>
              );
            }
          )}
        </div>
      ) : null}
      {
        completionEvent
          ? (
              <AdminEventCompletion
                event={
                  completionEvent
                }
                onClose={() =>
                  setCompletionEvent(
                    null
                  )
                }
                onCompleted={() => {
                  setCompletionEvent(
                    null
                  );
                  void loadEvents();
                }}
              />
            )
          : null
      }


    </section>
  );
}