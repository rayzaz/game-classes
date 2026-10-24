/**
 * Legacy stars bank API is intentionally disabled during Google Stars B2.
 * Do not import the legacy Netlify star bank or its September seed balances.
 * Juli uses a different system and is not handled by this endpoint.
 */
import {json, readSession} from './_shared/_auth.mjs';

export default async function handler(request) {
  try {
    const session = readSession(request);
    if (!session) return json({ok:false,error:'Требуется авторизация'},401);
    if (request.method === 'GET') {
      return json({ok:false,error:'Старый банк звёзд заменён новым Google-банком.'},410);
    }
    if (request.method === 'POST') {
      return json({ok:false,error:'Старый банк закрыт для операций. Новый банк звёзд подключается к Google.'},410);
    }
    return json({ok:false,error:'Метод не поддерживается'},405);
  } catch (error) {
    console.error('Legacy stars bank guard failed', error);
    return json({ok:false,error:'Сервис временно недоступен'},503);
  }
}
