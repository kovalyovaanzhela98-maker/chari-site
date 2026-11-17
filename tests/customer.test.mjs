import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../answers.js';
import {parseRates} from '../api/rates.js';
const answer=globalThis.ChariAnswers.answer;
test('questions choose the specific topic rather than generic price words',()=>{
 const cases=[
 ['Сколько стоит стикер?',/4 BYN/],
 ['Сколько стоит доставка?',/тарифы/],
 ['Можно отменить подписку?',/передумать/],
 ['Можно конверт в подарок?',/Это подарок/],
 ['Сколько стоит подписка?',/35 BYN/],
 ['Какой размер стикеров?',/не опубликованы/],
 ['Когда запуск?',/не объявлена/],
 ['Хочу удалить мои данные',/удаления/],
 ['Письмо пришло поврежденным',/повреждённого/],
 ['Как изменить город?',/номер заявки/],
 ['Есть промокод?',/не объявлены/],
 ['Привет',/Привет/],
 ['Сколько стоит подписка? Куда доставляете?',/35 BYN[\s\S]*Беларуси/],
 ['неизвестная абракадабра',/нет точного ответа/],
 ['<img src=x onerror=alert(1)>',/нет точного ответа/]
 ];
 for(const [q,re]of cases)assert.match(answer(q),re,q);
});
test('all suggested questions resolve to their own answers',()=>{
 for(const entry of ChariAnswers.entries)assert.equal(answer(entry.q),entry.a);
});
test('NBRB currency conversion handles RUB units of 100 and rejects invalid rates',()=>{
 const rows=[{Cur_Abbreviation:'USD',Cur_OfficialRate:3,Cur_Scale:1,Date:'2026-11-17T00:00:00'},{Cur_Abbreviation:'EUR',Cur_OfficialRate:3.3,Cur_Scale:1},{Cur_Abbreviation:'RUB',Cur_OfficialRate:3.6,Cur_Scale:100}];
 const data=parseRates(rows);assert.equal(data.rates.BYN,1);assert.equal(data.rates.USD,1/3);assert.equal(data.rates.RUB,100/3.6);assert.equal(data.date,'2026-11-17');
 assert.throws(()=>parseRates([]));assert.throws(()=>parseRates(rows.map(x=>({...x,Cur_Scale:0}))));
});

test('server prices override stale or manipulated browser cart values',async()=>{
 const {orderItems}=await import('../api/_catalog.js');
 assert.deepEqual(orderItems([{id:'club01',p:50,n:'old'},{id:'k1',p:0},{id:'k1'},{id:'unknown',p:-1}]),[
  {id:'club01',n:'Набор для отправки · выпуск №01',p:35},{id:'k1',n:'Котик с какао',p:4}
 ]);
 assert.deepEqual(orderItems(null),[]);
});
