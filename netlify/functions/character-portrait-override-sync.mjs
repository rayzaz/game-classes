import { getCharacterDbStore } from './_character-db/store.mjs';
import { assertPortraitPayload, publishPortraitOverride } from './_character-db/portrait-source.mjs';
const MAX_BYTES = 32 * 1024;
function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function isAuthorized(request) {
  const expected = String(process.env.CHARACTER_SYNC_SECRET || '').trim();
  const value = String(request.headers.get('x-character-sync-secret') || '').trim();
  if (!expected || !value || expected.length !== value.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ value.charCodeAt(i);
  return difference === 0;
}
export default async function (request) {
  if (request.method !== 'POST') return reply({ ok: false, error: 'Method not allowed' }, 405);
  if (!isAuthorized(request)) return reply({ ok: false, error: 'Unauthorized' }, 401);
  let raw;
  try { raw = await request.text(); } catch { return reply({ok:false,error:'Could not read request'},400); }
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return reply({ ok: false, error: 'Too large' }, 413);
  let validated;
  try { validated = assertPortraitPayload(JSON.parse(raw)); }
  catch (error) { return reply({ ok: false, error: String(error?.message || 'Invalid payload') }, 422); }
  try {
    const store = getCharacterDbStore();
    const applied = [];
    const superseded = [];
    for (const { characterId, source } of validated.portraits) {
      const status = await publishPortraitOverride(store, characterId, source, validated.observedAt);
      (status === 'applied' ? applied : superseded).push(characterId);
    }
    console.log('portrait source override sync', { applied, superseded });
    return reply({ ok: true, count: validated.portraits.length, applied, superseded });
  } catch (error) {
    console.error('portrait source override sync failed', error?.message || 'error');
    return reply({ ok: false, error: 'Portrait write failed' }, 503);
  }
}
