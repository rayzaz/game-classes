/* SIRA read-only live HP/MP for authenticated players; secret-authenticated Google publisher. */
import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';
import { readSession, json } from './_shared/_auth.mjs';
import { cleanLivePayload, liveForCharacter, LIVE_KEY, publishLiveSnapshot, resolveLiveCharacterId } from './_character-db/live-state-core.mjs';

function getLiveStore() {
  return getStore({ name: 'sira-character-live-state-v1', consistency: 'strong' });
}
function validSecret(request) {
  const expected = Buffer.from(String(process.env.CHARACTER_SYNC_SECRET || '').trim());
  const received = Buffer.from(String(request.headers.get('x-character-sync-secret') || '').trim());
  return expected.length > 0 && received.length === expected.length && timingSafeEqual(expected, received);
}
export default async function handler(request) {
  if (request.method === 'GET') {
    let session;
    try { session = readSession(request); } catch (error) {
      console.error('live state auth configuration error', error);
      return json({ ok: false, error: 'Authentication unavailable' }, 503);
    }
    if (!session) return json({ ok: false, error: 'Unauthorized' }, 401);
    const requestedId = new URL(request.url).searchParams.get('characterId');
    const id = resolveLiveCharacterId(session, requestedId);
    if (!id) return json({ ok: false, error: 'Forbidden' }, 403);
    try {
      const snapshot = await getLiveStore().get(LIVE_KEY, { type: 'json', consistency: 'strong' });
      const record = liveForCharacter(snapshot, id);
      if (!record) return json({ ok: true, available: false, characterId: id });
      return json({ ok: true, available: true, characterId: id, ...record });
    } catch (error) {
      console.error('live-state GET failed:', error);
      return json({ ok: false, error: 'Live data temporarily unavailable' }, 503);
    }
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (!validSecret(request)) return json({ ok: false, error: 'Unauthorized' }, 401);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 100_000) return json({ ok: false, error: 'Payload too large' }, 413);
  let snapshot;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, 'utf8') > 100_000) return json({ ok: false, error: 'Payload too large' }, 413);
    snapshot = cleanLivePayload(JSON.parse(body));
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Invalid payload' }, 422);
  }
  try {
    const outcome = await publishLiveSnapshot(getLiveStore(), snapshot);
    console.log('SIRA live HP/MP publish:', outcome.status, 'count:', snapshot.count);
    return json({ ok: true, status: outcome.status, count: snapshot.count, observedAt: snapshot.observedAt });
  } catch (error) {
    console.error('live-state POST failed:', error);
    return json({ ok: false, error: 'Live state storage unavailable' }, 503);
  }
}
