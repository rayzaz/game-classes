/* Session-protected fast central statistics; secret-authenticated Google publisher. */
import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';
import { readSession, json } from './_shared/_auth.mjs';
import { cleanFastPayload, fastForCharacter, FAST_CORE_KEY,
  publishFastSnapshot, resolveLiveCharacterId } from './_character-db/fast-state-core.mjs';

const STORE_NAME = 'sira-character-fast-core-v1';
function store() { return getStore({ name: STORE_NAME, consistency: 'strong' }); }
function secretAllowed(request) {
  const expected = Buffer.from(String(process.env.CHARACTER_SYNC_SECRET || '').trim());
  const received = Buffer.from(String(request.headers.get('x-character-sync-secret') || '').trim());
  return expected.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
}
export default async function handler(request) {
  if (request.method === 'GET') {
    let session;
    try { session = readSession(request); } catch (error) {
      console.error('fast core auth configuration', error);
      return json({ ok: false, error: 'Authentication unavailable' }, 503);
    }
    if (!session) return json({ ok: false, error: 'Unauthorized' }, 401);
    const requested = new URL(request.url).searchParams.get('characterId');
    const id = resolveLiveCharacterId(session, requested);
    if (!id) return json({ ok: false, error: 'Forbidden' }, 403);
    try {
      const snapshot = await store().get(FAST_CORE_KEY, { type: 'json', consistency: 'strong' });
      const record = fastForCharacter(snapshot, id);
      return record ? json({ ok: true, available: true, characterId: id, ...record }) :
        json({ ok: true, available: false, characterId: id });
    } catch (error) {
      console.error('fast core read failed', error);
      return json({ ok: false, error: 'Fast core temporarily unavailable' }, 503);
    }
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (!secretAllowed(request)) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (Number(request.headers.get('content-length') || 0) > 100_000)
    return json({ ok: false, error: 'Too large' }, 413);
  let snapshot;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, 'utf8') > 100_000) return json({ ok: false, error: 'Too large' }, 413);
    snapshot = cleanFastPayload(JSON.parse(body));
  } catch (error) { return json({ ok: false, error: String(error?.message || error) }, 422); }
  try {
    const outcome = await publishFastSnapshot(store(), snapshot);
    console.log('Central core publish', outcome.status, 'count', snapshot.count);
    return json({ ok: true, status: outcome.status, count: snapshot.count, observedAt: snapshot.observedAt });
  } catch (error) {
    console.error('Central core publish failed', error);
    return json({ ok: false, error: 'Storage failed' }, 503);
  }
}
