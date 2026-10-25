// Pure validation shared by the admin HTTP endpoint; Google repeats validations.
const STAT_KEYS = new Set(['hp', 'mp', 'strength', 'speed', 'attack', 'defense', 'healing', 'buff', 'debuff', 'potions', 'summon', 'movement', 'speedModifier', 'physical', 'other']);
const ORIGINS = new Set(['race', 'book', 'rp', 'curse', 'blessing', 'other']);
const TRIGGERS = new Set(['always', 'battle', 'conditional']);
const MAX_SOURCES = 45;
const MAX_EFFECTS = 12;
const text = (value, max = 4000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function validateEffectsV4(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Неверный формат V4');
  if (!Array.isArray(payload.sources) || payload.sources.length > MAX_SOURCES) throw Error('Слишком много особенностей');
  const race = text(payload.race, 120);
  const seen = new Set();
  const sources = payload.sources.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Неверная особенность');
    const id = text(item.id, 100);
    const kind = item.kind;
    const origin = item.origin;
    const name = text(item.name, 180);
    if (!id || seen.has(id) || !/^[\w:.-]{1,100}$/i.test(id)) throw Error('Повторяющийся или неверный ID особенности');
    if (!name) throw Error('У особенности нет названия');
    if (!['race', 'feature'].includes(kind) || !ORIGINS.has(origin)) throw Error('Неверный тип особенности');
    if (!Array.isArray(item.effects) || item.effects.length > MAX_EFFECTS) throw Error('Слишком много эффектов в особенности');
    seen.add(id);
    const seenEffects = new Set();
    const effects = item.effects.map((e) => {
      const eId = text(e?.id, 100);
      if (!eId || !/^[\w:.-]{1,100}$/i.test(eId) || seenEffects.has(eId)) throw Error('Неверный ID эффекта');
      seenEffects.add(eId);
      if (!TRIGGERS.has(e.trigger)) throw Error('Неверное условие действия эффекта');
      if (e.kind === 'ability') {
        const abilityName = text(e.abilityName, 160);
        if (!abilityName) throw Error('Назовите открываемую способность');
        return { id: eId, kind: 'ability', abilityName, description: text(e.description, 2000), trigger: e.trigger };
      }
      if (e.kind !== 'modifier' || !STAT_KEYS.has(e.stat) || !['flat', 'percent'].includes(e.mode)) throw Error('Неверный модификатор характеристики');
      if (typeof e.value !== 'number' || !Number.isFinite(e.value) || Math.abs(e.value) > 100000) throw Error('Недопустимое числовое значение');
      return { id: eId, kind: 'modifier', stat: e.stat, mode: e.mode, value: e.value, trigger: e.trigger, description: text(e.description, 2000) };
    });
    return { id, kind, origin, name, description: text(item.description, 4000), enabled: item.enabled === true, archived: item.archived === true, legacyName: text(item.legacyName, 180), effects };
  });
  if (sources.filter((s) => s.kind === 'race' && !s.archived).length > 1) throw Error('У персонажа может быть только одна активная раса');
  const normalized = { schemaVersion: 4, race, sources };
  if (JSON.stringify(normalized).length > 30000) throw Error('Данные V4 слишком большие');
  return normalized;
}
