import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import './npc.css';

export type NpcRelation = {
  id: string;
  sourceNpcId: string;
  sourceNpcName?: string;
  type: string;
  typeLabel: string;
  targetKind: 'npc' | 'character';
  targetId: string;
  targetName: string;
  public: boolean;
  note?: string;
  reverseOf?: string;
};

export type NpcRecord = {
  id: string;
  row: number;
  name: string;
  race: string;
  country: string;
  age: string;
  height: string;
  magic: string;
  grimoire: string;
  character: string;
  role: string;
  hasImage: boolean;
  imageUrl: string;
  imageKey: string;
  relations: NpcRelation[];
};

type Props = {
  onBack: () => void;
};

type ApiResponse = {
  ok?: boolean;
  npcs?: NpcRecord[];
  error?: string;
};

function NpcPortrait({
  npc,
  className = '',
}: {
  npc: NpcRecord;
  className?: string;
}) {
  // Локальный портрет из пакета пробуем всегда.
  // Google Apps Script не всегда умеет увидеть старые over-grid изображения,
  // поэтому hasImage не должен блокировать уже извлечённый WebP.
  const fallback = npc.imageKey
    ? `/npc/${npc.imageKey}.webp`
    : '';
  const primary = npc.imageUrl || fallback;
  const [src, setSrc] = useState(primary);

  useEffect(() => {
    setSrc(primary);
  }, [primary]);

  if (!src) {
    return (
      <div className={`npc-portrait npc-portrait-placeholder ${className}`.trim()}>
        <span>{npc.name?.trim().charAt(0).toUpperCase() || 'Н'}</span>
      </div>
    );
  }

  return (
    <div className={`npc-portrait ${className}`.trim()}>
      <img
        src={src}
        alt={npc.name || 'Портрет НПС'}
        loading="lazy"
        onError={() => {
          if (src !== fallback && fallback) {
            setSrc(fallback);
          } else {
            setSrc('');
          }
        }}
      />
    </div>
  );
}

function clean(value: string) {
  const text = String(value || '').trim();
  if (!text || ['???', '??', '?', '[ ? ]', '[?]'].includes(text)) {
    return 'Не указано';
  }
  return text;
}

export default function NpcDirectory({ onBack }: Props) {
  const [npcs, setNpcs] = useState<NpcRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [race, setRace] = useState('all');
  const [country, setCountry] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(
          `/.netlify/functions/npcs?t=${Date.now()}`,
          { cache: 'no-store' }
        );
        const result: ApiResponse = await response.json();
        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || 'Не удалось загрузить каталог НПС');
        }
        if (!cancelled) {
          setNpcs(Array.isArray(result.npcs) ? result.npcs : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const races = useMemo(
    () => Array.from(new Set(npcs.map(item => item.race).filter(value => value && !value.includes('?'))))
      .sort((a, b) => a.localeCompare(b, 'ru')),
    [npcs]
  );

  const countries = useMemo(
    () => Array.from(new Set(npcs.map(item => item.country).filter(value => value && !value.includes('?'))))
      .sort((a, b) => a.localeCompare(b, 'ru')),
    [npcs]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return npcs.filter(item => {
      if (race !== 'all' && item.race !== race) return false;
      if (country !== 'all' && item.country !== country) return false;
      if (!needle) return true;
      return [item.name, item.race, item.country, item.magic, item.role]
        .join(' ')
        .toLocaleLowerCase('ru')
        .includes(needle);
    });
  }, [npcs, query, race, country]);

  const selected = useMemo(
    () => npcs.find(item => item.id === selectedId) || null,
    [npcs, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [selected]);

  return (
    <main className="npc-directory-shell">
      <div className="npc-directory-ambient" aria-hidden />
      <div className="npc-directory-inner">
        <header className="npc-directory-topbar">
          <button type="button" className="npc-back" onClick={onBack}>← Главная</button>
          <span className="npc-directory-count">{loading ? 'Загрузка…' : `${npcs.length} НПС`}</span>
        </header>

        <section className="npc-directory-hero">
          <div>
            <span className="npc-kicker">ЖИТЕЛИ МИРА</span>
            <h1>НПС</h1>
            <p>
              Персонажи мира, их магия, роли и известные связи. Личные дела игроков отсюда не открываются.
            </p>
          </div>
        </section>

        <section className="npc-directory-controls" aria-label="Фильтры НПС">
          <label className="npc-search-field">
            <span>Поиск</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Имя, магия, роль…"
            />
          </label>

          <label>
            <span>Раса</span>
            <select value={race} onChange={event => setRace(event.target.value)}>
              <option value="all">Все</option>
              {races.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>

          <label>
            <span>Родина</span>
            <select value={country} onChange={event => setCountry(event.target.value)}>
              <option value="all">Все</option>
              {countries.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </section>

        {error ? <div className="npc-state npc-state-error">{error}</div> : null}
        {loading ? <div className="npc-state">Загружаю жителей мира…</div> : null}

        {!loading && !error ? (
          <>
            <div className="npc-results-line">
              <span>Показано</span>
              <strong>{filtered.length}</strong>
            </div>

            <section className="npc-grid">
              {filtered.map(npc => (
                <button
                  key={npc.id}
                  type="button"
                  className="npc-card"
                  onClick={() => setSelectedId(npc.id)}
                >
                  <NpcPortrait npc={npc} className="npc-card-portrait" />
                  <span className="npc-card-gradient" aria-hidden />
                  <span className="npc-card-copy">
                    <span className="npc-card-meta">
                      {[npc.race, npc.country].filter(Boolean).join(' · ') || 'НПС'}
                    </span>
                    <strong>{npc.name || 'Неизвестный НПС'}</strong>
                    <span className="npc-card-magic">{clean(npc.magic)}</span>
                    {npc.role ? <small>{npc.role}</small> : null}
                  </span>
                </button>
              ))}
            </section>

            {filtered.length === 0 ? (
              <div className="npc-state">По этим фильтрам никого не найдено.</div>
            ) : null}
          </>
        ) : null}
      </div>

      {selected && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="npc-detail-overlay"
              role="presentation"
              onMouseDown={event => {
                if (event.target === event.currentTarget) setSelectedId(null);
              }}
            >
              <article className="npc-detail" role="dialog" aria-modal="true" aria-label={`НПС ${selected.name || `строка ${selected.row}`}`}>
                <button type="button" className="npc-detail-close" onClick={() => setSelectedId(null)} aria-label="Закрыть">×</button>

                <div className="npc-detail-hero">
                  <NpcPortrait npc={selected} className="npc-detail-portrait" />
                  <div className="npc-detail-title">
                    <span className="npc-kicker">ЛИЧНОЕ ДОСЬЕ НПС</span>
                    <h2>{selected.name || 'Неизвестный НПС'}</h2>
                    <p>{[clean(selected.race), clean(selected.country)].join(' · ')}</p>
                    <div className="npc-detail-chips">
                      {selected.age ? <span>Возраст: {selected.age}</span> : null}
                      {selected.height ? <span>Рост: {selected.height}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="npc-detail-grid">
                  <section>
                    <span className="npc-detail-label">Магия</span>
                    <strong>{clean(selected.magic)}</strong>
                    <p>{selected.grimoire ? `Гримуар: ${selected.grimoire}` : 'Гримуар не указан'}</p>
                  </section>
                  <section>
                    <span className="npc-detail-label">Роль</span>
                    <p>{clean(selected.role)}</p>
                  </section>
                  <section className="npc-detail-wide">
                    <span className="npc-detail-label">Характер</span>
                    <p>{clean(selected.character)}</p>
                  </section>
                </div>

                <section className="npc-relations-public">
                  <div className="npc-relations-head">
                    <span className="npc-detail-label">Связи</span>
                    <strong>{selected.relations?.length || 0}</strong>
                  </div>

                  {selected.relations?.length ? (
                    <div className="npc-relation-list">
                      {selected.relations.map(relation => {
                        const targetNpc = relation.targetKind === 'npc'
                          ? npcs.find(item => item.id === relation.targetId)
                          : null;

                        const content = (
                          <>
                            <span>{relation.typeLabel}</span>
                            <strong>{relation.targetName}</strong>
                            <small>{relation.targetKind === 'character' ? 'Персонаж игрока' : 'НПС'}</small>
                          </>
                        );

                        return targetNpc ? (
                          <button
                            type="button"
                            className="npc-relation-card npc-relation-card-link"
                            key={relation.id}
                            onClick={() => setSelectedId(targetNpc.id)}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="npc-relation-card" key={relation.id}>{content}</div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="npc-relations-empty">Известные связи пока не внесены.</p>
                  )}
                </section>
              </article>
            </div>,
            document.body
          )
        : null}
    </main>
  );
}
