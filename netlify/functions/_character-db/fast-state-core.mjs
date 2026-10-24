/* Read-only central level/experience cache. Google sheets remain authoritative. */
import { resolveLiveCharacterId } from './live-state-core.mjs';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const VALID_ID = /^[a-z0-9][a-z0-9_-]{0,99}$/;
export const FAST_CORE_KEY = 'central-core/v1';
export const FAST_CORE_MAX_AGE_MS = 10 * 60_000;
export { resolveLiveCharacterId };

function epoch(iso) {
  if (typeof iso !== 'string' || !ISO.test(iso)) return null;
  const number = Date.parse(iso);
  return Number.isFinite(number) ? number : null;
}
function validLevel(value) {
  return value && Number.isSafeInteger(value.current) && value.current >= 0 && value.current <= 100_000 &&
    Number.isFinite(value.experience) && value.experience >= 0 && value.experience <= 1e12 &&
    Number.isFinite(value.progress) && value.progress >= 0 && value.progress <= 100.00001;
}
function validPoints(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000;
}
export function cleanFastPayload(body, now = Date.now()) {
  if (body?.schemaVersion !== 1 || body.complete !== true || !Array.isArray(body.characters) ||
    body.characters.length < 10 || body.characters.length > 300) {
    throw new Error('Incomplete central core snapshot');
  }
  const observedAt = epoch(body.observedAt);
  if (observedAt === null || observedAt > now + 120_000 || now - observedAt > 5 * 60_000) {
    throw new Error('Invalid central core timestamp');
  }
  const characters = Object.create(null);
  for (const item of body.characters) {
    const id = typeof item?.characterId === 'string' ? item.characterId : '';
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!VALID_ID.test(id) || Object.hasOwn(characters, id) || !name || name.length > 200 ||
      /[<>]/.test(name) || (!validLevel(item.level) ||
       (item.upgradePoints !== undefined && !validPoints(item.upgradePoints)))) {
      throw new Error('Invalid/duplicate central core character');
    }
    characters[id] = {
      name,
      level: { current: item.level.current, experience: item.level.experience, progress: item.level.progress },
      ...(item.upgradePoints !== undefined ? { upgradePoints: item.upgradePoints } : {}),
    };
  }
  return { ok: true, schemaVersion: 1, source: 'google-system-imported-levels',
    observedAt: body.observedAt, count: Object.keys(characters).length, characters };
}
export async function publishFastSnapshot(store, snapshot, maxAttempts = 6) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const current = await store.getWithMetadata(FAST_CORE_KEY, { type: 'json', consistency: 'strong' });
    if (epoch(current?.data?.observedAt) !== null &&
        epoch(current?.data?.observedAt) >= epoch(snapshot.observedAt)) {
      return { status: 'superseded' };
    }
    if (current && !current.etag) throw new Error('Missing ETag');
    const result = await store.setJSON(FAST_CORE_KEY, snapshot,
      current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (result?.modified === true && result.etag) return { status: 'applied' };
    if (result?.modified !== false) throw new Error('Central core write not confirmed');
  }
  throw new Error('Central core contention');
}
export function fastForCharacter(snapshot, characterId, now = Date.now()) {
  const time = epoch(snapshot?.observedAt);
  if (!VALID_ID.test(characterId || '') || time === null || time > now + 120_000 ||
      now - time > FAST_CORE_MAX_AGE_MS) return null;
  const record = snapshot?.characters?.[characterId];
  if (!record || typeof record.name !== 'string' || !record.name.trim() || (!validLevel(record.level) ||
      (record.upgradePoints !== undefined && !validPoints(record.upgradePoints)))) return null;
  return { ...record, observedAt: snapshot.observedAt };
}
