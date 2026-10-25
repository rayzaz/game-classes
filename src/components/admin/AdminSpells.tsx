import React, { useEffect, useMemo, useState } from 'react';
import type { AdminCharacterSummary } from './AdminCharacters';
import AdminSpellRequests from './AdminSpellRequests';
import SpellEditor, { type EditorSpell } from './AdminSpellEditor';
import { makeCanonicalSpell, spellSpatialLabels, spellDurationLabel, spellCalculationLabel, type CanonicalSpell } from '../../lib/spellSchema';
import './admin-spells.css';

const API = '/.netlify/functions/admin-spells';

type CharacterSpellResult = {
  ok: boolean;
  characterId: string;
  characterName: string;
  className?: string;
  spells: EditorSpell[];
  slotCount?: number;
  freeSlots?: number[];
  count: number;
  invalidCount: number;
  validCount: number;
  ready: boolean;
  error?: string;
};

type LoadState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: CharacterSpellResult;
  error?: string;
};

type FilterMode = 'issues' | 'ready' | 'all';


async function readCharacterSpells(characterId: string) {
  const response = await fetch(`${API}?characterId=${encodeURIComponent(characterId)}&t=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
  });

  const result = await response.json() as CharacterSpellResult;
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || 'Не удалось проверить заклинания');
  }

  return result;
}


export default function AdminSpells({ characters }: { characters: AdminCharacterSummary[] }) {
  const [states, setStates] = useState<Record<string, LoadState>>({});
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<FilterMode>('issues');
  const [search, setSearch] = useState('');
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [cloneSeed, setCloneSeed] = useState<EditorSpell | null>(null);
  const [deletingSlot, setDeletingSlot] = useState<number | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [spellQuery, setSpellQuery] = useState('');
  const [spellFilter, setSpellFilter] = useState<'all' | 'issues' | 'ready'>('all');
  const [activeView, setActiveView] = useState<'requests' | 'grimoirs'>('requests');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const connectedCharacters = useMemo(
    () => characters.filter((character) => character.cabinetReady),
    [characters],
  );

  useEffect(() => {
    let cancelled = false;
    let cursor = 0;
    const queue = connectedCharacters.slice();

    if (!queue.length) return undefined;

    setSelectedId((current) => current || queue[0].id);

    async function worker() {
      while (!cancelled) {
        const index = cursor;
        cursor += 1;
        if (index >= queue.length) return;

        const character = queue[index];
        setStates((prev) => ({
          ...prev,
          [character.id]: { status: 'loading', data: prev[character.id]?.data },
        }));

        try {
          const data = await readCharacterSpells(character.id);
          if (cancelled) return;
          setStates((prev) => ({ ...prev, [character.id]: { status: 'ready', data } }));
        } catch (error) {
          if (cancelled) return;
          setStates((prev) => ({
            ...prev,
            [character.id]: {
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            },
          }));
        }
      }
    }

    void Promise.all([worker(), worker()]);

    return () => {
      cancelled = true;
    };
  }, [connectedCharacters]);

  const stats = useMemo(() => {
    let checked = 0;
    let issues = 0;
    let ready = 0;
    let errors = 0;

    connectedCharacters.forEach((character) => {
      const state = states[character.id];
      if (state?.status === 'ready' && state.data) {
        checked += 1;
        if (state.data.invalidCount > 0 || state.data.count === 0) issues += 1;
        else ready += 1;
      } else if (state?.status === 'error') {
        errors += 1;
      }
    });

    return { checked, issues, ready, errors, total: connectedCharacters.length };
  }, [connectedCharacters, states]);

  const visibleCharacters = useMemo(() => {
    const query = search.trim().toLowerCase();

    return connectedCharacters.filter((character) => {
      if (query && !`${character.name} ${character.player} ${character.className || ''}`.toLowerCase().includes(query)) {
        return false;
      }

      const state = states[character.id];
      if (filter === 'all') return true;
      if (state?.status !== 'ready' || !state.data) return filter === 'issues';
      const hasIssues = state.data.invalidCount > 0 || state.data.count === 0;
      return filter === 'issues' ? hasIssues : !hasIssues;
    });
  }, [connectedCharacters, filter, search, states]);

  const selectedCharacter = connectedCharacters.find((character) => character.id === selectedId) ?? null;
  const selectedState = selectedCharacter ? states[selectedCharacter.id] : undefined;
  const selectedData = selectedState?.data;

  async function reloadOne(characterId: string) {
    setStates((prev) => ({ ...prev, [characterId]: { status: 'loading', data: prev[characterId]?.data } }));
    try {
      const data = await readCharacterSpells(characterId);
      setStates((prev) => ({ ...prev, [characterId]: { status: 'ready', data } }));
    } catch (error) {
      setStates((prev) => ({
        ...prev,
        [characterId]: { status: 'error', error: error instanceof Error ? error.message : String(error) },
      }));
    }
  }

  async function manageSpell(operation: 'create' | 'update' | 'delete', spell?: CanonicalSpell, initial?: EditorSpell) {
    if (!selectedCharacter) return;
    setSaving(true);
    setSaveError('');

    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          operation,
          characterId: selectedCharacter.id,
          spellIndex: initial?.slotIndex ?? null,
          spell: spell || {},
          expected: initial ? { name: initial.name, rawDescription: initial.rawDescription ?? '' } : {},
          confirmName: operation === 'delete' ? deleteConfirmation : undefined,
        }),
      });
      const result = await response.json() as { ok?: boolean; spellIndex?: number; error?: string };
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Не удалось изменить заклинание');
      await reloadOne(selectedCharacter.id);
      setEditingSlot(null);
      setCreating(false);
      setCloneSeed(null);
      setDeletingSlot(null);
      setDeleteConfirmation('');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const newSpell: EditorSpell = cloneSeed ? { ...cloneSeed, slotIndex: 0, valid: false, issues: [], legacy: false } : {
    ...makeCanonicalSpell('Урон'),
    slotIndex: 0,
    valid: false,
    issues: [],
    legacy: false,
  };
  const shownSpells = (selectedData?.spells || []).filter((spell) => {
    const query = spellQuery.trim().toLowerCase();
    if (spellFilter === 'ready' && !spell.valid) return false;
    if (spellFilter === 'issues' && spell.valid) return false;
    return !query || `${spell.name} ${spell.powerType} ${spell.effect}`.toLowerCase().includes(query);
  });

  return (
    <section className="admin-modern-section admin-spells-root">
      <div className="admin-section-head admin-spells-head">
        <div>
          <div className="admin-kicker">БОЕВОЙ КАЛЬКУЛЯТОР · ПОДГОТОВКА</div>
          <h2>Заклинания персонажей</h2>
          <p>Система проверяет старые гримуары и показывает, какие заклинания ещё нельзя безопасно использовать в автоматическом бою.</p>
        </div>
        <button type="button" className="admin-button" onClick={() => selectedCharacter && void reloadOne(selectedCharacter.id)} disabled={!selectedCharacter}>↻ Проверить выбранного</button>
      </div>

      <div className="admin-spell-tabs" role="group" aria-label="Разделы заклинаний">
        <button type="button" className={activeView === 'requests' ? 'active' : ''} onClick={() => setActiveView('requests')}>Заявки игроков</button>
        <button type="button" className={activeView === 'grimoirs' ? 'active' : ''} onClick={() => setActiveView('grimoirs')}>Гримуары и редактор</button>
      </div>
      {activeView === 'requests' ? <AdminSpellRequests /> : <>

      <div className="admin-spell-stats">
        <div><span>Проверено</span><b>{stats.checked}/{stats.total}</b></div>
        <div className="warning"><span>Нужно исправить</span><b>{stats.issues}</b></div>
        <div className="ready"><span>Готовы</span><b>{stats.ready}</b></div>
        {stats.errors ? <div className="error"><span>Ошибки чтения</span><b>{stats.errors}</b></div> : null}
      </div>

      <div className="admin-spell-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск персонажа…" />
        <div className="admin-spell-filter">
          <button type="button" className={filter === 'issues' ? 'active' : ''} onClick={() => setFilter('issues')}>Нужно исправить</button>
          <button type="button" className={filter === 'ready' ? 'active' : ''} onClick={() => setFilter('ready')}>Готовые</button>
          <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Все</button>
        </div>
      </div>

      <div className="admin-spell-workspace">
        <aside className="admin-spell-character-list">
          {visibleCharacters.map((character) => {
            const state = states[character.id];
            const invalid = state?.data?.invalidCount ?? 0;
            const count = state?.data?.count ?? 0;
            const status = state?.status === 'loading'
              ? 'Проверяю…'
              : state?.status === 'error'
                ? 'Ошибка чтения'
                : state?.status === 'ready'
                  ? invalid > 0 || count === 0
                    ? count === 0
                      ? 'Заклинания не найдены'
                      : `${invalid} требует проверки`
                    : `${count} готово`
                  : 'Ожидает проверки';

            return (
              <button
                type="button"
                key={character.id}
                className={`admin-spell-character ${selectedId === character.id ? 'active' : ''} ${state?.status === 'ready' && invalid === 0 && count > 0 ? 'ready' : ''}`}
                onClick={() => {
                  setSelectedId(character.id);
                  setEditingSlot(null);
                  setCreating(false);
                  setDeletingSlot(null);
                  setDeleteConfirmation('');
                  setSaveError('');
                }}
              >
                <div>
                  <strong>{character.name}</strong>
                  <span>{character.className || 'Класс не указан'}</span>
                </div>
                <small>{status}</small>
              </button>
            );
          })}

          {visibleCharacters.length === 0 ? <div className="admin-spell-empty">В этом разделе пока никого нет.</div> : null}
        </aside>

        <div className="admin-spell-detail">
          {!selectedCharacter ? (
            <div className="admin-spell-empty">Выберите персонажа.</div>
          ) : selectedState?.status === 'loading' && !selectedData ? (
            <div className="admin-spell-empty">Читаю гримуар {selectedCharacter.name}…</div>
          ) : selectedState?.status === 'error' ? (
            <div className="admin-spell-error">
              <b>Не удалось прочитать гримуар.</b>
              <span>{selectedState.error}</span>
              <button type="button" className="admin-button" onClick={() => void reloadOne(selectedCharacter.id)}>Повторить</button>
            </div>
          ) : selectedData ? (
            <>
              <div className="admin-spell-character-head">
                <div>
                  <span>{selectedData.className || selectedCharacter.className || 'Класс не указан'}</span>
                  <h3>{selectedData.characterName || selectedCharacter.name}</h3>
                </div>
                <div className={selectedData.ready ? 'ready' : 'warning'}>
                  {selectedData.ready
                    ? 'Гримуар готов к калькулятору'
                    : selectedData.count === 0
                      ? 'Заклинания не найдены'
                      : `Нужно исправить: ${selectedData.invalidCount}`}
                </div>
              </div>

              <div className="admin-spell-actions-toolbar">
                <span>Слотов: {selectedData.count}/{selectedData.slotCount ?? '—'} · Свободно: {selectedData.freeSlots?.length ?? '—'} · Административное добавление без списания баллов</span>
                <button
                  type="button"
                  className="admin-button primary"
                  disabled={saving || !selectedData.freeSlots?.length}
                  onClick={() => {
                    setEditingSlot(null);
                    setDeletingSlot(null);
                    setCloneSeed(null);
                    setCreating(true);
                    setSaveError('');
                  }}
                >+ Создать заклинание</button>
              </div>
              {creating ? (
                <SpellEditor
                  key={`new-${selectedCharacter.id}-${cloneSeed?.slotIndex ?? 0}`}
                  creating
                  initial={newSpell}
                  className={selectedData.className || selectedCharacter.className || ''}
                  saving={saving}
                  onCancel={() => { setCreating(false); setCloneSeed(null); }}
                  onSave={(next) => void manageSpell('create', next)}
                />
              ) : null}
              <div className="admin-spell-toolbar admin-spell-toolbar-internal">
                <input value={spellQuery} onChange={(event) => setSpellQuery(event.target.value)} placeholder="Поиск заклинания по названию, типу или эффекту…" />
                <div className="admin-spell-filter">
                  <button type="button" className={spellFilter === 'all' ? 'active' : ''} onClick={() => setSpellFilter('all')}>Все</button>
                  <button type="button" className={spellFilter === 'issues' ? 'active' : ''} onClick={() => setSpellFilter('issues')}>С ошибками</button>
                  <button type="button" className={spellFilter === 'ready' ? 'active' : ''} onClick={() => setSpellFilter('ready')}>Готовые</button>
                </div>
              </div>

              {saveError ? <div className="admin-spell-error compact">{saveError}</div> : null}

              {selectedData.spells.length ? (
                <div className="admin-spell-list">
                  {shownSpells.map((spell) => (
                    editingSlot === spell.slotIndex ? (
                      <SpellEditor
                        key={spell.slotIndex}
                        initial={spell}
                        className={selectedData.className || selectedCharacter.className || ''}
                        saving={saving}
                        onCancel={() => setEditingSlot(null)}
                        onSave={(next) => void manageSpell('update', next, spell)}
                      />
                    ) : (
                      <article className={`admin-spell-card ${spell.valid ? 'ready' : 'warning'}`} key={spell.slotIndex}>
                        <div className="admin-spell-card-head">
                          <div>
                            <span>Заклинание #{spell.slotIndex}</span>
                            <h4>{spell.name}</h4>
                          </div>
                          <span className={spell.valid ? 'ready' : 'warning'}>{spell.valid ? 'Готово' : 'Нужно исправить'}</span>
                        </div>

                        <div className="admin-spell-meta">
                          <span>{spell.powerType}</span>
                          <span>{spell.castTime}</span>
                          {spellSpatialLabels(spell).map((label) => <span key={label}>{label}</span>)}
                          <span>{spellDurationLabel(spell)}</span>
                        </div>

                        <p>{spell.effect || 'Описание эффекта не найдено.'}</p>

                        {!spell.valid ? (
                          <div className="admin-spell-issues">
                            {spell.issues.map((issue) => <span key={`${issue.field}-${issue.message}`}>{issue.message}</span>)}
                          </div>
                        ) : null}

                        <div className="admin-spell-card-actions">
                          <small>{spellCalculationLabel(spell)} · мана по классу</small>
                          <button type="button" className="admin-button" onClick={() => {
                            setEditingSlot(spell.slotIndex);
                            setCreating(false);
                            setDeletingSlot(null);
                          }} disabled={saving}>
                            {spell.valid ? 'Изменить' : 'Исправить'}
                          </button>
                          <button type="button" className="admin-button" disabled={saving || !selectedData.freeSlots?.length} onClick={() => {
                            setCloneSeed(spell);
                            setCreating(true);
                            setEditingSlot(null);
                            setDeletingSlot(null);
                            setSaveError('');
                          }}>Дублировать</button>
                          <button type="button" className="admin-button danger" onClick={() => {
                            setDeletingSlot(spell.slotIndex);
                            setDeleteConfirmation('');
                            setEditingSlot(null);
                            setCreating(false);
                          }} disabled={saving}>Удалить</button>
                        </div>
                        {deletingSlot === spell.slotIndex ? (
                          <div className="admin-spell-delete-confirm">
                            <strong>Удалить «{spell.name}» из слота #{spell.slotIndex}?</strong>
                            <p>Слот очистится, остальные заклинания не сдвинутся. Незавершённые заявки на улучшение удалённого заклинания могут стать неприменимыми.</p>
                            <label>Введи точное название для подтверждения
                              <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
                            </label>
                            <div>
                              <button type="button" className="admin-button" onClick={() => setDeletingSlot(null)}>Отмена</button>
                              <button type="button" className="admin-button danger" disabled={saving || deleteConfirmation !== spell.name} onClick={() => void manageSpell('delete', undefined, spell)}>Подтвердить удаление</button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    )
                  ))}
                  {shownSpells.length === 0 ? <div className="admin-spell-empty">Нет заклинаний по выбранным фильтрам.</div> : null}
                </div>
              ) : (
                <div className="admin-spell-empty">В личной таблице не найдено ни одного заклинания.</div>
              )}
            </>
          ) : (
            <div className="admin-spell-empty">Ожидаю данные…</div>
          )}
        </div>
      </div>
      </>}
    </section>
  );
}
