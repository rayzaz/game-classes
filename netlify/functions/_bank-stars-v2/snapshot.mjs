/**
 * SIRA Stars B2.1 — Google is authoritative; history is read-only.
 * The server filters both accounts and history using the signed session.cid.
 */
export const STARS_STORE = 'sira-star-bank-google-v2';
export const STARS_KEY = 'snapshots/stars-v2';
export const ACCOUNT_COUNT = 34;
export const MAX_HISTORY_ROWS = 300;
const IDENTIFIER = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const MAX_BALANCE = 1_000_000_000_000;
const MAX_AGE_MS = 15 * 60 * 1000;

function parseTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  return Date.parse(value);
}

function validateHistoryItem(item, knownAccounts, observed, seen) {
  const id = item?.transactionId;
  const cid = item?.characterId;
  if (typeof id !== 'string' || id.length < 1 || id.length > 128 ||
      !/^[\w-]+$/.test(id) || seen.has(id) ||
      typeof cid !== 'string' || !IDENTIFIER.test(cid) || !Object.hasOwn(knownAccounts, cid) ||
      typeof item.kind !== 'string' || item.kind.trim().length < 1 || item.kind.length > 80 ||
      typeof item.reason !== 'string' || item.reason.length > 500 ||
      typeof item.bankerLogin !== 'string' || item.bankerLogin.length > 120 ||
      !Number.isSafeInteger(item.amount) || item.amount < 0 || item.amount > MAX_BALANCE ||
      !Number.isSafeInteger(item.balanceBefore) || item.balanceBefore < 0 || item.balanceBefore > MAX_BALANCE ||
      !Number.isSafeInteger(item.balanceAfter) || item.balanceAfter < 0 || item.balanceAfter > MAX_BALANCE) {
    throw new Error('STARS: invalid history entry');
  }
  const timestamp = parseTime(item.occurredAt);
  if (!Number.isFinite(timestamp) || timestamp < Date.UTC(2020, 0, 1) || timestamp > observed + 120_000) {
    throw new Error('STARS: invalid history time');
  }
  seen.add(id);
  return {
    transactionId:id, occurredAt:item.occurredAt, characterId:cid,
    kind:item.kind.trim(), amount:item.amount, balanceBefore:item.balanceBefore,
    balanceAfter:item.balanceAfter, reason:item.reason, bankerLogin:item.bankerLogin
  };
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
    accounts[id] = {characterId:id,name:name.trim(),stars:value.stars,version:value.version};
  }
  if (Object.keys(accounts).length !== ACCOUNT_COUNT) throw new Error('STARS: incomplete accounts');

  // Compatibility with the existing B2 worker: do not falsely advertise an empty history
  // until the updated read-only Google worker has actually published it.
  let historyAvailable = false;
  let history = [];
  let historyTotal = 0;
  if (payload.historyComplete === true) {
    if (!Array.isArray(payload.history) || payload.history.length > MAX_HISTORY_ROWS ||
        !Number.isSafeInteger(payload.historyTotal) || payload.historyTotal < payload.history.length) {
      throw new Error('STARS: invalid history snapshot');
    }
    const seen = new Set();
    history = payload.history.map(item => validateHistoryItem(item,accounts,observed,seen));
    historyAvailable = true;
    historyTotal = payload.historyTotal;
  } else if (payload.historyComplete !== undefined || payload.history !== undefined || payload.historyTotal !== undefined) {
    throw new Error('STARS: incomplete history payload');
  }
  return {schemaVersion:2,currency:'stars',source:'SIRA Google Bank B1',
    observedAt:payload.observedAt,count:ACCOUNT_COUNT,accounts,
    historyAvailable, historyTotal, history};
}

/** CAS rejects older observations, preserving newer published snapshots. */
export async function saveStarsSnapshot(store, snapshot, tries = 6) {
  const incoming = parseTime(snapshot.observedAt);
  if (!Number.isFinite(incoming)) throw new Error('STARS: missing time');
  for (let attempt=0; attempt<tries; attempt++) {
    const existing = await store.getWithMetadata(STARS_KEY,{type:'json',consistency:'strong'});
    const current = parseTime(existing?.data?.observedAt);
    if (Number.isFinite(current) && incoming <= current) return {status:'superseded'};
    if (existing && !existing.etag) throw new Error('STARS: missing ETag');
    const write = await store.setJSON(STARS_KEY,snapshot,
      existing ? {onlyIfMatch:existing.etag} : {onlyIfNew:true});
    if (write?.modified === true && write.etag) return {status:'applied'};
    if (write?.modified !== false) throw new Error('STARS: write not confirmed');
  }
  throw new Error('STARS: concurrent update failed');
}

/** The privileged flag MUST come from server-side permissions, never the client. */
export function viewStarsSnapshot(snapshot, session, canManage, now = Date.now()) {
  if (!session) throw new Error('STARS: unauthenticated');
  const privileged = canManage === true;
  const base = {
    available:false,readOnly:true,currency:'stars',count:0,accounts:[],
    ownAccount:null,canManageBank:privileged,historyAvailable:false,history:[],historyHasMore:false
  };
  if (snapshot?.schemaVersion !== 2 || snapshot?.currency !== 'stars' ||
      snapshot?.count !== ACCOUNT_COUNT || !snapshot?.accounts) return base;
  const observed = parseTime(snapshot.observedAt);
  if (!Number.isFinite(observed) || observed > now + 120_000 || now-observed > MAX_AGE_MS) {
    return {...base,stale:true,observedAt:snapshot.observedAt};
  }
  const id = typeof session.cid === 'string' ? session.cid.toLowerCase().trim() : '';
  const own = IDENTIFIER.test(id) && Object.hasOwn(snapshot.accounts,id)
    ? snapshot.accounts[id] : null;
  const accounts = privileged
    ? Object.values(snapshot.accounts).sort((a,b)=>a.name.localeCompare(b.name,'ru'))
    : own ? [own] : [];
  const historyAvailable = snapshot.historyAvailable === true && Array.isArray(snapshot.history);
  const filtered = !historyAvailable ? [] : privileged
    ? snapshot.history : own ? snapshot.history.filter(item=>item.characterId===id) : [];
  const history = filtered.map(item => privileged ? {...item} : {
    transactionId:item.transactionId,occurredAt:item.occurredAt,
    characterId:item.characterId,kind:item.kind,amount:item.amount,
    balanceBefore:item.balanceBefore,balanceAfter:item.balanceAfter,reason:item.reason
  }).reverse();
  return {...base,available:true,count:privileged ? snapshot.count : accounts.length,
    observedAt:snapshot.observedAt,ownAccount:own,accounts,
    historyAvailable,history,historyHasMore:historyAvailable && snapshot.historyTotal>snapshot.history.length};
}
