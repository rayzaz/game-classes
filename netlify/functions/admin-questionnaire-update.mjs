import { getStore } from '@netlify/blobs';

import {
  json,
  loadUsers,
  normalizeLogin,
  readSession,
} from './_shared/_auth.mjs';

import { tryWriteAdminLog } from './_shared/_admin-log.mjs';

const STORE_NAME = 'gosmag-questionnaires';

function getQuestionnaireStore() {
  return getStore({
    name: STORE_NAME,
    consistency: 'strong',
  });
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function getAdminName(session) {
  try {
    const users = loadUsers();
    const admin = users.find(
      (user) =>
        normalizeLogin(user?.login) ===
        normalizeLogin(session?.sub),
    );

    return String(
      admin?.displayName ||
      session?.sub ||
      'Администратор',
    );
  } catch {
    return String(
      session?.sub ||
      'Администратор',
    );
  }
}

function questionnaireName(entry) {
  const data = isPlainObject(entry?.data) ? entry.data : {};
  const candidates = [
    data.name,
    data.characterName,
    data.character_name,
    data.fullName,
    data.full_name,
    data.nickname,
    data.nick,
  ];

  for (const candidate of candidates) {
    const clean = String(candidate || '').trim();
    if (clean) return clean.slice(0, 200);
  }

  return `Анкета ${String(entry?.id || '').slice(0, 8)}`;
}

export default async function (request) {
  if (request.method !== 'POST') {
    return json({
      ok: false,
      error: 'Метод не поддерживается',
    }, 405);
  }

  try {
    const session = readSession(request);

    if (!session) {
      return json({
        ok: false,
        error: 'Сначала войдите в систему',
      }, 401);
    }

    if (session.role !== 'admin') {
      return json({
        ok: false,
        error: 'Недостаточно прав',
      }, 403);
    }

    const body = await request.json().catch(() => null);
    const key = String(body?.key || '').trim();
    const data = body?.data;

    if (!/^submissions\/[A-Za-z0-9._-]+$/.test(key)) {
      return json({
        ok: false,
        error: 'Некорректный ключ анкеты',
      }, 400);
    }

    if (!isPlainObject(data)) {
      return json({
        ok: false,
        error: 'В анкете отсутствуют данные',
      }, 400);
    }

    const serialized = JSON.stringify(data);

    if (serialized.length > 1_500_000) {
      return json({
        ok: false,
        error: 'Анкета слишком большая. Уменьшите изображения и попробуйте снова.',
      }, 413);
    }

    const store = getQuestionnaireStore();
    const entry = await store.get(key, {
      type: 'json',
      consistency: 'strong',
    });

    if (!entry) {
      return json({
        ok: false,
        error: 'Анкета не найдена',
      }, 404);
    }

    const updatedAt = new Date().toISOString();
    const updatedEntry = {
      ...entry,
      data,
      updatedAt,
      lastAdminEditAt: updatedAt,
      lastAdminEditBy: String(session.sub || ''),
    };

    await store.setJSON(key, updatedEntry);

    const name = questionnaireName(updatedEntry);

    await tryWriteAdminLog({
      adminLogin: session.sub,
      adminName: getAdminName(session),
      action: 'EDIT_QUESTIONNAIRE',
      targetType: 'questionnaire',
      targetId: String(updatedEntry.id || ''),
      targetName: name,
      details: 'Администратор отредактировал данные анкеты и сохранил их в текущем формате.',
    });

    return json({
      ok: true,
      questionnaire: {
        key,
        id: String(updatedEntry.id || ''),
        createdAt: String(updatedEntry.createdAt || ''),
        updatedAt,
        status: String(updatedEntry.status || 'new'),
        name,
        isTest: Boolean(updatedEntry.isTest || data.isTest),
        testFixtureId: String(updatedEntry.testFixtureId || data.testFixtureId || ''),
        assistant: {
          id: String(updatedEntry.assistant?.id || ''),
          name: String(updatedEntry.assistant?.name || ''),
        },
        applicantFeedback: updatedEntry.applicantFeedback || null,
        data,
      },
    });
  } catch (error) {
    console.error('admin-questionnaire-update error:', error);

    return json({
      ok: false,
      error: `Не удалось сохранить анкету: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }, 500);
  }
}
