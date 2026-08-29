import {
  json,
  readSession,
} from './_shared/_auth.mjs';

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

    const response = await fetch(serviceUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'follow',
    });

    const text = await response.text();
    let result = null;
    try { result = JSON.parse(text); } catch { result = null; }

    if (!response.ok || !result || result.ok !== true) {
      throw new Error(result?.error || `Сервис НПС вернул ${response.status}`);
    }

    return json(result);
  } catch (error) {
    console.error('npcs error:', error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : 'Не удалось загрузить НПС',
    }, 500);
  }
}
