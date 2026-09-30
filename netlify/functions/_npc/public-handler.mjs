/* SIRA NPC isolated module v2 */
import {
  json,
  readSession,
} from '../_shared/_auth.mjs';

import { proxifyNpcImagesDeep } from '../_shared/_npc-images.mjs';

import {
  callNpcReadService,
  npcErrorStatus,
} from './character-service.mjs';


export default async function(request) {
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Метод не поддерживается' }, 405);
  }

  const session = readSession(request);
  if (!session) {
    return json({ ok: false, error: 'Сначала войдите в портал' }, 401);
  }

  try {
    const result = await callNpcReadService(
      'npcs',
      {},
      { timeoutMs: 22000 }
    );

    return json({
      ...result,
      npcs: Array.isArray(result?.npcs)
        ? result.npcs.map(proxifyNpcImagesDeep)
        : [],
    });
  } catch (error) {
    console.error('npcs error:', error);

    return json({
      ok: false,
      error: error instanceof Error
        ? error.message
        : 'Не удалось загрузить НПС',
    }, npcErrorStatus(error, 500));
  }
}
