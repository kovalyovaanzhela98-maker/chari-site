// Approximate network location provided by Vercel; never use as a delivery address.
export default function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Метод не поддерживается'});}
 const decode=value=>{try{return decodeURIComponent(String(value||'')).slice(0,80)}catch{return ''}};
 const trusted=Boolean(process.env.VERCEL);
 const country=trusted?decode(req.headers['x-vercel-ip-country']):'';
 const city=trusted?decode(req.headers['x-vercel-ip-city']):'';
 return res.status(200).json({country:/^[A-Z]{2}$/.test(country)?country:'',city,approximate:true});
}
