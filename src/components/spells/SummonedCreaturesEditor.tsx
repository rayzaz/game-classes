import React from 'react';
import type { SummonedAbility, SummonedCreature } from '../../lib/spellSchema';
import './summoned-creatures-editor.css';

type Props = {
  creatures: SummonedCreature[];
  onChange: (next: SummonedCreature[]) => void;
};

const emptyCreature = (): SummonedCreature => ({
  name: '', hp: null, mp: null, description: '', abilities: [],
});
const emptyAbility = (): SummonedAbility => ({ name: '', effect: '', manaCost: null });

function naturalNumber(raw: string, min: number): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= 1_000_000_000 ? value : null;
}

export default function SummonedCreaturesEditor({ creatures, onChange }: Props) {
  function updateCreature(index: number, next: Partial<SummonedCreature>) {
    onChange(creatures.map((creature, i) => i === index ? { ...creature, ...next } : creature));
  }
  function updateAbility(creatureIndex: number, abilityIndex: number, next: Partial<SummonedAbility>) {
    const creature = creatures[creatureIndex];
    updateCreature(creatureIndex, {
      abilities: creature.abilities.map((ability, i) => i === abilityIndex ? { ...ability, ...next } : ability),
    });
  }
  return (
    <div className="gosmag-summons">
      <div className="gosmag-summons-header">
        <div><strong>Призываемые существа</strong><small>HP, MP и способности каждого вида. Не меняет HP/MP самого персонажа.</small></div>
        <button type="button" disabled={creatures.length >= 10} onClick={() => onChange([...creatures, emptyCreature()])}>+ Существо</button>
      </div>
      {!creatures.length && <p>Можно добавить характеристики существ. Старые призывы без этих данных сохраняются как прежде.</p>}
      {creatures.map((creature, i) => (
        <div className="gosmag-summon-card" key={i}>
          <div className="gosmag-summon-card-head">
            <strong>Существо #{i + 1}</strong>
            <button type="button" onClick={() => onChange(creatures.filter((_, j) => j !== i))}>Удалить существо</button>
          </div>
          <div className="gosmag-summon-grid">
            <label>Название<input value={creature.name} maxLength={150} onChange={e => updateCreature(i, { name: e.target.value })} placeholder="Название монстра" /></label>
            <label>HP<input type="number" min="1" step="1" value={creature.hp ?? ''} onChange={e => updateCreature(i, { hp: naturalNumber(e.target.value, 1) })} placeholder="HP" /></label>
            <label>MP (мана)<input type="number" min="0" step="1" value={creature.mp ?? ''} onChange={e => updateCreature(i, { mp: naturalNumber(e.target.value, 0) })} placeholder="0, если нет маны" /></label>
            <label className="gosmag-summon-wide">Описание<textarea rows={2} maxLength={2000} value={creature.description} onChange={e => updateCreature(i, { description: e.target.value })} placeholder="Особенности существа (необязательно)" /></label>
          </div>
          <div className="gosmag-summon-card-head">
            <strong>Способности</strong>
            <button type="button" disabled={creature.abilities.length >= 12} onClick={() => updateCreature(i, { abilities: [...creature.abilities, emptyAbility()] })}>+ Способность</button>
          </div>
          {creature.abilities.map((ability, j) => (
            <div className="gosmag-summon-ability" key={j}>
              <div className="gosmag-summon-card-head"><span>Способность #{j + 1}</span><button type="button" onClick={() => updateCreature(i, { abilities: creature.abilities.filter((_, k) => k !== j) })}>Удалить</button></div>
              <div className="gosmag-summon-grid">
                <label>Название<input value={ability.name} maxLength={150} onChange={e => updateAbility(i, j, { name: e.target.value })} /></label>
                <label>Расход MP<input type="number" min="0" step="1" value={ability.manaCost ?? ''} onChange={e => updateAbility(i, j, { manaCost: naturalNumber(e.target.value, 0) })} placeholder="Не задан" /></label>
                <label className="gosmag-summon-wide">Эффект способности<textarea rows={2} maxLength={1200} value={ability.effect} onChange={e => updateAbility(i, j, { effect: e.target.value })} /></label>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
