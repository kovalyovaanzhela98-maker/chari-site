import crypto from 'node:crypto';
import {redis,hasStore,readJson,clip} from './_lib.js';
const TTL=7*86400;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const configured=()=>hasStore()&&/^https:\/\//.test(process.env.SUPABASE_URL||'')&&Boolean(process.env.SUPABASE_ANON_KEY);
const cookieKey=req=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('chari_session='))?.slice(14)||'';
export async function accountSession(req){
 const token=cookieKey(req);if(!hasStore()||!/^[a-f0-9]{64}$/.test(token))return null;
 const [value]=await redis(['GET','account:session:'+hash(token)]);
 if(!value)return null;try{return JSON.parse(value);}catch{return null;}
}
function sameOrigin(req){
 try {const origin=new URL(req.headers.origin);return origin.host===req.headers.host&&['https:','http:'].includes(origin.protocol);}catch{return false;}
}
async function auth(path,body){
 const response=await fetch(process.env.SUPABASE_URL.replace(/\/$/,'')+'/auth/v1/'+path,{
  method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(10000)
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const e=new Error('auth_failed');e.status=response.status;throw e;}
 return data;
}
async function limit(req,email,action){
 const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
 const window=Math.floor(Date.now()/3600000),prefix='account:limit:'+action+':'+window+':';
 const [ipHits,emailHits]=await redis(['INCR',prefix+hash(ip)],['INCR',prefix+hash(email)],
 ['EXPIRE',prefix+hash(ip),3700],['EXPIRE',prefix+hash(email),3700]);
 return ipHits<=(action==='send'?15:40)&&emailHits<=(action==='send'?5:12);
}
function setCookie(req,res,value,age){
 const secure=process.env.VERCEL||req.headers['x-forwarded-proto']==='https';
 res.setHeader('Set-Cookie','chari_session='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(secure?'; Secure':''));
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Метод не поддерживается'});}
 if(req.method==='POST'&&!sameOrigin(req))return res.status(403).json({error:'Открой кабинет на сайте чари'});
 try{
  if(req.method==='GET'){
   if(!configured())return res.status(200).json({configured:false,user:null});
   const user=await accountSession(req);if(!user)return res.status(200).json({configured:true,user:null});
   const [raw,profileRaw]=await redis(['HVALS','leads'],['GET','account:profile:'+hash(user.email)]);
   const leads=(raw||[]).flatMap(value=>{try{const x=JSON.parse(value);
    if(String(x.email||'').toLowerCase()!==user.email)return [];
    return [{no:x.no,created:x.created,status:x.status,city:x.city,country:x.country||'Беларусь',delivery:x.delivery,
      items:(x.items||[]).map(i=>({n:i.n,p:i.p})),comment:x.comment||''}];
   }catch{return []}}).sort((a,b)=>String(b.created).localeCompare(String(a.created))).slice(0,50);
   let profile={};try{profile=JSON.parse(profileRaw||'{}')}catch{}
   return res.status(200).json({configured:true,user:{email:user.email},profile,leads});
  }
  const body=await readJson(req),action=body.action;
  if(action==='logout'){
   const token=cookieKey(req);if(hasStore()&&/^[a-f0-9]{64}$/.test(token))await redis(['DEL','account:session:'+hash(token)]);
   setCookie(req,res,'',0);return res.status(200).json({ok:true});
  }
  if(!configured())return res.status(503).json({error:'Вход по почте ещё подключается. Заявку можно оставить без кабинета.'});
  if(action==='profile'){
   const user=await accountSession(req);if(!user)return res.status(401).json({error:'Войди в кабинет ещё раз'});
   const profile={city:clip(body.city,60),country:clip(body.country,60)};
   await redis(['SET','account:profile:'+hash(user.email),JSON.stringify(profile)]);
   return res.status(200).json({ok:true,profile});
  }
  if(!['send','verify'].includes(action))return res.status(400).json({error:'Неизвестное действие'});
  const email=clip(body.email,80).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return res.status(400).json({error:'Проверь email'});
  if(!await limit(req,email,action))return res.status(429).json({error:'Слишком много попыток. Попробуй через час.'});
  if(action==='send'){
   const [lock]=await redis(['SET','account:cooldown:'+hash(email),'1','EX',60,'NX']);
   if(!lock)return res.status(429).json({error:'Новый код можно запросить через минуту.'});
   await auth('otp',{email,create_user:true});
   return res.status(200).json({ok:true});
  }
  const code=clip(body.code,10);if(!/^[0-9]{6,10}$/.test(code))return res.status(400).json({error:'Введи код из письма'});
  const verified=await auth('verify',{email,token:code,type:'email'});
  if(!verified.user?.email_confirmed_at||String(verified.user.email).toLowerCase()!==email)return res.status(401).json({error:'Не получилось подтвердить почту'});
  // Store only a verified identity; provider access/refresh tokens never reach the browser.
  const token=crypto.randomBytes(32).toString('hex');
  const old=cookieKey(req);
  if(/^[a-f0-9]{64}$/.test(old))await redis(['DEL','account:session:'+hash(old)]);
  await redis(['SET','account:session:'+hash(token),JSON.stringify({email,id:verified.user.id}),'EX',TTL]);
  setCookie(req,res,token,TTL);
  return res.status(200).json({ok:true});
 }catch(error){
  console.error('account_failure',error.status||'unavailable');
  return res.status(error.status===429?429:error.status&&error.status<500?400:503).json({
   error:error.status===429?'Слишком много попыток. Попробуй позже.':error.status&&error.status<500?'Код недействителен или истёк. Проверь письмо или запроси новый код.':'Сервис входа временно недоступен. Попробуй позже.'
  });
 }
}
