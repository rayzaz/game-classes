import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getKnightRank,
} from '../../data/ranks';

import {
  getSquad,
} from '../../data/squads';

import './player-events.css';


const PLAYER_EVENTS_API =
  '/.netlify/functions/player-events';

const PLAYER_EVENT_SIGNUP_API =
  '/.netlify/functions/player-event-signup';


type EventMaterial = {
  id?: string;
  name: string;
  count: number;
  description?: string;
};


type PlayerSummary = {
  characterId: string;
  name: string;
  level: number;
  rank: string;
  className: string;
  squad: string;
};


type EligibilityRank = {
  id: string;
  label: string;
  order: number;
  step: number;
};


type EventEligibility = {
  canJoin: boolean;
  reason: string;

  rankAllowed: boolean;
  rankKnown: boolean;
  requiredRankKnown: boolean;

  playerRank: EligibilityRank | null;
  requiredRank: EligibilityRank | null;

  playerLevel: number;
  eventLevel: number;

  levelState:
    | 'normal'
    | 'danger'
    | 'low_reward'
    | string;

  levelWarning: string;
};


type PlayerEvent = {
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

    materials: EventMaterial[];
  };

  eligibility: EventEligibility;

  registration: {
    joined: boolean;
    status: string;
    joinedAt: string;
  };
};


type PlayerEventsResponse = {
  ok: boolean;
  player?: PlayerSummary;
  events?: PlayerEvent[];
  total?: number;
  adminView?: boolean;
  error?: string;
};


type SignupResponse = {
  ok: boolean;

  alreadyRegistered?: boolean;

  signup?: {
    eventId: string;
    eventKey: string;
    characterId: string;
    status: string;
    createdAt: string;
  };

  eligibility?: EventEligibility;

  error?: string;
};


type Props = {
  onBack: () => void;
  characterId?: string;
  adminView?: boolean;
};


function formatNumber(
  value: number,
  digits = 0
) {
  return new Intl.NumberFormat(
    'ru-RU',
    {
      maximumFractionDigits:
        digits,
    }
  ).format(
    Number.isFinite(value)
      ? value
      : 0
  );
}


function formatDate(
  value: string
) {
  if (!value) {
    return 'Дата не указана';
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


function getReasonText(
  event: PlayerEvent
) {
  const eligibility =
    event.eligibility;

  if (
    !eligibility
  ) {
    return '';
  }

  if (
    eligibility.reason ===
    'insufficient_rank'
  ) {
    return (
      `Для участия требуется минимум «${
        eligibility.requiredRank?.label ||
        event.difficulty.requiredKnightRank
      }».`
    );
  }

  if (
    eligibility.reason ===
    'unknown_player_rank'
  ) {
    return 'Система не смогла определить ранг персонажа.';
  }

  if (
    eligibility.reason ===
    'unknown_required_rank'
  ) {
    return 'Администратор указал ранг, который система не распознала.';
  }

  if (
    eligibility.reason ===
    'registration_closed'
  ) {
    return 'Запись на ивент уже закрыта.';
  }

  return '';
}


function RankView({
  label,
}: {
  label: string;
}) {
  const rank =
    getKnightRank(label);

  if (!rank) {
    return (
      <div className="player-event-rank player-event-rank-unknown">

        <span>
          🎖
        </span>

        <span>
          {
            label ||
            'Ранг не указан'
          }
        </span>

      </div>
    );
  }

  return (
    <div className="player-event-rank">

      <img
        src={
          rank.image
        }
        alt=""
      />

      <span>
        {
          rank.label
        }
      </span>

    </div>
  );
}


function PlayerIdentity({
  player,
}: {
  player: PlayerSummary;
}) {
  const rank =
    getKnightRank(
      player.rank
    );

  const squad =
    getSquad(
      player.squad
    );

  const portrait =
    `/cards/characters/${encodeURIComponent(
      player.characterId ||
      'unknown'
    )}.jpg`;

  return (
    <section className="nero-panel player-events-identity">

      <div className="player-events-identity-main">

        <div className="player-events-avatar-shell">

          <img
            src={
              portrait
            }

            alt={
              player.name
            }
          />

        </div>


        <div className="player-events-identity-copy">

          <div className="nero-kicker">
            УЧАСТНИК
          </div>

          <h2>
            {
              player.name
            }
          </h2>

          <div className="player-events-identity-tags">

            <span>
              Ур.{' '}
              {
                player.level
              }
            </span>

            <span>
              {
                player.className ||
                'Класс не указан'
              }
            </span>

          </div>

        </div>

      </div>


      <div className="player-events-identity-side">

        <div className="player-events-identity-block">

          <span className="player-events-small-label">
            Ранг
          </span>

          {
            rank
              ? (

                <div className="player-events-rank-large">

                  <img
                    src={
                      rank.image
                    }

                    alt=""
                  />

                  <strong>
                    {
                      rank.label
                    }
                  </strong>

                </div>

              )
              : (

                <strong>
                  {
                    player.rank ||
                    '—'
                  }
                </strong>

              )
          }

        </div>


        <div className="player-events-identity-block">

          <span className="player-events-small-label">
            Отряд
          </span>

          <div className="player-events-squad">

            {
              squad
                ? (

                  <img
                    src={
                      squad.image
                    }

                    alt=""
                  />

                )
                : null
            }

            <strong>
              {
                player.squad ||
                'Без отряда'
              }
            </strong>

          </div>

        </div>

      </div>

    </section>
  );
}


function EventWarning({
  event,
}: {
  event: PlayerEvent;
}) {
  const eligibility =
    event.eligibility;

  if (
    !eligibility
  ) {
    return null;
  }

  if (
    !eligibility.rankAllowed
  ) {
    return (
      <div className="player-event-warning player-event-warning-locked">

        <strong>
          🔒 Недостаточный ранг
        </strong>

        <span>
          {
            getReasonText(
              event
            )
          }
        </span>

      </div>
    );
  }

  if (
    eligibility.levelState ===
    'danger'
  ) {
    return (
      <div className="player-event-warning player-event-warning-danger">

        <strong>
          ⚠ Повышенная опасность
        </strong>

        <span>
          {
            eligibility.levelWarning
          }
        </span>

      </div>
    );
  }

  if (
    eligibility.levelState ===
    'low_reward'
  ) {
    return (
      <div className="player-event-warning player-event-warning-low">

        <strong>
          ⚠ Ивент ниже вашего уровня
        </strong>

        <span>
          {
            eligibility.levelWarning
          }
        </span>

      </div>
    );
  }

  return (
    <div className="player-event-warning player-event-warning-ok">

      <strong>
        ✓ Условия уровня подходят
      </strong>

    </div>
  );
}


function EventCard({
  event,
  busy,
  onSignup,
  adminView,
}: {
  event: PlayerEvent;
  busy: boolean;
  adminView: boolean;

  onSignup:
    (
      event: PlayerEvent
    ) => void;
}) {
  const materials =
    Array.isArray(
      event.rewards
        ?.materials
    )
      ? event.rewards.materials
      : [];

  const reasonText =
    getReasonText(
      event
    );

  return (
    <article className="player-event-card">

      <div className="player-event-card-head">

        <div>

          <div className="player-event-status-row">

            <span
              className={
                `player-event-status player-event-status-${event.status}`
              }
            >
              {
                event.status ===
                'active'
                  ? '⚔ Ивент идёт'
                  : '✦ Запись открыта'
              }
            </span>

            <span className="player-event-level">
              Ур.{' '}
              {
                event.difficulty
                  ?.level ||
                1
              }
            </span>

          </div>

          <h3>
            {
              event.title
            }
          </h3>

        </div>

      </div>


      <p className="player-event-description">
        {
          event.description
        }
      </p>


      <div className="player-event-info-grid">

        <div>

          <span>
            Минимальный ранг
          </span>

          <RankView
            label={
              event.difficulty
                ?.requiredKnightRank ||
              ''
            }
          />

        </div>


        <div>

          <span>
            Место
          </span>

          <strong>
            {
              event.location ||
              'Не указано'
            }
          </strong>

        </div>


        <div>

          <span>
            Начало
          </span>

          <strong>
            {
              formatDate(
                event.startsAt
              )
            }
          </strong>

        </div>


        <div>

          <span>
            {
              adminView
                ? 'Уровень персонажа'
                : 'Ваш уровень'
            }
          </span>

          <strong>
            {
              event.eligibility
                ?.playerLevel ??
              '—'
            }
          </strong>

        </div>

      </div>


      <EventWarning
        event={
          event
        }
      />


      <div className="player-event-reward-title">
        Награды
      </div>


      <div className="player-event-rewards">

        {
          Number(
            event.rewards
              ?.experience ||
            0
          ) >
          0
            ? (

              <span>
                ✦ +
                {
                  formatNumber(
                    event.rewards.experience
                  )
                }{' '}
                опыта
              </span>

            )
            : null
        }


        {
          Number(
            event.rewards
              ?.points ||
            0
          ) >
          0
            ? (

              <span>
                ★ +
                {
                  formatNumber(
                    event.rewards.points
                  )
                }{' '}
                баллов прокачки
              </span>

            )
            : null
        }


        {
          Number(
            event.rewards
              ?.money
              ?.amount ||
            0
          ) >
          0
            ? (

              <span>
                💰 +
                {
                  formatNumber(
                    event.rewards.money.amount
                  )
                }{' '}
                {
                  event.rewards
                    .money
                    .currency ||
                  'юли'
                }
              </span>

            )
            : null
        }


        {
          materials.map(
            material => (

              <span
                key={
                  material.id ||
                  `${material.name}-${material.count}`
                }
              >
                🎁{' '}
                {
                  material.name
                }{' '}
                ×
                {
                  material.count
                }
              </span>

            )
          )
        }

      </div>


      <div className="player-event-card-actions">

        {
          event.registration
            ?.joined
            ? (

              <div className="player-event-joined">

                ✓{' '}

                {
                  adminView
                    ? 'Персонаж уже записан на ивент'
                    : 'Вы записаны на ивент'
                }

              </div>

            )
            : event.status !==
              'published'
              ? (

                <div className="player-event-disabled">
                  Запись закрыта
                </div>

              )
              : !event.eligibility
                ?.canJoin
                ? (

                  <div className="player-event-disabled">

                    🔒{' '}

                    {
                      reasonText ||
                      'Запись недоступна'
                    }

                  </div>

                )
                : (

                  <button
                    className="nero-button player-event-signup-button"

                    type="button"

                    disabled={
                      busy
                    }

                    onClick={
                      () =>
                        onSignup(
                          event
                        )
                    }
                  >

                    {
                      busy
                        ? 'Записываем...'
                        : adminView
                          ? 'Записать персонажа'
                          : 'Записаться'
                    }

                  </button>

                )
        }

      </div>

    </article>
  );
}


export default function PlayerEvents({
  onBack,
  characterId = '',
  adminView = false,
}: Props) {

  const [
    player,
    setPlayer,
  ] =
    useState<
      PlayerSummary |
      null
    >(
      null
    );


  const [
    events,
    setEvents,
  ] =
    useState<
      PlayerEvent[]
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
    signupBusyKey,
    setSignupBusyKey,
  ] =
    useState(
      ''
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

          const params =
            new URLSearchParams();


          params.set(
            't',
            String(
              Date.now()
            )
          );


          /*
            Только в административном режиме
            передаём выбранного персонажа.

            Обычный игрок определяется
            сервером из своей сессии.
          */

          if (
            adminView &&
            characterId
          ) {

            params.set(
              'characterId',
              characterId
            );

          }


          const response =
            await fetch(
              `${PLAYER_EVENTS_API}?${params.toString()}`,
              {
                cache:
                  'no-store',
              }
            );


          const result:
            PlayerEventsResponse =
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


          setPlayer(
            result.player ||
            null
          );


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
              : String(
                  err
                )
          );


        } finally {

          setLoading(
            false
          );

        }

      },
      [
        adminView,
        characterId,
      ]
    );


  useEffect(
    () => {

      void loadEvents();

    },
    [
      loadEvents,
    ]
  );


  const signup =
    async (
      event:
        PlayerEvent
    ) => {

      if (
        event.registration
          ?.joined
      ) {
        return;
      }


      if (
        !event.eligibility
          ?.canJoin
      ) {

        window.alert(
          getReasonText(
            event
          ) ||
          'Персонаж не проходит условия допуска.'
        );

        return;
      }


      const participantName =
        player?.name ||
        characterId ||
        'персонажа';


      const confirmed =
        window.confirm(
          adminView
            ? `Записать персонажа «${participantName}» на ивент «${event.title}»?`
            : `Записаться на ивент «${event.title}»?`
        );


      if (!confirmed) {
        return;
      }


      setSignupBusyKey(
        event.key
      );


      try {

        const body:
          {
            key: string;
            characterId?: string;
          } = {

            key:
              event.key,

          };


        /*
          characterId отправляем
          только от административного
          просмотра.

          Обычному игроку он не нужен.
        */

        if (
          adminView &&
          characterId
        ) {

          body.characterId =
            characterId;

        }


        const response =
          await fetch(
            PLAYER_EVENT_SIGNUP_API,
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify(
                  body
                ),
            }
          );


        const result:
          SignupResponse =
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
            current.map(
              item =>
                item.key ===
                event.key
                  ? {
                      ...item,

                      eligibility:
                        result.eligibility ||
                        item.eligibility,

                      registration: {

                        joined:
                          true,

                        status:
                          'registered',

                        joinedAt:
                          result.signup
                            ?.createdAt ||
                          new Date()
                            .toISOString(),

                      },
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
            : String(
                err
              )
        );


      } finally {

        setSignupBusyKey(
          ''
        );

      }
    };


  const myEvents =
    useMemo(
      () =>
        events.filter(
          event =>
            event.registration
              ?.joined
        ),
      [
        events,
      ]
    );


  const availableEvents =
    useMemo(
      () =>
        events.filter(
          event =>
            !event.registration
              ?.joined
        ),
      [
        events,
      ]
    );


  /*
    Темы Рена и Люмин
    сохраняем и на странице ивентов.
  */

  const themeCharacterId =
    player?.characterId ||
    characterId;


  const characterThemeClass =
    themeCharacterId ===
    'ren'
      ? 'player-theme-ren'
      : themeCharacterId ===
        'lumin'
        ? 'player-theme-lumin'
        : themeCharacterId ===
          'nero'
          ? ''
          : 'player-theme-default';


  return (
    <main
      className={
        `nero-cabinet nero-modern player-events-page ${characterThemeClass}`
      }
    >

      {/* =========================
          ВЕРХНЯЯ ПАНЕЛЬ
          ========================= */}

      <div className="nero-toolbar">

        <button
          className="nero-button nero-button-back"

          type="button"

          onClick={
            onBack
          }
        >

          <span aria-hidden>
            ←
          </span>

          <span>
            Назад в личное дело
          </span>

        </button>


        <div className="nero-sync-pill">

          <span className="nero-sync-dot" />

          <span>
            {
              adminView
                ? 'Реестр ивентов · режим администратора'
                : 'Реестр ивентов'
            }
          </span>

        </div>

      </div>


      {/* =========================
          ЗАГОЛОВОК
          ========================= */}

      <section className="nero-panel">

        <div className="nero-section-head">

          <div>

            <div className="nero-kicker">
              АКТИВНОСТИ
            </div>

            <h1 className="player-events-page-title">
              Ивенты
            </h1>

          </div>


          <div className="nero-section-meta">
            {
              loading
                ? '...'
                : events.length
            }
          </div>

        </div>


        <div className="nero-history">

          {
            adminView
              ? 'Здесь администратор видит ивенты выбранного персонажа и может записать именно его на опубликованное событие.'
              : 'Здесь можно записаться на опубликованные события, проверить допуск по рангу и увидеть предупреждение по уровню.'
          }

        </div>

      </section>


      {/* =========================
          ПЕРСОНАЖ
          ========================= */}

      {
        !loading &&
        player
          ? (

            <PlayerIdentity
              player={
                player
              }
            />

          )
          : null
      }


      {/* =========================
          ЗАГРУЗКА
          ========================= */}

      {
        loading
          ? (

            <section className="nero-panel">

              <div className="nero-empty">
                Загружаем ивенты и данные персонажа...
              </div>

            </section>

          )
          : null
      }


      {/* =========================
          ОШИБКА
          ========================= */}

      {
        !loading &&
        error
          ? (

            <section className="nero-panel">

              <div className="nero-empty">

                Не удалось загрузить ивенты:{' '}

                {
                  error
                }

              </div>


              <button
                className="nero-button"

                type="button"

                onClick={
                  () =>
                    void loadEvents()
                }
              >
                Повторить
              </button>

            </section>

          )
          : null
      }


      {/* =========================
          ИВЕНТЫ
          ========================= */}

      {
        !loading &&
        !error
          ? (

            <>

              {
                myEvents.length >
                0
                  ? (

                    <section className="nero-panel">

                      <div className="nero-section-head">

                        <div>

                          <div className="nero-kicker">

                            {
                              adminView
                                ? 'ИВЕНТЫ ПЕРСОНАЖА'
                                : 'МОИ ИВЕНТЫ'
                            }

                          </div>

                          <h2>
                            Участие
                          </h2>

                        </div>


                        <div className="nero-section-meta">
                          {
                            myEvents.length
                          }
                        </div>

                      </div>


                      <div className="player-event-grid">

                        {
                          myEvents.map(
                            event => (

                              <EventCard
                                key={
                                  event.key
                                }

                                event={
                                  event
                                }

                                busy={
                                  signupBusyKey ===
                                  event.key
                                }

                                onSignup={
                                  signup
                                }

                                adminView={
                                  adminView
                                }
                              />

                            )
                          )
                        }

                      </div>

                    </section>

                  )
                  : null
              }


              <section className="nero-panel">

                <div className="nero-section-head">

                  <div>

                    <div className="nero-kicker">
                      ДОСТУПНЫЕ ИВЕНТЫ
                    </div>

                    <h2>
                      Открытая запись
                    </h2>

                  </div>


                  <div className="nero-section-meta">
                    {
                      availableEvents.length
                    }
                  </div>

                </div>


                {
                  availableEvents.length >
                  0
                    ? (

                      <div className="player-event-grid">

                        {
                          availableEvents.map(
                            event => (

                              <EventCard
                                key={
                                  event.key
                                }

                                event={
                                  event
                                }

                                busy={
                                  signupBusyKey ===
                                  event.key
                                }

                                onSignup={
                                  signup
                                }

                                adminView={
                                  adminView
                                }
                              />

                            )
                          )
                        }

                      </div>

                    )
                    : (

                      <div className="nero-empty">
                        Сейчас нет новых ивентов с открытой записью.
                      </div>

                    )
                }

              </section>

            </>

          )
          : null
      }

    </main>
  );
}