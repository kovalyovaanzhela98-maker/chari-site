// POST /api/track — посчитать визит для аналитики (без cookies и личных данных).
import { redis, hasStore, minskDate, readJson, clip } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' || !hasStore()) return res.status(204).end();
  const b = await readJson(req);
  const day = minskDate();
  const src = clip(b.src, 60) || 'неизвестно';
  try {
    await redis(['INCR', `views:${day}`], ['EXPIRE', `views:${day}`, 60 * 60 * 24 * 120], ['HINCRBY', 'vsrc', src, 1]);
  } catch (e) { console.error('track', e.message); }
  return res.status(204).end();
}
