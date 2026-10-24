/** SIRA stars-only B2 snapshot. The Google workbook is authoritative. */
export const STARS_STORE = 'sira-star-bank-google-v2';
export const STARS_KEY = 'snapshots/stars-v2';
export const ACCOUNT_COUNT = 34;
const IDENTIFIER = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const MAX_BALANCE = 1_000_000_000_000;
const MAX_AGE_MS = 15 * 60 * 1000;

function parseTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  return Date.parse(value);
}

export function validateStarsSnapshot(payload, now = Date.now()) {
  if (payload?.schemaVersion !== 2 || payload?.complete !== true ||
      payload?.currency !== 'stars' || !Array.isArray(payload?.accounts) ||
      payload.accounts.length !== ACCOUNT_COUNT) throw new Error('STARS: incomplete snapshot');
  const observed = parseTime(payload.observedAt);
  if (!Number.isFinite(observed) || observed > now + 120_000 || observed < now - 5 * 60_000) {
    throw new Error('STARS: invalid timestamp');
  }
  const accounts = Object.create(null);
  for (const value of payload.accounts) {
    const id = value?.characterId;
    const name = value?.name;
    if (typeof id !== 'string' || !IDENTIFIER.test(id) || Object.hasOwn(accounts, id) ||
        typeof name !== 'string' || !name.trim() || name.length > 250 ||
        !Number.isSafeInteger(value.stars) || value.stars < 0 || value.stars > MAX_BALANCE ||
        !Number.isSafeInteger(value.version) || value.version < 0) {
      throw new Error('STARS: invalid or duplicated account');
    }
    accounts[id] = {characterId: id, name: name.trim(), stars: value.stars, version: value.version};
  }
  if (Object.keys(accounts).length !== ACCOUNT_COUNT) throw new Error('STARS: incomplete accounts');
  return {schemaVersion: 2, currency: 'stars', source: 'SIRA Google Bank B1',
    observedAt: payload.observedAt, count: ACCOUNT_COUNT, accounts};
}

/** CAS prevents a slow source read from overwriting a later source snapshot. */
export async function saveStarsSnapshot(store, snapshot, tries = 6) {
  const incoming = parseTime(snapshot.observedAt);
  if (!Number.isFinite(incoming)) throw new Error('STARS: missing time');
  for (let attempt = 0; attempt < tries; attempt++) {
    const existing = await store.getWithMetadata(STARS_KEY, {type:'json', consistency:'strong'});
    const current = parseTime(existing?.data?.observedAt);
    if (Number.isFinite(current) && incoming <= current) return {status:'superseded'};
    if (existing && !existing.etag) throw new Error('STARS: missing ETag');
    const write = await store.setJSON(STARS_KEY, snapshot,
      existing ? {onlyIfMatch:existing.etag} : {onlyIfNew:true});
    if (write?.modified === true && write.etag) return {status:'applied'};
    if (write?.modified !== false) throw new Error('STARS: write not confirmed');
  }
  throw new Error('STARS: concurrent update failed');
}

export function viewStarsSnapshot(snapshot, session, canManage, now = Date.now()) {
  if (!session) throw new Error('STARS: unauthenticated');
  const base = {available:false, readOnly:true, currency:'stars', count:0, accounts:[], canManageBank:Boolean(canManage)};
  if (snapshot?.schemaVersion !== 2 || snapshot?.currency !== 'stars' ||
      snapshot?.count !== ACCOUNT_COUNT || !snapshot?.accounts) return base;
  const observed = parseTime(snapshot.observedAt);
  if (!Number.isFinite(observed) || observed > now + 120_000 || now - observed > MAX_AGE_MS) {
    return {...base, stale:true, count:snapshot.count, observedAt:snapshot.observedAt};
  }
  const id = typeof session.cid === 'string' ? session.cid.toLowerCase().trim() : '';
  const own = IDENTIFIER.test(id) && Object.hasOwn(snapshot.accounts, id) ? snapshot.accounts[id] : null;
  const accounts = canManage
    ? Object.values(snapshot.accounts).sort((a,b) => a.name.localeCompare(b.name,'ru'))
    : own ? [own] : [];
  return {...base, available:true, count:snapshot.count, observedAt:snapshot.observedAt,
    ownAccount:own, accounts};
}
