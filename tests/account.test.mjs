import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.KV_REST_API_URL='https://redis.test';
process.env.KV_REST_API_TOKEN='test-only';
process.env.SUPABASE_URL='https://auth.test';
process.env.SUPABASE_ANON_KEY='test-only';
process.env.VERCEL='1';
const memory=new Map(),expiries=new Map();let mailCount=0;
globalThis.fetch=async(url,options)=>{
 if(url==='https://redis.test/pipeline'){
  const result=JSON.parse(options.body).map(([op,key,...args])=>{
   if(expiries.get(key)<Date.now()){memory.delete(key);expiries.delete(key);}
   if(op==='GET')return {result:memory.get(key)||null};
   if(op==='SET'){
    if(args.includes('NX')&&memory.has(key))return {result:null};
    memory.set(key,args[0]);const ex=args.indexOf('EX');if(ex>=0)expiries.set(key,Date.now()+Number(args[ex+1])*1000);return {result:'OK'};
   }
   if(op==='INCR'){const n=Number(memory.get(key)||0)+1;memory.set(key,n);return {result:n};}
   if(op==='EXPIRE'){expiries.set(key,Date.now()+Number(args[0])*1000);return {result:1};}
   if(op==='DEL'){memory.delete(key);return {result:1};}
   if(op==='HVALS')return {result:memory.get(key)||[]};
   throw Error('Unexpected Redis command '+op);
  });return new Response(JSON.stringify(result),{status:200});
 }
 const body=JSON.parse(options.body);
 if(url==='https://auth.test/auth/v1/otp'){mailCount++;return new Response('{}',{status:200})}
 if(url==='https://auth.test/auth/v1/verify'){
  if(body.token!=='123456')return new Response('{}',{status:403});
  return new Response(JSON.stringify({access_token:'never-exposed',user:{id:'user-1',email:body.email,email_confirmed_at:new Date().toISOString()}}));
 }
 throw Error('Unexpected external request');
};
const {default:handler}=await import('../api/account.js');
const {default:context}=await import('../api/context.js');
function request(method,body,headers={}){
 return {method,body,headers:{host:'chari.by',origin:'https://chari.by','x-forwarded-for':'192.0.2.1',...headers}};
}
async function call(req,fn=handler){
 const result={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(value){this.body=value;return this}};
 await fn(req,result);return result;
}
test('email login, private history, profile, CSRF protection and logout',async()=>{
 memory.set('leads',[
  JSON.stringify({no:1,email:'anya@example.com',created:'2026-11-17',city:'Минск',status:'new',items:[{n:'Конверт',p:35}],note:'internal-admin-note'}),
  JSON.stringify({no:2,email:'other@example.com',created:'2026-11-17',city:'Брест',items:[]})
 ]);
 assert.equal((await call(request('GET'))).body.user,null);
 assert.equal((await call(request('POST',{action:'profile',city:'Минск'}))).statusCode,401);
 assert.equal((await call(request('POST',{action:'send',email:'anya@example.com'},{origin:'https://attacker.test'}))).statusCode,403);
 assert.equal(mailCount,0);
 assert.equal((await call(request('POST',{action:'send',email:'anya@example.com'}))).statusCode,200);
 assert.equal(mailCount,1);
 assert.equal((await call(request('POST',{action:'send',email:'anya@example.com'}))).statusCode,429);
 assert.equal((await call(request('POST',{action:'verify',email:'anya@example.com',code:'000000'}))).statusCode,400);
 const login=await call(request('POST',{action:'verify',email:'anya@example.com',code:'123456'}));
 assert.equal(login.statusCode,200);
 assert.match(login.headers['Set-Cookie'],/HttpOnly; SameSite=Lax; Max-Age=604800; Secure/);
 assert.equal(JSON.stringify(login.body).includes('never-exposed'),false);
 const cookie=login.headers['Set-Cookie'].split(';')[0];
 const account=await call(request('GET',null,{cookie}));
 assert.equal(account.body.user.email,'anya@example.com');
 assert.equal(account.body.leads.length,1);
 assert.equal(account.body.leads[0].no,1);
 assert.equal(JSON.stringify(account.body).includes('internal-admin-note'),false);
 assert.equal((await call(request('GET',null,{cookie:'chari_session='+'f'.repeat(64)}))).body.user,null);
 assert.equal((await call(request('POST',{action:'profile',city:'Гродно',country:'Беларусь'},{cookie}))).statusCode,200);
 assert.equal((await call(request('GET',null,{cookie}))).body.profile.city,'Гродно');
 assert.equal((await call(request('POST',{action:'logout'},{cookie}))).statusCode,200);
 assert.equal((await call(request('GET',null,{cookie}))).body.user,null);
});
test('rate limits bound code guessing per email',async()=>{
 for(let i=0;i<12;i++)await call(request('POST',{action:'verify',email:'rate@example.com',code:'000000'}));
 assert.equal((await call(request('POST',{action:'verify',email:'rate@example.com',code:'123456'}))).statusCode,429);
});
test('approximate geolocation is decoded and not cached publicly',async()=>{
 const data=await call(request('GET',null,{'x-vercel-ip-country':'BY','x-vercel-ip-city':encodeURIComponent('Минск')}),context);
 assert.deepEqual(data.body,{country:'BY',city:'Минск',approximate:true});
 assert.match(data.headers['Cache-Control'],/private, no-store/);
 delete process.env.VERCEL;
 assert.equal((await call(request('GET',null,{'x-vercel-ip-city':'Fake'}),context)).body.city,'');
});
