// POST /api/tgbot — вебхук бота для клиентов: подтверждение заявки, просмотр и отмена.
import { redis, hasStore, telegram, esc, readJson, clientBotOn, hookSecret, botApi } from './_lib.js';

const SITE = 'https://chari-site.vercel.app';
const IG = 'https://www.instagram.com/chari.mail_club/';
const MENU = { inline_keyboard: [[{ text: '📄 Мои заказы', callback_data: 'status' }], [{ text: '✖️ Отменить заявку', callback_data: 'cancel' }]] };

const send = (chat_id, text, extra = {}) => botApi('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

async function leadOfChat(chat) {
  const [no] = await redis(['GET', `chat:${chat}`]);
  if (no) { const [cur] = await redis(['HGET', 'leads', String(no)]); if (cur) return JSON.parse(cur); }
  // запасной путь: ищем последнюю заявку, к которой этот человек подключал бота
  const [raw] = await redis(['HGETALL', 'leads']);
  let best = null;
  for (let i = 0; i < (raw || []).length; i += 2) { try { const l = JSON.parse(raw[i + 1]); if (String(l.clientChat) === String(chat) && (!best || Number(l.no) > Number(best.no))) best = l; } catch {} }
  if (best) await redis(['SET', `chat:${chat}`, String(best.no)]);
  return best;
}
function card(lead) {
  const items = (lead.items || []).map((i) => esc(i.n)).join(', ');
  return [
    `Заявка <b>№${esc(lead.no)}</b> на первый выпуск`,
    `Город: ${esc(lead.city)}${lead.delivery ? ' · ' + esc(lead.delivery) : ''}`,
    items ? `В корзине: ${items}` : null,
  ].filter((x) => x !== null).join('\n');
}
const cancelled = (l) => l.status === 'declined' && l.clientCancelled;

export default async function handler(req, res) {
  if (req.method !== 'POST' || !clientBotOn()) return res.status(200).json({ ok: true });
  if (req.headers['x-telegram-bot-api-secret-token'] !== hookSecret()) return res.status(401).json({ error: 'forbidden' });
  const u = await readJson(req);

  try {
    // Нажатия на кнопки
    const cq = u.callback_query;
    if (cq && cq.message && hasStore()) {
      const chat = cq.message.chat.id, mid = cq.message.message_id, act = String(cq.data || '');
      await botApi('answerCallbackQuery', { callback_query_id: cq.id });
      const lead = await leadOfChat(chat);
      if (!lead) { await send(chat, `Не нашли твою заявку. Оставить её можно на сайте: ${SITE}`); return res.status(200).json({ ok: true }); }
      if (act === 'status') {
        await send(chat, cancelled(lead) ? `${card(lead)}\n\nЗаявка отменена. Передумаешь — оставь новую на сайте: ${SITE}` : `${card(lead)}\n\nВсё в силе 💌 Напишем сюда, когда откроем запись.`, cancelled(lead) ? {} : { reply_markup: MENU });
      } else if (act === 'cancel') {
        if (cancelled(lead)) await send(chat, 'Заявка уже отменена.');
        else await send(chat, `Точно отменить заявку №${esc(lead.no)}? Место в первом выпуске освободится.`, { reply_markup: { inline_keyboard: [[{ text: 'Да, отменить', callback_data: 'cancel_yes' }, { text: 'Нет, оставить', callback_data: 'cancel_no' }]] } });
      } else if (act === 'cancel_no') {
        await botApi('editMessageText', { chat_id: chat, message_id: mid, text: 'Отлично, заявка в силе 💌' });
      } else if (act === 'cancel_yes' && !cancelled(lead)) {
        lead.status = 'declined'; lead.clientCancelled = true; lead.cancelledAt = new Date().toISOString(); lead.updated = lead.cancelledAt;
        await redis(['HSET', 'leads', String(lead.no), JSON.stringify(lead)]);
        await botApi('editMessageText', { chat_id: chat, message_id: mid, parse_mode: 'HTML', disable_web_page_preview: true, text: `Заявка №${esc(lead.no)} отменена. Жаль! Если передумаешь — оставь новую на сайте: ${SITE}` });
        await telegram(`❌ Заявка №${esc(lead.no)} отменена клиентом в боте${lead.clientTg ? ' — ' + esc(lead.clientTg) : ''}`);
      }
      return res.status(200).json({ ok: true });
    }

    const m = u.message;
    if (!m || !m.chat || m.chat.type !== 'private') return res.status(200).json({ ok: true });
    const chat = m.chat.id;
    const who = m.from?.username ? '@' + m.from.username : (m.from?.first_name || 'без ника');
    const text = String(m.text || '').trim();
    const low = text.toLowerCase().replace(/@\w+$/, '');
    const isStatus = /^\/(status|orders?|myorders?|my_?orders?|my|zakaz\w*|zayavk\w*|moi\w*)$/.test(low) || /^(мои?|моя)\s+(заказ|заявк)/.test(low);
    const isCancel = /^\/(cancel|otmen\w*)$/.test(low) || /^отмен/.test(low);
    const st = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{6,64}))?$/);

    if (st && st[1] && hasStore()) {
      const [no] = await redis(['GET', `start:${st[1]}`]);
      const [cur] = no ? await redis(['HGET', 'leads', String(no)]) : [null];
      if (cur) {
        const lead = JSON.parse(cur);
        const first = !lead.clientChat;
        lead.clientChat = chat;
        lead.clientTg = m.from?.username ? '@' + m.from.username : '';
        await redis(['HSET', 'leads', String(no), JSON.stringify(lead)], ['SET', `chat:${chat}`, String(no)], ['SADD', 'cb:subs', String(chat)]);
        await send(chat, `Привет! Это чари 💌\n${card(lead)}\n\nЗаявка принята. Напишем сюда, когда откроем запись. Оплата — только после запуска.`, { reply_markup: MENU });
        if (first) await telegram(`✅ Заявка №${esc(no)}: клиент подключил бота — ${esc(who)}`);
        return res.status(200).json({ ok: true });
      }
    }
    if (st || text === '/menu') {
      if (hasStore()) await redis(['SADD', 'cb:subs', String(chat)]);
      const lead = hasStore() ? await leadOfChat(chat) : null;
      if (lead && !cancelled(lead)) await send(chat, `Привет! Это чари 💌\n${card(lead)}`, { reply_markup: MENU });
      else await send(chat, `Привет! Это чари — почтовый клуб стикеров 💌\nОставить заявку на первый выпуск: ${SITE}\nА пока мы в Instagram: ${IG}`);
      return res.status(200).json({ ok: true });
    }
    if ((isStatus || isCancel) && hasStore()) {
      const lead = await leadOfChat(chat);
      if (!lead) { await send(chat, `Не нашли твою заявку. Оставить её можно на сайте: ${SITE}`); return res.status(200).json({ ok: true }); }
      if (isStatus) await send(chat, cancelled(lead) ? `${card(lead)}\n\nЗаявка отменена.` : `${card(lead)}\n\nВсё в силе 💌`, cancelled(lead) ? {} : { reply_markup: MENU });
      else if (cancelled(lead)) await send(chat, 'Заявка уже отменена.');
      else await send(chat, `Точно отменить заявку №${esc(lead.no)}? Место в первом выпуске освободится.`, { reply_markup: { inline_keyboard: [[{ text: 'Да, отменить', callback_data: 'cancel_yes' }, { text: 'Нет, оставить', callback_data: 'cancel_no' }]] } });
      return res.status(200).json({ ok: true });
    }
    // Любое другое сообщение — пересылаем тебе, человеку отвечаем вежливо.
    await telegram(`💬 Сообщение в боте для клиентов от ${esc(who)}:\n${esc(text || '[не текст]')}`);
    await send(chat, 'Спасибо, сообщение получили 💌 Ответим совсем скоро.', { reply_markup: MENU });
  } catch (e) { console.error('tgbot', e.message); }
  return res.status(200).json({ ok: true });
}
