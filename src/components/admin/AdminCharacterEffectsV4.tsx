import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AdminCharacterSummary } from './AdminCharacters';
import {
  EFFECT_STATS_V4, calculateEffectsV4, effectsV4Text,
  type EffectSourceV4, type EffectStatV4, type EffectV4, type CharacterEffectsV4, type StatsV4,
} from '../../lib/characterEffectsV4';
import './admin-character-effects-v4.css';

const API = '/.netlify/functions/admin-character-effects-v4';
const ORIGINS = [
  ['race','Раса'],['book','Книга'],['rp','Награда / РП'],['curse','Проклятие'],
  ['blessing','Благословение'],['other','Другое'],
] as const;
const TRIGGERS = [['always','Постоянно'],['battle','Только в бою'],['conditional','По условию']] as const;
const newId = (prefix: string) => `${prefix}:${Math.random().toString(36).slice(2,11)}`;

type Loaded = { ok: boolean; profile: CharacterEffectsV4; effectiveStatsV4: {stats: StatsV4}; error?: string };

export default function AdminCharacterEffectsV4({ characters }: { characters: AdminCharacterSummary[] }) {
  const ready = useMemo(() => characters.filter((c) => c.cabinetReady), [characters]);
  const [characterId, setCharacterId] = useState('');
  const activeId = useRef('');
  activeId.current = characterId;
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<CharacterEffectsV4 | null>(null);
  const [base, setBase] = useState<Partial<StatsV4>>({});
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const selected = ready.find((c) => c.id === characterId);

  useEffect(() => {
    if (ready.length && !ready.some((c) => c.id === characterId)) setCharacterId(ready[0].id);
  }, [ready, characterId]);

  async function load(id: string) {
    if (!id) return;
    setWorking(true); setDraft(null); setMessage('');
    try {
      const response = await fetch(`${API}?characterId=${encodeURIComponent(id)}&t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json() as Loaded;
      if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось загрузить эффекты');
      if (id !== activeId.current) return;
      setDraft(data.profile);
      const rawBase: Partial<StatsV4> = {};
      Object.entries(data.effectiveStatsV4?.stats || {}).forEach(([key, value]) => { rawBase[key as EffectStatV4] = Number(value); });
      // Server also provides source base values in next load; obtain those by its breakdown.
      const breakdown = (data.effectiveStatsV4 as unknown as { breakdown?: Record<string,{base:number}> })?.breakdown;
      if (breakdown) Object.entries(breakdown).forEach(([key, value]) => { rawBase[key as EffectStatV4] = Number(value.base); });
      setBase(rawBase);
    } catch (error) { if (id === activeId.current) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (id === activeId.current) setWorking(false); }
  }
  useEffect(() => { void load(characterId); /* Reload on character change only. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  function patch(fn: (prev: CharacterEffectsV4) => CharacterEffectsV4) { setDraft((prev) => prev ? fn(prev) : prev); }
  function changeSource(index: number, next: Partial<EffectSourceV4>) {
    patch((prev) => ({ ...prev, sources: prev.sources.map((s,i) => i === index ? { ...s, ...next } : s) }));
  }
  function changeEffect(index: number, effectIndex: number, next: Partial<EffectV4>) {
    patch((prev) => ({ ...prev, sources: prev.sources.map((s,i) => i === index ? {
      ...s, effects: s.effects.map((e,j) => j === effectIndex ? { ...e, ...next } : e),
    } : s) }));
  }
  function addFeature() {
    patch((prev) => ({ ...prev, sources: [...prev.sources, { id: newId('feature'),kind:'feature',origin:'book',name:'',description:'',enabled:true,effects:[] }] }));
  }
  function updateRace(next: string) {
    patch((prev) => {
      const existing = prev.sources.findIndex((s) => s.kind === 'race' && !s.archived);
      const sources = prev.sources.slice();
      if (existing < 0) sources.unshift({ id:'race:main',kind:'race',origin:'race',name:next,description:'',enabled:true,effects:[] });
      else sources[existing] = { ...sources[existing],name:next };
      return { ...prev,race:next,sources };
    });
  }
  const preview = draft ? calculateEffectsV4(base, draft.sources) : null;
  async function save() {
    if (!draft || !characterId) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch(API, {
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({characterId,profile:draft,expectedRevision:draft.revision}),
      });
      const data = await response.json() as Loaded;
      if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось сохранить');
      setDraft(data.profile);
      setMessage('Сохранено в личной Google-таблице. Итоговые значения видны в ЭФФЕКТЫ_V4.');
      // Reload from Google to confirm persistence and update derived stats.
      const revision = data.profile.revision;
      const checked = await fetch(`${API}?characterId=${encodeURIComponent(characterId)}&t=${Date.now()}`, {cache:'no-store'});
      const confirmation = await checked.json() as Loaded;
      if (!checked.ok || !confirmation.ok || confirmation.profile.revision !== revision) throw Error('Запись сделана, но повторное чтение Google не подтвердило ревизию');
      setDraft(confirmation.profile);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  }

  return <section className="admin-effects-v4">
    <header className="admin-effects-v4-header">
      <div><h2>Расы и особенности · V4</h2><p>Индивидуальные бонусы, книжные особенности и расовые способности. Старый лист и формулы не изменяются.</p></div>
      <button type="button" className="admin-button" disabled={!draft || saving || working} onClick={() => void save()}>{saving ? 'Сохраняю…' : 'Сохранить в Google'}</button>
    </header>
    <div className="admin-effects-v4-layout">
      <aside className="admin-effects-v4-characters">
        <input placeholder="Поиск персонажа" value={query} onChange={(e) => setQuery(e.target.value)} />
        {ready.filter((c) => `${c.name} ${c.player}`.toLowerCase().includes(query.toLowerCase())).map((c) =>
          <button type="button" key={c.id} className={characterId === c.id ? 'selected' : ''} disabled={saving} onClick={() => setCharacterId(c.id)}>{c.name}<small>{c.player}</small></button>)}
      </aside>
      <div className="admin-effects-v4-content">
        {working ? <p>Читаю особенности из Google…</p> : null}
        {message ? <p className="admin-effects-v4-message" role="status">{message}</p> : null}
        {draft && selected ? <>
          <section className="admin-effects-v4-card">
            <h3>Раса · {selected.name}</h3>
            <label>Название расы<input value={draft.race} onChange={(e) => updateRace(e.target.value)} placeholder="Человек, демон, ведьма…" /></label>
            <small>Исходная раса из анкеты сохранена. Новое значение и индивидуальные усиления хранятся на листе ЭФФЕКТЫ_V4.</small>
          </section>
          {draft.sources.map((source, i) => <section className="admin-effects-v4-card" key={source.id}>
            <div className="admin-effects-v4-card-head"><h3>{source.kind === 'race' ? 'Расовые эффекты' : `Особенность ${i+1}`}</h3>
              {source.kind !== 'race' ? <button type="button" onClick={() => changeSource(i,{archived:!source.archived,enabled:source.archived})}>{source.archived ? 'Вернуть' : 'Архивировать'}</button> : null}
            </div>
            <div className="admin-effects-v4-fields">
              <label>Название<input value={source.name} onChange={(e) => changeSource(i,{name:e.target.value})} disabled={source.kind==='race'} /></label>
              <label>Источник<select value={source.origin} disabled={source.kind==='race'} onChange={(e) => changeSource(i,{origin:e.target.value as EffectSourceV4['origin']})}>{ORIGINS.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            </div>
            <label>Описание<textarea value={source.description} rows={2} onChange={(e) => changeSource(i,{description:e.target.value})} /></label>
            <label className="admin-effects-v4-check"><input type="checkbox" checked={source.enabled} onChange={(e) => changeSource(i,{enabled:e.target.checked})} /> Эффекты включены</label>
            {source.legacyName ? <small>Сохранена исходная запись из B76: «{source.legacyName}»</small> : null}
            {source.effects.map((effect,j) => <div className="admin-effects-v4-effect" key={effect.id}>
              <div className="admin-effects-v4-card-head"><strong>Эффект {j+1}</strong><button type="button" onClick={() => changeSource(i,{effects:source.effects.filter((_,k) => k!==j)})}>Удалить эффект</button></div>
              <div className="admin-effects-v4-fields">
                <label>Функция<select value={effect.kind} onChange={(e) => changeEffect(i,j,e.target.value==='ability' ? {kind:'ability',abilityName:'Новая способность'} : {kind:'modifier',stat:'attack',mode:'flat',value:0})}><option value="modifier">Изменение характеристики</option><option value="ability">Открывает способность</option></select></label>
                <label>Действует<select value={effect.trigger} onChange={(e) => changeEffect(i,j,{trigger:e.target.value as EffectV4['trigger']})}>{TRIGGERS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
                {effect.kind === 'modifier' ? <>
                  <label>Характеристика<select value={effect.stat || 'attack'} onChange={(e)=>changeEffect(i,j,{stat:e.target.value as EffectStatV4})}>{EFFECT_STATS_V4.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
                  <label>Формат<select value={effect.mode || 'flat'} onChange={(e)=>changeEffect(i,j,{mode:e.target.value as 'flat'|'percent'})}><option value="flat">Число (+/−)</option><option value="percent">Проценты (+/−)</option></select></label>
                  <label>Значение<input type="number" step="any" value={effect.value ?? 0} onChange={(e)=>changeEffect(i,j,{value:Number(e.target.value)})} /></label>
                </> : <label>Название способности<input value={effect.abilityName || ''} onChange={(e)=>changeEffect(i,j,{abilityName:e.target.value})} /></label>}
              </div>
              <label>Пояснение / условие<input value={effect.description || ''} onChange={(e)=>changeEffect(i,j,{description:e.target.value})} /></label>
              <small>{effectsV4Text(effect)}</small>
            </div>)}
            <div className="admin-effects-v4-actions"><button type="button" onClick={() => changeSource(i,{effects:[...source.effects,{id:newId('effect'),kind:'modifier',stat:'attack',mode:'flat',value:0,trigger:'always'}]})} disabled={source.effects.length >= 12}>+ Модификатор</button>
              <button type="button" disabled={source.effects.length >= 12} onClick={() => changeSource(i,{effects:[...source.effects,{id:newId('effect'),kind:'ability',abilityName:'Новая способность',description:'',trigger:'always'}]})}>+ Способность</button></div>
          </section>)}
          <button type="button" className="admin-effects-v4-add" disabled={draft.sources.length >= 45} onClick={addFeature}>+ Добавить особенность (книга / РП / проклятие)</button>
          <section className="admin-effects-v4-card"><h3>Предварительный расчёт · постоянные эффекты</h3><p><small>Суммы процентов складываются; формула: max(0, (база + числовые бонусы) × (1 + проценты / 100)). Условные и боевые эффекты не увеличивают постоянные показатели.</small></p>
            <div className="admin-effects-v4-preview">{EFFECT_STATS_V4.map(([key,label]) => <div key={key}><span>{label}</span><strong>{preview?.breakdown[key]?.total ?? 0}</strong><small>({preview?.breakdown[key]?.base ?? 0} + {preview?.breakdown[key]?.flat ?? 0}) · {preview?.breakdown[key]?.percent ?? 0}%</small></div>)}</div>
          </section>
        </> : !working && !message ? <p>Выбери персонажа.</p> : null}
      </div>
    </div>
  </section>;
}
