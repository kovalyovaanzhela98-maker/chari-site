let cached=null;
export function parseRates(rows){
 const rates={BYN:1};
 for(const row of rows){
  if(!['USD','EUR','RUB'].includes(row.Cur_Abbreviation))continue;
  const rate=Number(row.Cur_OfficialRate),scale=Number(row.Cur_Scale);
  if(Number.isFinite(rate)&&rate>0&&Number.isFinite(scale)&&scale>0)rates[row.Cur_Abbreviation]=scale/rate;
 }
 if(!['USD','EUR','RUB'].every(k=>rates[k]))throw new Error('missing_rates');
 return {rates,date:String(rows.find(x=>x.Cur_Abbreviation==='USD')?.Date||'').slice(0,10),source:'НБРБ'};
}
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Метод не поддерживается'});}
 try{
  if(!cached||Date.now()-cached.at>3600000){
   const response=await fetch('https://api.nbrb.by/exrates/rates?periodicity=0',{signal:AbortSignal.timeout(6000)});
   if(!response.ok)throw new Error('rates_unavailable');
   cached={...parseRates(await response.json()),at:Date.now()};
  }
  res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=3600');
  return res.status(200).json({rates:cached.rates,date:cached.date,source:cached.source});
 }catch{
  res.setHeader('Cache-Control','no-store');
  return res.status(503).json({rates:{BYN:1},error:'Курсы временно недоступны. Цены показаны в BYN.'});
 }
}
