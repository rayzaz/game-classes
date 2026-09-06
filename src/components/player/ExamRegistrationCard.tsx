import React, {
  useEffect,
  useState,
} from 'react';

import './exam-registration-card.css';


const EXAM_API =
  '/.netlify/functions/player-exam-registration';


type Props = {
  level: number;
  rank: string;
  onOpenEvents: () => void;
};


type ExamState = {
  joined?: boolean;
  event?: {
    key?: string;
    id?: string;
    title?: string;
    status?: string;
  } | null;
};


export default function ExamRegistrationCard({
  level,
  rank,
  onOpenEvents,
}: Props) {
  const eligible =
    Number(level) === 0 &&
    !String(rank || '')
      .trim();

  const [
    loading,
    setLoading,
  ] = useState(
    eligible
  );

  const [
    saving,
    setSaving,
  ] = useState(
    false
  );

  const [
    joined,
    setJoined,
  ] = useState(
    false
  );

  const [
    eventTitle,
    setEventTitle,
  ] = useState(
    'Экзамен в рыцари-чародеи'
  );

  const [
    message,
    setMessage,
  ] = useState(
    ''
  );

  const [
    error,
    setError,
  ] = useState(
    ''
  );


  useEffect(
    () => {
      if (!eligible) {
        return;
      }

      let cancelled =
        false;

      setLoading(
        true
      );

      setError(
        ''
      );

      fetch(
        `${EXAM_API}?t=${Date.now()}`,
        {
          cache:
            'no-store',
        }
      )
        .then(
          async response => {
            const result:
              ExamState & {
                ok?: boolean;
                error?: string;
              } =
              await response.json();

            if (
              !response.ok ||
              result.ok === false
            ) {
              throw new Error(
                result.error ||
                `Ошибка HTTP: ${response.status}`
              );
            }

            if (cancelled) {
              return;
            }

            setJoined(
              result.joined === true
            );

            if (
              result.event?.title
            ) {
              setEventTitle(
                result.event.title
              );
            }
          }
        )
        .catch(
          err => {
            if (!cancelled) {
              setError(
                err instanceof Error
                  ? err.message
                  : String(err)
              );
            }
          }
        )
        .finally(
          () => {
            if (!cancelled) {
              setLoading(
                false
              );
            }
          }
        );

      return () => {
        cancelled =
          true;
      };
    },
    [
      eligible,
    ]
  );


  if (!eligible) {
    return null;
  }


  async function register() {
    setSaving(
      true
    );

    setError(
      ''
    );

    setMessage(
      ''
    );

    try {
      const response =
        await fetch(
          EXAM_API,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({}),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        result.ok === false
      ) {
        throw new Error(
          result.error ||
          `Ошибка HTTP: ${response.status}`
        );
      }

      setJoined(
        true
      );

      if (
        result.event?.title
      ) {
        setEventTitle(
          result.event.title
        );
      }

      setMessage(
        result.alreadyRegistered
          ? 'Вы уже записаны на этот экзамен.'
          : result.eventCreated
            ? 'Экзаменационный ивент создан, а вы записаны первым участником.'
            : 'Запись на экзамен подтверждена.'
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
      setSaving(
        false
      );
    }
  }


  return (
    <section className="exam-registration-card">
      <div className="exam-registration-copy">
        <span className="exam-registration-kicker">
          ВСТУПИТЕЛЬНЫЙ ЭКЗАМЕН
        </span>

        <h2>
          Хочу стать рыцарем-чародеем
        </h2>

        <p>
          Для кандидатов 0 уровня без рыцарского звания. После записи вы появитесь среди участников ивента «{eventTitle}» у администрации.
        </p>

        <div className="exam-registration-rules">
          <span>Уровень: 0</span>
          <span>Ранг: без звания</span>
          <span>Запись: через личный кабинет</span>
        </div>

        {message ? (
          <div className="exam-registration-message is-success">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="exam-registration-message is-error">
            {error}
          </div>
        ) : null}
      </div>

      <div className="exam-registration-actions">
        {joined ? (
          <>
            <div className="exam-registration-status">
              ✓ Вы записаны
            </div>

            <button
              type="button"
              onClick={
                onOpenEvents
              }
            >
              Открыть ивенты
            </button>
          </>
        ) : (
          <button
            type="button"
            className="is-primary"
            disabled={
              loading ||
              saving
            }
            onClick={
              () =>
                void register()
            }
          >
            {
              loading
                ? 'Проверяю запись…'
                : saving
                  ? 'Записываю…'
                  : 'Хочу пройти экзамен'
            }
          </button>
        )}
      </div>
    </section>
  );
}
