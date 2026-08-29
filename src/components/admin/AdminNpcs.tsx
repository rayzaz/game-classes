import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import type { NpcRecord, NpcRelation } from '../NpcDirectory';
import '../npc.css';
import './admin-npcs.css';

type MissingField = { key: string; label: string };
type AdminNpc = NpcRecord & {
  note: string;
  missingFields: MissingField[];
  reviewFields: MissingField[];
  completionPercent: number;
};

type RelationType = { value: string; label: string };
type CharacterOption = { id: string; name: string };
type Stats = { slots: number; named: number; complete: number; needsWork: number; unnamed: number };

type AdminResponse = {
  ok?: boolean;
  npcs?: AdminNpc[];
  relationTypes?: RelationType[];
  characters?: CharacterOption[];
  stats?: Stats;
  npc?: AdminNpc | null;
  relation?: NpcRelation;
  error?: string;
};

const EMPTY_STATS: Stats = { slots: 0, named: 0, complete: 0, needsWork: 0, unnamed: 0 };

function imageSrc(npc: AdminNpc) {
  // Всегда пробуем локальную копию из пакета. Старые картинки Google
  // могут не определяться через Apps Script, хотя WebP уже есть на сайте.
  return npc.imageUrl || (npc.imageKey ? `/npc/${npc.imageKey}.webp` : '');
}

function NpcThumb({ npc }: { npc: AdminNpc }) {
  const fallback = npc.imageKey ? `/npc/${npc.imageKey}.webp` : '';
  const [src, setSrc] = useState(imageSrc(npc));
  useEffect(() => setSrc(imageSrc(npc)), [npc.id, npc.imageUrl, npc.imageKey, npc.hasImage]);
  return src ? (
    <img
      className="admin-npc-thumb"
      src={src}
      alt=""
      loading="lazy"
      onError={() => src !== fallback && fallback ? setSrc(fallback) : setSrc('')}
    />
  ) : (
    <div className="admin-npc-thumb admin-npc-thumb-empty">{npc.name?.charAt(0) || '?'}</div>
  );
}

function readMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function AdminNpcs() {
  const [npcs, setNpcs] = useState<AdminNpc[]>([]);
  const [relationTypes, setRelationTypes] = useState<RelationType[]>([]);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'work' | 'unnamed' | 'complete'>('work');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/.netlify/functions/admin-npcs?t=${Date.now()}`, { cache: 'no-store' });
      const result: AdminResponse = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Не удалось загрузить НПС');
      setNpcs(Array.isArray(result.npcs) ? result.npcs : []);
      setRelationTypes(Array.isArray(result.relationTypes) ? result.relationTypes : []);
      setCharacters(Array.isArray(result.characters) ? result.characters : []);
      setStats(result.stats || EMPTY_STATS);
    } catch (err) {
      setError(readMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return npcs.filter(npc => {
      if (filter === 'work' && npc.missingFields.length === 0 && npc.reviewFields.length === 0) return false;
      if (filter === 'unnamed' && npc.name.trim()) return false;
      if (filter === 'complete' && (npc.missingFields.length || npc.reviewFields.length)) return false;
      if (!needle) return true;
      return [npc.name, npc.race, npc.country, npc.magic, npc.role, String(npc.row)]
        .join(' ').toLocaleLowerCase('ru').includes(needle);
    });
  }, [npcs, filter, query]);

  const editing = npcs.find(npc => npc.id === editingId) || null;

  return (
    <section className="admin-modern-section admin-npcs-section">
      <div className="admin-section-head admin-npcs-head">
        <div>
          <div className="admin-kicker">МИР</div>
          <h2>НПС</h2>
          <p>Проверка заполненности, редактирование листа «НПС» и связи с НПС и персонажами игроков.</p>
        </div>
        <button type="button" className="admin-button" onClick={() => void load()} disabled={loading}>↻ Обновить</button>
      </div>

      <div className="admin-npc-stats">
        <button type="button" onClick={() => setFilter('all')} className={filter === 'all' ? 'active' : ''}><span>Всего слотов</span><strong>{stats.slots}</strong></button>
        <button type="button" onClick={() => setFilter('work')} className={filter === 'work' ? 'active' : ''}><span>Нужно проверить</span><strong>{stats.needsWork}</strong></button>
        <button type="button" onClick={() => setFilter('unnamed')} className={filter === 'unnamed' ? 'active' : ''}><span>Без имени</span><strong>{stats.unnamed}</strong></button>
        <button type="button" onClick={() => setFilter('complete')} className={filter === 'complete' ? 'active' : ''}><span>Готовы</span><strong>{stats.complete}</strong></button>
      </div>

      <div className="admin-npc-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск по имени, магии, роли или строке…" />
        <span>{filtered.length} показано · {stats.named} с именем</span>
      </div>

      {error ? <div className="admin-npc-error">{error}</div> : null}
      {loading ? <div className="admin-npc-empty">Читаю лист НПС…</div> : null}

      {!loading && !error ? (
        <div className="admin-npc-list">
          {filtered.map(npc => {
            const needs = [...npc.missingFields, ...npc.reviewFields];
            return (
              <button key={npc.id} type="button" className="admin-npc-row" onClick={() => setEditingId(npc.id)}>
                <NpcThumb npc={npc} />
                <span className="admin-npc-row-main">
                  <span className="admin-npc-row-overline">СТРОКА {npc.row}</span>
                  <strong>{npc.name || 'Без имени'}</strong>
                  <small>{[npc.race, npc.country, npc.magic].filter(Boolean).join(' · ') || 'Данные не заполнены'}</small>
                </span>
                <span className="admin-npc-quality">
                  <span className="admin-npc-progress"><i style={{ width: `${npc.completionPercent}%` }} /></span>
                  <strong>{npc.completionPercent}%</strong>
                  <small>{needs.length ? needs.slice(0, 3).map(item => item.label).join(', ') + (needs.length > 3 ? ` +${needs.length - 3}` : '') : 'Карточка заполнена'}</small>
                </span>
                <span className="admin-npc-row-arrow">→</span>
              </button>
            );
          })}
          {filtered.length === 0 ? <div className="admin-npc-empty">Здесь пока пусто.</div> : null}
        </div>
      ) : null}

      {editing && typeof document !== 'undefined' ? createPortal(
        <NpcEditor
          npc={editing}
          npcs={npcs}
          relationTypes={relationTypes}
          characters={characters}
          onClose={() => setEditingId(null)}
          onChanged={() => void load()}
        />,
        document.body
      ) : null}
    </section>
  );
}

function NpcEditor({
  npc,
  npcs,
  relationTypes,
  characters,
  onClose,
  onChanged,
}: {
  npc: AdminNpc;
  npcs: AdminNpc[];
  relationTypes: RelationType[];
  characters: CharacterOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [form, setForm] = useState({
    id: npc.id,
    row: npc.row,
    name: npc.name,
    race: npc.race,
    country: npc.country,
    age: npc.age,
    height: npc.height,
    magic: npc.magic,
    grimoire: npc.grimoire,
    character: npc.character,
    role: npc.role,
    note: npc.note || '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [relation, setRelation] = useState({
    type: relationTypes[0]?.value || 'relative',
    targetKind: 'npc' as 'npc' | 'character',
    targetId: '',
    note: '',
    public: true,
  });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);

  async function post(body: object) {
    const response = await fetch('/.netlify/functions/admin-npcs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result: AdminResponse = await response.json();
    if (!response.ok || !result?.ok) throw new Error(result?.error || 'Операция не выполнена');
    return result;
  }

  async function saveNpc() {
    setSaving(true); setMessage('');
    try {
      await post({ action: 'update', npc: form });
      setMessage('Сохранено в Google-таблицу.');
      onChanged();
    } catch (err) { setMessage(readMessage(err)); }
    finally { setSaving(false); }
  }

  async function saveRelation() {
    if (!relation.targetId) { setMessage('Сначала выберите, с кем связан НПС.'); return; }
    setSaving(true); setMessage('');
    try {
      await post({ action: 'relation-save', relation: { sourceNpcId: npc.id, ...relation } });
      setRelation(current => ({ ...current, targetId: '', note: '' }));
      setMessage('Связь сохранена.');
      onChanged();
    } catch (err) { setMessage(readMessage(err)); }
    finally { setSaving(false); }
  }

  async function deleteRelation(item: NpcRelation) {
    if (!window.confirm(`Удалить связь «${item.typeLabel}: ${item.targetName}»?`)) return;
    setSaving(true); setMessage('');
    try {
      await post({ action: 'relation-delete', relationId: item.reverseOf || item.id });
      setMessage('Связь удалена.');
      onChanged();
    } catch (err) { setMessage(readMessage(err)); }
    finally { setSaving(false); }
  }

  const targetOptions = relation.targetKind === 'npc'
    ? npcs.filter(item => item.id !== npc.id).map(item => ({ id: item.id, name: item.name || `Без имени · строка ${item.row}` }))
    : characters;

  const fieldState = (key: string) => npc.missingFields.some(item => item.key === key)
    ? 'missing'
    : npc.reviewFields.some(item => item.key === key)
      ? 'review'
      : 'ok';

  const input = (key: keyof typeof form, label: string, wide = false) => (
    <label className={`admin-npc-field ${wide ? 'wide' : ''} state-${fieldState(String(key))}`}>
      <span>{label}<i>{fieldState(String(key)) === 'missing' ? 'Пусто' : fieldState(String(key)) === 'review' ? 'Проверить' : ''}</i></span>
      <input value={String(form[key] ?? '')} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
    </label>
  );

  return (
    <div className="admin-npc-editor-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <article className="admin-npc-editor" role="dialog" aria-modal="true">
        <header className="admin-npc-editor-head">
          <NpcThumb npc={npc} />
          <div>
            <span>НПС · строка {npc.row}</span>
            <h2>{npc.name || 'Без имени'}</h2>
            <p>{npc.completionPercent}% заполнено · красное — пусто, жёлтое — требует проверки.</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="admin-npc-editor-body">
          <section className="admin-npc-editor-section">
            <div className="admin-npc-subhead"><div><span>ДАННЫЕ ТАБЛИЦЫ</span><h3>Карточка НПС</h3></div><button type="button" className="admin-button admin-button-primary" onClick={() => void saveNpc()} disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить в таблицу'}</button></div>
            <div className="admin-npc-form-grid">
              {input('name', 'Имя')}
              {input('race', 'Раса')}
              {input('country', 'Родина')}
              {input('age', 'Возраст')}
              {input('height', 'Рост')}
              {input('magic', 'Магия')}
              {input('grimoire', 'Гримуар')}
              <label className={`admin-npc-field wide state-${fieldState('character')}`}><span>Характер<i>{fieldState('character') === 'missing' ? 'Пусто' : fieldState('character') === 'review' ? 'Проверить' : ''}</i></span><textarea rows={4} value={form.character} onChange={event => setForm(current => ({ ...current, character: event.target.value }))} /></label>
              <label className={`admin-npc-field wide state-${fieldState('role')}`}><span>Роль<i>{fieldState('role') === 'missing' ? 'Пусто' : fieldState('role') === 'review' ? 'Проверить' : ''}</i></span><textarea rows={4} value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))} /></label>
              <label className="admin-npc-field wide"><span>Примечание <i>только админ</i></span><textarea rows={4} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
            </div>
          </section>

          <section className="admin-npc-editor-section">
            <div className="admin-npc-subhead"><div><span>СВЯЗИ</span><h3>Кто с кем связан</h3></div></div>
            <div className="admin-npc-relation-form">
              <label><span>Тип связи</span><select value={relation.type} onChange={event => setRelation(current => ({ ...current, type: event.target.value }))}>{relationTypes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label><span>С кем</span><select value={relation.targetKind} onChange={event => setRelation(current => ({ ...current, targetKind: event.target.value as 'npc' | 'character', targetId: '' }))}><option value="npc">НПС</option><option value="character">Персонаж игрока</option></select></label>
              <label className="wide"><span>Цель</span><select value={relation.targetId} onChange={event => setRelation(current => ({ ...current, targetId: event.target.value }))}><option value="">Выберите…</option>{targetOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="wide"><span>Комментарий для ГМ</span><input value={relation.note} onChange={event => setRelation(current => ({ ...current, note: event.target.value }))} placeholder="Необязательно" /></label>
              <label className="admin-npc-public-toggle"><input type="checkbox" checked={relation.public} onChange={event => setRelation(current => ({ ...current, public: event.target.checked }))} /><span>Показывать эту связь игрокам</span></label>
              <button type="button" className="admin-button admin-button-primary" onClick={() => void saveRelation()} disabled={saving}>Добавить связь</button>
            </div>

            <div className="admin-npc-relations">
              {npc.relations?.map(item => (
                <div className="admin-npc-relation-item" key={item.id}>
                  <div><span>{item.typeLabel} · {item.targetKind === 'character' ? 'персонаж' : 'НПС'}</span><strong>{item.targetName}</strong>{item.note ? <small>{item.note}</small> : null}</div>
                  <div className="admin-npc-relation-side"><em>{item.public ? 'видно игрокам' : 'скрыто'}</em><button type="button" onClick={() => void deleteRelation(item)} disabled={saving}>Удалить</button></div>
                </div>
              ))}
              {!npc.relations?.length ? <p className="admin-npc-empty">Связи ещё не внесены.</p> : null}
            </div>
          </section>

          {message ? <div className="admin-npc-editor-message">{message}</div> : null}
        </div>
      </article>
    </div>
  );
}
