import {
  readSession,
} from './_shared/_auth.mjs';
import {
  extractGoogleDriveFileId,
  isAllowedGoogleImageUrl,
} from './_shared/_npc-images.mjs';

const FILE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const NPC_ID_RE = /^npc-r\d+$/i;

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Не задана переменная ${name}`);
  return value;
}

function textResponse(message, status = 400) {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function looksLikeImage(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  return type.startsWith('image/') || type === 'application/octet-stream';
}

async function fetchCandidate(url, redirectDepth = 0) {
  if (!isAllowedGoogleImageUrl(url) || redirectDepth > 5) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0',
      },
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    try { await response.body?.cancel(); } catch {}
    if (!location) return null;

    let next = '';
    try { next = new URL(location, url).toString(); } catch { return null; }
    return fetchCandidate(next, redirectDepth + 1);
  }

  if (!response.ok || !looksLikeImage(response)) {
    try { await response.body?.cancel(); } catch {}
    return null;
  }

  return response;
}

async function resolveNpcCellImage(npcId) {
  const serviceUrl = new URL(requireEnv('CHARACTER_SERVICE_URL'));
  serviceUrl.searchParams.set('action', 'npc-image');
  serviceUrl.searchParams.set('npcId', npcId);
  serviceUrl.searchParams.set('_', String(Date.now()));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);

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
    throw new Error(result?.error || `Сервис портрета вернул ${response.status}`);
  }

  return {
    url: String(result.imageUrl || '').trim(),
    source: String(result.source || '').trim(),
  };
}

export default async function(request) {
  if (request.method !== 'GET') {
    return textResponse('Метод не поддерживается', 405);
  }

  const session = readSession(request);
  if (!session) {
    return textResponse('Сначала войдите в портал', 401);
  }

  const url = new URL(request.url);
  let id = String(url.searchParams.get('id') || '').trim();
  let src = String(url.searchParams.get('src') || '').trim();
  let resolvedSource = '';
  const npcId = String(url.searchParams.get('npcId') || '').trim();

  if (npcId) {
    if (!NPC_ID_RE.test(npcId)) {
      return textResponse('Некорректный идентификатор НПС', 400);
    }

    try {
      const resolved = await resolveNpcCellImage(npcId);
      if (!resolved.url) return textResponse('У НПС нет изображения в Google', 404);

      const resolvedId = extractGoogleDriveFileId(resolved.url);
      if (resolvedId) id = resolvedId;
      else src = resolved.url;
      resolvedSource = resolved.source || 'google';
    } catch (error) {
      console.error('npc-image resolve error:', error);
      return textResponse('Не удалось получить изображение НПС из Google', 502);
    }
  }

  if (!id && !src) {
    return textResponse('Не передан источник портрета', 400);
  }

  if (id && !FILE_ID_RE.test(id)) {
    return textResponse('Некорректный идентификатор портрета', 400);
  }

  if (src && !isAllowedGoogleImageUrl(src)) {
    return textResponse('Недопустимый источник портрета', 400);
  }

  const candidates = src
    ? [src]
    : [
        `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`,
        `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w1600`,
        `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`,
      ];

  try {
    for (const candidate of candidates) {
      const response = await fetchCandidate(candidate);
      if (!response) continue;

      const headers = new Headers();
      headers.set('content-type', response.headers.get('content-type') || 'image/jpeg');
      headers.set(
        'cache-control',
        npcId
          ? 'private, no-cache, max-age=0, must-revalidate'
          : 'private, max-age=900, stale-while-revalidate=3600'
      );
      headers.set('x-content-type-options', 'nosniff');
      if (resolvedSource) headers.set('x-npc-image-source', resolvedSource);

      const length = response.headers.get('content-length');
      if (length) headers.set('content-length', length);

      return new Response(response.body, { status: 200, headers });
    }

    return textResponse('Google не отдал портрет как изображение', 404);
  } catch (error) {
    console.error('npc-image error:', error);
    return textResponse('Не удалось загрузить портрет НПС', 502);
  }
}
