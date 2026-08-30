import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import { proxifyNpcImagesDeep } from './_shared/_npc-images.mjs';

function loadCharacterServiceUrl() {
  const raw = String(process.env.CHARACTER_SERVICE_URL || '').trim();
  if (!raw) throw new Error('Не задан CHARACTER_SERVICE_URL');
  return raw;
}

export default async (request) => {
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Метод не поддерживается' }, 405);
  }

  try {
    const session = readSession(request);
    if (!session) {
      return json({ ok: false, error: 'Сначала войдите в личный кабинет' }, 401);
    }

    const requestUrl = new URL(request.url);
    const requestedCharacterId = String(
      requestUrl.searchParams.get('characterId') || ''
    ).trim().toLowerCase();

    const characterId = session.role === 'admin' && requestedCharacterId
      ? requestedCharacterId
      : String(session.cid || '').trim().toLowerCase();

    if (!characterId) {
      return json({ ok: false, error: 'К аккаунту не привязан персонаж' }, 404);
    }

    const serviceUrl = new URL(loadCharacterServiceUrl());
    serviceUrl.searchParams.set('action', 'character-family-tree');
    serviceUrl.searchParams.set('characterId', characterId);
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
      throw new Error(result?.error || `Сервис семейного древа вернул ${response.status}`);
    }

    return json(proxifyNpcImagesDeep(result));
  } catch (error) {
    console.error('character-family-tree error:', error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : 'Не удалось загрузить семейное древо',
    }, 500);
  }
};
