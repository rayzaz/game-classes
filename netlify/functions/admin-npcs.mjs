import {
  json,
  readSession,
} from './_shared/_auth.mjs';

import {
  tryWriteAdminLog,
} from './_shared/_admin-log.mjs';

import { proxifyNpcImagesDeep } from './_shared/_npc-images.mjs';

function requireAdmin(request) {
  const session = readSession(request);
  if (!session || session.role !== 'admin') {
    return { error: json({ ok: false, error: 'Требуются права администратора' }, 403) };
  }
  return { session };
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Не задана переменная ${name}`);
  return value;
}

async function callCharacterService(payload) {
  const response = await fetch(requireEnv('CHARACTER_SERVICE_URL'), {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      ...payload,
      writeSecret: requireEnv('CHARACTER_WRITE_SECRET'),
    }),
    redirect: 'follow',
  });

  const text = await response.text();
  let result = null;
  try { result = JSON.parse(text); } catch { result = null; }

  if (!response.ok || !result || result.ok !== true) {
    throw new Error(result?.error || `Сервис НПС вернул ${response.status}`);
  }

  return result;
}

export default async function(request) {
  try {
    const auth = requireAdmin(request);
    if (auth.error) return auth.error;

    if (request.method === 'GET') {
      const result = await callCharacterService({ action: 'npc-admin-list' });
      return json(proxifyNpcImagesDeep(result));
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Метод не поддерживается' }, 405);
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim().toLowerCase();

    if (action === 'create') {
      const rawNpc = body?.npc && typeof body.npc === 'object' ? body.npc : {};
      const imageBase64 = String(rawNpc?.imageBase64 || '').replace(/\s+/g, '');
      const imageMime = String(rawNpc?.imageMime || '').trim().toLowerCase();
      const allowedImageMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);

      if (imageBase64.length > 4_500_000) {
        throw new Error('Подготовленный портрет слишком большой для отправки. Выберите изображение меньшего размера.');
      }

      if (imageBase64 && !allowedImageMimes.has(imageMime)) {
        throw new Error('Портрет должен быть JPG, PNG или WebP.');
      }

      const npc = {
        ...rawNpc,
        imageBase64,
        imageMime: imageBase64 ? imageMime : '',
        imageName: String(rawNpc?.imageName || '').trim().slice(0, 180),
      };

      const result = await callCharacterService({
        action: 'npc-create',
        npc,
        relations: Array.isArray(body?.relations) ? body.relations : [],
      });

      await tryWriteAdminLog({
        adminLogin: auth.session.sub || '',
        adminName: auth.session.name || auth.session.sub || '',
        action: 'NPC_CREATE',
        targetType: 'npc',
        targetId: result.npc?.id || '',
        targetName: result.npc?.name || String(body?.npc?.name || 'НПС'),
        details: `Создан НПС. Начальных связей: ${Array.isArray(result.relations) ? result.relations.length : 0}.`,
      });

      return json(proxifyNpcImagesDeep(result));
    }

    if (action === 'update') {
      const result = await callCharacterService({
        action: 'npc-update',
        npc: body?.npc || {},
      });

      await tryWriteAdminLog({
        adminLogin: auth.session.sub || '',
        adminName: auth.session.name || auth.session.sub || '',
        action: 'NPC_UPDATE',
        targetType: 'npc',
        targetId: result.npc?.id || String(body?.npc?.id || ''),
        targetName: result.npc?.name || String(body?.npc?.name || 'НПС'),
        details: `Обновлены данные НПС. Заполненность: ${result.npc?.completionPercent ?? 0}%.`,
      });

      return json(proxifyNpcImagesDeep(result));
    }

    if (action === 'bulk-import') {
      const sourceRecords = Array.isArray(body?.records) ? body.records.slice(0, 1) : [];

      // v29: строго одна карточка с портретом за синхронный запрос.
      // Это держит Sheets/Drive-операции ниже 30-секундного лимита функции.
      const records = sourceRecords.map(record => ({
        ...(record && typeof record === 'object' ? record : {}),
        imageBase64: String(record?.imageBase64 || '').replace(/\s+/g, ''),
        imageMime: String(record?.imageMime || 'image/jpeg').trim() || 'image/jpeg',
      }));

      const result = await callCharacterService({
        action: 'npc-bulk-import',
        records,
      });

      await tryWriteAdminLog({
        adminLogin: auth.session.sub || '',
        adminName: auth.session.name || auth.session.sub || '',
        action: 'NPC_BULK_IMPORT',
        targetType: 'npc',
        targetId: 'legacy-import',
        targetName: 'Массовый импорт НПС',
        details: `Создано: ${result.createdCount ?? 0}. Пропущено: ${result.skippedCount ?? 0}.`,
      });

      return json(result);
    }

    if (action === 'relation-save') {
      const result = await callCharacterService({
        action: 'npc-relation-save',
        relation: body?.relation || {},
      });

      await tryWriteAdminLog({
        adminLogin: auth.session.sub || '',
        adminName: auth.session.name || auth.session.sub || '',
        action: 'NPC_RELATION_SAVE',
        targetType: 'npc-relation',
        targetId: result.relation?.id || '',
        targetName: result.relation?.sourceName || 'Связь НПС',
        details: `${result.relation?.typeLabel || 'Связь'} → ${result.relation?.targetName || ''}`,
      });

      return json(result);
    }

    if (action === 'relation-materialize') {
      const relations = Array.isArray(body?.relations) ? body.relations.slice(0, 100) : [];
      const result = await callCharacterService({
        action: 'npc-relation-materialize',
        relations,
      });

      await tryWriteAdminLog({
        adminLogin: auth.session.sub || '',
        adminName: auth.session.name || auth.session.sub || '',
        action: 'NPC_RELATION_MATERIALIZE',
        targetType: 'npc-relation',
        targetId: 'kinship-auto',
        targetName: 'Автоматизация родословной',
        details: `Записано новых: ${result.createdCount ?? 0}. Обновлено: ${result.updatedCount ?? 0}. Пропущено: ${result.skippedCount ?? 0}.`,
      });

      return json(result);
    }

    if (action === 'relation-delete') {
      const result = await callCharacterService({
        action: 'npc-relation-delete',
        relationId: body?.relationId,
      });

      await tryWriteAdminLog({
        adminLogin: auth.session.sub || '',
        adminName: auth.session.name || auth.session.sub || '',
        action: 'NPC_RELATION_DELETE',
        targetType: 'npc-relation',
        targetId: String(body?.relationId || ''),
        targetName: 'Связь НПС',
        details: 'Связь удалена.',
      });

      return json(result);
    }

    return json({ ok: false, error: 'Неизвестное действие' }, 400);
  } catch (error) {
    console.error('admin-npcs error:', error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : 'Не удалось обработать НПС',
    }, 500);
  }
}
