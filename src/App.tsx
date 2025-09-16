// src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';
import CLASSES from './data/merged';
import ClassCard from './components/ClassCard';
import './styles.css';
import Portal from './components/Portal';

// ── утилиты для ролей/сложности ─────────────────────────────
function splitRoles(input?: string, extraTags?: string[]): string[] {
  const raw = (input ?? '').toString();
  const s = raw.replace(/[—–]/g, '-');
  const parts = s.split(/(?:\s+|-|,|\/|;|(?:\sи\s))/i).map(t=>t.trim()).filter(Boolean);
  const tags = (extraTags ?? []).map(t=>t.trim()).filter(Boolean);
  const merged = [...parts, ...tags];
  const seen = new Set<string>();
  const nice = (w:string)=> w.length ? w[0].toUpperCase()+w.slice(1).toLowerCase() : w;
  const out:string[] = [];
  for (const w of merged) {
    const key = w.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(nice(w)); }
  }
  if (out.length > 2 && !out.map(x=>x.toLowerCase()).includes('гибрид')) out.push('Гибрид');
  return out;
}

function splitComplexity(input: unknown): string[] {
  const mapCx = (v: string): string | null => {
    const x = v.toLowerCase();
    if (x === '1' || x.startsWith('низк')) return 'низкая';
    if (x === '2' || x.startsWith('средн')) return 'средняя';
    if (x === '3' || x.startsWith('высо')) return 'высокая';
    return null;
  };
  const toTokens = (val: string) =>
    val.replace(/[—–]/g, '-').split(/(?:\s+|-|,|\/|;|(?:\sи\s))/i).map(t=>t.trim()).filter(Boolean);

  let parts: string[] = [];
  if (Array.isArray(input)) parts = input.flatMap(v => toTokens(String(v ?? '').toLowerCase().trim()));
  else {
    const raw = String(input ?? '').toLowerCase().trim();
    if (!raw) return [];
    parts = toTokens(raw);
  }
  const mapped = parts.map(mapCx).filter(Boolean) as string[];
  return Array.from(new Set(mapped));
}

export default function App() {
  // тема
  const [theme, setTheme] = useState<'light'|'dark'>('light');
  const [fx, setFx] = useState<'light'|'dark'|null>(null);
  const [fxKey, setFxKey] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light'|'dark'|null;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const t = saved ?? (prefersDark ? 'dark' : 'light');
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const startTransition = (target: 'light'|'dark') => {
    setFx(target);
    setFxKey(k=>k+1);
    window.setTimeout(()=>setTheme(target), 1000);
    window.setTimeout(()=>setFx(null), 2100);
  };
  const goLight = () => startTransition('light');
  const goDark  = () => startTransition('dark');

  // состояние портала
  const [portalOpen, setPortalOpen] = useState(false);

  // роли для фильтра
  const ALL = useMemo(() => {
    const rolesSet = new Set<string>();
    for (const c of (CLASSES as any[])) {
      const tokens = splitRoles(c.role, c.tags);
      if (tokens.length > 2 && !tokens.map(x=>x.toLowerCase()).includes('гибрид')) tokens.push('Гибрид');
      for (const t of tokens) rolesSet.add(t);
    }
    return Array.from(rolesSet).sort((a,b)=>a.localeCompare(b,'ru'));
  }, []);
  const COMPLEXITIES = ['низкая','средняя','высокая'];

  const [selRoles, setSelRoles] = useState<Set<string>>(new Set());
  const [selCx, setSelCx] = useState<Set<string>>(new Set());

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, val: string) =>
    setter(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });

  // фильтрация
  const { list, total } = useMemo(() => {
    const all = CLASSES as any[];
    const placeholder = all.find(c => c.placeholder);
    const pass = (c:any) => {
      const roleTokens = splitRoles(c.role, c.tags);
      const roleSet = new Set(roleTokens.map(t=>t.toLowerCase()));
      if (roleTokens.length > 2) roleSet.add('гибрид');
      const okRoles = selRoles.size === 0 || Array.from(selRoles).every(r => roleSet.has(r.toLowerCase()));

      const cxTokens = splitComplexity(c.complexity);
      const cxSet = new Set(cxTokens);
      const okCx = selCx.size === 0 || Array.from(selCx).every(k => cxSet.has(k.toLowerCase()));

      return okRoles && okCx;
    };
    const normal = all.filter(c => !c.placeholder);
    const filtered = normal.filter(pass);
    const result = placeholder ? [placeholder, ...filtered] : filtered;
    const totalCount = normal.length + (placeholder ? 1 : 0);
    return { list: result, total: totalCount };
  }, [selRoles, selCx]);

  return (
    <div className="book">
      {fx && (
        <div className={`theme-bloom ${fx}`} key={fxKey} aria-hidden>
          <div className="veil" />
          <div className="grain" />
        </div>
      )}

      <div className="page">
        <div className="toolbar" style={{ position: 'relative', zIndex: 1 }}>
          {/* Кнопка Портал — БЕЗ лишних тегов */}
          <button
            className="btn"
            type="button"
            onClick={() => setPortalOpen(true)}
          >
            🌀 Портал
          </button>

          {/* Переключатель темы */}
          {theme === 'dark' ? (
            <button className="btn theme-toggle" onClick={goLight}>Свет ☀️</button>
          ) : (
            <button className="btn theme-toggle" onClick={goDark}>Тьма 🌙</button>
          )}
        </div>

        <details open>
          <summary><strong>Сложность</strong></summary>
          <div className="chips" style={{marginTop:8}}>
            {COMPLEXITIES.map(cx => {
              const key = cx.toLowerCase();
              const on = selCx.has(key);
              return (
                <button
                  key={cx}
                  className={`chip ${on?'active':''}`}
                  onClick={()=>toggleSet(setSelCx, key)}
                  title="Фильтр по сложности"
                >
                  {cx}
                </button>
              );
            })}
          </div>
        </details>

        <details open style={{marginTop:10}}>
          <summary><strong>Роли</strong></summary>
          <div className="chips" style={{marginTop:8}}>
            {ALL.map(r => {
              const key = r.toLowerCase();
              const on = selRoles.has(key);
              return (
                <button
                  key={r}
                  className={`chip ${on?'active':''}`}
                  onClick={()=>toggleSet(setSelRoles, key)}
                  title="Фильтр по ролям"
                >
                  {r}
                </button>
              );
            })}
          </div>
        </details>

        <h1 style={{ margin: '10px 0 10px' }}>
          Каталог классов · найдено {list.length} из {total}
        </h1>

        <div className="grid">
          {list.map((c:any) => <ClassCard key={c.id ?? c.name} {...c} />)}
        </div>
      </div>

      {/* Портал рендерим в самом конце дерева, поверх всего */}
      <Portal open={portalOpen} onClose={() => setPortalOpen(false)} />
    </div>
  );
}
