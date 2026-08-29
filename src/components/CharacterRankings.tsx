import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import './character-rankings.css';


type BattleStats = {
  attack: number;
  defense: number;
  healing: number;
  buff: number;
  debuff: number;
  potions: number;
  summon: number;
  movement: number;
  speedModifier: number;
  physical: number;
  other: number;
};


type PchkStat = {
  current: number;
  max: number;
  percent: number;
};


type PchkStats = {
  protection: PchkStat;
  senses: PchkStat;
  control: PchkStat;
  overall: number;
};


type FinanceStats = {
  wealth: number;
  bank: number;
};


type RankingCharacter = {
  id: string;
  name: string;
  rank: string;
  squad: string;
  className: string;
  magicType: string;
  portrait: string;
  level: number;
  battle: BattleStats;
  pchk: PchkStats;
  finance: FinanceStats;
};


type RankingResponse = {
  ok: boolean;
  characters?: RankingCharacter[];
  count?: number;
  unavailable?: number;
  updatedAt?: string;
  error?: string;
};


type MetricGroupKey =
  | 'general'
  | 'battle'
  | 'pchk'
  | 'finance';


type MetricKey =
  | 'level'
  | 'attack'
  | 'defense'
  | 'healing'
  | 'buff'
  | 'debuff'
  | 'potions'
  | 'summon'
  | 'movement'
  | 'physical'
  | 'pchkOverall'
  | 'protection'
  | 'senses'
  | 'control'
  | 'wealth'
  | 'bank';


type MetricDef = {
  key: MetricKey;
  group: MetricGroupKey;
  label: string;
  short: string;
  note?: string;
};


const GROUPS: Array<{
  key: MetricGroupKey;
  label: string;
}> = [
  { key: 'general', label: 'Общее' },
  { key: 'battle', label: 'Бой' },
  { key: 'pchk', label: 'ПЧК' },
  { key: 'finance', label: 'Финансы' },
];


const METRICS: MetricDef[] = [
  {
    key: 'level',
    group: 'general',
    label: 'Уровень',
    short: 'УР',
  },
  {
    key: 'attack',
    group: 'battle',
    label: 'Атака',
    short: 'АТ',
  },
  {
    key: 'defense',
    group: 'battle',
    label: 'Защита',
    short: 'ЗЩ',
  },
  {
    key: 'healing',
    group: 'battle',
    label: 'Лечение',
    short: 'ЛЧ',
  },
  {
    key: 'buff',
    group: 'battle',
    label: 'Бафф',
    short: 'БФ',
  },
  {
    key: 'debuff',
    group: 'battle',
    label: 'Дебафф',
    short: 'ДБ',
  },
  {
    key: 'potions',
    group: 'battle',
    label: 'Зелья',
    short: 'ЗЛ',
  },
  {
    key: 'summon',
    group: 'battle',
    label: 'Призыв',
    short: 'ПР',
  },
  {
    key: 'movement',
    group: 'battle',
    label: 'Подвижность',
    short: 'ПД',
  },
  {
    key: 'physical',
    group: 'battle',
    label: 'Физ. сила',
    short: 'ФС',
  },
  {
    key: 'pchkOverall',
    group: 'pchk',
    label: 'ПЧК общий',
    short: 'ПЧК',
    note: 'Среднее развитие Покрова, Чувства и Контроля в процентах.',
  },
  {
    key: 'protection',
    group: 'pchk',
    label: 'Покров',
    short: 'П',
  },
  {
    key: 'senses',
    group: 'pchk',
    label: 'Чувство',
    short: 'Ч',
  },
  {
    key: 'control',
    group: 'pchk',
    label: 'Контроль',
    short: 'К',
  },
  {
    key: 'wealth',
    group: 'finance',
    label: 'Богатство',
    short: 'Ю',
    note: 'Текущие юли персонажа.',
  },
  {
    key: 'bank',
    group: 'finance',
    label: 'Банк',
    short: 'БК',
    note: 'Накопления персонажа.',
  },
];


const GROUP_DEFAULTS: Record<MetricGroupKey, MetricKey> = {
  general: 'level',
  battle: 'attack',
  pchk: 'pchkOverall',
  finance: 'wealth',
};


const BATTLE_METRICS =
  METRICS.filter(
    metric =>
      metric.group === 'battle'
  );


function metricValue(
  character: RankingCharacter,
  key: MetricKey
) {
  switch (key) {
    case 'level':
      return Number(character.level || 0);

    case 'attack':
    case 'defense':
    case 'healing':
    case 'buff':
    case 'debuff':
    case 'potions':
    case 'summon':
    case 'movement':
    case 'physical':
      return Number(character.battle?.[key] || 0);

    case 'pchkOverall':
      return Number(character.pchk?.overall || 0);

    case 'protection':
      return Number(character.pchk?.protection?.current || 0);

    case 'senses':
      return Number(character.pchk?.senses?.current || 0);

    case 'control':
      return Number(character.pchk?.control?.current || 0);

    case 'wealth':
      return Number(character.finance?.wealth || 0);

    case 'bank':
      return Number(character.finance?.bank || 0);

    default:
      return 0;
  }
}


function formatValue(
  value: number,
  maximumFractionDigits = 2
) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat(
    'ru-RU',
    {
      maximumFractionDigits,
    }
  ).format(value);
}


function pchkContext(
  character: RankingCharacter
) {
  const p = character.pchk;

  return [
    `П ${formatValue(p?.protection?.current || 0, 0)}/${formatValue(p?.protection?.max || 100, 0)}`,
    `Ч ${formatValue(p?.senses?.current || 0, 0)}/${formatValue(p?.senses?.max || 200, 0)}`,
    `К ${formatValue(p?.control?.current || 0, 0)}/${formatValue(p?.control?.max || 500, 0)}`,
  ].join(' · ');
}


function metricPresentation(
  character: RankingCharacter,
  key: MetricKey
) {
  const value = metricValue(character, key);

  if (key === 'pchkOverall') {
    return {
      main: `${formatValue(value, 1)}%`,
      sub: pchkContext(character),
    };
  }

  if (
    key === 'protection' ||
    key === 'senses' ||
    key === 'control'
  ) {
    const stat = character.pchk?.[key];

    return {
      main: formatValue(value, 0),
      sub: `из ${formatValue(stat?.max || 0, 0)} · ${formatValue(stat?.percent || 0, 1)}%`,
    };
  }

  if (
    key === 'wealth' ||
    key === 'bank'
  ) {
    return {
      main: formatValue(value, 0),
      sub: 'юли',
    };
  }

  return {
    main: formatValue(value),
    sub: METRICS.find(item => item.key === key)?.label || '',
  };
}


function strongestMetrics(
  character: RankingCharacter
) {
  return BATTLE_METRICS
    .map(
      metric => ({
        ...metric,
        value:
          metricValue(
            character,
            metric.key
          ),
      })
    )
    .filter(
      metric =>
        metric.value > 0
    )
    .sort(
      (a, b) =>
        b.value -
        a.value
    )
    .slice(0, 3);
}


function Portrait({
  character,
}: {
  character: RankingCharacter;
}) {
  const [failed, setFailed] =
    useState(false);

  const initial =
    character.name
      .trim()
      .charAt(0)
      .toUpperCase() ||
    '?';

  if (
    !character.portrait ||
    failed
  ) {
    return (
      <span className="rankings-avatar-fallback">
        {initial}
      </span>
    );
  }

  return (
    <img
      src={character.portrait}
      alt=""
      loading="lazy"
      onError={() =>
        setFailed(true)
      }
    />
  );
}


type Props = {
  ownCharacterId?: string;
  onBack: () => void;
};


export default function CharacterRankings({
  ownCharacterId,
  onBack,
}: Props) {
  const [characters, setCharacters] =
    useState<RankingCharacter[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [updatedAt, setUpdatedAt] =
    useState('');

  const [unavailable, setUnavailable] =
    useState(0);

  const [group, setGroup] =
    useState<MetricGroupKey>('general');

  const [metric, setMetric] =
    useState<MetricKey>('level');

  const [squad, setSquad] =
    useState('all');


  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const response =
        await fetch(
          '/.netlify/functions/character-rankings',
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              accept: 'application/json',
            },
          }
        );

      const payload =
        await response.json() as RankingResponse;

      if (
        !response.ok ||
        payload.ok !== true
      ) {
        throw new Error(
          payload.error ||
          'Не удалось загрузить рейтинг'
        );
      }

      setCharacters(
        Array.isArray(payload.characters)
          ? payload.characters
          : []
      );

      setUpdatedAt(
        payload.updatedAt ||
        ''
      );

      setUnavailable(
        Number(
          payload.unavailable ||
          0
        )
      );

    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить рейтинг'
      );

    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    void load();
  }, []);


  const squads =
    useMemo(
      () =>
        Array.from(
          new Set(
            characters
              .map(
                character =>
                  character.squad.trim()
              )
              .filter(Boolean)
          )
        )
          .sort(
            (a, b) =>
              a.localeCompare(
                b,
                'ru'
              )
          ),
      [characters]
    );


  const groupMetrics =
    useMemo(
      () =>
        METRICS.filter(
          item =>
            item.group === group
        ),
      [group]
    );


  const ranked =
    useMemo(
      () =>
        characters
          .filter(
            character =>
              squad === 'all' ||
              character.squad === squad
          )
          .slice()
          .sort(
            (a, b) => {
              const difference =
                metricValue(b, metric) -
                metricValue(a, metric);

              if (difference !== 0) {
                return difference;
              }

              return a.name.localeCompare(
                b.name,
                'ru'
              );
            }
          ),
      [
        characters,
        metric,
        squad,
      ]
    );


  const currentMetric =
    METRICS.find(
      item =>
        item.key === metric
    ) ||
    METRICS[0];


  const metricHint =
    currentMetric.note ||
    (group === 'battle'
      ? 'Фактический показатель из боевого профиля персонажа.'
      : 'Сортировка по текущему уровню персонажа.');


  const ownPlace =
    ownCharacterId
      ? ranked.findIndex(
          character =>
            character.id ===
            ownCharacterId
              .trim()
              .toLowerCase()
        ) + 1
      : 0;


  const changeGroup =
    (nextGroup: MetricGroupKey) => {
      setGroup(nextGroup);
      setMetric(
        GROUP_DEFAULTS[nextGroup]
      );
    };


  return (
    <main className="rankings-shell">
      <div className="rankings-ambient" aria-hidden="true" />

      <div className="rankings-inner">
        <header className="rankings-header">
          <button
            type="button"
            className="rankings-back"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
            Главная
          </button>

          <span className="rankings-privacy">
            Без доступа к анкетам
          </span>
        </header>

        <section className="rankings-title-row">
          <div>
            <span className="rankings-kicker">
              СТАТИСТИКА МАГОВ
            </span>

            <h1>
              Рейтинг персонажей
            </h1>

            <p>
              Кто в чём силён: боевые показатели, ПЧК и игровая экономика — без переходов в чужие личные дела.
            </p>
          </div>

          {!loading && ownPlace > 0 ? (
            <div className="rankings-own-place">
              <span>Ваше место</span>
              <strong>#{ownPlace}</strong>
              <small>{currentMetric.label}</small>
            </div>
          ) : null}
        </section>

        <section className="rankings-controls" aria-label="Настройки рейтинга">
          <div
            className="rankings-group-switch"
            role="tablist"
            aria-label="Раздел рейтинга"
          >
            {GROUPS.map(
              item => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={item.key === group}
                  className={
                    item.key === group
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    changeGroup(item.key)
                  }
                >
                  {item.label}
                </button>
              )
            )}
          </div>

          <div className="rankings-control-selects">
            <label className="rankings-select-filter">
              <span>Показатель</span>
              <select
                value={metric}
                onChange={event =>
                  setMetric(
                    event.target.value as MetricKey
                  )
                }
              >
                {groupMetrics.map(
                  item => (
                    <option
                      key={item.key}
                      value={item.key}
                    >
                      {item.label}
                    </option>
                  )
                )}
              </select>
            </label>

            {squads.length > 1 ? (
              <label className="rankings-select-filter rankings-squad-filter">
                <span>Отряд</span>
                <select
                  value={squad}
                  onChange={event =>
                    setSquad(
                      event.target.value
                    )
                  }
                >
                  <option value="all">
                    Все отряды
                  </option>

                  {squads.map(
                    squadName => (
                      <option
                        key={squadName}
                        value={squadName}
                      >
                        {squadName}
                      </option>
                    )
                  )}
                </select>
              </label>
            ) : null}
          </div>

          <div className="rankings-control-note">
            <b>{currentMetric.short}</b>
            <span>{metricHint}</span>
          </div>
        </section>

        {loading ? (
          <section className="rankings-state">
            <span className="rankings-loader" aria-hidden="true" />
            <strong>Собираем показатели персонажей…</strong>
          </section>
        ) : error ? (
          <section className="rankings-state rankings-state-error">
            <strong>{error}</strong>
            <button
              type="button"
              onClick={() =>
                void load()
              }
            >
              Повторить
            </button>
          </section>
        ) : ranked.length === 0 ? (
          <section className="rankings-state">
            <strong>Для этого фильтра пока нет персонажей.</strong>
          </section>
        ) : (
          <>
            <section
              className="rankings-podium"
              aria-label={`Лидеры: ${currentMetric.label}`}
            >
              {ranked
                .slice(0, 3)
                .map(
                  (character, index) => {
                    const presentation =
                      metricPresentation(
                        character,
                        metric
                      );

                    return (
                      <article
                        key={character.id}
                        className={
                          character.id === ownCharacterId?.trim().toLowerCase()
                            ? 'rankings-leader-card is-own'
                            : 'rankings-leader-card'
                        }
                      >
                        <div className="rankings-leader-rank">
                          {index + 1}
                        </div>

                        <div className="rankings-leader-avatar">
                          <Portrait character={character} />
                        </div>

                        <div className="rankings-leader-copy">
                          <span className="rankings-leader-place">
                            #{index + 1} · {currentMetric.label}
                          </span>

                          <h2>{character.name}</h2>

                          <p>
                            {[
                              character.className,
                              character.level > 0 ? `ур. ${character.level}` : '',
                              character.squad,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Персонаж'}
                          </p>
                        </div>

                        <div className="rankings-leader-value">
                          <strong>
                            {presentation.main}
                          </strong>
                          <span>{presentation.sub}</span>
                        </div>
                      </article>
                    );
                  }
                )}
            </section>

            <section className="rankings-board">
              <div className="rankings-board-head">
                <div>
                  <span className="rankings-kicker">
                    ВСЕ ПЕРСОНАЖИ
                  </span>
                  <h2>{currentMetric.label}</h2>
                  <p>{metricHint}</p>
                </div>

                <span className="rankings-count">
                  {ranked.length}
                </span>
              </div>

              <div className="rankings-list">
                {ranked.map(
                  (character, index) => {
                    const strengths =
                      strongestMetrics(character);

                    const presentation =
                      metricPresentation(
                        character,
                        metric
                      );

                    const isOwn =
                      character.id ===
                      ownCharacterId
                        ?.trim()
                        .toLowerCase();

                    return (
                      <article
                        key={character.id}
                        className={
                          isOwn
                            ? 'rankings-row is-own'
                            : 'rankings-row'
                        }
                      >
                        <div className="rankings-position">
                          {index + 1}
                        </div>

                        <div className="rankings-row-avatar">
                          <Portrait character={character} />
                        </div>

                        <div className="rankings-row-main">
                          <div className="rankings-row-name">
                            <strong>{character.name}</strong>
                            {isOwn ? (
                              <span>Вы</span>
                            ) : null}
                          </div>

                          <p>
                            {[
                              character.rank,
                              character.className,
                              character.level > 0 ? `ур. ${character.level}` : '',
                              character.squad,
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </p>

                          {group === 'battle' && strengths.length > 0 ? (
                            <div className="rankings-strengths" aria-label="Сильные показатели">
                              {strengths.map(
                                strength => (
                                  <span key={strength.key}>
                                    {strength.label}
                                    <b>{formatValue(strength.value)}</b>
                                  </span>
                                )
                              )}
                            </div>
                          ) : null}

                          {group === 'pchk' && metric !== 'pchkOverall' ? (
                            <div className="rankings-inline-context">
                              {pchkContext(character)}
                            </div>
                          ) : null}
                        </div>

                        <div className="rankings-row-value">
                          <strong>{presentation.main}</strong>
                          <span>{presentation.sub}</span>
                        </div>
                      </article>
                    );
                  }
                )}
              </div>
            </section>
          </>
        )}

        {!loading && !error ? (
          <footer className="rankings-footer">
            <span>
              {updatedAt
                ? `Обновлено ${new Date(updatedAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Рейтинг загружен'}
            </span>

            {unavailable > 0 ? (
              <span>
                Временно без данных: {unavailable}
              </span>
            ) : null}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
