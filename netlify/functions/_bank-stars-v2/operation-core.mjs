import {createHmac} from 'node:crypto';

const CID=/^[a-z0-9][a-z0-9_-]{0,99}$/;
const REQUEST_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_STARS=1_000_000_000_000;
export function validateStarCommand(body){
  const characterId=String(body?.characterId ?? '').trim();
  const action=body?.action;
  const amount=body?.amount;
  const requestId=String(body?.requestId??'').trim();
  const reason=String(body?.reason??'').trim();
  const postUrl=String(body?.postUrl??'').trim();
  if(!CID.test(characterId) || !['credit','debit'].includes(action) ||
     !Number.isSafeInteger(amount) || amount<1 || amount>1_000_000 ||
     !REQUEST_ID.test(requestId) || reason.length>180 || postUrl.length>350 ||
     (!reason && !postUrl) || /[\r\n\u0000-\u001f]/.test(reason+postUrl)) {
    throw new Error('Неверные параметры операции');
  }
  if(reason.length + (postUrl ? postUrl.length + 9 : 0) > 500) throw new Error('Основание слишком длинное');
  if(postUrl){
    let parsed;
    try {parsed=new URL(postUrl);}catch {throw new Error('Некорректная ссылка на пост');}
    if(parsed.protocol!=='https:' || !parsed.hostname.includes('.') || parsed.username || parsed.password ||
       /(?:^|\.)localhost$/i.test(parsed.hostname)) throw new Error('Нужна публичная HTTPS-ссылка на пост');
  }
  return {characterId,action,amount,reason,postUrl,requestId};
}
export function buildSignedEnvelope(command, bankerLogin, secret, now=Date.now()){
  if(typeof secret!=='string' || secret.length<32) throw new Error('B3 secret missing');
  const payload={...command,bankerLogin:String(bankerLogin||''),issuedAt:new Date(now).toISOString()};
  if(!payload.bankerLogin || payload.bankerLogin.length>120) throw new Error('Invalid banker identity');
  const signature=createHmac('sha256',secret).update(JSON.stringify(payload),'utf8').digest('hex');
  return {payload,signature};
}
export function parseGoogleResult(raw){
  if(!raw || raw.ok!==true || !['applied','duplicate'].includes(raw.status) ||
     !Number.isSafeInteger(raw.balanceAfter) || raw.balanceAfter<0 || raw.balanceAfter>MAX_STARS ||
     typeof raw.transactionId!=='string') throw new Error('Google did not confirm transaction');
  return {status:raw.status,balanceAfter:raw.balanceAfter,transactionId:raw.transactionId};
}
