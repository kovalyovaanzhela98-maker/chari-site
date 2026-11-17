(function(){
 'use strict';
 const $=s=>document.querySelector(s),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const local={get(key,fallback){try{return localStorage.getItem(key)||fallback}catch{return fallback}},set(key,value){try{localStorage.setItem(key,value)}catch{}}};
 let currency='BYN',rates={BYN:1},date='',profile={},user=null,geo={},ratesError=false;
 const format=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2,minimumFractionDigits:0}).format(n);
 const originals=new WeakMap();
 function updatePrices(){
  const containers=document.querySelectorAll('.pp,.pr,.mpr,.cl small,.total span:last-child,#mbarT span');
  for(const el of containers){
   const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
   while(node=walker.nextNode()){
    if(!originals.has(node)&&/\d+(?:[.,]\d+)? BYN/.test(node.data))originals.set(node,node.data);
    const original=originals.get(node);if(!original)continue;
    const next=currency==='BYN'?original:original.replace(/≈?(\d+(?:[.,]\d+)?) BYN/g,(_,n)=>'≈'+format(Number(n.replace(',','.'))*rates[currency])+' '+currency);
    if(node.data!==next)node.data=next;
   }
  }
  const note=ratesError?'Курсы временно недоступны. Цены и оформление — в BYN.':currency==='BYN'?'Цены и оформление — в BYN.':'Примерно по курсу НБРБ на '+date+'. Оформление — в BYN.';
  if($('#currencyNote').textContent!==note)$('#currencyNote').textContent=note;
 }
 let pending=false;
 new MutationObserver(()=>{if(!pending){pending=true;queueMicrotask(()=>{pending=false;updatePrices()})}}).observe(document.querySelector('main'),{childList:true,subtree:true});
 $('#currencySelect').addEventListener('change',e=>{currency=rates[e.target.value]?e.target.value:'BYN';local.set('chari-currency',currency);updatePrices()});
 fetch('/api/rates').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{
  if(!['USD','EUR','RUB'].every(k=>Number.isFinite(data.rates?.[k])&&data.rates[k]>0))throw Error();
  rates=data.rates;date=data.date;currency=local.get('chari-currency','BYN');if(!rates[currency])currency='BYN';
  for(const opt of $('#currencySelect').options)opt.disabled=!rates[opt.value];
  $('#currencySelect').value=currency;updatePrices();
 }).catch(()=>{ratesError=true;$('#currencySelect').title='Курсы временно недоступны — цены в BYN';$('#currencyNote').textContent='Курсы временно недоступны. Цены и оформление — в BYN.'});
 function countryName(code){try{return code?new Intl.DisplayNames(['ru'],{type:'region'}).of(code):''}catch{return code||''}}
 const cityNames={Minsk:'Минск',Brest:'Брест',Vitebsk:'Витебск',Vitsyebsk:'Витебск',Gomel:'Гомель',Homyel:'Гомель',Grodno:'Гродно',Hrodna:'Гродно',Mogilev:'Могилёв',Mahilyow:'Могилёв'};
 let locationEdited=false;
 ['#country','#cityOther','#ddBtn'].forEach(selector=>$(selector).addEventListener('input',()=>locationEdited=true));
 $('#ddBtn').addEventListener('click',()=>locationEdited=true);
 function fillLocation(){
  if(locationEdited)return;
  const country=profile.country||countryName(geo.country),city=profile.city||cityNames[geo.city]||geo.city;
  if(country)$('#country').value=country;
  if(city){
   const choices=['Минск','Брест','Витебск','Гомель','Гродно','Могилёв'];
   const value=choices.includes(city)?city:'Другой город';$('#city').value=value;$('#ddVal').textContent=value;
   $('#cityOtherBox').hidden=value!=='Другой город';if(value==='Другой город')$('#cityOther').value=city;
   $('#ddList').querySelectorAll('li').forEach(li=>li.setAttribute('aria-selected',String(li.textContent===value)));
  }
  if(profile.city||profile.country)$('#locationHint').textContent='Подставили из твоего профиля. Проверь город и страну перед отправкой.';
  else if(country||city)$('#locationHint').textContent='Предположили город и страну по сети. Это может быть неточно — проверь и исправь. Доставка пока по Беларуси.';
 }
 fetch('/api/context').then(r=>r.ok?r.json():{}).then(data=>{geo=data;fillLocation()}).catch(()=>{});
 $('#form').addEventListener('reset',()=>{locationEdited=false;setTimeout(fillLocation,0)});
 async function api(body){
  const response=await fetch('/api/account',{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Не удалось загрузить кабинет. Попробуй позже.');return data;
 }
 const message=text=>{$('#accountMessage').textContent=text};
 async function loadAccount(){
  try{
   const data=await api();user=data.user;profile=data.profile||{};
   $('#accountLogin').hidden=Boolean(user);$('#accountDashboard').hidden=!user;
   $('#sendCode').disabled=data.configured===false;
   if(!data.configured){message('Вход по почте скоро появится. Пока можно оставить заявку без кабинета.');return;}
   if(!user)return;
   $('#accountIdentity').textContent=user.email;
   $('#profileCity').value=profile.city||cityNames[geo.city]||geo.city||'';
   $('#profileCountry').value=profile.country||countryName(geo.country)||'Беларусь';
   if(!$('#tg').value)$('#tg').value=user.email;
   fillLocation();
   const status={new:'Заявка получена',contacted:'Команда связалась с тобой',waiting:'Ожидаем уточнения',confirmed:'Подтверждена',ordered:'Заказ оформлен',declined:'Отменена'};
   $('#accountLeads').innerHTML=(data.leads||[]).map(lead=>'<article class="account-order"><div><b>Заявка №'+esc(lead.no)+'</b><span>'+esc(status[lead.status]||'Уточни у команды')+'</span></div><small>'+esc(new Date(lead.created).toLocaleDateString('ru-RU'))+' · '+esc(lead.city)+' · '+esc(lead.delivery)+'</small><ul>'+(lead.items||[]).map(item=>'<li>'+esc(item.n)+' — '+esc(item.p)+' BYN</li>').join('')+'</ul></article>').join('')||'<p class="account-empty">Заявок с этой почтой пока нет. Выбери конверт или отдельные мелочи в каталоге.</p>';
  }catch(error){message(error.message)}
 }
 async function submit(form,work){
  const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);message('');
  try{await work()}catch(error){message(error.message)}finally{buttons.forEach(b=>b.disabled=false)}
 }
 $('#emailForm').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{
  await api({action:'send',email:$('#accountEmail').value.trim()});
  $('#codeForm').hidden=false;$('#emailForm').hidden=true;message('Отправили код на '+$('#accountEmail').value.trim()+'. Проверь также папку «Спам».');$('#accountCode').focus();
 })});
 $('#codeForm').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{
  await api({action:'verify',email:$('#accountEmail').value.trim(),code:$('#accountCode').value.trim()});
  $('#accountCode').value='';await loadAccount();message('Ты в клубе ♡');
 })});
 $('#changeEmail').addEventListener('click',()=>{$('#codeForm').hidden=true;$('#emailForm').hidden=false;$('#accountCode').value='';message('Новый код можно запросить через минуту после предыдущего.');$('#accountEmail').focus()});
 $('#profileForm').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{
  const data=await api({action:'profile',country:$('#profileCountry').value.trim(),city:$('#profileCity').value.trim()});profile=data.profile;fillLocation();message('Сохранили город и страну.');
 })});
 $('#logout').addEventListener('click',async()=>{try{await api({action:'logout'});user=null;profile={};$('#tg').value='';$('#profileCity').value='';$('#profileCountry').value='';$('#accountLeads').innerHTML='';$('#accountIdentity').textContent='';$('#codeForm').hidden=true;$('#emailForm').hidden=false;await loadAccount();message('Ты вышла из кабинета.')}catch(error){message(error.message)}});
 addEventListener('hashchange',()=>{if(location.hash==='#account'){message('');loadAccount()}});
 loadAccount();updatePrices();
})();
