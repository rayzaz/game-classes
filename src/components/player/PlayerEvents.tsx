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

const PLAYER_EVENT_LOADOUT_API =
  '/.netlify/functions/player-event-loadout';


type EventMaterial = {
  id?: string;
  name: string;
  count: number;
  description?: string;
};


type EventInventoryItem = {
  id: string;
  name: string;
  group: string;
  areaKey?: string;
  category: string;
  consumedAt?: string;
  consumedBy?: {
    login?: string;
    name?: string;
  };
};


type EventLoadout = {
  equipment:
    EventInventoryItem[];

  inventory:
    EventInventoryItem[];
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
    loadout:
      EventLoadout;
  };
};


type PlayerEventHistory = {
  key: string;
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  completedAt: string;

  finalReward: {
    experience: number;
    points: number;

    money: {
      amount: number;
      currency: string;
    };
  };

  materials: EventMaterial[];
  specialReward: string;
};


type PlayerEventsResponse = {
  ok: boolean;
  player?: PlayerSummary;
  inventoryItems?: EventInventoryItem[];
  events?: PlayerEvent[];
  history?: PlayerEventHistory[];
  total?: number;
  historyTotal?: number;
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
    loadout?: EventLoadout;
  };

  eligibility?: EventEligibility;

  error?: string;
};


type LoadoutResponse = {
  ok: boolean;
  loadout?: EventLoadout;
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



function LoadoutEditor({
  event,
  items,
  busy,
  onSave,
}: {
  event: PlayerEvent;
  items: EventInventoryItem[];
  busy: boolean;
  onSave:
    (
      event: PlayerEvent,
      itemIds: string[]
    ) => void;
}) {
  const [
    open,
    setOpen,
  ] =
    useState(false);


  const loadout =
    event.registration
      ?.loadout ||
    {
      equipment: [],
      inventory: [],
    };


  const currentItems =
    [
      ...(
        Array.isArray(
          loadout.equipment
        )
          ? loadout.equipment
          : []
      ),
      ...(
        Array.isArray(
          loadout.inventory
        )
          ? loadout.inventory
          : []
      ),
    ];


  const activeCurrentItems =
    currentItems.filter(
      item =>
        !item.consumedAt
    );


  const consumedItems =
    currentItems.filter(
      item =>
        Boolean(
          item.consumedAt
        )
    );


  const [
    selectedIds,
    setSelectedIds,
  ] =
    useState<string[]>(
      () =>
        activeCurrentItems
          .map(
            item =>
              item.id
          )
          .filter(Boolean)
    );


  useEffect(
    () => {
      setSelectedIds(
        activeCurrentItems
          .map(
            item =>
              item.id
          )
          .filter(Boolean)
      );
    },
    [
      event.key,
      event.registration
        ?.loadout,
    ]
  );


  const grouped =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            EventInventoryItem[]
          >();

        items.forEach(
          item => {
            const key =
              item.category ||
              (
                item.group ===
                  'equipment'
                  ? 'Экипировка'
                  : 'Инвентарь'
              );

            const list =
              map.get(key) ||
              [];

            list.push(
              item
            );

            map.set(
              key,
              list
            );
          }
        );

        return Array.from(
          map.entries()
        );
      },
      [
        items,
      ]
    );


  const toggleItem =
    (
      itemId:
        string
    ) => {
      setSelectedIds(
        current =>
          current.includes(
            itemId
          )
            ? current.filter(
                id =>
                  id !==
                  itemId
              )
            : [
                ...current,
                itemId,
              ]
      );
    };


  return (
    <div className="player-event-loadout">
      <div className="player-event-loadout-summary">
        <div>
          <strong>
            🎒 Снаряжение на ивент
          </strong>

          <span>
            Взято: {
              activeCurrentItems.length
            }
            {
              consumedItems.length >
              0
                ? ` · израсходовано: ${consumedItems.length}`
                : ''
            }
          </span>
        </div>

        <button
          type="button"
          className="nero-button player-event-loadout-toggle"
          onClick={() =>
            setOpen(
              value =>
                !value
            )
          }
        >
          {
            open
              ? 'Скрыть'
              : 'Выбрать вещи'
          }
        </button>
      </div>


      {
        consumedItems.length >
        0
          ? (
            <div className="player-event-loadout-consumed">
              {
                consumedItems.map(
                  item => (
                    <span
                      key={
                        item.id
                      }
                    >
                      ✓ {
                        item.name
                      }
                    </span>
                  )
                )
              }
            </div>
          )
          : null
      }


      {
        open
          ? (
            <div className="player-event-loadout-editor">
              <p>
                Предметы пока остаются в обычном инвентаре. Они исчезнут только если ивентер нажмёт «Израсходовать».
              </p>

              {
                grouped.length >
                0
                  ? grouped.map(
                      (
                        [
                          category,
                          categoryItems,
                        ]
                      ) => (
                        <div
                          className="player-event-loadout-group"
                          key={
                            category
                          }
                        >
                          <div className="player-event-loadout-group-title">
                            {
                              category
                            }
                          </div>

                          <div className="player-event-loadout-options">
                            {
                              categoryItems.map(
                                item => (
                                  <label
                                    className="player-event-loadout-option"
                                    key={
                                      item.id
                                    }
                                  >
                                    <input
                                      type="checkbox"
                                      checked={
                                        selectedIds.includes(
                                          item.id
                                        )
                                      }
                                      onChange={() =>
                                        toggleItem(
                                          item.id
                                        )
                                      }
                                      disabled={
                                        busy
                                      }
                                    />

                                    <span>
                                      {
                                        item.group ===
                                          'equipment'
                                          ? '⚔'
                                          : '🎒'
                                      }
                                    </span>

                                    <span>
                                      {
                                        item.name
                                      }
                                    </span>
                                  </label>
                                )
                              )
                            }
                          </div>
                        </div>
                      )
                    )
                  : (
                    <div className="player-event-loadout-empty">
                      В текущем Google-инвентаре нет предметов, которые можно взять на ивент.
                    </div>
                  )
              }

              <div className="player-event-loadout-actions">
                <span>
                  Выбрано: {
                    selectedIds.length
                  }
                </span>

                <button
                  type="button"
                  className="nero-button"
                  disabled={
                    busy
                  }
                  onClick={() =>
                    onSave(
                      event,
                      selectedIds
                    )
                  }
                >
                  {
                    busy
                      ? 'Сохраняем...'
                      : 'Сохранить набор'
                  }
                </button>
              </div>
            </div>
          )
          : null
      }
    </div>
  );
}


function EventCard({
  event,
  busy,
  loadoutBusy,
  inventoryItems,
  onSignup,
  onSaveLoadout,
  adminView,
}: {
  event: PlayerEvent;
  busy: boolean;
  loadoutBusy: boolean;
  inventoryItems:
    EventInventoryItem[];
  adminView: boolean;

  onSignup:
    (
      event: PlayerEvent
    ) => void;

  onSaveLoadout:
    (
      event: PlayerEvent,
      itemIds: string[]
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

              <>
                <div className="player-event-joined">

                  ✓{' '}

                  {
                    adminView
                      ? 'Персонаж уже записан на ивент'
                      : 'Вы записаны на ивент'
                  }

                </div>

                {
                  !adminView &&
                  (
                    event.status ===
                      'published' ||
                    event.status ===
                      'active'
                  )
                    ? (
                      <LoadoutEditor
                        event={
                          event
                        }
                        items={
                          inventoryItems
                        }
                        busy={
                          loadoutBusy
                        }
                        onSave={
                          onSaveLoadout
                        }
                      />
                    )
                    : null
                }
              </>

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


function HistoryCard({
  event,
}: {
  event: PlayerEventHistory;
}) {
  const materials =
    Array.isArray(
      event.materials
    )
      ? event.materials
      : [];

  return (
    <article className="player-event-card player-event-history-card">

      <div className="player-event-card-head">

        <div>

          <div className="player-event-status-row">

            <span className="player-event-status player-event-status-completed">
              ✓ Завершён
            </span>

          </div>

          <h3>
            {
              event.title
            }
          </h3>

        </div>

      </div>


      {
        event.description
          ? (

            <p className="player-event-description">
              {
                event.description
              }
            </p>

          )
          : null
      }


      <div className="player-event-info-grid">

        <div>

          <span>
            Завершён
          </span>

          <strong>
            {
              formatDate(
                event.completedAt
              )
            }
          </strong>

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

      </div>


      <div className="player-event-reward-title">
        Получено
      </div>


      <div className="player-event-rewards">

        {
          event.finalReward
            .experience > 0
            ? (

              <span>
                ✦ +
                {
                  formatNumber(
                    event.finalReward
                      .experience
                  )
                }{' '}
                опыта
              </span>

            )
            : null
        }


        {
          event.finalReward
            .points > 0
            ? (

              <span>
                ★ +
                {
                  formatNumber(
                    event.finalReward
                      .points
                  )
                }{' '}
                баллов прокачки
              </span>

            )
            : null
        }


        {
          event.finalReward
            .money.amount > 0
            ? (

              <span>
                💰 +
                {
                  formatNumber(
                    event.finalReward
                      .money.amount
                  )
                }{' '}
                {
                  event.finalReward
                    .money.currency ||
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


        {
          event.specialReward
            ? (

              <span className="player-event-special-reward">
                ✧ {
                  event.specialReward
                }
              </span>

            )
            : null
        }


        {
          event.finalReward
            .experience <= 0 &&
          event.finalReward
            .points <= 0 &&
          event.finalReward
            .money.amount <= 0 &&
          materials.length === 0 &&
          !event.specialReward
            ? (

              <span>
                Награды не указаны
              </span>

            )
            : null
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
    history,
    setHistory,
  ] =
    useState<
      PlayerEventHistory[]
    >(
      []
    );


  const [
    inventoryItems,
    setInventoryItems,
  ] =
    useState<
      EventInventoryItem[]
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


  const [
    loadoutBusyKey,
    setLoadoutBusyKey,
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


          setHistory(
            Array.isArray(
              result.history
            )
              ? result.history
              : []
          );


          setInventoryItems(
            Array.isArray(
              result.inventoryItems
            )
              ? result.inventoryItems
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

                        loadout:
                          result.signup
                            ?.loadout ||
                          {
                            equipment: [],
                            inventory: [],
                          },

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



  const saveLoadout =
    async (
      event:
        PlayerEvent,
      itemIds:
        string[]
    ) => {
      setLoadoutBusyKey(
        event.key
      );


      try {
        const body:
          {
            key: string;
            itemIds: string[];
            characterId?: string;
          } = {
            key:
              event.key,
            itemIds,
          };


        if (
          adminView &&
          characterId
        ) {
          body.characterId =
            characterId;
        }


        const response =
          await fetch(
            PLAYER_EVENT_LOADOUT_API,
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
          LoadoutResponse =
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


        const nextLoadout =
          result.loadout ||
          {
            equipment: [],
            inventory: [],
          };


        setEvents(
          current =>
            current.map(
              item =>
                item.key ===
                event.key
                  ? {
                      ...item,

                      registration: {
                        ...item.registration,
                        loadout:
                          nextLoadout,
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
        setLoadoutBusyKey(
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
              : 'Здесь можно записаться на опубликованные события, проверить допуск по рангу и посмотреть историю уже завершённых ивентов.'
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

                                loadoutBusy={
                                  loadoutBusyKey ===
                                  event.key
                                }

                                inventoryItems={
                                  inventoryItems
                                }

                                onSignup={
                                  signup
                                }

                                onSaveLoadout={
                                  saveLoadout
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

                                loadoutBusy={
                                  loadoutBusyKey ===
                                  event.key
                                }

                                inventoryItems={
                                  inventoryItems
                                }

                                onSignup={
                                  signup
                                }

                                onSaveLoadout={
                                  saveLoadout
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


              <section className="nero-panel">

                <div className="nero-section-head">

                  <div>

                    <div className="nero-kicker">
                      ИСТОРИЯ
                    </div>

                    <h2>
                      Завершённые ивенты
                    </h2>

                  </div>


                  <div className="nero-section-meta">
                    {
                      history.length
                    }
                  </div>

                </div>


                {
                  history.length >
                  0
                    ? (

                      <div className="player-event-grid">

                        {
                          history.map(
                            event => (

                              <HistoryCard
                                key={
                                  event.key
                                }

                                event={
                                  event
                                }
                              />

                            )
                          )
                        }

                      </div>

                    )
                    : (

                      <div className="nero-empty">
                        У персонажа пока нет завершённых ивентов с сохранённым итоговым отчётом.
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