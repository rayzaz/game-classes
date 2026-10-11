/*
 * Stage B: best-effort refresh after an authoritative Google mutation.
 * Only reads Google and publishes its read-only snapshot to Character DB.
 * Failure MUST NOT turn a successful reward or item consumption into a retryable write.
 * Uses Stage A guarded snapshot writes (ETag CAS); never store.setJSON blindly.
 */
import { getCharacterDbStore, characterKey } from './store.mjs';
import { publishCharacterSnapshot } from './guarded-write.mjs';
import { normalizeCharacterIds, preserveStablePortrait } from './event-refresh-utils.mjs';

const CONCURRENCY = 6;
const READ_TIMEOUT_MS = 30_000;
const SETTLE_DELAY_MS = 8_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function refreshOne(characterId) {
  const serviceUrl = String(process.env.CHARACTER_SERVICE_URL || '').trim();
  if (!serviceUrl) throw new Error('CHARACTER_SERVICE_URL is missing');
  const address = new URL(serviceUrl);
  address.searchParams.set('characterId', characterId);
  address.searchParams.set('_', String(Date.now()));

  // Timestamp when the observation began; never stamp it with completion time,
  // or an old in-flight fetch could claim to be newer than a later fetch.
  const sourceVersion = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  let data;
  try {
    const response = await fetch(address, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Google HTTP ${response.status}`);
    data = await response.json();
  } finally {
    clearTimeout(timer);
  }
  if (data?.ok !== true) throw new Error(data?.error || 'Google returned invalid character');
  const dataId = String(data?.registry?.characterId || '').trim().toLowerCase();
  if (dataId && dataId !== characterId) throw new Error('Google returned another character');

  const store = getCharacterDbStore();
  const result = await publishCharacterSnapshot({
    store,
    key: characterKey(characterId),
    characterId,
    data,
    sourceVersion,
    transformData: (snapshot, current) => preserveStablePortrait(snapshot, current, characterId),
  });
  return { characterId, status: result.status };
}

async function refreshAll(ids, label, round) {
  const queue = ids.slice();
  const succeeded = [];
  const failed = [];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      try {
        succeeded.push(await refreshOne(id));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failed.push({ characterId: id, reason });
        console.error('event Character DB refresh failed:', label, round, id, reason);
      }
    }
  });
  await Promise.all(workers);
  console.log('event Character DB refresh:', label, round,
    `applied=${succeeded.filter(v => v.status === 'applied').length}`,
    `superseded=${succeeded.filter(v => v.status === 'superseded').length}`,
    `failed=${failed.length}`);
  return { succeeded, failed };
}

export async function scheduleEventCharacterRefresh(context, rawIds, label) {
  const ids = normalizeCharacterIds(rawIds);
  if (!ids.length) return false;
  const task = (async () => {
    await refreshAll(ids, label, 'immediate');
    await sleep(SETTLE_DELAY_MS);
    await refreshAll(ids, label, 'settled');
  })().catch(error => {
    console.error('event Character DB refresh task failed:', label,
      error instanceof Error ? error.message : String(error));
  });

  if (typeof context?.waitUntil === 'function') {
    context.waitUntil(task);
  } else {
    // Conservative fallback for runtimes without waitUntil. Prevent an untracked
    // detached promise from being killed when the function returns.
    await task;
  }
  return true;
}
