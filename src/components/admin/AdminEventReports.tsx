import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import './admin-event-reports.css';


type RewardShape = {
  experience?: number;
  points?: number;
  money?: number;
};


type ParticipantReport = {
  characterId: string;
  name: string;
  fixedReward?: RewardShape;
  adjustment?: RewardShape;
  finalReward?: RewardShape;
  rewardReason?: string;
  hpSpent?: number;
  manaSpent?: number;
  specialReward?: string;
  praise?: string;
  complaint?: string;
};


type EventReport = {
  key: string;
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  createdBy?: {
    login?: string;
    name?: string;
  };
  completedAt: string;
  completedBy?: {
    login?: string;
    name?: string;
  };
  report: string;
  rewards?: {
    experience?: number;
    points?: number;
    money?: {
      amount?: number;
      currency?: string;
    };
    materials?: Array<{
      id?: string;
      name?: string;
      count?: number;
      description?: string;
    }>;
  };
  participantReports: ParticipantReport[];
};


type ReportsResponse = {
  ok: boolean;
  reports?: EventReport[];
  total?: number;
  error?: string;
};


const API =
  '/.netlify/functions/admin-event-reports';


function formatDateTime(
  value: string
) {
  if (!value) {
    return 'Не указано';
  }

  const date =
    new Date(
      value
    );

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
  ).format(
    date
  );
}


function formatNumber(
  value: unknown
) {
  const number =
    Number(
      value
    );

  return new Intl.NumberFormat(
    'ru-RU',
    {
      maximumFractionDigits:
        0,
    }
  ).format(
    Number.isFinite(
      number
    )
      ? number
      : 0
  );
}


function signedNumber(
  value: unknown
) {
  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    ) ||
    number ===
      0
  ) {
    return '0';
  }

  return `${
    number >
    0
      ? '+'
      : ''
  }${formatNumber(number)}`;
}


function hasAdjustment(
  report:
    ParticipantReport
) {
  const value =
    report.adjustment ||
    {};

  return (
    Number(
      value.experience
    ) !==
      0 ||
    Number(
      value.points
    ) !==
      0 ||
    Number(
      value.money
    ) !==
      0
  );
}


export default function AdminEventReports() {
  const [
    reports,
    setReports,
  ] =
    useState<
      EventReport[]
    >(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    error,
    setError,
  ] =
    useState(
      ''
    );

  const [
    query,
    setQuery,
  ] =
    useState(
      ''
    );

  const [
    openKey,
    setOpenKey,
  ] =
    useState(
      ''
    );


  async function load() {
    setLoading(
      true
    );

    setError(
      ''
    );

    try {
      const response =
        await fetch(
          `${API}?t=${Date.now()}`,
          {
            cache:
              'no-store',
          }
        );

      const result:
        ReportsResponse =
          await response.json();

      if (
        !response.ok ||
        !result.ok
      ) {
        throw new Error(
          result.error ||
          `Ошибка HTTP ${response.status}`
        );
      }

      setReports(
        Array.isArray(
          result.reports
        )
          ? result.reports
          : []
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
      setLoading(
        false
      );
    }
  }


  useEffect(
    () => {
      void load();
    },
    []
  );


  const filtered =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        if (!needle) {
          return reports;
        }

        return reports.filter(
          item => {
            const haystack =
              [
                item.title,
                item.location,
                item.createdBy?.name,
                item.createdBy?.login,
                item.completedBy?.name,
                item.completedBy?.login,
                item.report,
                ...item.participantReports.map(
                  participant =>
                    `${participant.name} ${participant.characterId}`
                ),
              ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(
              needle
            );
          }
        );
      },
      [
        query,
        reports,
      ]
    );


  return (
    <section className="admin-event-reports">
      <div className="admin-section-head admin-event-reports-head">
        <div>
          <div className="admin-kicker">
            ВНУТРЕННИЕ ОТЧЁТЫ
          </div>

          <h2>
            Отчёты ивентеров
          </h2>

          <p>
            Общие отчёты, индивидуальные награды, похвалы и проблемы по завершённым ивентам.
          </p>
        </div>

        <div className="admin-event-reports-total">
          <strong>
            {reports.length}
          </strong>

          <span>
            завершённых
          </span>
        </div>
      </div>

      <div className="admin-event-reports-toolbar">
        <input
          value={
            query
          }
          onChange={
            event =>
              setQuery(
                event.target.value
              )
          }
          placeholder="Найти ивент, ивентера или персонажа"
        />

        <button
          type="button"
          className="admin-button"
          onClick={() =>
            void load()
          }
          disabled={
            loading
          }
        >
          Обновить
        </button>
      </div>

      {loading ? (
        <div className="admin-empty">
          Загружаем отчёты…
        </div>
      ) : null}

      {!loading &&
      error ? (
        <div className="admin-error">
          <strong>
            Не удалось загрузить отчёты
          </strong>

          <p>
            {error}
          </p>
        </div>
      ) : null}

      {!loading &&
      !error &&
      filtered.length ===
        0 ? (
        <div className="admin-empty">
          {reports.length
            ? 'По этому запросу отчётов нет.'
            : 'Завершённых ивентов с отчётами пока нет.'}
        </div>
      ) : null}

      {!loading &&
      !error &&
      filtered.length >
        0 ? (
        <div className="admin-event-report-list">
          {filtered.map(
            report => {
              const opened =
                openKey ===
                report.key;

              const eventer =
                report.completedBy
                  ?.name ||
                report.completedBy
                  ?.login ||
                report.createdBy
                  ?.name ||
                report.createdBy
                  ?.login ||
                'Не указан';

              return (
                <article
                  key={
                    report.key
                  }
                  className={`admin-event-report-card${
                    opened
                      ? ' is-open'
                      : ''
                  }`}
                >
                  <button
                    type="button"
                    className="admin-event-report-summary"
                    onClick={() =>
                      setOpenKey(
                        current =>
                          current ===
                          report.key
                            ? ''
                            : report.key
                      )
                    }
                  >
                    <div className="admin-event-report-summary-main">
                      <div className="admin-event-report-title-row">
                        <span className="admin-event-report-status">
                          Завершён
                        </span>

                        <span>
                          {formatDateTime(
                            report.completedAt
                          )}
                        </span>
                      </div>

                      <h3>
                        {report.title}
                      </h3>

                      <p>
                        Ивентер: <strong>{eventer}</strong>
                      </p>
                    </div>

                    <div className="admin-event-report-summary-side">
                      <strong>
                        {report.participantReports.length}
                      </strong>

                      <span>
                        участников
                      </span>

                      <b aria-hidden="true">
                        {opened
                          ? '−'
                          : '+'}
                      </b>
                    </div>
                  </button>

                  {opened ? (
                    <div className="admin-event-report-details">
                      <div className="admin-event-report-facts">
                        <div>
                          <span>
                            Место
                          </span>

                          <strong>
                            {report.location ||
                              '—'}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Начало
                          </span>

                          <strong>
                            {formatDateTime(
                              report.startsAt
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Завершил
                          </span>

                          <strong>
                            {eventer}
                          </strong>
                        </div>
                      </div>

                      <section className="admin-event-report-general">
                        <span>
                          Общий отчёт
                        </span>

                        <p>
                          {report.report ||
                            'Общий отчёт не заполнен.'}
                        </p>
                      </section>

                      <div className="admin-event-report-participants">
                        {report.participantReports.map(
                          participant => (
                            <article
                              className="admin-event-report-member"
                              key={
                                participant.characterId ||
                                participant.name
                              }
                            >
                              <div className="admin-event-report-member-head">
                                <div>
                                  <span>
                                    УЧАСТНИК
                                  </span>

                                  <h4>
                                    {participant.name ||
                                      participant.characterId}
                                  </h4>
                                </div>

                                <div className="admin-event-report-final-reward">
                                  <span>
                                    {formatNumber(
                                      participant.finalReward?.experience
                                    )}{' '}
                                    EXP
                                  </span>

                                  <span>
                                    {formatNumber(
                                      participant.finalReward?.points
                                    )}{' '}
                                    бал.
                                  </span>

                                  <span>
                                    {formatNumber(
                                      participant.finalReward?.money
                                    )}{' '}
                                    {report.rewards?.money?.currency ||
                                      'юли'}
                                  </span>
                                </div>
                              </div>

                              {hasAdjustment(
                                participant
                              ) ? (
                                <div className="admin-event-report-adjustment">
                                  <span>
                                    Изменение награды:
                                  </span>

                                  <strong>
                                    EXP {signedNumber(
                                      participant.adjustment?.experience
                                    )}
                                    {' · '}
                                    баллы {signedNumber(
                                      participant.adjustment?.points
                                    )}
                                    {' · '}
                                    деньги {signedNumber(
                                      participant.adjustment?.money
                                    )}
                                  </strong>

                                  {participant.rewardReason ? (
                                    <p>
                                      {participant.rewardReason}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}

                              <div className="admin-event-report-member-grid">
                                <div>
                                  <span>
                                    Потрачено
                                  </span>

                                  <p>
                                    HP: {formatNumber(
                                      participant.hpSpent
                                    )} · MP: {formatNumber(
                                      participant.manaSpent
                                    )}
                                  </p>
                                </div>

                                <div>
                                  <span>
                                    Особая награда
                                  </span>

                                  <p>
                                    {participant.specialReward ||
                                      '—'}
                                  </p>
                                </div>

                                <div className="is-positive">
                                  <span>
                                    Похвала
                                  </span>

                                  <p>
                                    {participant.praise ||
                                      '—'}
                                  </p>
                                </div>

                                <div className="is-negative">
                                  <span>
                                    Жалоба / проблема
                                  </span>

                                  <p>
                                    {participant.complaint ||
                                      '—'}
                                  </p>
                                </div>
                              </div>
                            </article>
                          )
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            }
          )}
        </div>
      ) : null}
    </section>
  );
}
