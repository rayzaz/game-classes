import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getClassScores,
  getElementLabel,
  getMagicSuggestions,
  getSpellTypes,
  MAGIC_ELEMENTS,
  type ElementId,
  type SpellPowerType,
} from './questionnaireLogic';
import './questionnaire.css';

export type GameClass = {
  id?: string | number;
  key?: string;
  name: string;
  emoji?: string;
  role?: string | null;
  roles?: string[] | null;
  tags?: string[] | null;
  who?: string;
  complexity?: string;
  strengths?: string;
  weaknesses?: string;
  desc?: string;
  description?: string;
  bestallies?: string;
  counterplay?: string;
  fit?: string;
  image?: string;
  placeholder?: boolean;
};

export type Spell = {
  name: string;
  castTime: string;
  radius: string;
  effect: string;
  duration: string;
  powerType: SpellPowerType;
  power: number | null;
  powerDie: 'd20';
};

export type WeightCategory =
  | 'худоба'
  | 'обычный'
  | 'плотный'
  | 'полнота'
  | 'ожирение';

export type BodyType =
  | 'слабое'
  | 'обычное'
  | 'подтянутое'
  | 'рельефное'
  | 'атлетическое';

export type QuestionnaireData = {
  name: string;
  age: number;
  suit: 'Клевер' | 'Алмаз' | 'Пики' | 'Червы';
  bio: string;
  race: string;
  playerLink: string;

  height: string;
  weight: string;
  weightCategory: WeightCategory;
  body: BodyType;
  hairColor: string;
  hairLength: string;
  eyes: string;
  marks: string;

  hasGrimoire: boolean;
  plannedAge?: number | null;
  noviceNote: string;
  magicName: string;
  magicInspiration: string;
  magicDescription: string;

  classKey: string | null;
  universalRoll?: number | null;

  // elements сохраняем в старом человекочитаемом виде для совместимости,
  // а elementKeys — как стабильные системные идентификаторы.
  elements: string[];
  elementKeys: ElementId[];

  spells: Spell[];

  combatNotes: string;

  photo: {
    name: string;
    mime: string;
    size: number;
    dataUrl: string;
  } | null;

  grimoirePhoto: {
    name: string;
    mime: string;
    size: number;
    dataUrl: string;
  } | null;
};

type Props = {
  assistant?: { name: string; title?: string };
  classes: GameClass[];
  variant?: unknown;
  onSpeakingChange?: (v: boolean) => void;
  onCancel?: () => void;
  onFinish?: (data: QuestionnaireData, pickedClass?: GameClass | null) => void;
  initial?: Partial<QuestionnaireData>;
};

const SUITS = ['Клевер', 'Алмаз', 'Пики', 'Червы'] as const;

const WEIGHT_CATEGORIES: WeightCategory[] = [
  'худоба',
  'обычный',
  'плотный',
  'полнота',
  'ожирение',
];

const BODIES: BodyType[] = [
  'слабое',
  'обычное',
  'подтянутое',
  'рельефное',
  'атлетическое',
];

const TOTAL_STEPS = 6;

const QUESTIONNAIRE_DRAFT_STORAGE = 'gosmag-questionnaire-draft-v1';
const QUESTIONNAIRE_DRAFT_VERSION = 1;

type StoredQuestionnaireDraft = {
  version: number;
  savedAt: string;
  step: number;
  universalRoll: number | null;
  data: QuestionnaireData;
};

export function clearQuestionnaireDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(QUESTIONNAIRE_DRAFT_STORAGE);
  } catch {
    // Если браузер запретил localStorage, анкета всё равно продолжит работать.
  }
}

function loadQuestionnaireDraft(): StoredQuestionnaireDraft | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(QUESTIONNAIRE_DRAFT_STORAGE);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredQuestionnaireDraft>;
    if (parsed.version !== QUESTIONNAIRE_DRAFT_VERSION || !parsed.data) {
      return null;
    }

    return {
      version: QUESTIONNAIRE_DRAFT_VERSION,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      step: Number.isInteger(parsed.step) ? Math.max(1, Math.min(TOTAL_STEPS, Number(parsed.step))) : 1,
      universalRoll: Number.isInteger(parsed.universalRoll) ? Number(parsed.universalRoll) : null,
      data: normalizeInitial(parsed.data),
    };
  } catch {
    return null;
  }
}

function formatDraftTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const STEP_META = [
  { id: 1, title: 'Основное', short: 'Кто вы' },
  { id: 2, title: 'Внешность', short: 'Образ' },
  { id: 3, title: 'Магия', short: 'Природы' },
  { id: 4, title: 'Класс', short: 'Роль' },
  { id: 5, title: 'Заклинания', short: '1–3' },
  { id: 6, title: 'Проверка', short: 'Готово' },
];

function toKey(c: GameClass) {
  return String(c.id ?? c.key ?? c.name);
}

function collectRoles(c: GameClass): string[] {
  const bucket: string[] = [];
  if (typeof c.role === 'string' && c.role.trim()) bucket.push(c.role);
  if (Array.isArray(c.roles)) bucket.push(...c.roles);
  if (Array.isArray(c.tags)) bucket.push(...c.tags);
  return bucket.map((role) => role.toLowerCase());
}

function isUniversal(c: GameClass) {
  return collectRoles(c).some((role) =>
    ['универсал', 'универсальный', 'universal'].some((word) => role.includes(word)),
  );
}

function secureRoll(max: number) {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bucket = new Uint32Array(1);
    crypto.getRandomValues(bucket);
    return (bucket[0] % max) + 1;
  }
  return Math.floor(Math.random() * max) + 1;
}

function makeSpell(powerType: SpellPowerType = 'Урон'): Spell {
  return {
    name: '',
    castTime: '',
    radius: '',
    effect: '',
    duration: '',
    powerType,
    power: null,
    powerDie: 'd20',
  };
}

function normalizeWeightCategory(value: unknown): WeightCategory {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (WEIGHT_CATEGORIES.includes(normalized as WeightCategory)) {
    return normalized as WeightCategory;
  }

  return 'обычный';
}

function normalizeBodyType(value: unknown): BodyType {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (BODIES.includes(normalized as BodyType)) {
    return normalized as BodyType;
  }

  // Совместимость со старыми черновиками анкеты.
  if (normalized === 'худощавый') return 'слабое';
  if (normalized === 'средний') return 'обычное';
  if (normalized === 'крепкий') return 'подтянутое';

  return 'обычное';
}

function normalizeInitial(initial?: Partial<QuestionnaireData>): QuestionnaireData {
  const initialKeys = Array.isArray(initial?.elementKeys) ? initial!.elementKeys! : [];
  const initialElements = Array.isArray(initial?.elements) ? initial!.elements! : [];

  return {
    name: initial?.name ?? '',
    age: initial?.age ?? 14,
    suit: initial?.suit ?? 'Клевер',
    bio: initial?.bio ?? '',
    race: initial?.race ?? 'человек',
    playerLink: initial?.playerLink ?? '',

    height: initial?.height ?? '',
    weight: initial?.weight ?? '',
    weightCategory: normalizeWeightCategory(initial?.weightCategory),
    body: normalizeBodyType(initial?.body),
    hairColor: initial?.hairColor ?? '',
    hairLength: initial?.hairLength ?? '',
    eyes: initial?.eyes ?? '',
    marks: initial?.marks ?? '',

    hasGrimoire: true,
    plannedAge: null,
    noviceNote: 'Персонаж может вступать в рыцари с 14 лет. Новичок — это уровень опыта в ордене, а не возраст. Гримуар к этому моменту уже получен.',
    magicName: initial?.magicName ?? '',
    magicInspiration: initial?.magicInspiration ?? '',
    magicDescription: initial?.magicDescription ?? '',

    classKey: initial?.classKey ?? null,

    elements:
      initialElements.length > 0
        ? initialElements
        : initialKeys.map((key) => getElementLabel(key).toLowerCase()),
    elementKeys: initialKeys,

    spells:
      Array.isArray(initial?.spells) && initial!.spells!.length > 0
        ? initial!.spells!.map((spell) => ({
            ...makeSpell(spell.powerType ?? 'Урон'),
            ...spell,
            powerDie: 'd20',
          }))
        : [makeSpell()],

    combatNotes: 'Сила стартового заклинания определяется одноразовым броском d20 в анкете: выпавшее число становится значением урона, лечения, защиты, баффа, дебаффа и т.п. в зависимости от типа способности.',

    photo: initial?.photo ?? null,
    grimoirePhoto: initial?.grimoirePhoto ?? null,
  };
}

async function optimizePortrait(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Нужно выбрать изображение JPG, PNG или WebP.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Исходный файл слишком большой. Максимум 5 МБ.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
      img.src = objectUrl;
    });

    const maxSide = 720;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не смог подготовить изображение.');

    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.76);

    return {
      name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
      mime: 'image/jpeg',
      size: Math.round((dataUrl.length * 3) / 4),
      dataUrl,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function scoreLabel(score: number, topScore: number) {
  if (score <= 0 || topScore <= 0) return 'Возможно';
  const ratio = score / topScore;
  if (ratio >= 0.8) return 'Отлично подходит';
  if (ratio >= 0.55) return 'Хорошо подходит';
  return 'Можно попробовать';
}

export default function QuestionnaireWizard({
  assistant = { name: 'Помощник' },
  classes,
  onCancel,
  onFinish,
  initial,
}: Props) {
  const restoredDraftRef = useRef<StoredQuestionnaireDraft | null>(
    initial ? null : loadQuestionnaireDraft(),
  );

  const [step, setStep] = useState(() => restoredDraftRef.current?.step ?? 1);
  const [data, setData] = useState<QuestionnaireData>(() =>
    initial
      ? normalizeInitial(initial)
      : restoredDraftRef.current?.data ?? normalizeInitial(),
  );
  const [universalRoll, setUniversalRoll] = useState<number | null>(() =>
    initial?.universalRoll ?? restoredDraftRef.current?.universalRoll ?? null,
  );
  const [draftRestored, setDraftRestored] = useState(Boolean(restoredDraftRef.current));
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(
    restoredDraftRef.current?.savedAt || null,
  );
  const [classMessage, setClassMessage] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [grimoireBusy, setGrimoireBusy] = useState(false);
  const [grimoireError, setGrimoireError] = useState<string | null>(null);
  const [rollBusy, setRollBusy] = useState<number | null>(null);

  useEffect(() => {
    // Редактирование уже отправленной анкеты не сохраняем в локальный черновик:
    // её исходные данные уже находятся на сервере.
    if (initial) return;

    const timer = window.setTimeout(() => {
      const draft: StoredQuestionnaireDraft = {
        version: QUESTIONNAIRE_DRAFT_VERSION,
        savedAt: new Date().toISOString(),
        step,
        universalRoll,
        data,
      };

      try {
        window.localStorage.setItem(QUESTIONNAIRE_DRAFT_STORAGE, JSON.stringify(draft));
        setDraftSavedAt(draft.savedAt);
      } catch {
        // Например, браузер запретил localStorage или закончилась квота.
        // Само заполнение анкеты из-за этого не ломаем.
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [data, initial, step, universalRoll]);

  const usableClasses = useMemo(
    () => classes.filter((klass) => !klass.placeholder && toKey(klass) !== 'placeholder'),
    [classes],
  );

  const pickedClass = useMemo(
    () => (data.classKey ? usableClasses.find((klass) => toKey(klass) === data.classKey) ?? null : null),
    [data.classKey, usableClasses],
  );

  const magicSuggestions = useMemo(
    () => getMagicSuggestions(data.elementKeys),
    [data.elementKeys],
  );

  const classScores = useMemo(
    () => getClassScores(data.elementKeys, data.magicInspiration),
    [data.elementKeys, data.magicInspiration],
  );

  const recommendedClasses = useMemo(() => {
    return usableClasses
      .map((klass) => ({ klass, score: classScores[toKey(klass)] ?? 0 }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.klass.name.localeCompare(b.klass.name, 'ru'))
      .slice(0, 3);
  }, [usableClasses, classScores]);

  const spellTypes = useMemo(() => getSpellTypes(data.classKey), [data.classKey]);
  const progress = Math.round((step / TOTAL_STEPS) * 100);

  const valid1 =
    data.name.trim().length >= 2 &&
    Number.isInteger(data.age) &&
    data.age >= 14 &&
    data.bio.trim().length >= 20 &&
    data.race.trim().length > 0 &&
    data.playerLink.trim().length > 0;

  const valid2 =
    data.height.trim().length > 0 &&
    data.weight.trim().length > 0 &&
    data.hairColor.trim().length > 0 &&
    data.hairLength.trim().length > 0 &&
    data.eyes.trim().length > 0;

  const valid3 =
    data.elementKeys.length >= 1 &&
    data.elementKeys.length <= 4 &&
    data.magicInspiration.trim().length >= 2 &&
    data.magicName.trim().length >= 3 &&
    data.magicDescription.trim().length >= 10;

  const valid4 = Boolean(data.classKey);

  const valid5 =
    data.spells.length >= 1 &&
    data.spells.length <= 3 &&
    data.spells.every(
      (spell) =>
        spell.name.trim() &&
        spell.castTime.trim() &&
        spell.radius.trim() &&
        spell.effect.trim() &&
        spell.duration.trim() &&
        Number.isInteger(spell.power) &&
        Number(spell.power) >= 1 &&
        Number(spell.power) <= 20,
    );

  const canContinue = [valid1, valid2, valid3, valid4, valid5, true][step - 1] ?? false;

  function setField<K extends keyof QuestionnaireData>(key: K, value: QuestionnaireData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function goTo(next: number) {
    setStep(Math.max(1, Math.min(TOTAL_STEPS, next)));
  }

  function toggleElement(elementId: ElementId) {
    setData((prev) => {
      const has = prev.elementKeys.includes(elementId);
      const elementKeys = has
        ? prev.elementKeys.filter((key) => key !== elementId)
        : prev.elementKeys.length >= 4
          ? prev.elementKeys
          : [...prev.elementKeys, elementId];

      const magicNameWasAutoFilled =
        prev.magicInspiration.trim().length > 0 &&
        prev.magicName.trim() === prev.magicInspiration.trim();

      return {
        ...prev,
        elementKeys,
        elements: elementKeys.map((key) => getElementLabel(key).toLowerCase()),
        magicInspiration: '',
        magicName: magicNameWasAutoFilled ? '' : prev.magicName,
      };
    });
  }

  function pickMagic(name: string) {
    setData((prev) => ({
      ...prev,
      magicInspiration: name,
      magicName: prev.magicName.trim() ? prev.magicName : name,
    }));
  }

  function pickCustomMagic() {
    setData((prev) => ({
      ...prev,
      magicInspiration: 'Своя идея',
    }));
  }

  function updateSpell(index: number, patch: Partial<Spell>) {
    setData((prev) => {
      const spells = prev.spells.slice();
      spells[index] = { ...spells[index], ...patch };
      return { ...prev, spells };
    });
  }

  function addSpell() {
    setData((prev) => {
      if (prev.spells.length >= 3) return prev;
      return { ...prev, spells: [...prev.spells, makeSpell(spellTypes[0])] };
    });
  }

  function removeSpell(index: number) {
    setData((prev) => {
      if (prev.spells.length <= 1) return prev;
      return { ...prev, spells: prev.spells.filter((_, spellIndex) => spellIndex !== index) };
    });
  }

  function selectClass(klass: GameClass) {
    const key = toKey(klass);

    if (isUniversal(klass)) {
      const result = universalRoll ?? secureRoll(100);
      if (universalRoll === null) setUniversalRoll(result);

      if (result < 80) {
        setClassMessage(`🎲 d100 = ${result}. Для универсального класса нужно 80–100. В этой анкете универсалы заблокированы.`);
        setField('classKey', null);
        return;
      }
      setClassMessage(`🎲 d100 = ${result}. Успех — универсальный класс доступен.`);
    } else {
      setClassMessage(null);
    }

    setData((prev) => {
      if (prev.classKey === key) return prev;
      const allowedTypes = getSpellTypes(key);
      return {
        ...prev,
        classKey: key,
        spells: prev.spells.map((spell) => ({
          ...spell,
          powerType: allowedTypes.includes(spell.powerType) ? spell.powerType : allowedTypes[0],
          power: null,
        })),
      };
    });
  }

  async function rollSpell(index: number) {
    const spell = data.spells[index];
    if (!spell || spell.power != null || rollBusy != null) return;

    setRollBusy(index);
    try {
      const value = secureRoll(20);
      updateSpell(index, { power: value, powerDie: 'd20' });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Не удалось бросить d20.');
    } finally {
      setRollBusy(null);
    }
  }

  async function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPhotoError(null);
    if (!file) {
      setField('photo', null);
      return;
    }

    setPhotoBusy(true);
    try {
      const photo = await optimizePortrait(file);
      setField('photo', photo);
    } catch (error) {
      setField('photo', null);
      setPhotoError(error instanceof Error ? error.message : 'Не удалось обработать изображение.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onPickGrimoirePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setGrimoireError(null);

    if (!file) {
      setField('grimoirePhoto', null);
      return;
    }

    setGrimoireBusy(true);

    try {
      const image = await optimizePortrait(file);
      setField('grimoirePhoto', image);
    } catch (error) {
      setField('grimoirePhoto', null);
      setGrimoireError(error instanceof Error ? error.message : 'Не удалось обработать изображение гримуара.');
    } finally {
      setGrimoireBusy(false);
    }
  }

  function discardDraft() {
    clearQuestionnaireDraft();
    restoredDraftRef.current = null;
    setDraftRestored(false);
    setDraftSavedAt(null);
    setStep(1);
    setUniversalRoll(null);
    setClassMessage(null);
    setPhotoError(null);
    setGrimoireError(null);
    setData(normalizeInitial());
  }

  function submit() {
    if (!(valid1 && valid2 && valid3 && valid4 && valid5)) return;
    onFinish?.(
      {
        ...data,
        universalRoll,
      },
      pickedClass,
    );
  }

  const topScore = recommendedClasses[0]?.score ?? 0;

  return (
    <div className="qf-shell">
      <div className="qf-head">
        <div>
          <div className="qf-kicker">ГосМАГ · регистрационное дело</div>
          <h2>Анкета персонажа</h2>
          <p>{assistant.name} поможет заполнить только то, что действительно нужно для старта.</p>
        </div>
        <div className="qf-progress-number">{progress}%</div>
      </div>

      <div className="qf-progress" aria-label={`Заполнено ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      {!initial && (
        <div className={`qf-info ${draftRestored ? 'success' : ''}`} style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span>
              {draftRestored
                ? `✓ Черновик восстановлен${draftSavedAt ? ` · сохранён в ${formatDraftTime(draftSavedAt)}` : ''}. Все дальнейшие изменения сохраняются автоматически.`
                : `Черновик сохраняется автоматически в этом браузере${draftSavedAt ? ` · последнее сохранение в ${formatDraftTime(draftSavedAt)}` : ''}.`}
            </span>

            {(draftRestored || data.name.trim() || data.bio.trim() || data.magicName.trim()) && (
              <button type="button" className="qf-icon-button danger" onClick={discardDraft}>
                Очистить черновик
              </button>
            )}
          </div>
        </div>
      )}

      <div className="qf-steps" aria-label="Разделы анкеты">
        {STEP_META.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`qf-step ${step === item.id ? 'is-active' : ''} ${step > item.id ? 'is-done' : ''}`}
            onClick={() => {
              if (item.id <= step) goTo(item.id);
            }}
          >
            <span>{step > item.id ? '✓' : item.id}</span>
            <div><b>{item.title}</b><small>{item.short}</small></div>
          </button>
        ))}
      </div>

      <div className="qf-card">
        {step === 1 && (
          <section className="qf-section">
            <div className="qf-section-title">
              <span>01</span>
              <div><h3>Имя, возраст и происхождение</h3><p>Вступать в рыцари можно с 14 лет. Верхней границы возраста нет.</p></div>
            </div>

            <div className="qf-grid two">
              <label className="qf-field wide">
                <span>Имя персонажа</span>
                <input value={data.name} onChange={(e) => setField('name', e.target.value)} placeholder="Например: Паувинд Рен" />
              </label>

              <label className="qf-field">
                <span>Возраст</span>
                <input
                  type="number"
                  min={14}
                  step={1}
                  inputMode="numeric"
                  value={data.age}
                  onChange={(e) => setField('age', Number(e.target.value))}
                  placeholder="14"
                />
                <small>Минимум 14 лет. Персонаж может быть взрослым или пожилым — верхней границы в анкете нет.</small>
              </label>

              <label className="qf-field">
                <span>Раса</span>
                <input value={data.race} onChange={(e) => setField('race', e.target.value)} placeholder="человек" />
                <small>По умолчанию человек. Исключения требуют отдельного допуска по правилам игры.</small>
              </label>

              <div className="qf-field wide">
                <span>Место рождения</span>
                <div className="qf-choice-row four">
                  {SUITS.map((suit) => (
                    <button key={suit} type="button" className={data.suit === suit ? 'is-selected' : ''} onClick={() => setField('suit', suit)}>{suit}</button>
                  ))}
                </div>
              </div>

              <label className="qf-field wide">
                <span>Ссылка на игрока / профиль VK</span>
                <input
                  type="url"
                  value={data.playerLink}
                  onChange={(e) => setField('playerLink', e.target.value)}
                  placeholder="https://vk.com/..."
                />
                <small>Нужна для существующей основной Google-таблицы. Позже при автоматическом создании персонажа эта ссылка будет переноситься в его блок.</small>
              </label>

              <label className="qf-field wide">
                <span>Краткая биография</span>
                <textarea rows={7} value={data.bio} onChange={(e) => setField('bio', e.target.value)} placeholder="Семья, происхождение, воспитание, обучение и первые шаги после получения гримуара…" />
                <small>Все люди этого мира обладают магией; гримуар к моменту вступления в рыцари уже получен. Возраст персонажа может быть любым от 14 лет.</small>
              </label>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="qf-section">
            <div className="qf-section-title">
              <span>02</span>
              <div><h3>Внешность</h3><p>Только основные признаки, без лишней анкеты на двадцать полей.</p></div>
            </div>

            <div className="qf-appearance">
              <div className="qf-portrait-box">
                <div className="qf-portrait-preview">
                  {data.photo?.dataUrl ? <img src={data.photo.dataUrl} alt="Портрет персонажа" /> : <div><b>Портрет</b><span>Можно добавить арт персонажа</span></div>}
                </div>
                <label className="qf-upload">
                  <input type="file" accept="image/*" onChange={onPickPhoto} disabled={photoBusy} />
                  <span>{photoBusy ? 'Обрабатываю…' : data.photo ? 'Заменить изображение' : 'Выбрать изображение'}</span>
                </label>
                <small>Рекомендуемый формат: квадрат 1:1, например 720×720 px. JPG / PNG / WebP, до 5 МБ. Сайт уменьшит файл без обрезания.</small>
                {photoError && <div className="qf-error">{photoError}</div>}
              </div>

              <div className="qf-grid two">
                <label className="qf-field"><span>Рост, см</span><input inputMode="numeric" value={data.height} onChange={(e) => setField('height', e.target.value)} placeholder="172" /></label>
                <label className="qf-field"><span>Вес, кг</span><input inputMode="numeric" value={data.weight} onChange={(e) => setField('weight', e.target.value)} placeholder="61" /></label>

                <div className="qf-field wide">
                  <span>Весовая категория системы</span>
                  <div className="qf-choice-row">
                    {WEIGHT_CATEGORIES.map((weightCategory) => (
                      <button
                        key={weightCategory}
                        type="button"
                        className={data.weightCategory === weightCategory ? 'is-selected' : ''}
                        onClick={() => setField('weightCategory', weightCategory)}
                      >
                        {weightCategory}
                      </button>
                    ))}
                  </div>
                  <small>Это точное системное значение для листа персонажа: «худоба / обычный / плотный / полнота / ожирение». Вес в килограммах выше остаётся отдельным описательным значением.</small>
                </div>

                <div className="qf-field wide">
                  <span>Телосложение системы</span>
                  <div className="qf-choice-row">
                    {BODIES.map((body) => (
                      <button key={body} type="button" className={data.body === body ? 'is-selected' : ''} onClick={() => setField('body', body)}>{body}</button>
                    ))}
                  </div>
                  <small>Это значение позже напрямую попадёт в существующую таблицу персонажа: «слабое / обычное / подтянутое / рельефное / атлетическое».</small>
                </div>

                <label className="qf-field"><span>Цвет волос</span><input value={data.hairColor} onChange={(e) => setField('hairColor', e.target.value)} placeholder="Белые" /></label>
                <label className="qf-field"><span>Длина волос</span><input value={data.hairLength} onChange={(e) => setField('hairLength', e.target.value)} placeholder="До плеч" /></label>
                <label className="qf-field"><span>Глаза</span><input value={data.eyes} onChange={(e) => setField('eyes', e.target.value)} placeholder="Зелёные" /></label>
                <label className="qf-field"><span>Особые приметы</span><input value={data.marks} onChange={(e) => setField('marks', e.target.value)} placeholder="Шрам, родинка, татуировка…" /></label>
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="qf-section">
            <div className="qf-section-title">
              <span>03</span>
              <div><h3>Создание магии</h3><p>Выберите от 1 до 4 природ. Анкета предложит подходящие виды магии.</p></div>
            </div>

            <div className="qf-element-grid">
              {MAGIC_ELEMENTS.map((element) => {
                const selected = data.elementKeys.includes(element.id);
                const locked = !selected && data.elementKeys.length >= 4;
                return (
                  <button
                    key={element.id}
                    type="button"
                    data-element={element.id}
                    className={`qf-element ${selected ? 'is-selected' : ''}`}
                    disabled={locked}
                    onClick={() => toggleElement(element.id)}
                  >
                    <span>{element.emoji}</span>
                    <b>{element.label}</b>
                    <small>{selected ? 'Выбрано' : 'Добавить'}</small>
                  </button>
                );
              })}
            </div>

            <div className="qf-selected-line">Выбрано: <b>{data.elementKeys.length}</b> из 4</div>

            {data.elementKeys.length > 0 && (
              <div className="qf-suggestions">
                <div className="qf-subhead"><h4>Магии-вдохновители</h4><p>Выберите основу, которая могла бы произрасти из ваших природ. Это не обязательное название вашей магии, а направление для идей и будущих заклинаний.</p></div>
                <div className="qf-magic-grid">
                  {magicSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      data-element={suggestion.elements[0]}
                      className={`qf-magic-card ${data.magicInspiration === suggestion.name ? 'is-selected' : ''}`}
                      onClick={() => pickMagic(suggestion.name)}
                    >
                      <b>{suggestion.name}</b>
                      <span>{suggestion.elements.map(getElementLabel).join(' + ')}</span>
                      <small>Магия-вдохновитель</small>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`qf-magic-card custom ${data.magicInspiration === 'Своя идея' ? 'is-selected' : ''}`}
                    onClick={pickCustomMagic}
                  >
                    <b>Своя идея</b>
                    <span>Без готового вдохновителя</span>
                    <small>Можно придумать направление самостоятельно</small>
                  </button>
                </div>

                {data.magicInspiration && (
                  <div className="qf-info success">
                    ✨ <b>Вдохновитель:</b> {data.magicInspiration}. Это не обязательное официальное название. Используйте его как основу, чтобы придумать свою магию и заклинания.
                  </div>
                )}
              </div>
            )}

            <div className="qf-grid two qf-magic-fields">
              <label className="qf-field wide qf-magic-name" data-element={data.elementKeys[0]}>
                <span>Название вашей магии</span>
                <input value={data.magicName} onChange={(e) => setField('magicName', e.target.value)} placeholder="Например: Магия ледяных зеркал" />
                <small>Название свободное. Можно оставить предложенный вдохновитель или придумать собственный вариант на его основе.</small>
              </label>
              <label className="qf-field wide">
                <span>Краткое описание магии</span>
                <textarea rows={4} value={data.magicDescription} onChange={(e) => setField('magicDescription', e.target.value)} placeholder="Что эта магия позволяет делать персонажу?" />
              </label>
            </div>

            <div style={{ maxWidth: 280, marginTop: 18 }}>
              <div className="qf-portrait-box">
                <div className="qf-portrait-preview qf-grimoire-preview">
                  {data.grimoirePhoto?.dataUrl ? (
                    <img src={data.grimoirePhoto.dataUrl} alt="Изображение гримуара" />
                  ) : (
                    <div><b>Гримуар</b><span>Добавьте внешний вид гримуара</span></div>
                  )}
                </div>
                <label className="qf-upload">
                  <input type="file" accept="image/*" onChange={onPickGrimoirePhoto} disabled={grimoireBusy} />
                  <span>{grimoireBusy ? 'Обрабатываю…' : data.grimoirePhoto ? 'Заменить гримуар' : 'Выбрать изображение гримуара'}</span>
                </label>
                <small>Рекомендуемый формат: вертикальный 2:3, например 480×720 px. JPG / PNG / WebP, до 5 МБ. Гримуар попадёт только в блок персонажа в Основной Google-таблице — в личную таблицу он больше не вставляется.</small>
                {grimoireError && <div className="qf-error">{grimoireError}</div>}
              </div>
            </div>

            <div className="qf-info">📖 «Новичок» означает начало пути среди рыцарей, а не подростковый возраст. Персонажу может быть сколько угодно лет, если ему уже исполнилось 14. Простые выстрелы маны разрешены системой и не требуют отдельного поля.</div>
          </section>
        )}

        {step === 4 && (
          <section className="qf-section">
            <div className="qf-section-title">
              <span>04</span>
              <div><h3>Боевой класс</h3><p>Магия подсказывает подходящие роли, но окончательный выбор остаётся за игроком.</p></div>
            </div>

            {recommendedClasses.length > 0 && (
              <div className="qf-recommended">
                <div className="qf-subhead"><h4>Рекомендуемые классы</h4><p>Рекомендация строится по выбранным природам и выбранному вдохновителю.</p></div>
                <div className="qf-recommended-grid">
                  {recommendedClasses.map(({ klass, score }, index) => (
                    <button key={toKey(klass)} type="button" className={`qf-class-card featured ${data.classKey === toKey(klass) ? 'is-selected' : ''}`} onClick={() => selectClass(klass)}>
                      <span className="qf-rank">{index + 1}</span>
                      <div className="qf-class-name"><span>{klass.emoji ?? '✦'}</span><b>{klass.name}</b></div>
                      <strong>{scoreLabel(score, topScore)}</strong>
                      <small>{klass.role || klass.who || 'Подходит по стилю выбранной магии.'}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="qf-subhead all"><h4>Все доступные классы</h4><p>Можно выбрать класс вне рекомендаций — это не запрет.</p></div>
            <div className="qf-class-grid">
              {usableClasses.map((klass) => (
                <button key={toKey(klass)} type="button" className={`qf-class-card ${data.classKey === toKey(klass) ? 'is-selected' : ''}`} onClick={() => selectClass(klass)}>
                  <div className="qf-class-name"><span>{klass.emoji ?? '✦'}</span><b>{klass.name}</b></div>
                  <small>{klass.role || klass.who || 'Боевой класс'}</small>
                  {isUniversal(klass) && <em>Требуется d100 ≥ 80</em>}
                </button>
              ))}
            </div>

            {classMessage && <div className={`qf-info ${classMessage.includes('заблокированы') ? 'warning' : 'success'}`}>{classMessage}</div>}
            {pickedClass && <div className="qf-picked-class"><b>Выбран:</b> {pickedClass.emoji ?? '✦'} {pickedClass.name}<span>{pickedClass.fit || pickedClass.who || pickedClass.role}</span></div>}
          </section>
        )}

        {step === 5 && (
          <section className="qf-section">
            <div className="qf-section-title">
              <span>05</span>
              <div><h3>Стартовые заклинания</h3><p>От 1 до 3. Сила каждого определяется одним броском d20.</p></div>
            </div>

            <div className="qf-info">🎲 Выпавшее число становится силой выбранного эффекта: уроном, лечением, защитой, баффом, дебаффом и т. д. Перебрасывать результат внутри анкеты нельзя.</div>

            <div className="qf-spell-list">
              {data.spells.map((spell, index) => (
                <article className="qf-spell" key={index}>
                  <div className="qf-spell-head">
                    <div><span>Заклинание</span><b>#{index + 1}</b></div>
                    {data.spells.length > 1 && <button type="button" className="qf-icon-button danger" onClick={() => removeSpell(index)}>Удалить</button>}
                  </div>

                  <div className="qf-grid two">
                    <label className="qf-field wide"><span>Название</span><input value={spell.name} onChange={(e) => updateSpell(index, { name: e.target.value })} placeholder="Например: Воздушное лезвие" /></label>
                    <label className="qf-field"><span>Время каста</span><input value={spell.castTime} onChange={(e) => updateSpell(index, { castTime: e.target.value })} placeholder="1 ход" /></label>
                    <label className="qf-field"><span>Радиус / дальность</span><input value={spell.radius} onChange={(e) => updateSpell(index, { radius: e.target.value })} placeholder="10 м вперёд" /></label>
                    <label className="qf-field"><span>Длительность</span><input value={spell.duration} onChange={(e) => updateSpell(index, { duration: e.target.value })} placeholder="разовое / 2 хода" /></label>
                    <label className="qf-field"><span>Тип силы</span>
                      <select value={spell.powerType} onChange={(e) => updateSpell(index, { powerType: e.target.value as SpellPowerType, power: null })}>
                        {spellTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </label>
                    <label className="qf-field wide"><span>Эффект</span><textarea rows={3} value={spell.effect} onChange={(e) => updateSpell(index, { effect: e.target.value })} placeholder="Что именно делает заклинание: ожог, лечение, щит, замедление…" /></label>
                  </div>

                  <div className={`qf-roll-box ${spell.power != null ? 'is-rolled' : ''}`}>
                    <div>
                      <small>Сила · d20</small>
                      <b>{spell.power == null ? '—' : spell.power}</b>
                      <span>{spell.power == null ? `Будет определена для эффекта «${spell.powerType}»` : `${spell.powerType}: ${spell.power}`}</span>
                    </div>
                    <button type="button" disabled={spell.power != null || rollBusy != null} onClick={() => rollSpell(index)}>
                      {rollBusy === index ? 'Бросаю…' : spell.power == null ? '🎲 Бросить d20' : '✓ Результат закреплён'}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <button type="button" className="qf-add-spell" disabled={data.spells.length >= 3} onClick={addSpell}>+ Добавить заклинание</button>
          </section>
        )}

        {step === 6 && (
          <section className="qf-section">
            <div className="qf-section-title">
              <span>06</span>
              <div><h3>Проверьте анкету</h3><p>Перед отправкой всё важное собрано в одном месте.</p></div>
            </div>

            <div className="qf-review-hero">
              {data.photo?.dataUrl ? <img src={data.photo.dataUrl} alt="Портрет" /> : <div className="qf-review-placeholder">✦</div>}
              <div><small>{data.suit} · {data.race}</small><h3>{data.name || 'Без имени'}</h3><p>{data.age} лет · {data.height || '—'} см · {data.weightCategory} · {data.body}</p></div>
            </div>

            <div className="qf-review-grid">
              <div className="qf-review-card"><div><b>История</b><button type="button" onClick={() => goTo(1)}>Изменить</button></div><p>{data.bio || '—'}</p><span>Игрок: {data.playerLink || '—'}</span></div>
              <div className="qf-review-card"><div><b>Внешность и системные параметры</b><button type="button" onClick={() => goTo(2)}>Изменить</button></div><p>Рост: {data.height || '—'} см · Вес: {data.weight || '—'} кг</p><span>Весовая категория: {data.weightCategory}</span><span>Телосложение: {data.body}</span></div>
              <div className="qf-review-card"><div><b>Магия</b><button type="button" onClick={() => goTo(3)}>Изменить</button></div><h4>{data.magicName || '—'}</h4><p>{data.elementKeys.map(getElementLabel).join(' + ') || '—'}</p><span>Вдохновитель: {data.magicInspiration || '—'}</span><span>{data.magicDescription || '—'}</span>{data.grimoirePhoto?.dataUrl && <img src={data.grimoirePhoto.dataUrl} alt="Гримуар" style={{ width: 64, height: 96, objectFit: 'contain', marginTop: 10, borderRadius: 12 }} />}</div>
              <div className="qf-review-card"><div><b>Класс</b><button type="button" onClick={() => goTo(4)}>Изменить</button></div><h4>{pickedClass ? `${pickedClass.emoji ?? '✦'} ${pickedClass.name}` : '—'}</h4><p>{pickedClass?.role || pickedClass?.who || '—'}</p></div>
              <div className="qf-review-card wide"><div><b>Заклинания</b><button type="button" onClick={() => goTo(5)}>Изменить</button></div><div className="qf-review-spells">{data.spells.map((spell, index) => <div key={index}><b>{index + 1}. {spell.name}</b><span>{spell.powerType}: {spell.power ?? '—'} · d20</span><p>{spell.effect}</p></div>)}</div></div>
            </div>

            <div className="qf-info success">Анкета отправится в существующую админку. Google-таблицы на этом этапе не изменяются.</div>
          </section>
        )}
      </div>

      {!canContinue && step < TOTAL_STEPS && (
        <div className="qf-validation">
          {step === 1 && 'Укажите возраст от 14 лет, заполните имя, расу, ссылку на игрока/VK и биографию (минимум несколько предложений).'}
          {step === 2 && 'Укажите рост, вес, волосы и глаза. Особые приметы и портрет можно оставить пустыми.'}
          {step === 3 && 'Выберите 1–4 природы, выберите магию-вдохновитель (или «Своя идея»), укажите название и коротко опишите магию.'}
          {step === 4 && 'Выберите боевой класс.'}
          {step === 5 && 'У каждого заклинания заполните все поля и один раз бросьте d20.'}
        </div>
      )}

      <div className="qf-actions">
        <button type="button" className="qf-button ghost" onClick={step === 1 ? onCancel : () => goTo(step - 1)}>{step === 1 ? 'Отменить' : '← Назад'}</button>
        {step < TOTAL_STEPS ? (
          <button type="button" className="qf-button primary" disabled={!canContinue} onClick={() => goTo(step + 1)}>Далее →</button>
        ) : (
          <button type="button" className="qf-button primary send" onClick={submit}>Отправить анкету</button>
        )}
      </div>
    </div>
  );
}
