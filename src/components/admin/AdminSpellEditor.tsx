import React, { useState } from 'react';
import {
  SPELL_AREAS,
  SPELL_CAST_TIMES,
  SPELL_DURATION_MODES,
  SPELL_FORMS,
  defaultSpellRequiresHit,
  spellSpatialLabels,
  spellTargetOptions,
  spellUsesArea,
  spellUsesMovement,
  spellUsesRange,
  spellUsesSummonCount,
  spellUsesFixedPower,
  normalizeCanonicalSpell,
  spellCalculationLabel,
  validateCanonicalSpell,
  type CanonicalSpell,
  type SpellArea,
  type SpellForm,
  type SpellCastTime,
  type SpellDurationMode,
  type SpellTarget,
} from '../../lib/spellSchema';
import { getSpellTypes, spellPowerTypeLabel, type SpellPowerType } from '../questionnaire/questionnaireLogic';
import SummonedCreaturesEditor from '../spells/SummonedCreaturesEditor';
import './admin-spells.css';

export type EditorSpell = CanonicalSpell & {
  slotIndex: number;
  description?: string;
  rawDescription?: string;
  valid: boolean;
  legacy?: boolean;
  issues: Array<{ field: string; message: string }>;
};

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

export default function SpellEditor({
  initial,
  creating = false,
  className,
  saving,
  onCancel,
  onSave,
  heading,
  saveLabel,
}: {
  initial: EditorSpell;
  creating?: boolean;
  className: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (spell: CanonicalSpell) => void;
  heading?: string;
  saveLabel?: string;
}) {
  const classKey = classKeyFromName(className);
  const allowedTypes = getSpellTypes(classKey);
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
          <span>{heading || (creating ? 'НОВОЕ ЗАКЛИНАНИЕ' : 'РЕДАКТОР ЗАКЛИНАНИЯ')}</span>
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
            {allowedTypes.map((type) => <option key={type} value={type}>{spellPowerTypeLabel(type)}</option>)}
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

        {draft.form === 'Призыв' ? (
          <SummonedCreaturesEditor creatures={draft.summonedCreatures} onChange={summonedCreatures => patch({ summonedCreatures })} />
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
          {saving ? 'Сохраняю…' : saveLabel || (creating ? 'Создать заклинание' : 'Сохранить изменения')}
        </button>
      </div>
    </div>
  );
}
