// POST /api/lead — принять предзаявку: сохранить и прислать в Telegram.
import { redis, hasStore, telegram, tgConfigured, esc, clip, readJson } from './_lib.js';

const WANT = { club: 'Подписка на выпуски', stickers: 'Стикеры поштучно', gift: 'Подарок другу' };
const CITIES = ['Минск', 'Витебск', 'Гомель', 'Могилёв', 'Гродно', 'Брест'];

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Метод не поддерживается' }); }
  if (!hasStore() && !tgConfigured()) return res.status(503).json({ error: 'Приём заявок ещё не настроен' });

  const b = await readJson(req);
  if (b.website) return res.status(200).json({ ok: true, no: '—' }); // ловушка для ботов

  const name = clip(b.name, 60);
  let telegramNick = clip(b.telegram, 40).replace(/^@?/, '@');
  if (telegramNick === '@') telegramNick = '';
  const phone = clip(b.phone, 22);
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2) return res.status(400).json({ error: 'Укажи имя' });
  if (!telegramNick && !digits) return res.status(400).json({ error: 'Укажи Telegram или телефон' });
  if (telegramNick && !/^@[A-Za-z0-9_]{4,32}$/.test(telegramNick)) return res.status(400).json({ error: 'Проверь ник в Telegram' });
  if (digits && !/^(375\d{9}|80\d{9})$/.test(digits)) return res.status(400).json({ error: 'Нужен белорусский номер телефона' });

  const lead = {
    created: new Date().toISOString(),
    status: 'new',
    name, telegram: telegramNick, phone,
    city: clip(b.city, 40) || 'не указан',
    cityKnown: CITIES.includes(clip(b.city, 40)),
    delivery: clip(b.delivery, 30),
    want: (Array.isArray(b.want) ? b.want : []).filter((w) => WANT[w]).slice(0, 3),
    items: (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((i) => ({ id: clip(i.id, 10), n: clip(i.n, 60), p: Number(i.p) || 0 })),
    comment: clip(b.comment, 500),
    source: clip(b.source, 60) || 'неизвестно',
    note: '',
  };

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  let no;
  if (hasStore()) {
    try {
      const [hits] = await redis(['INCR', `rl:${ip}`], ['EXPIRE', `rl:${ip}`, 3600, 'NX']);
      if (hits > 5) return res.status(429).json({ error: 'Слишком много заявок подряд, попробуй через час' });
      [no] = await redis(['INCR', 'lead:seq']);
      lead.no = no;
      await redis(['HSET', 'leads', String(no), JSON.stringify(lead)]);
    } catch (e) {
      console.error('store', e.message);
      if (!tgConfigured()) return res.status(500).json({ error: 'Не получилось сохранить заявку' });
    }
  }
  if (!no) { no = Date.now().toString(36).slice(-5).toUpperCase(); lead.no = no; }

  const lines = [
    `🌸 <b>Новая заявка №${esc(no)}</b>`,
    `<b>${esc(lead.name)}</b>`,
    lead.telegram && `Telegram: ${esc(lead.telegram)}`,
    lead.phone && `Телефон: ${esc(lead.phone)}`,
    `Город: ${esc(lead.city)}${lead.delivery ? ' · ' + esc(lead.delivery) : ''}`,
    lead.want.length && `Интересно: ${lead.want.map((w) => WANT[w]).join(', ')}`,
    lead.items.length && `Корзина: ${lead.items.map((i) => esc(i.n)).join(', ')}`,
    lead.comment && `💬 ${esc(lead.comment)}`,
    `Источник: ${esc(lead.source)}`,
  ].filter(Boolean);
  const sent = await telegram(lines.join('\n'));
  if (!sent && !hasStore()) return res.status(500).json({ error: 'Не получилось отправить заявку' });

  return res.status(200).json({ ok: true, no });
}
