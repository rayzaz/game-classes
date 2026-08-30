import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import './admin-calendar.css';


type Season =
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter';


type CalendarState = {
  initialized: boolean;
  season: Season;
  seasonLabel: string;
  year: number;
  nextSeason: Season;
  nextSeasonLabel: string;
  revision: number;
  updatedAt: string;
};


type AgeReport = {
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  updated?: Array<{
    characterId: string;
    name: string;
    before: number;
    after: number;
  }>;
  skipped?: Array<{
    characterId: string;
    name: string;
    reason: string;
  }>;
  errors?: Array<{
    characterId: string;
    name: string;
    error: string;
  }>;
};


type NpcAgeReport = {
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  updated?: Array<{
    npcId: string;
    name: string;
    before: number;
    after: number;
  }>;
  skipped?: Array<{
    npcId: string;
    name: string;
    reason: string;
  }>;
  errors?: Array<{
    npcId: string;
    name: string;
    error: string;
  }>;
};


type CalendarResponse = {
  ok: boolean;
  calendar?: CalendarState;
  yearChanged?: boolean;
  ageReport?: AgeReport | null;
  npcAgeReport?: NpcAgeReport | null;
  error?: string;
};


const SEASONS: Array<{
  value: Season;
  label: string;
  icon: string;
}> = [
  {
    value: 'spring',
    label: 'Весна',
    icon: '🌸',
  },
  {
    value: 'summer',
    label: 'Лето',
    icon: '☀️',
  },
  {
    value: 'autumn',
    label: 'Осень',
    icon: '🍂',
  },
  {
    value: 'winter',
    label: 'Зима',
    icon: '❄️',
  },
];


function seasonIcon(
  season: Season
) {
  return (
    SEASONS.find(
      item =>
        item.value ===
        season
    )?.icon ||
    '◷'
  );
}


async function readJson(
  response: Response
): Promise<CalendarResponse> {
  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      error:
        'Сервер вернул некорректный ответ',
    };
  }
}


export default function AdminCalendar() {
  const [
    calendar,
    setCalendar
  ] =
    useState<CalendarState | null>(
      null
    );

  const [
    loading,
    setLoading
  ] =
    useState(
      true
    );

  const [
    saving,
    setSaving
  ] =
    useState(
      false
    );

  const [
    error,
    setError
  ] =
    useState(
      ''
    );

  const [
    message,
    setMessage
  ] =
    useState(
      ''
    );

  const [
    ageReport,
    setAgeReport
  ] =
    useState<AgeReport | null>(
      null
    );

  const [
    npcAgeReport,
    setNpcAgeReport
  ] =
    useState<NpcAgeReport | null>(
      null
    );


  const [
    setupSeason,
    setSetupSeason
  ] =
    useState<Season>(
      'summer'
    );

  const [
    setupYear,
    setSetupYear
  ] =
    useState(
      '1'
    );


  const nextIcon =
    useMemo(
      () =>
        calendar
          ? seasonIcon(
              calendar.nextSeason
            )
          : '◷',
      [
        calendar,
      ]
    );


  async function loadCalendar() {
    setLoading(
      true
    );
    setError(
      ''
    );

    try {
      const response =
        await fetch(
          `/.netlify/functions/admin-calendar?t=${Date.now()}`,
          {
            method:
              'GET',
            cache:
              'no-store',
          }
        );

      const result =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !result.ok ||
        !result.calendar
      ) {
        throw new Error(
          result.error ||
          'Не удалось загрузить календарь'
        );
      }

      setCalendar(
        result.calendar
      );

      if (
        !result.calendar.initialized
      ) {
        setSetupSeason(
          result.calendar.season ||
          'summer'
        );

        setSetupYear(
          String(
            result.calendar.year ||
            1
          )
        );
      }

    } catch (
      err: any
    ) {
      setError(
        err?.message ||
        String(
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
      loadCalendar();
    },
    []
  );


  async function initializeCalendar() {
    const year =
      Number(
        setupYear
      );

    if (
      !Number.isInteger(
        year
      ) ||
      year < 1
    ) {
      setError(
        'Игровой год должен быть целым числом от 1'
      );
      return;
    }

    setSaving(
      true
    );
    setError(
      ''
    );
    setMessage(
      ''
    );
    setAgeReport(
      null
    );

    try {
      const response =
        await fetch(
          '/.netlify/functions/admin-calendar',
          {
            method:
              'POST',
            headers: {
              'content-type':
                'application/json',
            },
            body:
              JSON.stringify({
                action:
                  'initialize',
                season:
                  setupSeason,
                year,
              }),
          }
        );

      const result =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !result.ok ||
        !result.calendar
      ) {
        throw new Error(
          result.error ||
          'Не удалось настроить календарь'
        );
      }

      setCalendar(
        result.calendar
      );

      setMessage(
        `Календарь установлен: ${result.calendar.seasonLabel}, ${result.calendar.year} год.`
      );

    } catch (
      err: any
    ) {
      setError(
        err?.message ||
        String(
          err
        )
      );

    } finally {
      setSaving(
        false
      );
    }
  }


  async function advanceCalendar() {
    if (
      !calendar ||
      !calendar.initialized
    ) {
      return;
    }

    const changesYear =
      calendar.season ===
      'winter';

    if (
      changesYear
    ) {
      const confirmed =
        window.confirm(
          `Переход Зима → Весна увеличит игровой год до ${calendar.year + 1} и возраст всех активных персонажей на 1 год.\n\nПродолжить?`
        );

      if (
        !confirmed
      ) {
        return;
      }
    }

    setSaving(
      true
    );
    setError(
      ''
    );
    setMessage(
      ''
    );
    setAgeReport(
      null
    );

    try {
      const response =
        await fetch(
          '/.netlify/functions/admin-calendar',
          {
            method:
              'POST',
            headers: {
              'content-type':
                'application/json',
            },
            body:
              JSON.stringify({
                action:
                  'advance',
                expectedRevision:
                  calendar.revision,
              }),
          }
        );

      const result =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !result.ok ||
        !result.calendar
      ) {
        throw new Error(
          result.error ||
          'Не удалось перевести сезон'
        );
      }

      setCalendar(
        result.calendar
      );

      setAgeReport(
        result.ageReport ||
        null
      );

      setNpcAgeReport(
        result.npcAgeReport ||
        null
      );

      if (
        result.yearChanged
      ) {
        const updated =
          result.ageReport
            ?.updatedCount ??
          0;

        const npcUpdated =
          result.npcAgeReport
            ?.updatedCount ??
          0;

        const skipped =
          (
            result.ageReport
              ?.skippedCount ??
            0
          ) +
          (
            result.npcAgeReport
              ?.skippedCount ??
            0
          );

        const errors =
          (
            result.ageReport
              ?.errorCount ??
            0
          ) +
          (
            result.npcAgeReport
              ?.errorCount ??
            0
          );

        setMessage(
          `Наступила весна ${result.calendar.year} года. Возраст увеличен у ${updated} персонажей и ${npcUpdated} НПС.${
            skipped
              ? ` Пропущено: ${skipped}.`
              : ''
          }${
            errors
              ? ` Ошибок: ${errors}.`
              : ''
          }`
        );

      } else {
        setMessage(
          `Теперь ${result.calendar.seasonLabel.toLowerCase()}, ${result.calendar.year} год.`
        );
      }

    } catch (
      err: any
    ) {
      setError(
        err?.message ||
        String(
          err
        )
      );

    } finally {
      setSaving(
        false
      );
    }
  }


  if (
    loading
  ) {
    return (
      <section className="admin-calendar">
        <div className="admin-calendar-card">
          Загружаем игровой календарь…
        </div>
      </section>
    );
  }


  if (
    !calendar
  ) {
    return (
      <section className="admin-calendar">
        <div className="admin-calendar-card">
          <h2>
            Календарь
          </h2>

          {
            error
              ? (
                <div className="admin-calendar-alert error">
                  {error}
                </div>
              )
              : null
          }

          <button
            type="button"
            className="admin-button"
            onClick={
              loadCalendar
            }
          >
            Повторить
          </button>
        </div>
      </section>
    );
  }


  if (
    !calendar.initialized
  ) {
    return (
      <section className="admin-calendar">
        <div className="admin-calendar-heading">
          <div>
            <div className="admin-calendar-kicker">
              Игровое время
            </div>

            <h2>
              Календарь
            </h2>

            <p>
              Один раз укажи текущий сезон и игровой год. После этого календарь будет переводиться одной кнопкой.
            </p>
          </div>
        </div>

        <div className="admin-calendar-card">
          <div className="admin-calendar-setup-grid">
            <label>
              <span>
                Текущий сезон
              </span>

              <select
                value={
                  setupSeason
                }
                onChange={
                  event =>
                    setSetupSeason(
                      event.target
                        .value as Season
                    )
                }
                disabled={
                  saving
                }
              >
                {
                  SEASONS.map(
                    item => (
                      <option
                        key={
                          item.value
                        }
                        value={
                          item.value
                        }
                      >
                        {item.icon} {item.label}
                      </option>
                    )
                  )
                }
              </select>
            </label>

            <label>
              <span>
                Игровой год
              </span>

              <input
                type="number"
                min="1"
                step="1"
                value={
                  setupYear
                }
                onChange={
                  event =>
                    setSetupYear(
                      event.target
                        .value
                    )
                }
                disabled={
                  saving
                }
              />
            </label>
          </div>

          {
            error
              ? (
                <div className="admin-calendar-alert error">
                  {error}
                </div>
              )
              : null
          }

          <button
            type="button"
            className="admin-calendar-primary"
            onClick={
              initializeCalendar
            }
            disabled={
              saving
            }
          >
            {
              saving
                ? 'Сохраняем…'
                : 'Сохранить начальную дату'
            }
          </button>
        </div>
      </section>
    );
  }


  return (
    <section className="admin-calendar">
      <div className="admin-calendar-heading">
        <div>
          <div className="admin-calendar-kicker">
            Игровое время
          </div>

          <h2>
            Календарь
          </h2>

          <p>
            Сезон меняется только вручную. При переходе с зимы на весну год и возраст активных персонажей увеличиваются автоматически.
          </p>
        </div>
      </div>

      <div className="admin-calendar-board">
        <div
          className={
            `admin-calendar-season season-${calendar.season}`
          }
        >
          <div className="admin-calendar-season-icon">
            {
              seasonIcon(
                calendar.season
              )
            }
          </div>

          <div>
            <div className="admin-calendar-season-label">
              {
                calendar.seasonLabel
              }
            </div>

            <div className="admin-calendar-year">
              {
                calendar.year
              } игровой год
            </div>
          </div>
        </div>

        <div className="admin-calendar-next">
          <span>
            Следующий сезон
          </span>

          <strong>
            {nextIcon} {
              calendar.nextSeasonLabel
            }
          </strong>

          {
            calendar.season ===
            'winter'
              ? (
                <small>
                  Переход увеличит год и возраст персонажей на 1.
                </small>
              )
              : (
                <small>
                  Год и возраст пока не меняются.
                </small>
              )
          }
        </div>
      </div>

      {
        error
          ? (
            <div className="admin-calendar-alert error">
              {error}
            </div>
          )
          : null
      }

      {
        message
          ? (
            <div className="admin-calendar-alert success">
              {message}
            </div>
          )
          : null
      }

      <div className="admin-calendar-actions">
        <button
          type="button"
          className="admin-calendar-primary"
          onClick={
            advanceCalendar
          }
          disabled={
            saving
          }
        >
          {
            saving
              ? 'Переводим календарь…'
              : `Перевести: ${calendar.seasonLabel} → ${calendar.nextSeasonLabel}`
          }
        </button>
      </div>

      {
        ageReport &&
        (
          ageReport.skippedCount >
            0 ||
          ageReport.errorCount >
            0
        )
          ? (
            <details className="admin-calendar-report">
              <summary>
                Подробности обновления возраста
              </summary>

              {
                ageReport.skipped?.length
                  ? (
                    <div>
                      <strong>
                        Пропущены:
                      </strong>

                      <ul>
                        {
                          ageReport.skipped.map(
                            item => (
                              <li
                                key={
                                  `skip-${item.characterId}`
                                }
                              >
                                {item.name || item.characterId}: {item.reason}
                              </li>
                            )
                          )
                        }
                      </ul>
                    </div>
                  )
                  : null
              }

              {
                ageReport.errors?.length
                  ? (
                    <div>
                      <strong>
                        Ошибки:
                      </strong>

                      <ul>
                        {
                          ageReport.errors.map(
                            item => (
                              <li
                                key={
                                  `error-${item.characterId}`
                                }
                              >
                                {item.name || item.characterId}: {item.error}
                              </li>
                            )
                          )
                        }
                      </ul>
                    </div>
                  )
                  : null
              }
            </details>
          )
          : null
      }

      {
        npcAgeReport &&
        (
          npcAgeReport.skippedCount >
            0 ||
          npcAgeReport.errorCount >
            0
        )
          ? (
            <details className="admin-calendar-report">
              <summary>
                Подробности обновления возраста НПС
              </summary>

              {
                npcAgeReport.skipped?.length
                  ? (
                    <div>
                      <strong>
                        Пропущены:
                      </strong>

                      <ul>
                        {
                          npcAgeReport.skipped.map(
                            item => (
                              <li
                                key={
                                  `npc-skip-${item.npcId}`
                                }
                              >
                                {item.name || item.npcId}: {item.reason}
                              </li>
                            )
                          )
                        }
                      </ul>
                    </div>
                  )
                  : null
              }

              {
                npcAgeReport.errors?.length
                  ? (
                    <div>
                      <strong>
                        Ошибки:
                      </strong>

                      <ul>
                        {
                          npcAgeReport.errors.map(
                            item => (
                              <li
                                key={
                                  `npc-error-${item.npcId}`
                                }
                              >
                                {item.name || item.npcId}: {item.error}
                              </li>
                            )
                          )
                        }
                      </ul>
                    </div>
                  )
                  : null
              }
            </details>
          )
          : null
      }
    </section>
  );
}
