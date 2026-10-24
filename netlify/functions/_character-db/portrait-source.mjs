/**
 * Standalone portrait source overrides. Does not modify character snapshots.
 * Google Sheets personal AS1 remains authoritative; only public Drive images.
 */
export const PORTRAIT_OVERRIDE_PREFIX = 'portrait-overrides/';
export function safePortraitId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,80}$/.test(id) ? id : '';
}
export function portraitOverrideKey(id) {
  const valid = safePortraitId(id);
  if (!valid) throw new Error('Invalid character ID');
  return PORTRAIT_OVERRIDE_PREFIX + valid;
}
export function driveFileId(source) {
  let url;
  try { url = new URL(String(source || '').trim()); } catch { return ''; }
  if (url.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(url.hostname.toLowerCase())) return '';
  const patterns = [
    url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/),
    url.pathname.match(/^\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/),
  ];
  const candidate = patterns.find(Boolean)?.[1] || url.searchParams.get('id') || '';
  return /^[A-Za-z0-9_-]{20,}$/.test(candidate) ? candidate : '';
}
export function preferredPortraitUrl(source) {
  const fileId = driveFileId(source);
  return fileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`
    : String(source || '').trim();
}
export function assertPortraitPayload(payload, nowMs = Date.now()) {
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload?.portraits) ||
      payload.portraits.length < 1 || payload.portraits.length > 34) {
    throw new Error('Invalid portrait sync schema or count');
  }
  const observedAt = String(payload.observedAt || '');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(observedAt))
    throw new Error('Invalid observedAt');
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp) || timestamp > nowMs + 600000 || timestamp < nowMs - 7 * 86400000)
    throw new Error('ObservedAt out of acceptable window');
  const ids = new Set();
  const portraits = payload.portraits.map(entry => {
    const characterId = safePortraitId(entry?.characterId);
    const source = String(entry?.source || '').trim();
    if (!characterId || !driveFileId(source) || ids.has(characterId))
      throw new Error('Missing, duplicate or unsupported portrait entry');
    ids.add(characterId);
    return { characterId, source };
  });
  return { observedAt, portraits };
}
export async function publishPortraitOverride(store, characterId, source, observedAt) {
  const key = portraitOverrideKey(characterId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const prior = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const prevVersion = Date.parse(prior?.data?.observedAt || '') || 0;
    if (prevVersion >= Date.parse(observedAt)) return 'superseded';
    if (prior && !prior.etag) throw new Error('Missing portrait ETag');
    const options = prior ? { onlyIfMatch: prior.etag } : { onlyIfNew: true };
    const outcome = await store.setJSON(key, {
      schemaVersion: 1, characterId, source, observedAt,
    }, options);
    if (outcome?.modified === true && outcome?.etag) return 'applied';
    if (outcome?.modified !== false) throw new Error('Unconfirmed portrait write');
  }
  throw new Error('Portrait CAS contention');
}
export async function readPortraitOverride(store, characterId) {
  const id = safePortraitId(characterId);
  if (!id) return '';
  const entry = await store.get(portraitOverrideKey(id), { type: 'json', consistency: 'strong' });
  return entry?.characterId === id && driveFileId(entry?.source) ? entry.source : '';
}
