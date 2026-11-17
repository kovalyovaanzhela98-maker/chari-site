// Server-side BYN prices: submitted browser prices are never authoritative.
const products=[
 ['club01','Набор для отправки · выпуск №01',35],
 ['k1','Котик с какао',4],['k2','Ёлочка',4],['k3','Волшебник',4],
 ['k4','Лист стикеров №01',14],['k5','Постер «Диджитал детокс»',12],
 ['k6','Судоку',5],['k7','«21 день»',5],
 ['o1','Ворчун',7],['o2','Good things',7],['o3','Можно. А зачем?',7],
 ['o4','Грибочек с какао',7],['o5','New Year Mood',7],['o6','Сонная ёлка',7],
 ['o7','Ёлка от руки',7],['o8','Пусть всё идёт по плану',7]
].map(([id,n,p])=>({id,n,p}));
export function orderItems(input){
 const ids=new Set((Array.isArray(input)?input:[]).slice(0,30).map(x=>x?.id));
 return products.filter(x=>ids.has(x.id)).map(x=>({...x}));
}
