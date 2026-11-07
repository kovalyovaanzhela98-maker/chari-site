// GET /api/card?no=4&s=подпись — картинка заявки для бота (PNG).
import crypto from 'node:crypto';
import { redis, hasStore, hookSecret } from './_lib.js';
import { renderCard, renderScene } from './_card.js';

export const cardSig = (no) => crypto.createHmac('sha256', 'card:' + hookSecret()).update(String(no)).digest('hex').slice(0, 20);

export default async function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const scene = q.get('scene');
  if (scene && /^(bye|stay|empty|hello|thanks)$/.test(scene)) {
    const no = /^\d{1,8}$/.test(q.get('no') || '') ? q.get('no') : '';
    const img = await renderScene(scene, no);
    res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(Buffer.from(await img.arrayBuffer()));
  }
  if (q.get('demo') === '1') { // пример для проверки, без настоящих данных
    const img = await renderCard({ no: 0, created: new Date().toISOString(), status: 'new', city: 'Минск', delivery: 'Европочта', items: [{ id: 'club01', n: 'Набор для отправки · выпуск №01', p: 50 }, { id: 'k1', n: 'Котик с какао', p: 5 }] });
    res.setHeader('Content-Type', 'image/png'); return res.status(200).send(Buffer.from(await img.arrayBuffer()));
  }
  const no = String(q.get('no') || '');
  if (!hasStore() || !/^\d{1,8}$/.test(no) || q.get('s') !== cardSig(no)) return res.status(404).end();
  const [cur] = await redis(['HGET', 'leads', no]);
  if (!cur) return res.status(404).end();
  const img = await renderCard(JSON.parse(cur));
  const buf = Buffer.from(await img.arrayBuffer());
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).send(buf);
}
