import { getStore } from '@netlify/blobs';
import { createHash, randomBytes } from 'node:crypto';

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

function hashEditToken(token) {
  return createHash('sha256')
    .update(String(token || ''))
    .digest('hex');
}

function getAdminName(session) {
  try {
    const users = loadUsers();
    const admin = users.find(
      (user) =>
        normalizeLogin(user?.login) ===
        normalizeLogin(session?.sub),
    );
    return String(admin?.displayName || session?.sub || 'Администратор');
  } catch {
    return String(session?.sub || 'Администратор');
  }
}

function getQuestionnaireName(entry) {
  const data = entry?.data && typeof entry.data === 'object' && !Array.isArray(entry.data)
    ? entry.data
    : {};
  const candidates = [
    data.name,
    data.characterName,
    data.character_name,
    data.fullName,
    data.full_name,
  ];
  for (const value of candidates) {
    const clean = String(value || '').trim();
    if (clean) return clean.slice(0, 200);
  }
  return `Анкета ${String(entry?.id || '').slice(0, 8)}`;
}

function encodeAccessCode(key, editToken) {
  return Buffer.from(
    JSON.stringify({ key, editToken }),
    'utf8',
  ).toString('base64url');
}

export default async function (request) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Метод не поддерживается' }, 405);
  }

  try {
    const session = readSession(request);
    if (!session) {
      return json({ ok: false, error: 'Сначала войдите в систему' }, 401);
    }
    if (session.role !== 'admin') {
      return json({ ok: false, error: 'Недостаточно прав' }, 403);
    }

    const body = await request.json().catch(() => null);
    const key = String(body?.key || '').trim();

    if (!/^submissions\/[A-Za-z0-9._-]+$/.test(key)) {
      return json({ ok: false, error: 'Некорректный ключ анкеты' }, 400);
    }

    const store = getQuestionnaireStore();
    const entry = await store.get(key, {
      type: 'json',
      consistency: 'strong',
    });

    if (!entry) {
      return json({ ok: false, error: 'Анкета не найдена' }, 404);
    }

    const editToken = randomBytes(32).toString('hex');
    const updatedAt = new Date().toISOString();
    const updatedEntry = {
      ...entry,
      editTokenHash: hashEditToken(editToken),
      updatedAt,
      accessResetAt: updatedAt,
      accessResetBy: String(session.sub || ''),
    };

    await store.setJSON(key, updatedEntry);

    const name = getQuestionnaireName(updatedEntry);
    await tryWriteAdminLog({
      adminLogin: session.sub,
      adminName: getAdminName(session),
      action: 'EDIT_QUESTIONNAIRE',
      targetType: 'questionnaire',
      targetId: String(updatedEntry.id || ''),
      targetName: name,
      details: 'Для игрока перевыпущен код доступа к статусу и доработке анкеты.',
    });

    return json({
      ok: true,
      access: {
        key,
        accessCode: encodeAccessCode(key, editToken),
        updatedAt,
      },
    });
  } catch (error) {
    console.error('admin-questionnaire-access error:', error);
    return json({
      ok: false,
      error: 'Не удалось перевыпустить доступ к анкете',
    }, 500);
  }
}
