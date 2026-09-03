import { getStore } from '@netlify/blobs';

import {
  json,
  loadUsers,
  normalizeLogin,
  readSession,
} from './_shared/_auth.mjs';

import { tryWriteAdminLog } from './_shared/_admin-log.mjs';


const QUESTIONNAIRE_STORE = 'gosmag-questionnaires';
const REQUEST_TIMEOUT_MS = 55_000;


function cleanText(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength);
}


function asRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}


function getAdminName(session) {
  try {
    const users = loadUsers();
    const admin = users.find(
      (user) => normalizeLogin(user?.login) === normalizeLogin(session?.sub),
    );

    return String(admin?.displayName || session?.sub || 'Администратор');
  } catch {
    return String(session?.sub || 'Администратор');
  }
}


function loadRequiredEnv(name) {
  const value = cleanText(process.env[name]);
  if (!value) throw new Error(`Не задан ${name}`);
  return value;
}


async function postResyncToGoogle(resync) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(loadRequiredEnv('CHARACTER_SERVICE_URL'), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
      body: JSON.stringify({
        action: 'resync-candidate-from-questionnaire',
        writeSecret: loadRequiredEnv('CHARACTER_WRITE_SECRET'),
        resync,
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
      throw new Error(cleanText(data?.error || `Google-сервис завершился с HTTP ${response.status}`, 2000));
    }

    return data;
  } catch (error) {
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      throw new Error(
        'Повторная отправка превысила время ожидания сайта. Операция безопасна для повтора: сначала обновите статус и проверьте Google-таблицу.',
      );
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

    const body = asRecord(await request.json().catch(() => ({})));
    const questionnaireKey = cleanText(body.questionnaireKey, 500);
    const payload = asRecord(body.payload);

    if (!/^submissions\/[A-Za-z0-9._-]+$/.test(questionnaireKey)) {
      return json({ ok: false, error: 'Некорректный ключ анкеты' }, 400);
    }

    if (!Object.keys(payload).length) {
      return json({ ok: false, error: 'Не переданы данные анкеты' }, 400);
    }

    const payloadSource = asRecord(payload.source);
    const payloadQuestionnaireKey = cleanText(payloadSource.questionnaireKey, 500);

    if (payloadQuestionnaireKey && payloadQuestionnaireKey !== questionnaireKey) {
      return json({ ok: false, error: 'Данные относятся к другой анкете' }, 409);
    }

    if (JSON.stringify(payload).length > 1_500_000) {
      return json({ ok: false, error: 'Анкета слишком большая для повторной отправки' }, 413);
    }

    const store = getStore({
      name: QUESTIONNAIRE_STORE,
      consistency: 'strong',
    });

    const questionnaire = await store.get(questionnaireKey, {
      type: 'json',
      consistency: 'strong',
    });

    if (!questionnaire) {
      return json({ ok: false, error: 'Анкета не найдена' }, 404);
    }

    if (cleanText(questionnaire.status) !== 'approved') {
      return json({
        ok: false,
        error: 'Перед повторной отправкой анкета должна иметь статус «Одобрена».',
      }, 409);
    }

    const creation = asRecord(questionnaire.characterCreation);

    if (!cleanText(creation.characterId) || !cleanText(creation.spreadsheetId)) {
      return json({
        ok: false,
        error: 'У анкеты нет сохранённого Google-персонажа. Используйте обычное первичное создание.',
      }, 409);
    }

    const result = await postResyncToGoogle({
      creation: {
        characterId: cleanText(creation.characterId, 120),
        spreadsheetId: cleanText(creation.spreadsheetId, 220),
        mainRows: asRecord(creation.mainRows),
        systemRows: asRecord(creation.systemRows),
        registryRow: Number(creation.registryRow) || null,
      },
      payload,
    });

    const syncedAt = cleanText(result.syncedAt) || new Date().toISOString();

    const updatedQuestionnaire = {
      ...questionnaire,
      characterCreation: {
        ...creation,
        lastSyncedAt: syncedAt,
        lastSyncStatus: 'success',
        mainRows: result.mainRows || creation.mainRows || null,
        registryRow: result.registryRow || creation.registryRow || null,
      },
      updatedAt: new Date().toISOString(),
    };

    await store.setJSON(questionnaireKey, updatedQuestionnaire);

    await tryWriteAdminLog({
      adminLogin: session.sub,
      adminName: getAdminName(session),
      action: 'RESYNC_CANDIDATE_FROM_QUESTIONNAIRE',
      targetType: 'character',
      targetId: cleanText(creation.characterId),
      targetName: cleanText(payload?.character?.name),
      details: `Анкета ${cleanText(questionnaire.id)} повторно синхронизирована с существующим Google-персонажем. Заклинаний: ${Number(result.spellsUpdated) || 0}.`,
    });

    return json({
      ok: true,
      ...result,
      questionnaireUpdated: true,
    });
  } catch (error) {
    console.error('admin-google-resync:', error);

    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
}
