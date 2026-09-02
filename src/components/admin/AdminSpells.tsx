import React, { useEffect, useMemo, useState } from 'react';
import type { AdminCharacterSummary } from './AdminCharacters';
import {
  SPELL_AREAS,
  SPELL_CAST_TIMES,
  SPELL_DURATION_MODES,
  SPELL_FORMS,
  SPELL_TARGETS,
  defaultSpellRequiresHit,
  spellSpatialLabels,
  spellTargetOptions,
  spellUsesArea,
  spellUsesMovement,
  spellUsesRange,
  spellUsesSummonCount,
  spellUsesFixedPower,
  normalizeCanonicalSpell,
  spellAreaLabel,
  spellCalculationLabel,
  spellDurationLabel,
  validateCanonicalSpell,
  type CanonicalSpell,
  type SpellArea,
  type SpellForm,
  type SpellCastTime,
  type SpellDurationMode,
  type SpellTarget,
} from '../../lib/spellSchema';
import { getSpellTypes, type SpellPowerType } from '../questionnaire/questionnaireLogic';
import './admin-spells.css';

const API = '/.netlify/functions/admin-spells';

type EditorSpell = CanonicalSpell & {
  slotIndex: number;
  description?: string;
  rawDescription?: string;
  valid: boolean;
  legacy?: boolean;
  issues: Array<{ field: string; message: string }>;
};

type CharacterSpellResult = {
  ok: boolean;
  characterId: string;
  characterName: string;
  className?: string;
  spells: EditorSpell[];
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

function classKeyFromName(name: string) {
  const normalized = name.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  const map: Array<[string, string]> = [
    ['сапорт x3 знахарь', 'support_x3_alchemist'],
    ['саппорт x3 знахарь', 'support_x3_alchemist'],
    ['сапорт x3', 'support_x3'],
    ['саппорт x3', 'support_x3'],
    ['хилер знахарь', 'healer_alchemist'],
    ['хилер дебаффер', 'healer_debuffer'],
    ['хилер баффер', 'healer_buffer'],
    ['баффер знахарь', 'buffer_alchemist'],
    ['дебаффер знахарь', 'debuffer_alchemist'],
    ['баффер дебаффер', 'buffer_debuffer'],
    ['призыватель мульти', 'summoner_multi'],
    ['призыватель сап', 'summoner_sup'],
    ['призыватель дд', 'summoner_dps'],
    ['брузер', 'bruiser'],
    ['убийца', 'assassin'],
    ['дамагер', 'dps'],
    ['танк', 'tank'],
    ['знахарь', 'alchemist'],
    ['дебаффер', 'debuffer'],
    ['баффер', 'buffer'],
    ['хилер', 'healer'],
  ];

  return map.find(([label]) => normalized.includes(label))?.[1] ?? null;
}

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

function SpellEditor({
  initial,
  className,
  saving,
  onCancel,
  onSave,
}: {
  initial: EditorSpell;
  className: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (spell: CanonicalSpell) => void;
}) {
  const classKey = classKeyFromName(className);
  const allowedTypes = classKey
    ? getSpellTypes(classKey)
    : ['Урон', 'Лечение', 'Защита', 'Бафф', 'Дебафф', 'Контроль', 'Призыв', 'Ресурс', 'Без расчёта'] as SpellPowerType[];
  const fallbackType = (allowedTypes[0] || 'Урон') as SpellPowerType;
  const [draft, setDraft] = useState<CanonicalSpell>(() =>
    normalizeCanonicalSpell(initial, initial.powerType || fallbackType),
  );

  const issues = validateCanonicalSpell(draft, { requireMasterReview: true });
  const targetOptions = spellTargetOptions(draft.form);
  const rangeNeeded = spellUsesRange(draft);
  const areaNeeded = spellUsesArea(draft);
  const movementNeeded = spellUsesMovement(draft);
  const summonCountNeeded = spellUsesSummonCount(draft);
  const durationNeedsRounds = draft.durationMode === 'Ходы';

  function patch(next: Partial<CanonicalSpell>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  function normalizePatch(next: Partial<CanonicalSpell>) {
    setDraft((prev) => normalizeCanonicalSpell({ ...prev, ...next }, String(next.powerType || prev.powerType)));
  }

  return (
    <div className="admin-spell-editor">
      <div className="admin-spell-editor-head">
        <div>
          <span>РЕДАКТОР ЗАКЛИНАНИЯ</span>
          <h3>{initial.name || `Заклинание #${initial.slotIndex}`}</h3>
        </div>
        <button type="button" className="admin-button" onClick={onCancel} disabled={saving}>Закрыть</button>
      </div>

      {initial.legacy ? (
        <div className="admin-spell-legacy-note">
          Старые данные уже подставлены насколько это возможно. Главное — проверь «как работает заклинание». Трансформация, аура, телепорт, призыв и барьер больше не обязаны иметь одинаковые поля.
        </div>
      ) : null}

      <div className="admin-spell-form-grid">
        <label className="wide">
          <span>Название</span>
          <input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
        </label>

        <label>
          <span>Боевой тип</span>
          <select
            value={draft.powerType}
            onChange={(event) => {
              const powerType = event.target.value;
              normalizePatch({ powerType, requiresHit: defaultSpellRequiresHit(powerType), hitReviewed: draft.target === 'На себя' });
            }}
          >
            {allowedTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            {!allowedTypes.includes(draft.powerType as SpellPowerType) ? <option value={draft.powerType}>{draft.powerType}</option> : null}
          </select>
        </label>

        <label>
          <span>Как работает</span>
          <select value={draft.form} onChange={(event) => normalizePatch({ form: event.target.value as SpellForm })}>
            {SPELL_FORMS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        <label>
          <span>Время каста</span>
          <select value={draft.castTime} onChange={(event) => patch({ castTime: event.target.value as SpellCastTime })}>
            {SPELL_CAST_TIMES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        <label>
          <span>Цель</span>
          <select value={draft.target} onChange={(event) => normalizePatch({ target: event.target.value as SpellTarget, hitReviewed: event.target.value === 'На себя' })}>
            {targetOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        {rangeNeeded ? (
          <label>
            <span>Дальность применения, м</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={draft.rangeMeters ?? ''}
              onChange={(event) => patch({ rangeMeters: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </label>
        ) : null}

        {(draft.form === 'Область' || draft.form === 'Аура' || draft.form === 'Создание / барьер') ? (
          <label>
            <span>Форма области</span>
            <select value={draft.area} onChange={(event) => normalizePatch({ area: event.target.value as SpellArea })}>
              {SPELL_AREAS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        ) : null}

        {areaNeeded ? (
          <label>
            <span>Размер области, м</span>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={draft.areaMeters ?? ''}
              onChange={(event) => patch({ areaMeters: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </label>
        ) : null}

        {movementNeeded ? (
          <label>
            <span>Дистанция перемещения, м</span>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={draft.movementMeters ?? ''}
              onChange={(event) => patch({ movementMeters: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </label>
        ) : null}

        {summonCountNeeded ? (
          <label>
            <span>Количество существ</span>
            <input
              type="number"
              min="1"
              max="99"
              step="1"
              value={draft.summonCount ?? 1}
              onChange={(event) => patch({ summonCount: Math.max(1, Number(event.target.value || 1)) })}
            />
          </label>
        ) : null}

        <label>
          <span>Длительность</span>
          <select
            value={draft.durationMode}
            onChange={(event) => {
              const durationMode = event.target.value as SpellDurationMode;
              patch({ durationMode, durationRounds: durationMode === 'Ходы' ? draft.durationRounds ?? 1 : null });
            }}
          >
            {SPELL_DURATION_MODES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>

        {durationNeedsRounds ? (
          <label>
            <span>Сколько ходов</span>
            <input
              type="number"
              min="1"
              max="99"
              step="1"
              value={draft.durationRounds ?? 1}
              onChange={(event) => patch({ durationRounds: Math.max(1, Number(event.target.value || 1)) })}
            />
          </label>
        ) : null}

        {spellUsesFixedPower(draft.powerType) ? (
          <label>
            <span>Базовая сила · d20</span>
            <input
              type="number"
              min="1"
              max="20"
              step="1"
              value={draft.basePower ?? ''}
              onChange={(event) => patch({ basePower: event.target.value === '' ? null : Math.max(1, Math.min(20, Number(event.target.value))) })}
              placeholder="1–20"
            />
          </label>
        ) : null}

        {draft.target !== 'На себя' ? (
          <label>
            <span>Правило попадания · мастер</span>
            <select
              value={!draft.hitReviewed ? 'pending' : draft.requiresHit ? 'required' : 'none'}
              onChange={(event) => {
                const value = event.target.value;
                patch({
                  hitReviewed: value !== 'pending',
                  requiresHit: value === 'required',
                });
              }}
            >
              <option value="pending">Не проверено</option>
              <option value="required">Нужен d20 против сложности цели</option>
              <option value="none">Проверка попадания не нужна</option>
            </select>
          </label>
        ) : null}

        <label className="wide">
          <span>Эффект</span>
          <textarea
            rows={5}
            value={draft.effect}
            onChange={(event) => patch({ effect: event.target.value })}
            placeholder="Опиши один цельный эффект заклинания. Для трансформации — форму и изменения; для перемещения — принцип переноса; для призыва — кого именно призывает."
          />
        </label>
      </div>

      <div className="admin-spell-system-preview">
        <span><b>Структура:</b> {spellSpatialLabels(draft).join(' · ')}</span>
        <span><b>Расчёт:</b> {spellCalculationLabel(draft)}</span>
        <span><b>Мана:</b> стандартный расход класса</span>
        <span><b>База:</b> {draft.basePower == null ? (spellUsesFixedPower(draft.powerType) ? 'не задана' : 'не требуется') : `${draft.basePower} (d20)`}</span>
        <span><b>Крит:</b> числовой эффект ×2</span>
      </div>

      {issues.length ? (
        <div className="admin-spell-editor-issues">
          {issues.map((issue) => <span key={`${issue.field}-${issue.message}`}>{issue.message}</span>)}
        </div>
      ) : null}

      <div className="admin-spell-editor-actions">
        <button type="button" className="admin-button" onClick={onCancel} disabled={saving}>Отмена</button>
        <button
          type="button"
          className="admin-button primary"
          disabled={saving || issues.length > 0}
          onClick={() => onSave(draft)}
        >
          {saving ? 'Сохраняю…' : 'Сохранить и пометить готовым'}
        </button>
      </div>
    </div>
  );
}

export default function AdminSpells({ characters }: { characters: AdminCharacterSummary[] }) {
  const [states, setStates] = useState<Record<string, LoadState>>({});
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<FilterMode>('issues');
  const [search, setSearch] = useState('');
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
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

  async function saveSpell(spellIndex: number, spell: CanonicalSpell) {
    if (!selectedCharacter) return;
    setSaving(true);
    setSaveError('');

    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          characterId: selectedCharacter.id,
          spellIndex,
          spell,
        }),
      });

      const result = await response.json() as { ok?: boolean; spell?: EditorSpell; error?: string };
      if (!response.ok || !result?.ok || !result.spell) {
        throw new Error(result?.error || 'Не удалось сохранить заклинание');
      }

      setStates((prev) => {
        const current = prev[selectedCharacter.id]?.data;
        if (!current) return prev;
        const spells = current.spells.map((item) => item.slotIndex === spellIndex ? result.spell! : item);
        const invalidCount = spells.filter((item) => item.valid !== true).length;
        return {
          ...prev,
          [selectedCharacter.id]: {
            status: 'ready',
            data: {
              ...current,
              spells,
              invalidCount,
              validCount: Math.max(0, spells.length - invalidCount),
              ready: spells.length > 0 && invalidCount === 0,
            },
          },
        };
      });

      setEditingSlot(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

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

              {saveError ? <div className="admin-spell-error compact">{saveError}</div> : null}

              {selectedData.spells.length ? (
                <div className="admin-spell-list">
                  {selectedData.spells.map((spell) => (
                    editingSlot === spell.slotIndex ? (
                      <SpellEditor
                        key={spell.slotIndex}
                        initial={spell}
                        className={selectedData.className || selectedCharacter.className || ''}
                        saving={saving}
                        onCancel={() => setEditingSlot(null)}
                        onSave={(next) => void saveSpell(spell.slotIndex, next)}
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
                          <button type="button" className="admin-button" onClick={() => setEditingSlot(spell.slotIndex)}>
                            {spell.valid ? 'Изменить' : 'Исправить'}
                          </button>
                        </div>
                      </article>
                    )
                  ))}
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
    </section>
  );
}
