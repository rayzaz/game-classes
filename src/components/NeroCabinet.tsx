// src/components/NeroCabinet.tsx

import React, { useEffect, useState } from 'react';

const CABINET_API =
  '/.netlify/functions/character-data';

type Props = {
  onBack: () => void;
};

type ClassSkill = {
  name: string;
  description: string;
  unlockLevel: number;
  unlocked: boolean;
  progress: number;
};

type SpecialSkill = {
  name: string;
  description: string;
};

type PersonalSpell = {
  name: string;
  description: string;
};

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

type RadarPoint = {
  label: string;
  icon: string;
  actual: number;
  top: number;
  percent: number;
};

type InventoryData = {
  equipment: {
    headNeck: string[];
    torso: string[];
    shouldersArms: string[];
    belt: string[];
    back: string[];
    legsShoes: string[];
  };
  storage: {
    potions: string[];
    amulets: string[];
    securities: string[];
    miscellaneous: string[];
  };
};

type NeroData = {
  ok: boolean;
  character: {
    name: string;
    player: string;
    rank: string;
    squad: string;
    className: string;
    magicType: string;
  };
  profile?: {
    height: string;
    weight: string;
    age: string;
    build: string;
    history: string;
  };
  level: {
    current: number;
    experience: number;
    progress: number;
  };
  health: {
    current: number;
    max: number;
  };
  mana: {
    current: number;
    max: number;
  };
  battle: BattleStats;
  battleRadar: RadarPoint[];
  classSkills: ClassSkill[];
  specialSkills: SpecialSkill[];
  spells: PersonalSpell[];
  inventory: InventoryData;
  money: {
    juli: number;
    salary: number;
    savings: number;
    extraIncome: number;
    extraExpenses: number;
    balance: number;
  };
  updatedAt?: string;
};

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

function SectionTitle({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="nero-section-head">
      <div>
        <div className="nero-kicker">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      {meta ? <div className="nero-section-meta">{meta}</div> : null}
    </div>
  );
}

function BattleCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number;
}) {
  return (
    <div className="nero-battle-card">
      <div className="nero-battle-label">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function BattleRadar({ points }: { points: RadarPoint[] }) {
  const items = points ?? [];

  if (!items.length) {
    return <div className="nero-empty">Нет данных для диаграммы.</div>;
  }

  const width = 680;
  const height = 570;
  const cx = 340;
  const cy = 285;
  const radius = 190;
  const axisCount = items.length;

  const getPoint = (index: number, ratio: number, extra = 0) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / axisCount;
    const r = radius * ratio + extra;

    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  };

  const polygon = items
    .map((item, index) => {
      const ratio = Math.max(0, Math.min(1, (item.percent || 0) / 100));
      const point = getPoint(index, ratio);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  return (
    <div className="nero-radar-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Нормализованная диаграмма боевого профиля Неро"
        className="nero-radar"
      >
        {[0.25, 0.5, 0.75, 1].map(ring => {
          const ringPoints = items
            .map((_, index) => {
              const p = getPoint(index, ring);
              return `${p.x},${p.y}`;
            })
            .join(' ');

          return (
            <polygon
              key={ring}
              points={ringPoints}
              fill="none"
              stroke="currentColor"
              strokeOpacity={ring === 1 ? 0.32 : 0.13}
              strokeWidth={ring === 1 ? 1.5 : 1}
            />
          );
        })}

        {items.map((_, index) => {
          const end = getPoint(index, 1);
          return (
            <line
              key={`axis-${index}`}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              stroke="currentColor"
              strokeOpacity="0.14"
            />
          );
        })}

        <polygon
          points={polygon}
          fill="currentColor"
          fillOpacity="0.14"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {items.map((item, index) => {
          const ratio = Math.max(0, Math.min(1, (item.percent || 0) / 100));
          const p = getPoint(index, ratio);

          return (
            <circle
              key={`dot-${index}`}
              cx={p.x}
              cy={p.y}
              r="4.5"
              fill="currentColor"
            />
          );
        })}

        {items.map((item, index) => {
          const p = getPoint(index, 1, 54);
          const anchor =
            p.x < cx - 30 ? 'end' : p.x > cx + 30 ? 'start' : 'middle';

          return (
            <text
              key={item.label}
              x={p.x}
              y={p.y}
              textAnchor={anchor}
              fill="currentColor"
              fontSize="13"
            >
              <tspan x={p.x} dy="0">
                {item.icon} {item.label}
              </tspan>
              <tspan x={p.x} dy="17" fontWeight="700">
                {formatNumber(item.percent, 1)}%
              </tspan>
            </text>
          );
        })}

        <circle
          cx={cx}
          cy={cy}
          r="27"
          className="nero-radar-core"
        />
        <text
          x={cx}
          y={cy + 7}
          textAnchor="middle"
          className="nero-radar-core-symbol"
        >
          ✦
        </text>
      </svg>

      <div className="nero-radar-note">
        Каждая ось нормализована относительно системного TOP своего показателя.
      </div>
    </div>
  );
}

function InventoryCategory({
  icon,
  title,
  items,
}: {
  icon: string;
  title: string;
  items: string[];
}) {
  return (
    <article className="nero-inventory-card">
      <div className="nero-inventory-title">
        <span>{icon}</span>
        <span>{title}</span>
      </div>

      {items.length > 0 ? (
        <div className="nero-item-list">
          {items.map((item, index) => (
            <div className="nero-item" key={`${title}-${item}-${index}`}>
              {item}
            </div>
          ))}
        </div>
      ) : (
        <div className="nero-empty">Пусто</div>
      )}
    </article>
  );
}

function MoneyCard({
  label,
  value,
  prefix = '',
}: {
  label: string;
  value: number;
  prefix?: string;
}) {
  return (
    <article className="nero-money-card">
      <span>{label}</span>
      <strong>
        {prefix}
        {formatNumber(value, 0)}
      </strong>
      <small>юли</small>
    </article>
  );
}

export default function NeroCabinet({ onBack }: Props) {
  const [data, setData] = useState<NeroData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${CABINET_API}?t=${Date.now()}`, {
      cache: 'no-store',
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        return response.json();
      })
      .then(result => {
        if (!result.ok) {
          throw new Error(result.error || 'Таблица вернула ошибку');
        }
        setData(result);
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message || String(err));
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <main className="nero-cabinet nero-modern nero-state-screen">
        <div className="nero-loading-symbol">✦</div>
        <h2>Получаем личное дело мага...</h2>
        <p>Синхронизация с реестром ГосМАГ-услуг</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="nero-cabinet nero-modern nero-state-screen">
        <h1>Не удалось открыть личное дело</h1>
        <p>{error}</p>
        <button className="nero-button" onClick={onBack}>
          ← Назад
        </button>
      </main>
    );
  }

  const profile = data.profile ?? {
    height: '',
    weight: '',
    age: '',
    build: '',
    history: '',
  };

  const classSkills = data.classSkills ?? [];
  const specialSkills = data.specialSkills ?? [];
  const spells = data.spells ?? [];

  const inventory: InventoryData = data.inventory ?? {
    equipment: {
      headNeck: [],
      torso: [],
      shouldersArms: [],
      belt: [],
      back: [],
      legsShoes: [],
    },
    storage: {
      potions: [],
      amulets: [],
      securities: [],
      miscellaneous: [],
    },
  };

  const hpPercent =
    data.health.max > 0
      ? Math.min(100, (data.health.current / data.health.max) * 100)
      : 0;

  const manaPercent =
    data.mana.max > 0
      ? Math.min(100, (data.mana.current / data.mana.max) * 100)
      : 0;

  const unlockedClassSkills = classSkills.filter(skill => skill.unlocked);
  const nextClassSkill = classSkills.find(skill => !skill.unlocked);

  return (
    <main className="nero-cabinet nero-modern">
      <div className="nero-toolbar">
        <button className="nero-button nero-button-back" onClick={onBack}>
          <span aria-hidden>←</span>
          <span>Назад в каталог</span>
        </button>

        <div className="nero-sync-pill">
          <span className="nero-sync-dot" />
          <span>Данные синхронизированы</span>
        </div>
      </div>

      <section className="nero-hero">
        <div className="nero-portrait-shell">
          <img src="/cards/characters/nero.jpg" alt="Неро Нуар" />
          <div className="nero-portrait-glow" aria-hidden />
        </div>

        <div className="nero-identity">
          <div className="nero-kicker">ГОСМАГ-УСЛУГИ · ЛИЧНОЕ ДЕЛО</div>
          <h1>{data.character.name}</h1>
          <p className="nero-player">Игрок: {data.character.player}</p>

          <div className="nero-tags">
            <span>{data.character.rank}</span>
            <span>🏰 {data.character.squad}</span>
            <span>{data.character.className}</span>
            {data.character.magicType ? <span>✦ {data.character.magicType}</span> : null}
          </div>

          <div className="nero-profile-grid">
            {[
              ['Рост', profile.height],
              ['Вес', profile.weight],
              ['Возраст', profile.age],
              ['Телосложение', profile.build],
            ].map(([label, value]) => (
              <div className="nero-profile-cell" key={label}>
                <span>{label}</span>
                <strong>{value || '—'}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="nero-level-card">
          <span>Уровень</span>
          <strong>{data.level.current}</strong>
          <small>{data.level.progress.toFixed(2)}% до следующего</small>
        </div>
      </section>

      {profile.history ? (
        <section className="nero-panel">
          <SectionTitle eyebrow="ЛИЧНОЕ ДЕЛО" title="История персонажа" />
          <div className="nero-history">{profile.history}</div>
        </section>
      ) : null}

      <section className="nero-metrics-grid">
        <article className="nero-metric-card nero-metric-hp">
          <div className="nero-metric-top">
            <span>❤️ Здоровье</span>
            <strong>
              {formatNumber(data.health.current, 0)} / {formatNumber(data.health.max, 0)}
            </strong>
          </div>
          <div className="nero-progress-track">
            <div className="nero-progress-fill nero-progress-hp" style={{ width: `${hpPercent}%` }} />
          </div>
          <small>{hpPercent.toFixed(1)}%</small>
        </article>

        <article className="nero-metric-card nero-metric-mana">
          <div className="nero-metric-top">
            <span>◆ Мана</span>
            <strong>
              {formatNumber(data.mana.current, 0)} / {formatNumber(data.mana.max, 0)}
            </strong>
          </div>
          <div className="nero-progress-track">
            <div className="nero-progress-fill nero-progress-mana" style={{ width: `${manaPercent}%` }} />
          </div>
          <small>{manaPercent.toFixed(1)}%</small>
        </article>

        <article className="nero-metric-card nero-metric-exp">
          <div className="nero-metric-top">
            <span>✦ Опыт</span>
            <strong>{formatNumber(data.level.experience, 0)}</strong>
          </div>
          <div className="nero-progress-track">
            <div
              className="nero-progress-fill nero-progress-exp"
              style={{ width: `${data.level.progress}%` }}
            />
          </div>
          <small>{data.level.progress.toFixed(2)}%</small>
        </article>
      </section>

      <section className="nero-panel">
        <SectionTitle eyebrow="БОЕВАЯ СИСТЕМА" title="Боевые показатели" />

        <div className="nero-battle-layout">
          <BattleRadar points={data.battleRadar ?? []} />

          <div className="nero-battle-grid">
            <BattleCard icon="💥" label="Атака заклинанием" value={data.battle.attack} />
            <BattleCard icon="🛡️" label="Защита заклинанием" value={data.battle.defense} />
            <BattleCard icon="💉" label="Лечение" value={data.battle.healing} />
            <BattleCard icon="✔️" label="Баф" value={data.battle.buff} />
            <BattleCard icon="❌" label="Дебаф" value={data.battle.debuff} />
            <BattleCard icon="🧪" label="Зелья" value={data.battle.potions} />
            <BattleCard icon="🐲" label="Призыв" value={data.battle.summon} />
            <BattleCard icon="🏃" label="Перемещение" value={data.battle.movement} />
            <BattleCard icon="👣" label="Модификатор скорости" value={data.battle.speedModifier} />
            <BattleCard icon="💪" label="Физическое воздействие" value={data.battle.physical} />
            <BattleCard icon="💫" label="Прочее" value={data.battle.other} />
          </div>
        </div>
      </section>

      <section className="nero-panel">
        <SectionTitle
          eyebrow="КЛАССОВОЕ РАЗВИТИЕ"
          title="Навыки класса"
          meta={`Открыто: ${unlockedClassSkills.length}`}
        />

        <div className="nero-skill-grid">
          {unlockedClassSkills.map(skill => (
            <article className="nero-skill-card" key={skill.name}>
              <div className="nero-skill-top">
                <span>Ур. {skill.unlockLevel}</span>
                <span className="nero-status-good">✓ Открыто</span>
              </div>
              <h3>{skill.name}</h3>
              <p>{skill.description}</p>
            </article>
          ))}
        </div>

        {nextClassSkill ? (
          <article className="nero-next-card">
            <div className="nero-next-copy">
              <div>
                <span className="nero-kicker">
                  СЛЕДУЮЩИЙ НАВЫК · УРОВЕНЬ {nextClassSkill.unlockLevel}
                </span>
                <h3>{nextClassSkill.name}</h3>
                <p>{nextClassSkill.description}</p>
              </div>
              <strong>{nextClassSkill.progress.toFixed(2)}%</strong>
            </div>
            <div className="nero-progress-track">
              <div
                className="nero-progress-fill nero-progress-exp"
                style={{ width: `${nextClassSkill.progress}%` }}
              />
            </div>
          </article>
        ) : null}
      </section>

      <section className="nero-panel">
        <SectionTitle
          eyebrow="ВНЕ КЛАССА"
          title="Особые навыки"
          meta={specialSkills.length}
        />

        {specialSkills.length > 0 ? (
          <div className="nero-skill-grid">
            {specialSkills.map((skill, index) => (
              <article className="nero-skill-card" key={`${skill.name}-${index}`}>
                <div className="nero-skill-top">
                  <span>Особый навык</span>
                  <span className="nero-status-good">✓ Получен</span>
                </div>
                <h3>{skill.name}</h3>
                {skill.description ? <p>{skill.description}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="nero-empty">Особых навыков нет.</div>
        )}
      </section>

      <section className="nero-panel">
        <SectionTitle eyebrow="ГРИМУАР" title="Заклинания" meta={spells.length} />

        {spells.length > 0 ? (
          <div className="nero-skill-grid">
            {spells.map((spell, index) => (
              <article className="nero-skill-card nero-spell-card-modern" key={`${spell.name}-${index}`}>
                <div className="nero-skill-top">
                  <span>✦ Заклинание</span>
                </div>
                <h3>{spell.name}</h3>
                <p>{spell.description || 'Описание не указано.'}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="nero-empty">Заклинания не найдены.</div>
        )}
      </section>

      <section className="nero-panel">
        <SectionTitle eyebrow="СНАРЯЖЕНИЕ" title="Экипировка" />
        <div className="nero-inventory-grid">
          <InventoryCategory icon="🎩" title="Голова и шея" items={inventory.equipment.headNeck} />
          <InventoryCategory icon="👕" title="Торс" items={inventory.equipment.torso} />
          <InventoryCategory icon="🧤" title="Плечи и руки" items={inventory.equipment.shouldersArms} />
          <InventoryCategory icon="🪢" title="Пояс" items={inventory.equipment.belt} />
          <InventoryCategory icon="🧥" title="Спина" items={inventory.equipment.back} />
          <InventoryCategory icon="🥾" title="Ноги и обувь" items={inventory.equipment.legsShoes} />
        </div>
      </section>

      <section className="nero-panel">
        <SectionTitle eyebrow="ИНВЕНТАРЬ" title="Хранилище" />
        <div className="nero-inventory-grid nero-inventory-grid-4">
          <InventoryCategory icon="🧪" title="Зелья" items={inventory.storage.potions} />
          <InventoryCategory icon="📿" title="Амулеты" items={inventory.storage.amulets} />
          <InventoryCategory icon="📜" title="Ценные бумаги" items={inventory.storage.securities} />
          <InventoryCategory icon="🎒" title="Всякая всячина" items={inventory.storage.miscellaneous} />
        </div>
      </section>

      <section className="nero-panel">
        <SectionTitle eyebrow="КАЗНА" title="Финансы" meta="Общий реестр" />
        <div className="nero-money-grid">
          <MoneyCard label="💰 Текущие юли" value={data.money.juli} />
          <MoneyCard label="🪙 Зарплата" value={data.money.salary} />
          <MoneyCard label="📈 Доп. доход" value={data.money.extraIncome} prefix="+" />
          <MoneyCard label="📉 Доп. расходы" value={data.money.extraExpenses} prefix="−" />
          <MoneyCard
            label="⚖️ Баланс"
            value={data.money.balance}
            prefix={data.money.balance > 0 ? '+' : ''}
          />
          <MoneyCard label="🏦 Накопления" value={data.money.savings} />
        </div>
      </section>

      <footer className="nero-footer">
        ГосМАГ-услуги · личное дело синхронизируется с игровыми реестрами
      </footer>
    </main>
  );
}
