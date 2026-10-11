// Pure utilities for safe event-triggered Character DB refresh.
export function normalizeCharacterIds(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values
    .map(value => String(value ?? '').trim().toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, ''))
    .filter(Boolean)));
}

export function preserveStablePortrait(data, existingDocument, characterId) {
  if (!data || typeof data !== 'object' || !data.character || typeof data.character !== 'object') return data;
  const portrait = String(data.character.portrait ?? '').trim();
  if (portrait && !portrait.includes('/sheetsz/')) return data;
  const previous = String(existingDocument?.data?.character?.portraitSource ||
    existingDocument?.data?.character?.portrait || '').trim();
  const stable = previous && !previous.includes('/sheetsz/')
    ? previous : `/cards/characters/${characterId}.jpg`;
  return { ...data, character: { ...data.character, portrait: stable } };
}
