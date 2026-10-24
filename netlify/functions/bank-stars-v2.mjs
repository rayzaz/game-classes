import {getStore} from '@netlify/blobs';
import {timingSafeEqual} from 'node:crypto';
import {json, readSession} from './_shared/_auth.mjs';
import {getBankManagerPermissions} from './_shared/_bank-permissions.mjs';
import {STARS_STORE, STARS_KEY, validateStarsSnapshot, saveStarsSnapshot, viewStarsSnapshot} from './_bank-stars-v2/snapshot.mjs';

function bankStore() { return getStore({name:STARS_STORE, consistency:'strong'}); }
function hasSyncSecret(request) {
  const expected = Buffer.from(String(process.env.CHARACTER_SYNC_SECRET || '').trim());
  const given = Buffer.from(String(request.headers.get('x-character-sync-secret') || '').trim());
  return expected.length >= 24 && expected.length === given.length && timingSafeEqual(expected, given);
}

export default async function handler(request) {
  if (request.method === 'POST') {
    if (!hasSyncSecret(request)) return json({ok:false,error:'Unauthorized'},401);
    if (Number(request.headers.get('content-length') || '0') > 40_000) return json({ok:false,error:'Payload too large'},413);
    let snapshot;
    try {
      const raw = await request.text();
      if (Buffer.byteLength(raw,'utf8') > 40_000) return json({ok:false,error:'Payload too large'},413);
      snapshot = validateStarsSnapshot(JSON.parse(raw));
    } catch {return json({ok:false,error:'Invalid stars snapshot'},422);}
    try {
      const result = await saveStarsSnapshot(bankStore(), snapshot);
      return json({ok:true,count:snapshot.count,status:result.status});
    } catch (error) {
      console.error('SIRA stars publish failed',error);
      return json({ok:false,error:'Stars storage unavailable'},503);
    }
  }
  if (request.method !== 'GET') return json({ok:false,error:'Method not allowed'},405);
  let session;
  try {session = readSession(request);} catch (error) {
    console.error('Stars session verification error',error);
    return json({ok:false,error:'Authentication unavailable'},503);
  }
  if (!session) return json({ok:false,error:'Authorization required'},401);
  try {
    const rights = await getBankManagerPermissions({login:session.sub,role:session.role});
    const snapshot = await bankStore().get(STARS_KEY,{type:'json',consistency:'strong'});
    return json({ok:true,...viewStarsSnapshot(snapshot,session,rights.canManageBank)});
  } catch (error) {
    console.error('Stars read failed',error);
    return json({ok:false,error:'Stars temporarily unavailable'},503);
  }
}
