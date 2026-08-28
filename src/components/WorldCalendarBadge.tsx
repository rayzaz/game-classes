import React, {
  useEffect,
  useState,
} from 'react';

import './world-calendar-badge.css';


type CalendarState = {
  initialized: boolean;
  season:
    | 'spring'
    | 'summer'
    | 'autumn'
    | 'winter';
  seasonLabel: string;
  year: number;
  updatedAt: string;
};


type CalendarResponse = {
  ok: boolean;
  calendar?: CalendarState;
  error?: string;
};


const SEASON_ICONS:
  Record<
    CalendarState['season'],
    string
  > = {
    spring: '🌸',
    summer: '☀️',
    autumn: '🍂',
    winter: '❄️',
  };


export default function WorldCalendarBadge() {
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
    failed,
    setFailed
  ] =
    useState(
      false
    );


  useEffect(
    () => {
      let cancelled =
        false;

      async function load() {
        try {
          const response =
            await fetch(
              `/.netlify/functions/calendar-state?t=${Date.now()}`,
              {
                method:
                  'GET',
              }
            );

          const result =
            await response
              .json()
              .catch(
                () => null
              ) as CalendarResponse | null;

          if (
            !response.ok ||
            !result?.ok ||
            !result.calendar
          ) {
            throw new Error(
              result?.error ||
              'Не удалось загрузить календарь'
            );
          }

          if (
            !cancelled
          ) {
            setCalendar(
              result.calendar
            );
            setFailed(
              false
            );
          }

        } catch {
          if (
            !cancelled
          ) {
            setFailed(
              true
            );
          }

        } finally {
          if (
            !cancelled
          ) {
            setLoading(
              false
            );
          }
        }
      }

      void load();

      return () => {
        cancelled =
          true;
      };
    },
    []
  );


  if (
    loading
  ) {
    return (
      <div
        className="world-calendar-badge is-loading"
        aria-live="polite"
      >
        <span className="world-calendar-icon">
          ◷
        </span>

        <span className="world-calendar-copy">
          <small>
            Игровая дата
          </small>

          <strong>
            Загружается…
          </strong>
        </span>
      </div>
    );
  }


  if (
    failed ||
    !calendar
  ) {
    return (
      <div
        className="world-calendar-badge is-unavailable"
        title="Не удалось получить игровой календарь"
      >
        <span className="world-calendar-icon">
          ◷
        </span>

        <span className="world-calendar-copy">
          <small>
            Игровая дата
          </small>

          <strong>
            Недоступна
          </strong>
        </span>
      </div>
    );
  }


  if (
    !calendar.initialized
  ) {
    return (
      <div className="world-calendar-badge is-uninitialized">
        <span className="world-calendar-icon">
          ◷
        </span>

        <span className="world-calendar-copy">
          <small>
            Игровая дата
          </small>

          <strong>
            Не настроена
          </strong>
        </span>
      </div>
    );
  }


  const icon =
    SEASON_ICONS[
      calendar.season
    ] ||
    '◷';


  return (
    <div
      className={
        `world-calendar-badge season-${calendar.season}`
      }
      title="Текущие сезон и год игрового мира"
      aria-label={
        `${calendar.seasonLabel}, ${calendar.year} игровой год`
      }
    >
      <span className="world-calendar-icon">
        {icon}
      </span>

      <span className="world-calendar-copy">
        <small>
          Сейчас в мире
        </small>

        <strong>
          {calendar.seasonLabel}
          {' · '}
          {calendar.year}
          {' год'}
        </strong>
      </span>
    </div>
  );
}
