import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';

function cleanText(value, maxLength = 5000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeCharacterId(value) {
  return cleanText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function asRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function loadRequiredEnv(name) {
  const value = cleanText(process.env[name]);
  if (!value) throw new Error(`Не задан ${name}`);
  return value;
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${fallbackMessage}: источник вернул некорректный JSON`);
  }

  if (!response.ok || !data?.ok) {
    throw new Error(cleanText(data?.error) || fallbackMessage);
  }

  return data;
}

async function loadCharacterSpells(characterId) {
  const serviceUrl = new URL(loadRequiredEnv('CHARACTER_SERVICE_URL'));
  serviceUrl.searchParams.set('action', 'character-spells');
  serviceUrl.searchParams.set('characterId', characterId);
  serviceUrl.searchParams.set('_', String(Date.now()));

  const response = await fetch(serviceUrl, {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(55_000),
  });

  return readJsonResponse(response, 'Не удалось прочитать заклинания персонажа');
}

async function saveCharacterSpell(characterId, spellIndex, spell) {
  const serviceUrl = loadRequiredEnv('CHARACTER_SERVICE_URL');
  const writeSecret = loadRequiredEnv('CHARACTER_WRITE_SECRET');

  const response = await fetch(serviceUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      action: 'update-character-spell',
      writeSecret,
      characterId,
      spellIndex,
      spell,
    }),
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(55_000),
  });

  return readJsonResponse(response, 'Не удалось сохранить заклинание');
}

export default async function (request) {
  try {
    const session = readSession(request);

    if (!session) {
      return json({ ok: false, error: 'Сначала войдите в систему' }, 401);
    }

    if (session.role !== 'admin') {
      return json({ ok: false, error: 'Недостаточно прав' }, 403);
    }

    if (request.method === 'GET') {
      const url = new URL(request.url);
      const characterId = normalizeCharacterId(url.searchParams.get('characterId'));

      if (!characterId) {
        return json({ ok: false, error: 'Не указан characterId' }, 400);
      }

      const data = await loadCharacterSpells(characterId);
      return json(data, 200, {
        'cache-control': 'no-store, max-age=0',
      });
    }

    if (request.method === 'POST') {
      let body = {};

      try {
        body = asRecord(await request.json());
      } catch {
        return json({ ok: false, error: 'Некорректный JSON' }, 400);
      }

      const characterId = normalizeCharacterId(body.characterId);
      const spellIndex = Math.trunc(Number(body.spellIndex));
      const spell = asRecord(body.spell);

      if (!characterId || !Number.isInteger(spellIndex) || spellIndex < 1) {
        return json({ ok: false, error: 'Не указан персонаж или номер заклинания' }, 400);
      }

      const result = await saveCharacterSpell(characterId, spellIndex, spell);

      try {
        await tryWriteAdminLog({
          adminLogin: session.sub || '',
          adminName: session.name || session.sub || '',
          action: 'CHARACTER_SPELL_UPDATE',
          targetType: 'character',
          targetId: characterId,
          targetName: cleanText(spell.name, 180),
          details: `Исправлено заклинание #${spellIndex}: ${cleanText(spell.name, 180)}.`,
        });
      } catch (error) {
        console.error('admin spell log error:', error);
      }

      return json(result, 200, {
        'cache-control': 'no-store, max-age=0',
      });
    }

    return json({ ok: false, error: 'Метод не поддерживается' }, 405);
  } catch (error) {
    console.error('admin-spells error:', error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
}
