// POST /api/tgbot — вебхук бота для клиентов: подтверждает заявку человеку, который нажал «Start».
import { redis, hasStore, telegram, esc, readJson, clientBotOn, hookSecret, botApi } from './_lib.js';

const SITE = 'https://chari-site.vercel.app';
const IG = 'https://www.instagram.com/chari.mail_club/';

export default async function handler(req, res) {
  if (req.method !== 'POST' || !clientBotOn()) return res.status(200).json({ ok: true });
  if (req.headers['x-telegram-bot-api-secret-token'] !== hookSecret()) return res.status(401).json({ error: 'forbidden' });

  const u = await readJson(req);
  const m = u.message;
  if (!m || !m.chat || m.chat.type !== 'private') return res.status(200).json({ ok: true });
  const chat = m.chat.id;
  const who = m.from?.username ? '@' + m.from.username : (m.from?.first_name || 'без ника');
  const text = String(m.text || '');
  const st = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{6,64}))?\s*$/);

  try {
    if (st && st[1] && hasStore()) {
      const [no] = await redis(['GET', `start:${st[1]}`]);
      const [cur] = no ? await redis(['HGET', 'leads', String(no)]) : [null];
      if (cur) {
        const lead = JSON.parse(cur);
        const first = !lead.clientChat;
        lead.clientChat = chat;
        lead.clientTg = m.from?.username ? '@' + m.from.username : '';
        await redis(['HSET', 'leads', String(no), JSON.stringify(lead)], ['SADD', 'cb:subs', String(chat)]);
        const items = (lead.items || []).map((i) => esc(i.n)).join(', ');
        await botApi('sendMessage', {
          chat_id: chat, parse_mode: 'HTML', disable_web_page_preview: true,
          text: [
            `Привет! Это чари 💌`,
            `Заявка <b>№${esc(no)}</b> на первый выпуск принята.`,
            ``,
            `Город: ${esc(lead.city)}${lead.delivery ? ' · ' + esc(lead.delivery) : ''}`,
            items ? `В корзине: ${items}` : null,
            ``,
            `Напишем сюда, когда откроем запись. Оплата — только после запуска.`,
          ].filter((x) => x !== null).join('\n'),
        });
        if (first) await telegram(`✅ Заявка №${esc(no)}: клиент подключил бота — ${esc(who)}`);
        return res.status(200).json({ ok: true });
      }
    }
    if (st) {
      if (hasStore()) await redis(['SADD', 'cb:subs', String(chat)]);
      await botApi('sendMessage', {
        chat_id: chat, parse_mode: 'HTML', disable_web_page_preview: true,
        text: `Привет! Это чари — почтовый клуб стикеров 💌\nОставить заявку на первый выпуск: ${SITE}\nА пока мы в Instagram: ${IG}`,
      });
      return res.status(200).json({ ok: true });
    }
    // Любое другое сообщение — пересылаем тебе, человеку отвечаем вежливо.
    await telegram(`💬 Сообщение в боте для клиентов от ${esc(who)}:\n${esc(text || '[не текст]')}`);
    await botApi('sendMessage', { chat_id: chat, text: 'Спасибо, сообщение получили 💌 Ответим совсем скоро.' });
  } catch (e) { console.error('tgbot', e.message); }
  return res.status(200).json({ ok: true });
}
