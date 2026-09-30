/* SIRA NPC isolated module v2 */
import {
  json,
  readSession,
} from '../_shared/_auth.mjs';

import {
  tryWriteAdminLog,
} from '../_shared/_admin-log.mjs';

import { proxifyNpcImagesDeep } from '../_shared/_npc-images.mjs';

import {
  callNpcWriteService,
  npcErrorStatus,
} from './character-service.mjs';

function requireAdmin(request) {
  const session = readSession(request);
  if (!session || session.role !== 'admin') {
    return { error: json({ ok: false, error: 'Требуются права администратора' }, 403) };
  }
  return { session };
}


function proxifyAdminNpcResult(result) {
  const payload = proxifyNpcImagesDeep(result || {});

  try {
    console.info('[npc-admin] payload ready', {
      npcs: Array.isArray(payload?.npcs) ? payload.npcs.length : 0,
      relations: Array.isArray(payload?.relations) ? payload.relations.length : 0,
      bytes: Buffer.byteLength(JSON.stringify(payload), 'utf8'),
    });
  } catch {}

  return payload;
}


export default async function(request) {
  try {
    const auth = requireAdmin(request);
    if (auth.error) return auth.error;

    if (request.method === 'GET') {
      const result = await callNpcWriteService({ action: 'npc-admin-list' }, { timeoutMs: 22000 });
      return json(proxifyAdminNpcResult(result));
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

      const result = await callNpcWriteService({
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
      const result = await callNpcWriteService({
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

      const result = await callNpcWriteService({
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
      const result = await callNpcWriteService({
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
      const result = await callNpcWriteService({
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
      const result = await callNpcWriteService({
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
    }, npcErrorStatus(error, 500));
  }
}
