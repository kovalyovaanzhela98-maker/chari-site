// /api/leads — админка: GET список и аналитика, PATCH статус/заметка, DELETE заявка. Нужен ADMIN_PASSWORD.
import { redis, hasStore, isAdmin, minskDate, readJson, clip, tgConfigured, ensureClientBot } from './_lib.js';

const STATUSES = ['new', 'contacted', 'waiting', 'confirmed', 'ordered', 'declined'];

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Неверный пароль' });
  if (!hasStore()) return res.status(503).json({ error: 'Хранилище не подключено', telegram: tgConfigured() });

  try {
    if (req.method === 'GET') {
      try { await ensureClientBot(String(req.headers['x-forwarded-host'] || req.headers.host || '')); } catch (e) { console.error('clientbot', e.message); }
      const days = [...Array(30)].map((_, i) => minskDate(new Date(Date.now() - (29 - i) * 864e5)));
      const [raw, views, vsrc] = await redis(['HGETALL', 'leads'], ['MGET', ...days.map((d) => `views:${d}`)], ['HGETALL', 'vsrc']);
      const leads = [];
      for (let i = 0; i < (raw || []).length; i += 2) { try { leads.push(JSON.parse(raw[i + 1])); } catch {} }
      leads.sort((a, b) => Number(b.no) - Number(a.no));
      const v = {}; days.forEach((d, i) => { v[d] = Number(views[i]) || 0; });
      const src = {}; for (let i = 0; i < (vsrc || []).length; i += 2) src[vsrc[i]] = Number(vsrc[i + 1]) || 0;
      return res.status(200).json({ leads, views: v, vsrc: src, telegram: tgConfigured() });
    }

    if (req.method === 'PATCH') {
      const b = await readJson(req);
      const key = String(b.no || '');
      const [cur] = await redis(['HGET', 'leads', key]);
      if (!cur) return res.status(404).json({ error: 'Заявка не найдена' });
      const lead = JSON.parse(cur);
      if (b.status !== undefined) { if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Неизвестный статус' }); lead.status = b.status; }
      if (b.note !== undefined) lead.note = clip(b.note, 1000);
      lead.updated = new Date().toISOString();
      await redis(['HSET', 'leads', key, JSON.stringify(lead)]);
      return res.status(200).json({ ok: true, lead });
    }

    if (req.method === 'DELETE') {
      const key = String(new URL(req.url, 'http://x').searchParams.get('no') || '');
      await redis(['HDEL', 'leads', key]);
      return res.status(200).json({ ok: true });
    }
  } catch (e) {
    console.error('leads', e.message);
    return res.status(500).json({ error: 'Ошибка хранилища' });
  }
  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Метод не поддерживается' });
}
