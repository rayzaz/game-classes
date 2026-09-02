export const SPELL_SCHEMA_VERSION = 3 as const;

export const SPELL_CAST_TIMES = [
  '1 действие',
  '1 реакция',
  '1 круг подготовки',
  '2 круга подготовки',
  '3 круга подготовки',
] as const;

export const SPELL_FORMS = [
  'Направленное',
  'На себя',
  'Область',
  'Аура',
  'Трансформация',
  'Перемещение',
  'Призыв',
  'Создание / барьер',
  'Особое',
] as const;

export const SPELL_TARGETS = [
  'На себя',
  '1 враг',
  '1 союзник',
  'Любая 1 цель',
  'Несколько целей',
  'Точка / область',
] as const;

export const SPELL_AREAS = [
  'Одна цель',
  'Круг',
  'Конус',
  'Линия',
  'Вокруг себя',
] as const;

export const SPELL_DURATION_MODES = [
  'Мгновенно',
  'Ходы',
  'До конца боя',
  'До снятия',
] as const;

export type SpellCastTime = (typeof SPELL_CAST_TIMES)[number];
export type SpellForm = (typeof SPELL_FORMS)[number];
export type SpellTarget = (typeof SPELL_TARGETS)[number];
export type SpellArea = (typeof SPELL_AREAS)[number];
export type SpellDurationMode = (typeof SPELL_DURATION_MODES)[number];

export type CanonicalSpell = {
  schemaVersion: typeof SPELL_SCHEMA_VERSION;
  name: string;
  powerType: string;
  form: SpellForm;
  castTime: SpellCastTime;
  target: SpellTarget;
  rangeMeters: number | null;
  area: SpellArea;
  areaMeters: number | null;
  movementMeters: number | null;
  summonCount: number | null;
  durationMode: SpellDurationMode;
  durationRounds: number | null;
  effect: string;
  basePower: number | null;
  powerDie: 'd20';
  powerScale: number;
  requiresHit: boolean;
  hitReviewed: boolean;
  manaMode: 'class';
  manaScale: number;
};

export type SpellValidationIssue = {
  field: keyof CanonicalSpell | 'legacy';
  message: string;
};

const OFFENSIVE_TYPES = new Set([
  'Урон',
  'Дебафф',
  'Контроль',
]);


export function spellUsesFixedPower(powerType: string) {
  return String(powerType || '').trim() !== 'Без расчёта';
}

export function normalizeBasePower(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.min(20, Math.round(parsed)));
}

export function defaultSpellRequiresHit(powerType: string) {
  return OFFENSIVE_TYPES.has(String(powerType || '').trim());
}

export function defaultSpellForm(powerType: string): SpellForm {
  const type = String(powerType || '').trim();
  if (type === 'Призыв') return 'Призыв';
  if (type === 'Защита') return 'Создание / барьер';
  return 'Направленное';
}

export function inferSpellForm(text: string, powerType = ''): SpellForm {
  const source = String(text || '').toLowerCase().replace(/ё/g, 'е');

  if (/(трансформ|превращ|облик|форма\b|метаморф|оборот)/i.test(source)) return 'Трансформация';
  if (/(телепорт|перемещ|рывок|скачок|портал|переносит|перенести)/i.test(source)) return 'Перемещение';
  if (/(аура|вокруг себя|окружает себя|поле вокруг)/i.test(source)) return 'Аура';
  if (/(призыва|призыв|существ|фамильяр|создает помощника|создаёт помощника)/i.test(source) || powerType === 'Призыв') return 'Призыв';
  if (/(барьер|стена|купол|щит|преград|укрыт|конструкц)/i.test(source) || powerType === 'Защита') return 'Создание / барьер';
  if (/(радиус|область|зона|всем врагам|всех врагов|всех союзников|по площади)/i.test(source)) return 'Область';

  return defaultSpellForm(powerType);
}

export function spellTargetOptions(form: SpellForm): readonly SpellTarget[] {
  switch (form) {
    case 'На себя':
    case 'Аура':
      return ['На себя'];
    case 'Трансформация':
      return ['На себя', '1 союзник', 'Любая 1 цель'];
    case 'Перемещение':
      return ['На себя', '1 союзник', '1 враг', 'Любая 1 цель'];
    case 'Призыв':
      return ['Точка / область', 'На себя'];
    case 'Область':
      return ['Точка / область', 'На себя'];
    case 'Создание / барьер':
      return ['На себя', '1 союзник', 'Любая 1 цель', 'Точка / область'];
    case 'Особое':
      return SPELL_TARGETS;
    case 'Направленное':
    default:
      return ['1 враг', '1 союзник', 'Любая 1 цель', 'Несколько целей'];
  }
}

export function spellUsesRange(spell: Pick<CanonicalSpell, 'form' | 'target'>) {
  if (spell.target === 'На себя') return false;
  return !['На себя', 'Аура', 'Особое'].includes(spell.form);
}

export function spellUsesArea(spell: Pick<CanonicalSpell, 'form' | 'area'>) {
  if (spell.form === 'Область' || spell.form === 'Аура') return true;
  if (spell.form === 'Создание / барьер') return spell.area !== 'Одна цель';
  return false;
}

export function spellUsesMovement(spell: Pick<CanonicalSpell, 'form'>) {
  return spell.form === 'Перемещение';
}

export function spellUsesSummonCount(spell: Pick<CanonicalSpell, 'form'>) {
  return spell.form === 'Призыв';
}

export function makeCanonicalSpell(powerType = 'Урон'): CanonicalSpell {
  const form = defaultSpellForm(powerType);
  const target: SpellTarget = form === 'Призыв'
    ? 'Точка / область'
    : form === 'Создание / барьер'
      ? 'На себя'
      : OFFENSIVE_TYPES.has(powerType)
        ? '1 враг'
        : '1 союзник';

  return {
    schemaVersion: SPELL_SCHEMA_VERSION,
    name: '',
    powerType,
    form,
    castTime: '1 действие',
    target,
    rangeMeters: target === 'На себя' ? null : 9,
    area: 'Одна цель',
    areaMeters: null,
    movementMeters: null,
    summonCount: form === 'Призыв' ? 1 : null,
    durationMode: powerType === 'Урон' || powerType === 'Лечение' ? 'Мгновенно' : 'Ходы',
    durationRounds: powerType === 'Урон' || powerType === 'Лечение' ? null : 1,
    effect: '',
    basePower: null,
    powerDie: 'd20',
    powerScale: 100,
    requiresHit: defaultSpellRequiresHit(powerType),
    hitReviewed: target === 'На себя',
    manaMode: 'class',
    manaScale: 100,
  };
}

export function normalizeMeters(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed * 10) / 10);
}

export function normalizePercent(value: unknown, fallback = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, Math.round(parsed)));
}

export function normalizeCanonicalSpell(
  raw: Partial<CanonicalSpell> & Record<string, unknown>,
  powerTypeFallback = 'Урон',
): CanonicalSpell {
  const powerType = String(raw.powerType || powerTypeFallback || 'Урон').trim();
  const base = makeCanonicalSpell(powerType);
  const inferredText = `${String(raw.name || '')} ${String(raw.effect || raw.description || '')}`;
  const form = SPELL_FORMS.includes(raw.form as SpellForm)
    ? (raw.form as SpellForm)
    : inferSpellForm(inferredText, powerType);

  const castTime = SPELL_CAST_TIMES.includes(raw.castTime as SpellCastTime)
    ? (raw.castTime as SpellCastTime)
    : base.castTime;

  const allowedTargets = spellTargetOptions(form);
  const target = allowedTargets.includes(raw.target as SpellTarget)
    ? (raw.target as SpellTarget)
    : allowedTargets[0];

  let area: SpellArea = SPELL_AREAS.includes(raw.area as SpellArea)
    ? (raw.area as SpellArea)
    : 'Одна цель';

  if (form === 'Аура') area = 'Вокруг себя';
  if (form === 'Область' && area === 'Одна цель') area = 'Круг';
  if (!['Область', 'Аура', 'Создание / барьер'].includes(form)) area = 'Одна цель';

  const durationMode = SPELL_DURATION_MODES.includes(raw.durationMode as SpellDurationMode)
    ? (raw.durationMode as SpellDurationMode)
    : base.durationMode;

  const shouldHaveRange = spellUsesRange({ form, target } as CanonicalSpell);
  const rangeMeters = shouldHaveRange
    ? normalizeMeters(raw.rangeMeters ?? base.rangeMeters ?? 9)
    : null;

  const shouldHaveArea = spellUsesArea({ form, area } as CanonicalSpell);
  const areaMeters = shouldHaveArea
    ? normalizeMeters(raw.areaMeters ?? 3)
    : null;

  const movementMeters = form === 'Перемещение'
    ? normalizeMeters(raw.movementMeters ?? raw.rangeMeters ?? 9)
    : null;

  const summonRaw = Number(raw.summonCount ?? 1);
  const summonCount = form === 'Призыв'
    ? Math.max(1, Math.min(99, Number.isFinite(summonRaw) ? Math.trunc(summonRaw) : 1))
    : null;

  const durationRounds = durationMode === 'Ходы'
    ? Math.max(1, Math.min(99, Math.trunc(Number(raw.durationRounds || 1))))
    : null;

  const defaultRequiresHit = target === 'На себя'
    ? false
    : defaultSpellRequiresHit(powerType);

  // Даже для «Без расчёта» не стираем уже выпавший d20: если игрок
  // вернётся к числовому типу, он не сможет получить бесплатный переброс.
  const basePower = normalizeBasePower(raw.basePower ?? raw.power ?? raw.powerRoll);

  return {
    schemaVersion: SPELL_SCHEMA_VERSION,
    name: String(raw.name || '').trim(),
    powerType,
    form,
    castTime,
    target,
    rangeMeters,
    area,
    areaMeters,
    movementMeters,
    summonCount,
    durationMode,
    durationRounds,
    effect: String(raw.effect || '').trim(),
    basePower,
    powerDie: 'd20',
    powerScale: normalizePercent(raw.powerScale, 100),
    requiresHit: typeof raw.requiresHit === 'boolean'
      ? (target === 'На себя' ? false : raw.requiresHit)
      : defaultRequiresHit,
    hitReviewed: target === 'На себя' ? true : raw.hitReviewed === true,
    manaMode: 'class',
    manaScale: normalizePercent(raw.manaScale, 100),
  };
}

export function validateCanonicalSpell(
  spell: CanonicalSpell,
  options: { requireMasterReview?: boolean } = {},
): SpellValidationIssue[] {
  const issues: SpellValidationIssue[] = [];

  if (!spell.name.trim()) issues.push({ field: 'name', message: 'Нет названия.' });
  if (!spell.powerType.trim()) issues.push({ field: 'powerType', message: 'Не выбран тип заклинания.' });
  if (!SPELL_FORMS.includes(spell.form)) issues.push({ field: 'form', message: 'Не выбран способ применения заклинания.' });
  if (!SPELL_CAST_TIMES.includes(spell.castTime)) issues.push({ field: 'castTime', message: 'Нужно выбрать стандартное время каста.' });

  const allowedTargets = spellTargetOptions(spell.form);
  if (!allowedTargets.includes(spell.target)) {
    issues.push({ field: 'target', message: 'Выбранная цель не подходит этому способу применения.' });
  }

  if (spellUsesRange(spell) && (spell.rangeMeters === null || spell.rangeMeters < 0)) {
    issues.push({ field: 'rangeMeters', message: 'Для этого заклинания нужна дальность в метрах.' });
  }

  if (spellUsesArea(spell) && (spell.areaMeters === null || spell.areaMeters <= 0)) {
    issues.push({ field: 'areaMeters', message: 'Для области нужен размер в метрах.' });
  }

  if (spellUsesMovement(spell) && (spell.movementMeters === null || spell.movementMeters <= 0)) {
    issues.push({ field: 'movementMeters', message: 'Укажите, на сколько метров перемещает заклинание.' });
  }

  if (spellUsesSummonCount(spell) && (!spell.summonCount || spell.summonCount < 1)) {
    issues.push({ field: 'summonCount', message: 'Укажите количество призываемых существ.' });
  }

  if (!SPELL_DURATION_MODES.includes(spell.durationMode)) issues.push({ field: 'durationMode', message: 'Нужно выбрать длительность.' });
  if (spell.durationMode === 'Ходы' && (!spell.durationRounds || spell.durationRounds < 1)) {
    issues.push({ field: 'durationRounds', message: 'Укажите количество ходов.' });
  }
  if (!spell.effect.trim()) issues.push({ field: 'effect', message: 'Не описан эффект заклинания.' });
  if (spellUsesFixedPower(spell.powerType) && (spell.basePower === null || spell.basePower < 1 || spell.basePower > 20)) {
    issues.push({ field: 'basePower', message: 'Нужно один раз бросить d20 и закрепить базовую силу заклинания.' });
  }
  if (options.requireMasterReview && spell.target !== 'На себя' && !spell.hitReviewed) {
    issues.push({ field: 'hitReviewed', message: 'Мастер должен подтвердить, требуется ли d20 против сложности цели.' });
  }
  if (!Number.isFinite(spell.powerScale) || spell.powerScale < 1) issues.push({ field: 'powerScale', message: 'Некорректная сила эффекта.' });
  if (!Number.isFinite(spell.manaScale) || spell.manaScale < 1) issues.push({ field: 'manaScale', message: 'Некорректный расход маны.' });

  return issues;
}

export function spellDurationLabel(spell: Pick<CanonicalSpell, 'durationMode' | 'durationRounds'>) {
  if (spell.durationMode !== 'Ходы') return spell.durationMode;
  const rounds = Math.max(1, Number(spell.durationRounds || 1));
  return `${rounds} ход${rounds === 1 ? '' : rounds >= 2 && rounds <= 4 ? 'а' : 'ов'}`;
}

export function spellAreaLabel(spell: Pick<CanonicalSpell, 'form' | 'area' | 'areaMeters'>) {
  if (!spellUsesArea(spell as CanonicalSpell)) return '';
  const size = spell.areaMeters == null ? '—' : `${spell.areaMeters} м`;
  return `${spell.area} · ${size}`;
}

export function spellSpatialLabels(spell: CanonicalSpell) {
  const labels: string[] = [spell.form, spell.target];
  if (spellUsesRange(spell) && spell.rangeMeters != null) labels.push(`${spell.rangeMeters} м`);
  const area = spellAreaLabel(spell);
  if (area) labels.push(area);
  if (spellUsesMovement(spell) && spell.movementMeters != null) labels.push(`перемещение ${spell.movementMeters} м`);
  if (spellUsesSummonCount(spell) && spell.summonCount != null) labels.push(`призыв ×${spell.summonCount}`);
  return labels;
}

export function spellCalculationLabel(spell: Pick<CanonicalSpell, 'powerType' | 'powerScale' | 'form' | 'basePower'>) {
  const statByType: Record<string, string> = {
    Урон: 'Атака',
    Лечение: 'Лечение',
    Защита: 'Защита',
    Бафф: 'Бафф',
    Дебафф: 'Дебафф',
    Призыв: 'Призыв',
    Ресурс: 'Ресурс',
    Контроль: 'Контроль',
  };

  if (spell.powerType === 'Без расчёта') return 'Без фиксированной числовой силы · применяется собственная механика заклинания';
  const stat = statByType[spell.powerType] || spell.powerType || 'эффект';
  const fixed = spell.basePower == null ? 'd20 ещё не закреплён' : `${spell.basePower} базовой силы`;
  const levelPart = `${stat} от уровня${spell.powerScale === 100 ? '' : ` × ${spell.powerScale}%`}`;
  const base = `${fixed} + ${levelPart}`;
  if (spell.form === 'Трансформация') return `Трансформация · ${base}`;
  if (spell.form === 'Перемещение') return `Перемещение · ${base}`;
  if (spell.form === 'Призыв') return `Призыв · ${base}`;
  return base;
}
