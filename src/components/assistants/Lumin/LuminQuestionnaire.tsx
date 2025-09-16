// src/components/assistants/Lumin/LuminQuestionnaire.tsx
import React, { useMemo, useState } from "react";
import "../../../styles.css";

type Props = {
  assistant?: { name: string; title?: string };
  classes: GameClass[];

  // прилетает из Portal — можно не использовать
  variant?: any;
  onSpeakingChange?: (v: boolean) => void;

  onCancel?: () => void;
  onFinish?: (data: QuestionnaireData, pickedClass?: GameClass | null) => void;

  initial?: Partial<QuestionnaireData>;
};

export type Spell = {
  name: string;
  castTime: string;  // "1 ход"
  radius: string;    // "10 м"
  effect: string;    // "ожог / щит / лечение"
  duration: string;  // "разово / 2 хода"
};

// Универсальный тип под карточки из src/data/classes.ts
export type GameClass = {
  id?: string | number;
  key?: string;
  name: string;
  role?: string | null;
  roles?: string[] | null;
  tags?: string[] | null;
  // описательные поля из твоего датасета
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
};

export type QuestionnaireData = {
  // 1) базовое
  name: string;
  age: number; // 13–15
  suit: "Клевер" | "Алмаз" | "Пики" | "Червы";
  bio: string;
  race: string;

  // 2) внешность
  height: string;
  weight: string;
  body: "худощавый" | "средний" | "крепкий";
  hairColor: string;
  hairLength: string;
  eyes: string;
  marks: string;

  // 3) магия
  hasGrimoire: boolean;
  plannedAge?: number | null;
  noviceNote: string;

  // 4) класс
  classKey: string | null;

  // 5) стихии (1–4)
  elements: string[];

  // 6) заклинания (1–3)
  spells: Spell[];

  // 7) пояснения
  combatNotes: string;

  // 8) фото персонажа
  photo: {
    name: string;
    mime: string;
    size: number;
    dataUrl: string; // base64
  } | null;
};

const SUITS = ["Клевер", "Алмаз", "Пики", "Червы"] as const;
const BODIES = ["худощавый", "средний", "крепкий"] as const;
const ELEMENTS = [
  "вода", "воздух", "земля", "огонь",
  "свет", "тьма", "жизнь", "пространство", "время", "дикая",
];

function toKey(c: GameClass) {
  return String(c.id ?? c.key ?? c.name);
}
function collectRoles(c: GameClass): string[] {
  const bucket: string[] = [];
  if (typeof c.role === "string" && c.role.trim()) bucket.push(c.role);
  if (Array.isArray(c.roles)) bucket.push(...c.roles);
  if (Array.isArray(c.tags)) bucket.push(...c.tags);
  return bucket.map((r) => r.toLowerCase());
}
function isUniversal(c: GameClass) {
  const r = collectRoles(c);
  return r.some((x) => ["универсал", "универсальный", "universal"].includes(x));
}
function rollD100() {
  return Math.floor(Math.random() * 100) + 1;
}

export default function LuminQuestionnaire({
  assistant = { name: "Люмин" },
  classes,
  onCancel,
  onFinish,
}: Props) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<QuestionnaireData>({
    // 1) базовое
    name: "",
    age: 13,
    suit: "Клевер",
    bio: "",
    race: "человек",

    // 2) внешность
    height: "",
    weight: "",
    body: "средний",
    hairColor: "",
    hairLength: "",
    eyes: "",
    marks: "",

    // 3) магия
    hasGrimoire: true,
    plannedAge: null,
    noviceNote:
      "Стартовый уровень — новичок. Доступны только простые выстрелы маны.",

    // 4) класс
    classKey: null,

    // 5) стихии
    elements: [],

    // 6) заклинания
    spells: [{ name: "", castTime: "", radius: "", effect: "", duration: "" }],

    // 7)
    combatNotes:
      "В бою все бросают кубы; к результату прибавляются бонусы от класса/магии/предметов. Эффекты: ожог, лечение, щит, замедление и т.д.",

    // 8) фото
    photo: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [roll, setRoll] = useState<number | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);
  // единичный бросок для «универсала»
  const [universalRoll, setUniversalRoll] = useState<number | null>(null);

  // фото (выбранный файл и превью)
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const pickedClass = useMemo(
    () => (data.classKey ? classes.find((c) => toKey(c) === data.classKey) ?? null : null),
    [data.classKey, classes]
  );

  const progress = Math.round((step / 8) * 100);

  /** ========== ВАЛИДАЦИЯ ========= */
  const valid1 =
    !!data.name.trim() &&
    data.age >= 13 && data.age <= 15 &&
    SUITS.includes(data.suit);
  const valid2 =
    !!data.height.trim() && !!data.weight.trim() &&
    !!data.hairColor.trim() && !!data.hairLength.trim() && !!data.eyes.trim();
  const valid3 =
    data.hasGrimoire || (data.plannedAge != null && data.plannedAge >= 13 && data.plannedAge <= 15);
  const valid4 = !!data.classKey;
  const valid5 = data.elements.length >= 1 && data.elements.length <= 4;
  const valid6 =
    data.spells.length >= 1 &&
    data.spells.length <= 3 &&
    data.spells.every(
      (s) => s.name.trim() && s.castTime.trim() && s.radius.trim() && s.effect.trim() && s.duration.trim()
    );

  const canNext =
    step === 1 ? valid1 :
    step === 2 ? valid2 :
    step === 3 ? valid3 :
    step === 4 ? valid4 :
    step === 5 ? valid5 :
    step === 6 ? valid6 :
    true; // шаги 7–8 свободные

  /** ========== UI ========= */
  const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="asst-bubble" style={{ marginTop: 8 }}>
      <div className="asst-meta">
        {assistant.name}
        {assistant.title ? ` · ${assistant.title}` : ""}
      </div>
      <div className="asst-text">{children}</div>
    </div>
  );

  /** ========== ОБРАБОТЧИКИ ========= */
  const setField = <K extends keyof QuestionnaireData>(key: K, val: QuestionnaireData[K]) =>
    setData((p) => ({ ...p, [key]: val }));

  const toggleElement = (el: string) =>
    setData((p) => {
      const has = p.elements.includes(el);
      if (has) return { ...p, elements: p.elements.filter((x) => x !== el) };
      if (p.elements.length >= 4) return p;
      return { ...p, elements: [...p.elements, el] };
    });

  const addSpell = () =>
    setData((p) =>
      p.spells.length >= 3
        ? p
        : { ...p, spells: [...p.spells, { name: "", castTime: "", radius: "", effect: "", duration: "" }] }
    );

  const updateSpell = (i: number, patch: Partial<Spell>) =>
    setData((p) => {
      const copy = p.spells.slice();
      copy[i] = { ...copy[i], ...patch };
      return { ...p, spells: copy };
    });

  const removeSpell = (i: number) =>
    setData((p) => {
      if (p.spells.length <= 1) return p;
      const copy = p.spells.slice();
      copy.splice(i, 1);
      return { ...p, spells: copy };
    });

  // Выбор класса + единичный d100 для универсала
  const pickClass = (klass: GameClass) => {
    const key = toKey(klass);

    if (isUniversal(klass)) {
      if (universalRoll === null) {
        const r = rollD100();
        setUniversalRoll(r);
        setRoll(r);
        if (r < 80) {
          setRollError(`🎲 d100 = ${r}. Нужно 80–100. Универсальные классы недоступны в этой анкете.`);
          setField("classKey", null);
          return;
        }
        setRollError(null);
        setField("classKey", key);
        return;
      }

      setRoll(universalRoll);
      if (universalRoll < 80) {
        setRollError(`🎲 d100 = ${universalRoll}. Универсальные классы заблокированы для этой анкеты.`);
        setField("classKey", null);
        return;
      }
      setRollError(null);
      setField("classKey", key);
      return;
    }

    setRoll(null);
    setRollError(null);
    setField("classKey", key);
  };

  // выбор фото
  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) {
      setPhotoFile(null);
      setPhotoDataUrl(null);
      setData((d) => ({ ...d, photo: null }));
      return;
    }
    if (!f.type.startsWith("image/")) {
      alert("Загрузите изображение (jpg, png и т.п.)");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      alert("Слишком большой файл. Максимум 5 МБ.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      setPhotoFile(f);
      setPhotoDataUrl(url);
      setData((d) => ({
        ...d,
        photo: {
          name: f.name,
          mime: f.type,
          size: f.size,
          dataUrl: url,
        },
      }));
    };
    reader.readAsDataURL(f);
  }

  const submit = () => {
    if (!valid1 || !valid2 || !valid3 || !valid4 || !valid5 || !valid6) {
      const next: Record<string, string> = {};
      if (!valid1) next.step1 = "Заполни имя/возраст/страну.";
      if (!valid2) next.step2 = "Заполни внешний вид.";
      if (!valid3) next.step3 = "Проверь блок с гримуаром.";
      if (!valid4) next.step4 = "Выбери класс (d100 ≥ 80 для универсала).";
      if (!valid5) next.step5 = "Выбери от 1 до 4 стихий.";
      if (!valid6) next.step6 = "1–3 заклинания: все поля обязательны.";
      setErrors(next);
      return;
    }
    onFinish?.(data, pickedClass);
  };

  /** ========== РЕНДЕР ========= */
  return (
    <div className="portal">
      <div className="portal-title">Анкета персонажа · шаг {step} из 8</div>

      <div className="portal-progress">
        <div className="portal-progress-bar" style={{ width: `${progress}%` }} />
        <div className="portal-progress-hint">{progress}%</div>
      </div>

      {/* 1) Имя/возраст/происхождение/биография */}
      {step === 1 && (
        <>
          <Hint>
            Заполним первую часть анкеты. Для начала — имя. Дальше укажи свой возраст: подростки в 13–15 лет всегда проходят церемонию получения гримуара. Теперь место рождения: выбери одну из четырёх стран — Клевер, Алмаз, Пики или Червы. Важно отметить и происхождение: напиши о своей семье, своём пути. Из деревни — значит, скромное воспитание и ремёсла. Из столицы — значит, образование и культура. Если в роду была редкая магия, об этом тоже стоит упомянуть. Это важно для понимания твоих корней.
          </Hint>

          <label className="form-label">Имя</label>
          <input className="input" placeholder="Ваше имя"
            value={data.name} onChange={(e) => setField("name", e.target.value)} autoFocus />

          <div className="grid" style={{ gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label className="form-label">Возраст (13–15)</label>
              <input className="input" type="number" min={13} max={15}
                value={data.age} onChange={(e) => setField("age", Number(e.target.value))} />
            </div>
            <div>
              <label className="form-label">Страна</label>
              <select className="input" value={data.suit} onChange={(e) => setField("suit", e.target.value as any)}>
                {SUITS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Раса</label>
            <input className="input" placeholder="человек"
              value={data.race} onChange={(e) => setField("race", e.target.value)} />
          </div>

          <label className="form-label">Краткая биография</label>
          <textarea className="input" rows={4}
            placeholder="Семья, происхождение, обучение, редкая магия рода (если есть)…"
            value={data.bio} onChange={(e) => setField("bio", e.target.value)} />

          <div className="asst-actions" style={{ marginTop: 12 }}>
            <button className="btn" type="button" onClick={onCancel}>Отмена</button>
            <button className="btn primary" type="button" disabled={!valid1} onClick={() => setStep(2)}>Далее</button>
          </div>
        </>
      )}

      {/* 2) Внешность */}
      {step === 2 && (
        <>
          <Hint>
            Хорошо, теперь внешность. Запиши рост и вес — это обычные сведения, чтобы представить твой облик. Телосложение можно указать как худощавое, среднее или крепкое. Обязательно опиши волосы: их цвет и длину. Затем цвет глаз. А ещё особые приметы — например, родинки, шрамы, знаки или татуировки. Это важно не только для анкеты, но и для того, чтобы у тебя сложился собственный образ.
          </Hint>

          <div className="grid" style={{ gap: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <label className="form-label">Рост</label>
              <input className="input" placeholder="например, 164 см"
                value={data.height} onChange={(e) => setField("height", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Вес</label>
              <input className="input" placeholder="например, 52 кг"
                value={data.weight} onChange={(e) => setField("weight", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Телосложение</label>
              <select className="input" value={data.body} onChange={(e) => setField("body", e.target.value as any)}>
                {BODIES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="grid" style={{ gap: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <label className="form-label">Волосы — цвет</label>
              <input className="input" placeholder="каштановые / чёрные…"
                value={data.hairColor} onChange={(e) => setField("hairColor", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Волосы — длина</label>
              <input className="input" placeholder="короткие / средние / длинные…"
                value={data.hairLength} onChange={(e) => setField("hairLength", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Глаза — цвет</label>
              <input className="input" placeholder="карие / зелёные…"
                value={data.eyes} onChange={(e) => setField("eyes", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="form-label">Особые приметы</label>
            <input className="input" placeholder="шрамы, родинки, татуировки…"
              value={data.marks} onChange={(e) => setField("marks", e.target.value)} />
          </div>

          <div className="asst-actions" style={{ marginTop: 12 }}>
            <button className="btn" type="button" onClick={() => setStep(1)}>Назад</button>
            <button className="btn primary" type="button" disabled={!valid2} onClick={() => setStep(3)}>Далее</button>
          </div>
        </>
      )}

      {/* 3) Магия */}
      {step === 3 && (
        <>
          <Hint>
            Гримуар получают в 13–15. Уровень — новичок. Разрешены простые «выстрелы маны».
          </Hint>

          <label className="checkbox" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={data.hasGrimoire}
              onChange={(e) => setField("hasGrimoire", e.target.checked)} />
            <span>Гримуар уже есть</span>
          </label>

          {!data.hasGrimoire && (
            <div style={{ marginTop: 10 }}>
              <label className="form-label">Возраст получения (13–15)</label>
              <input className="input" type="number" min={13} max={15}
                value={data.plannedAge ?? ""}
                onChange={(e) => setField("plannedAge", Number(e.target.value))} />
            </div>
          )}

          <label className="form-label" style={{ marginTop: 10 }}>Примечание</label>
          <textarea className="input" rows={3}
            value={data.noviceNote}
            onChange={(e) => setField("noviceNote", e.target.value)}
            placeholder="Новичок. Разрешены простые выстрелы маны." />

          <div className="asst-actions" style={{ marginTop: 12 }}>
            <button className="btn" type="button" onClick={() => setStep(2)}>Назад</button>
            <button className="btn primary" type="button" disabled={!valid3} onClick={() => setStep(4)}>Далее</button>
          </div>
        </>
      )}

      {/* 4) Класс — из карточек + единичный d100 для «универсала» */}
      {step === 4 && (
        <>
          <Hint>
            Определись, кем ты будешь в бою. Класс — твоя роль. Выбрал — выполняй.
            Ну, так кто ты — щит, меч или подмога?
          </Hint>

          <div
            className="grid"
            style={{
              gap: 8,
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              alignItems: "stretch",
            }}
          >
            {classes.map((klass) => {
              const key = toKey(klass);
              const active = data.classKey === key;
              const universal = isUniversal(klass);
              const disabledUniversal =
                universalRoll !== null && universalRoll < 80 && universal;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabledUniversal}
                  className={`confirm-card text-left ${active ? "active" : ""}`}
                  style={{
                    opacity: disabledUniversal ? 0.5 : 1,
                    cursor: disabledUniversal ? "not-allowed" : "pointer",
                    padding: 10,
                    minHeight: 64,
                  }}
                  onClick={() => !disabledUniversal && pickClass(klass)}
                >
                  <div className="confirm-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="truncate">{klass.name}</span>
                    {universal && (
                      <span className="pill" title="Требуется один бросок d100 ≥ 80">🎲 d100 ≥ 80</span>
                    )}
                  </div>
                  {(klass.desc ?? klass.description ?? klass.who) && (
                    <div className="confirm-desc line-clamp-2" style={{ fontSize: 12, opacity: 0.8 }}>
                      {klass.desc ?? klass.description ?? klass.who}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {universalRoll !== null && (
            <div className="portal-subtle" style={{ marginTop: 6 }}>
              Итог броска d100 для «универсала»: <b>{universalRoll}</b>{" "}
              {universalRoll >= 80 ? "— универсальные классы доступны." : "— универсальные классы заблокированы."}
            </div>
          )}
          {(rollError || errors.step4) && (
            <div className="portal-error" style={{ marginTop: 6 }}>
              {rollError || "Выбери класс."}
            </div>
          )}

          {pickedClass && !rollError && (
            <div className="confirm-card" style={{ marginTop: 10 }}>
              <div className="font-semibold" style={{ marginBottom: 6 }}>
                ✅ Выбран класс: {pickedClass.name}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                {pickedClass.role && <div><b>Роль:</b> {pickedClass.role}</div>}
                {Array.isArray(pickedClass.roles) && pickedClass.roles.length > 0 && (
                  <div><b>Роли:</b> {pickedClass.roles.join(", ")}</div>
                )}
                {pickedClass.complexity && <div><b>Сложность:</b> {pickedClass.complexity}</div>}
                {pickedClass.who && <div><b>Кто вы:</b> {pickedClass.who}</div>}
                {pickedClass.strengths && <div><b>Сильные стороны:</b> {pickedClass.strengths}</div>}
                {pickedClass.weaknesses && <div><b>Слабые стороны:</b> {pickedClass.weaknesses}</div>}
                {(pickedClass.desc ?? pickedClass.description) && (
                  <div style={{ marginTop: 6, opacity: 0.9 }}>
                    {pickedClass.desc ?? pickedClass.description}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="asst-actions" style={{ marginTop: 12 }}>
            <button className="btn" type="button" onClick={() => setStep(3)}>Назад</button>
            <button className="btn primary" type="button" disabled={!valid4} onClick={() => setStep(5)}>Далее</button>
          </div>
        </>
      )}

      {/* 5) Природа магии */}
      {step === 5 && (
        <>
          <Hint>
            Записывай стихии: от одной до четырёх. Комбинации допустимы — Огонь+Земля=Лава, Вода+Воздух=Лёд.
          </Hint>

          {/* счётчик и лимит */}
          <div className="portal-subtle" style={{ marginBottom: 6 }}>
            Выбрано стихий: <b>{data.elements.length}</b> из 4
          </div>

          <div className="chips">
            {ELEMENTS.map((el) => {
              const on = data.elements.includes(el);
              const limitReached = !on && data.elements.length >= 4;
              return (
                <button
                  key={el}
                  type="button"
                  className={`chip ${on ? "on" : ""}`}
                  aria-pressed={on}
                  aria-label={`${on ? "Снять" : "Выбрать"} стихию ${el}`}
                  title={on ? `Снять стихию: ${el}` : (limitReached ? "Достигнут лимит 4" : `Выбрать стихию: ${el}`)}
                  disabled={limitReached}
                  onClick={() => toggleElement(el)}
                >
                  {el}
                </button>
              );
            })}
          </div>

          {errors.step5 && <div className="portal-error" style={{ marginTop: 6 }}>{errors.step5}</div>}

          <div className="asst-actions" style={{ marginTop: 12 }}>
            <button className="btn" type="button" onClick={() => setStep(4)}>Назад</button>
            <button className="btn primary" type="button" disabled={!valid5} onClick={() => setStep(6)}>Далее</button>
          </div>
        </>
      )}

      {/* 6) Заклинания */}
      {step === 6 && (
        <>
          <Hint>
            Заклинания! На старте 1–3 штуки. Название, время каста, радиус, эффект и длительность.
          </Hint>

          {data.spells.map((s, i) => (
            <div key={i} className="confirm-card" style={{ marginBottom: 10 }}>
              <div className="grid" style={{ gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <label className="form-label">Название</label>
                  <input className="input" value={s.name}
                    onChange={(e) => updateSpell(i, { name: e.target.value })} placeholder="Огненная стрела" />
                </div>
                <div>
                  <label className="form-label">Время каста</label>
                  <input className="input" value={s.castTime}
                    onChange={(e) => updateSpell(i, { castTime: e.target.value })} placeholder="1 ход" />
                </div>
              </div>

              <div className="grid" style={{ gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <label className="form-label">Радиус</label>
                  <input className="input" value={s.radius}
                    onChange={(e) => updateSpell(i, { radius: e.target.value })} placeholder="10 м" />
                </div>
                <div>
                  <label className="form-label">Длительность</label>
                  <input className="input" value={s.duration}
                    onChange={(e) => updateSpell(i, { duration: e.target.value })} placeholder="разово / 2 хода" />
                </div>
              </div>

              <div>
                <label className="form-label">Эффект</label>
                <input className="input" value={s.effect}
                  onChange={(e) => updateSpell(i, { effect: e.target.value })} placeholder="ожог цели / малый щит" />
              </div>

              <div className="asst-actions" style={{ marginTop: 8 }}>
                <button className="btn" type="button" onClick={addSpell} disabled={data.spells.length >= 3}>+ Добавить</button>
                <button className="btn danger" type="button" onClick={() => removeSpell(i)} disabled={data.spells.length <= 1}>Удалить</button>
              </div>
            </div>
          ))}

          {!valid6 && <div className="portal-error">Нужно 1–3 заклинания, все поля обязательны.</div>}

          <div className="asst-actions" style={{ marginTop: 12 }}>
            <button className="btn" type="button" onClick={() => setStep(5)}>Назад</button>
            <button className="btn primary" type="button" disabled={!valid6} onClick={() => setStep(7)}>Далее</button>
          </div>
        </>
      )}

      {/* 7) Система боя */}
      {step === 7 && (
        <>
          <Hint>
            Завершаем анкету системой боя. Каждый бой проходит через броски кубов. Игрок и противник бросают их, а затем к результату прибавляют бонусы от класса, магии или предметов. Заклинания могут накладывать эффекты — например, ожог, лечение или защитный барьер. Итоговый результат складывается из числа на кубике и твоих бонусов. Побеждает тот, у кого сумма выше. Всё честно и просто — главное помнить, что каждое заклинание влияет на ход боя.
          </Hint>

          <div className="portal-subtle" style={{ marginTop: 6 }}>
            Это пояснения. После них в реальной версии появится отправка «совиной почтой».
          </div>

          <div className="asst-actions" style={{ marginTop: 14 }}>
            <button className="btn" type="button" onClick={() => setStep(6)}>Назад</button>
            <button className="btn primary" type="button" onClick={() => setStep(8)}>Далее</button>
          </div>
        </>
      )}

      {/* 8) Фото персонажа */}
      {step === 8 && (
        <>
          <Hint>
            Тут должно быть ваше фото (портрет персонажа). Загрузите изображение — оно прикрепится к анкете и уйдёт вместе с остальными данными. Поддерживаются PNG/JPG до 5 МБ.
          </Hint>

          <div className="grid" style={{ gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label className="form-label">Файл изображения</label>
              <input
                type="file"
                accept="image/*"
                onChange={onPickPhoto}
                className="input"
              />
              <div className="portal-subtle" style={{ marginTop: 6 }}>
                Советы: ровный кадр, лицо/маска персонажа, без лишнего фона; 512–2048 px по ширине.
              </div>
            </div>

            <div>
              <label className="form-label">Предпросмотр</label>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  border: "1px dashed rgba(255,255,255,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.04)"
                }}
              >
                {photoDataUrl ? (
                  <img
                    src={photoDataUrl}
                    alt="Фото персонажа"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div className="portal-subtle" style={{ padding: 12, textAlign: "center" }}>
                    Здесь появится ваш портрет.<br />Пока что фото не выбрано.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="asst-actions" style={{ marginTop: 14 }}>
            <button className="btn" type="button" onClick={() => setStep(7)}>Назад</button>
            <button className="btn primary" type="button" onClick={submit}>Отправить</button>
          </div>
        </>
      )}
    </div>
  );
}
