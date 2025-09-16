// src/components/ClassCard.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import '../styles.css';

// ───────── Роли
function splitRoles(input?: string, extraTags?: string[]): string[] {
  const raw = (input ?? '').toString();
  const s = raw.replace(/[—–]/g, '-');
  const parts = s
    .split(/(?:\s+|-|,|\/|;|(?:\sи\s))/i)
    .map(t => t.trim())
    .filter(Boolean);

  const tags = (extraTags ?? []).map(t => t.trim()).filter(Boolean);
  const merged = [...parts, ...tags];

  const seen = new Set<string>();
  const nice = (w: string) =>
    w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;

  const out: string[] = [];
  for (const w of merged) {
    const key = w.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(nice(w));
    }
  }
  if (out.length > 2 && !out.map(x => x.toLowerCase()).includes('гибрид')) {
    out.push('Гибрид');
  }
  return out;
}

// ───────── Сложность
function splitComplexity(input: unknown): string[] {
  const mapCx = (v: string): string | null => {
    const x = v.toLowerCase();
    if (x === '1' || x.startsWith('низк')) return 'низкая';
    if (x === '2' || x.startsWith('средн')) return 'средняя';
    if (x === '3' || x.startsWith('высо')) return 'высокая';
    if (['-', '–', '—', 'и', '/', ',', ';'].includes(x)) return null;
    return null;
  };
  const toTokens = (val: string) =>
    val.replace(/[—–]/g, '-')
       .split(/(?:\s+|-|,|\/|;|(?:\sи\s))/i)
       .map(t => t.trim())
       .filter(Boolean);

  let parts: string[] = [];
  if (Array.isArray(input)) {
    parts = input.flatMap(v => toTokens(String(v ?? '').toLowerCase().trim()));
  } else {
    const raw = String(input ?? '').toLowerCase().trim();
    if (!raw) return [];
    parts = toTokens(raw);
  }
  const mapped = parts.map(mapCx).filter(Boolean) as string[];
  return Array.from(new Set(mapped));
}

// ───────── Утилиты для секций
function toList(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);
  return String(val)
    .split(/\r?\n|;|\/|,|·|•|—|-{2,}/)
    .map(s => s.trim())
    .filter(Boolean);
}
function pickField(obj: Record<string, any>, names: string[]): string[] {
  for (const n of names) if (n in obj) return toList(obj[n]);
  return [];
}

type Props = {
  name: string;
  emoji?: string;
  emote?: string;
  icon?: string;
  role?: string;
  tags?: string[];
  complexity?: string | string[] | number;

  // спец для плейсхолдера
  placeholder?: boolean;
  image?: string;

  [key: string]: any;
};

export default function ClassCard(props: Props) {
  // ==== ОСОБЫЙ СЛУЧАЙ: плейсхолдер ====
  if (props.placeholder) {
    return (
      <div className="card placeholder-card">
        <div className="image-wrap">
          <img src={props.image} alt="В разработке" />
          <div className="new-badge">NEW</div>
        </div>
        <h3 style={{ marginTop: '8px', textAlign:'center' }}>В разработке</h3>
      </div>
    );
  }

  // ==== Обычная карточка ====
  const {
    name, emoji, emote, icon,
    role, tags, complexity,
    ...rest
  } = props;

  const emojiText = (emoji || emote || icon || '').toString();
  const emojiRef = useRef<HTMLSpanElement>(null);

  // Twemoji
  useEffect(() => {
    const tw = (window as any).twemoji;
    if (tw && emojiRef.current) {
      tw.parse(emojiRef.current, { folder: 'svg', ext: '.svg' });
    }
  }, [emojiText]);

  const roleChips = useMemo(() => splitRoles(role, tags), [role, tags]);
  const cxChips   = useMemo(() => splitComplexity(complexity), [complexity]);

  // Секции данных
  const who = pickField(rest, ['кто','кто вы','кто_вы','кто это','кто_это','who','whoYouAre','identity','about']);
  const strengths = pickField(rest, ['сильные стороны','сильные','преимущества','плюсы','strengths','pros','advantages']);
  const weaknesses = pickField(rest, ['слабые стороны','слабые','недостатки','минусы','weaknesses','cons','disadvantages']);
  const bestAllies = pickField(rest, ['лучшие союзники','союзники','ally','allies','bestAllies']);
  const counterplay = pickField(rest, ['контрплей по тебе','контрплей','опасные противники','контры','counters','counterplay']);
  const newbieMistakes = pickField(rest, ['ошибки новичка','частые ошибки','mistakes','noobMistakes','commonMistakes']);
  const suitableFor = pickField(rest, ['кому подойдёт','кому подойдет','подойдёт','подойдет','suitableFor','goodFor','whoShouldPlay']);

  return (
    <div className="card">
      <h3 style={{ margin: '2px 0 10px', display:'flex', alignItems:'center', gap:'.35rem' }}>
        {emojiText && (
          <span ref={emojiRef} className="emoji-row" aria-hidden="true">
            {emojiText}
          </span>
        )}
        <span>{name}</span>
      </h3>

      {/* Роли и Сложность — отдельно и с лейблами */}
      <div className="badges-row">
        {roleChips.length > 0 && (
          <div className="badges">
            <span className="badge badge-label">Роли:</span>
            {roleChips.map((r, i) => <span key={`r-${i}`} className="badge">{r}</span>)}
          </div>
        )}
        {cxChips.length > 0 && (
          <div className="badges">
            <span className="badge badge-label">Сложность:</span>
            {cxChips.map((c, i) => <span key={`c-${i}`} className="badge badge--soft">{c}</span>)}
          </div>
        )}
      </div>

      <div className="hr" />

      {who.length > 0 && (
        <details><summary><strong>Кто вы</strong></summary>
          <ul style={{ margin:'6px 0 4px', paddingLeft:'18px' }}>
            {who.map((it, i) => <li key={`who-${i}`}>{it}</li>)}
          </ul>
        </details>
      )}

      {strengths.length > 0 && (
        <details><summary><strong>Сильные стороны</strong></summary>
          <ul style={{ margin:'6px 0 4px', paddingLeft:'18px' }}>
            {strengths.map((it, i) => <li key={`str-${i}`}>{it}</li>)}
          </ul>
        </details>
      )}

      {weaknesses.length > 0 && (
        <details><summary><strong>Слабые стороны</strong></summary>
          <ul style={{ margin:'6px 0 4px', paddingLeft:'18px' }}>
            {weaknesses.map((it, i) => <li key={`weak-${i}`}>{it}</li>)}
          </ul>
        </details>
      )}

      {bestAllies.length > 0 && (
        <details><summary><strong>Лучшие союзники</strong></summary>
          <ul style={{ margin:'6px 0 4px', paddingLeft:'18px' }}>
            {bestAllies.map((it, i) => <li key={`ally-${i}`}>{it}</li>)}
          </ul>
        </details>
      )}

      {counterplay.length > 0 && (
        <details><summary><strong>Контрплей по тебе</strong></summary>
          <ul style={{ margin:'6px 0 4px', paddingLeft:'18px' }}>
            {counterplay.map((it, i) => <li key={`ctr-${i}`}>{it}</li>)}
          </ul>
        </details>
      )}

      {newbieMistakes.length > 0 && (
        <details><summary><strong>Ошибки новичка</strong></summary>
          <ul style={{ margin:'6px 0 4px', paddingLeft:'18px' }}>
            {newbieMistakes.map((it, i) => <li key={`mis-${i}`}>{it}</li>)}
          </ul>
        </details>
      )}

      {suitableFor.length > 0 && (
        <details><summary><strong>Кому подойдёт</strong></summary>
          <ul style={{ margin:'6px 0 4px', paddingLeft:'18px' }}>
            {suitableFor.map((it, i) => <li key={`fit-${i}`}>{it}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
