/** Character effects V4: shared data contract for racial and acquired features.
 * Always-on modifiers affect the calculated preview; situational modifiers are
 * listed but intentionally DO NOT change permanent values without battle state.
 */
export const EFFECT_STATS_V4 = [
  ['hp', 'Макс. HP'], ['mp', 'Макс. MP'], ['strength', 'Физическая сила'], ['speed', 'Скорость'],
  ['attack', 'Магическая атака'], ['defense', 'Магическая защита'], ['healing', 'Лечение'],
  ['buff', 'Бафф'], ['debuff', 'Дебафф'], ['potions', 'Зелья'], ['summon', 'Призыв'],
  ['movement', 'Перемещение'], ['speedModifier', 'Модификатор скорости'],
  ['physical', 'Физическое воздействие'], ['other', 'Прочее'],
] as const;
export type EffectStatV4 = typeof EFFECT_STATS_V4[number][0];
export type EffectTriggerV4 = 'always' | 'battle' | 'conditional';
export type EffectV4 = {
  id: string;
  kind: 'modifier' | 'ability';
  stat?: EffectStatV4;
  mode?: 'flat' | 'percent';
  value?: number;
  trigger: EffectTriggerV4;
  abilityName?: string;
  description?: string;
};
export type EffectSourceV4 = {
  id: string;
  kind: 'race' | 'feature';
  origin: 'race' | 'book' | 'rp' | 'curse' | 'blessing' | 'other';
  name: string;
  description: string;
  enabled: boolean;
  archived?: boolean;
  legacyName?: string;
  effects: EffectV4[];
};
export type CharacterEffectsV4 = {
  schemaVersion: 4;
  revision: number;
  race: string;
  sources: EffectSourceV4[];
};
export type StatsV4 = Record<EffectStatV4, number>;

export function emptyEffectsV4(): CharacterEffectsV4 {
  return { schemaVersion: 4, revision: 0, race: '', sources: [] };
}

export function calculateEffectsV4(base: Partial<StatsV4>, sources: EffectSourceV4[]) {
  const current = {} as StatsV4;
  const breakdown = {} as Record<EffectStatV4, { base: number; flat: number; percent: number; total: number }>;
  for (const [stat] of EFFECT_STATS_V4) {
    const baseValue = Number(base[stat] ?? 0);
    let flat = 0;
    let percent = 0;
    for (const source of sources) {
      if (!source.enabled || source.archived) continue;
      for (const effect of source.effects) {
        if (effect.kind !== 'modifier' || effect.trigger !== 'always' || effect.stat !== stat) continue;
        if (effect.mode === 'flat') flat += Number(effect.value ?? 0);
        else if (effect.mode === 'percent') percent += Number(effect.value ?? 0);
      }
    }
    const total = Math.max(0, Math.round(((baseValue + flat) * (1 + percent / 100)) * 100) / 100);
    breakdown[stat] = { base: baseValue, flat, percent, total };
    current[stat] = total;
  }
  return { stats: current, breakdown };
}

export function effectsV4Text(effect: EffectV4): string {
  if (effect.kind === 'ability') return `Способность: ${effect.abilityName || 'Без названия'}`;
  const label = EFFECT_STATS_V4.find(([key]) => key === effect.stat)?.[1] ?? effect.stat ?? '';
  const n = Number(effect.value ?? 0);
  const sign = n > 0 ? '+' : '';
  const suffix = effect.mode === 'percent' ? '%' : '';
  const trigger = effect.trigger !== 'always' ? ` · ${effect.trigger === 'battle' ? 'только в бою' : 'условно'}` : '';
  return `${label}: ${sign}${n}${suffix}${trigger}`;
}
