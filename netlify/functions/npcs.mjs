import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import { proxifyNpcImagesDeep } from './_shared/_npc-images.mjs';

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Не задана переменная ${name}`);
  return value;
}

export default async function(request) {
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Метод не поддерживается' }, 405);
  }

  const session = readSession(request);
  if (!session) {
    return json({ ok: false, error: 'Сначала войдите в портал' }, 401);
  }

  try {
    const serviceUrl = new URL(requireEnv('CHARACTER_SERVICE_URL'));
    serviceUrl.searchParams.set('action', 'npcs');
    serviceUrl.searchParams.set('_', String(Date.now()));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);

    let response;
    try {
      response = await fetch(serviceUrl, {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let result = null;
    try { result = JSON.parse(text); } catch { result = null; }

    if (!response.ok || !result || result.ok !== true) {
      throw new Error(result?.error || `Сервис НПС вернул ${response.status}`);
    }

    return json(proxifyNpcImagesDeep(result));
  } catch (error) {
    console.error('npcs error:', error);

    const aborted =
      error instanceof Error &&
      (error.name === 'AbortError' || /abort/i.test(error.message));

    return json({
      ok: false,
      error: aborted
        ? 'Google Sheets слишком долго формировал каталог НПС. Каталог не должен зависеть от загрузки портретов; проверьте Code-npcs-v40.4.gs.'
        : error instanceof Error
          ? error.message
          : 'Не удалось загрузить НПС',
    }, aborted ? 504 : 500);
  }
}
