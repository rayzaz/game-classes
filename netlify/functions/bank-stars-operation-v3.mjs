import {json,readSession} from './_shared/_auth.mjs';
import {getBankManagerPermissions} from './_shared/_bank-permissions.mjs';
import {validateStarCommand,buildSignedEnvelope,parseGoogleResult} from './_bank-stars-v2/operation-core.mjs';
const MAX_BYTES=4096;
const allowedURL=url=>{try {const u=new URL(url);return u.protocol==='https:' && u.hostname==='script.google.com' && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname);}catch{return false;}};
export default async function handler(request){
  if(request.method!=='POST') return json({ok:false,error:'Method not allowed'},405);
  let session;
  try {session=readSession(request);}catch{return json({ok:false,error:'Authentication unavailable'},503);}
  if(!session) return json({ok:false,error:'Authorization required'},401);
  // No caller-selected banker; signed identity comes from the authenticated portal session.
  const permissions=await getBankManagerPermissions({login:session.sub,role:session.role});
  if(!permissions.canManageBank) return json({ok:false,error:'Требуются права банкира'},403);
  let command;
  try {
    const raw=await request.text();
    if(Buffer.byteLength(raw,'utf8')>MAX_BYTES) return json({ok:false,error:'Payload too large'},413);
    command=validateStarCommand(JSON.parse(raw));
  } catch(error) {return json({ok:false,error:error.message || 'Invalid transaction'},422);}
  const endpoint=String(process.env.SIRA_STARS_B3_WEBAPP_URL||'').trim();
  const secret=String(process.env.SIRA_STARS_B3_SECRET||'').trim();
  if(!allowedURL(endpoint)||secret.length<32) return json({ok:false,error:'Банковские операции ещё не подключены'},503);
  try {
    const envelope=buildSignedEnvelope(command,session.sub,secret);
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(envelope),redirect:'follow',signal:AbortSignal.timeout(23000)});
    if(!response.ok) throw new Error(`Google HTTP ${response.status}`);
    const raw=await response.text();
    const data=JSON.parse(raw);
    if(!data.ok) return json({ok:false,error:String(data.error||'Операция не подтверждена').slice(0,150)},409);
    return json({ok:true,...parseGoogleResult(data),characterId:command.characterId});
  }catch(error){
    console.error('STARS B3 transaction unconfirmed',error);
    return json({ok:false,error:'Результат Google не подтверждён. Не повторяйте начисление новым запросом; проверьте историю.'},503);
  }
}
