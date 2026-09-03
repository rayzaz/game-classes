import {
  json,
  readSession,
} from './_shared/_auth.mjs';

const REQUEST_TIMEOUT_MS = 55_000;

function cleanText(value, maxLength = 2000) {
  return String(value ?? '').trim().slice(0, maxLength);
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

async function postRepairToGoogle(repair) {
  const serviceUrl = loadRequiredEnv('CHARACTER_SERVICE_URL');
  const writeSecret = loadRequiredEnv('CHARACTER_WRITE_SECRET');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
      body: JSON.stringify({
        action: 'repair-candidate-presentation',
        writeSecret,
        repair,
      }),
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Google-сервис вернул не JSON: ${text.slice(0, 350) || 'пустой ответ'}`);
    }

    if (!response.ok || data?.ok !== true) {
      throw new Error(cleanText(data?.error || `Google-сервис завершился с HTTP ${response.status}`));
    }

    return data;
  } catch (error) {
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      throw new Error('Ремонт оформления Google превысил время ожидания. Проверьте таблицу перед повторным запуском.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export default async function(request) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Метод не поддерживается' }, 405);
  }

  try {
    const session = readSession(request);
    if (!session) return json({ ok: false, error: 'Сначала войдите в систему' }, 401);
    if (session.role !== 'admin') return json({ ok: false, error: 'Недостаточно прав' }, 403);

    const body = asRecord(await request.json());
    const creation = asRecord(body.creation);
    const presentation = asRecord(body.presentation);
    const character = asRecord(presentation.character);
    const magic = asRecord(presentation.magic);

    if (!cleanText(creation.characterId) || !cleanText(creation.spreadsheetId)) {
      return json({ ok: false, error: 'Не переданы данные уже созданного кандидата' }, 400);
    }

    const result = await postRepairToGoogle({
      creation: {
        characterId: cleanText(creation.characterId, 120),
        spreadsheetId: cleanText(creation.spreadsheetId, 220),
        mainRows: asRecord(creation.mainRows),
      },
      presentation: {
        character: {
          name: cleanText(character.name, 240),
          playerLink: cleanText(character.playerLink, 1200),
        },
        magic: {
          name: cleanText(magic.name, 300),
          elementKeys: Array.isArray(magic.elementKeys)
            ? magic.elementKeys.map((item) => cleanText(item, 60)).filter(Boolean).slice(0, 20)
            : [],
        },
      },
    });

    return json(result);
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
}
