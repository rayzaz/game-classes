import { json, readSession } from './_shared/_auth.mjs';
import { validateEffectsV4 } from './_shared/_character-effects-v4.mjs';

const normalizeId = (v) => typeof v === 'string' ? v.trim().toLowerCase() : '';
const urlFromEnv = () => {
  const raw = String(process.env.CHARACTER_SERVICE_URL || '').trim();
  if (!raw) throw new Error('Не задан CHARACTER_SERVICE_URL');
  return raw;
};
async function googleResponse(response) {
  const body = await response.text();
  let result;
  try { result = JSON.parse(body); } catch { throw new Error('Google ответил неверным JSON'); }
  if (!response.ok || result?.ok !== true) throw new Error(result?.error || 'Ошибка сервиса персонажей');
  return result;
}
export default async function (request) {
  try {
    const session = readSession(request);
    if (!session) return json({ ok: false, error: 'Требуется вход в систему' }, 401);
    if (session.role !== 'admin') return json({ ok: false, error: 'Только администратор может изменять эффекты' }, 403);
    if (request.method === 'GET') {
      const id = normalizeId(new URL(request.url).searchParams.get('characterId'));
      if (!/^[a-z0-9_-]{1,100}$/.test(id)) return json({ ok: false, error: 'Неверный characterId' }, 400);
      const url = new URL(urlFromEnv());
      url.searchParams.set('action', 'character-effects-v4');
      url.searchParams.set('characterId', id);
      url.searchParams.set('_', String(Date.now()));
      return json(await googleResponse(await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(55_000) })), 200, { 'cache-control': 'no-store' });
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'Недопустимый метод' }, 405);
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'Неверный JSON' }, 400); }
    const id = normalizeId(body?.characterId);
    if (!/^[a-z0-9_-]{1,100}$/.test(id)) return json({ ok: false, error: 'Неверный characterId' }, 400);
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) return json({ ok: false, error: 'Неверная ревизия' }, 400);
    let profile;
    try { profile = validateEffectsV4(body.profile); } catch (error) { return json({ ok: false, error: error.message }, 400); }
    const secret = String(process.env.CHARACTER_WRITE_SECRET || '');
    if (!secret) throw Error('Не задан CHARACTER_WRITE_SECRET');
    const response = await fetch(urlFromEnv(), {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8', accept: 'application/json' },
      body: JSON.stringify({ action: 'admin-character-effects-v4', characterId: id, expectedRevision: body.expectedRevision, profile, writeSecret: secret }),
      cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(55_000),
    });
    return json(await googleResponse(response), 200, { 'cache-control': 'no-store' });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502);
  }
};
