/* SIRA Live HP/MP V1. Pure validation and CAS logic; no Google writes. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ID = /^[a-z0-9][a-z0-9_-]{0,99}$/;
export const LIVE_KEY = 'hpmp/v1';
export const STALE_MS = 15 * 60 * 1000;
export function cleanId(value) {
  const id = String(value ?? '').trim().toLowerCase();
  return ID.test(id) ? id : '';
}
/** Return null for attempted cross-character player access. */
export function resolveLiveCharacterId(session, requested) {
  const own = cleanId(session?.cid);
  const want = cleanId(requested);
  if (!session) return null;
  if (session.role === 'admin') return want || own || null;
  if (!own || (want && want !== own)) return null;
  return own;
}
export function isoTime(value) {
  const s = String(value ?? '');
  return ISO.test(s) && Number.isFinite(Date.parse(s)) ? Date.parse(s) : null;
}
export function validMetric(metric) {
  const current = metric?.current, max = metric?.max;
  return typeof current === 'number' && Number.isFinite(current) && current >= 0 &&
    typeof max === 'number' && Number.isFinite(max) && max > 0 &&
    current <= 1e10 && max <= 1e10;
}
export function cleanLivePayload(payload, now = Date.now()) {
  if (payload?.schemaVersion !== 1 || payload?.complete !== true ||
      !Array.isArray(payload.characters) || payload.characters.length < 10 || payload.characters.length > 300) {
    throw new Error('Incomplete or invalid live snapshot');
  }
  const time = isoTime(payload.observedAt);
  if (time === null || time > now + 120_000 || now - time > 5 * 60_000) {
    throw new Error('Invalid live observation time');
  }
  const characters = {};
  for (const item of payload.characters) {
    const id = cleanId(item?.characterId);
    if (!id || Object.hasOwn(characters, id) || !validMetric(item.health) || !validMetric(item.mana)) {
      throw new Error('Invalid or duplicate live record');
    }
    characters[id] = {
      health: { current: item.health.current, max: item.health.max },
      mana: { current: item.mana.current, max: item.mana.max },
    };
  }
  return { ok: true, schemaVersion: 1, source: 'google-system-green-row',
    observedAt: payload.observedAt, characters, count: Object.keys(characters).length };
}

/** Ensure old observations or overlapping invocations never overwrite newer live data. */
export async function publishLiveSnapshot(store, snapshot, maxAttempts = 6) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const current = await store.getWithMetadata(LIVE_KEY, { type: 'json', consistency: 'strong' });
    const prior = isoTime(current?.data?.observedAt);
    const incoming = isoTime(snapshot?.observedAt);
    if (incoming === null) throw new Error('Invalid incoming live snapshot');
    if (prior !== null && prior >= incoming) return { status: 'superseded' };
    if (current && !current.etag) throw new Error('Missing ETag for existing live state');
    const result = await store.setJSON(LIVE_KEY, snapshot,
      current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (result?.modified === true && result.etag) return { status: 'applied' };
    if (result?.modified !== false) throw new Error('Live state write not confirmed');
  }
  throw new Error('Live state contention');
}
export function liveForCharacter(snapshot, id, now = Date.now()) {
  const time = isoTime(snapshot?.observedAt);
  const key = cleanId(id);
  if (!key || time === null || time > now + 120_000 || now - time > STALE_MS) return null;
  const record = snapshot?.characters?.[key];
  if (!validMetric(record?.health) || !validMetric(record?.mana)) return null;
  return { health: record.health, mana: record.mana, observedAt: snapshot.observedAt };
}
