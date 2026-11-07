// POST /api/tgbot — вебхук бота для клиентов: подтверждение заявки, «Мои заказы», отмена.
import { redis, hasStore, telegram, esc, readJson, clientBotOn, hookSecret, botApi, ensureClientBot } from './_lib.js';

const SITE = 'https://chari-site.vercel.app';
const IG = 'https://www.instagram.com/chari.mail_club/';

const send = (chat_id, text, extra = {}) => botApi('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
const cancelled = (l) => l.status === 'declined';
const active = (ls) => ls.filter((l) => !cancelled(l));

// Все заявки человека: к которым он подключал бота или где указал свой ник.
async function leadsOf(chat, username) {
  const [raw] = await redis(['HGETALL', 'leads']);
  const nick = username ? '@' + String(username).toLowerCase() : '';
  const out = [];
  for (let i = 0; i < (raw || []).length; i += 2) {
    try {
      const l = JSON.parse(raw[i + 1]);
      if (String(l.clientChat) === String(chat) || (nick && String(l.telegram || '').toLowerCase() === nick)) out.push(l);
    } catch {}
  }
  return out.sort((a, b) => Number(b.no) - Number(a.no));
}
const dt = (iso) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Minsk', day: 'numeric', month: 'long' }).format(new Date(iso));
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
function card(l) {
  const items = l.items || [];
  const lines = [`<b>Заявка №${esc(l.no)}</b> · ${dt(l.created)}`, `📍 ${esc(l.city)}${l.delivery ? ' · ' + esc(l.delivery) : ''}`];
  if (items.length) {
    lines.push('🛒 В корзине:');
    items.forEach((i) => lines.push(`   • ${esc(i.n)} — ${Number(i.p) || 0} BYN${String(i.id).startsWith('club') ? ' в месяц' : ''}`));
    lines.push(`<b>Итого ≈ ${items.reduce((t, i) => t + (Number(i.p) || 0), 0)} BYN</b>`);
  } else lines.push('🛒 Корзина пустая — место в первом выпуске');
  return lines.join('\n');
}
const LINE = '— — — — — — — — —';
function menu() {
  return { inline_keyboard: [[{ text: '🌐 Перейти на сайт', url: SITE }], [{ text: '✖️ Отменить мою заявку', callback_data: 'cancel' }]] };
}
async function showOrders(chat, username, hello = '') {
  const ls = await leadsOf(chat, username);
  if (!ls.length) return send(chat, `${hello}Пока не нашли твоих заявок. Оставить заявку можно на сайте 👇`, { reply_markup: { inline_keyboard: [[{ text: '🌐 Перейти на сайт', url: SITE }]] } });
  const a = active(ls), off = ls.filter(cancelled);
  if (!a.length) return send(chat, `${hello}Все твои заявки отменены (${off.map((l) => '№' + esc(l.no)).join(', ')}).\nПередумаешь — оставь новую на сайте 👇`, { reply_markup: { inline_keyboard: [[{ text: '🌐 Перейти на сайт', url: SITE }]] } });
  const parts = [
    `${hello}📮 <b>${a.length === 1 ? 'У тебя 1 заявка' : `У тебя ${a.length} ${plural(a.length, 'заявка', 'заявки', 'заявок')}`}</b> на первый выпуск`,
    LINE,
    a.slice(0, 6).map(card).join(`\n${LINE}\n`),
    LINE,
    off.length ? `Отменённые: ${off.map((l) => '№' + esc(l.no)).join(', ')}` : null,
    'Оплата — только после запуска. Напишем сюда, когда откроем запись 💌',
  ].filter(Boolean);
  return send(chat, parts.join('\n'), { reply_markup: menu() });
}
async function askCancel(chat, username, no) {
  const ls = await leadsOf(chat, username);
  const a = active(ls);
  if (!a.length) return send(chat, ls.length ? 'Все твои заявки уже отменены.' : `Не нашли твоих заявок. Оставить можно на сайте: ${SITE}`);
  if (!no && a.length > 1) return send(chat, 'Какую заявку отменить?', { reply_markup: { inline_keyboard: [...a.slice(0, 6).map((l) => [{ text: `№${l.no} · ${l.city}${(l.items || []).length ? ' · ' + (l.items || []).reduce((t, i) => t + (Number(i.p) || 0), 0) + ' BYN' : ''}`, callback_data: `cancel:${l.no}` }]), [{ text: 'Не отменять', callback_data: 'no' }]] } });
  const l = a.find((x) => String(x.no) === String(no || a[0].no));
  if (!l) return send(chat, 'Эта заявка уже отменена.');
  return send(chat, `Точно отменить заявку №${esc(l.no)}? Место в первом выпуске освободится.`,
    { reply_markup: { inline_keyboard: [[{ text: 'Да, отменить', callback_data: `yes:${l.no}` }, { text: 'Нет, оставить', callback_data: 'no' }]] } });
}

export default async function handler(req, res) {
  if (req.method !== 'POST' || !clientBotOn()) return res.status(200).json({ ok: true });
  if (req.headers['x-telegram-bot-api-secret-token'] !== hookSecret()) return res.status(401).json({ error: 'forbidden' });
  const u = await readJson(req);
  const ok = () => res.status(200).json({ ok: true });
  // держим вебхук актуальным (кнопки, меню) — один быстрый запрос, если всё уже настроено
  try { await ensureClientBot(String(req.headers['x-forwarded-host'] || req.headers.host || '')); } catch (e) { console.error('ensure', e.message); }
  console.log('tgbot_in', u.callback_query ? 'cb:' + u.callback_query.data : 'msg');

  try {
    const cq = u.callback_query;
    if (cq && cq.message && hasStore()) {
      const chat = cq.message.chat.id, mid = cq.message.message_id, uname = cq.from?.username || '';
      const [act, arg] = String(cq.data || '').split(':');
      await botApi('answerCallbackQuery', { callback_query_id: cq.id });
      if (act === 'status') await showOrders(chat, uname);
      else if (act === 'cancel') await askCancel(chat, uname, arg);
      else if (act === 'no') await botApi('editMessageText', { chat_id: chat, message_id: mid, text: 'Отлично, всё в силе 💌' });
      else if (act === 'yes') {
        const l = (await leadsOf(chat, uname)).find((x) => String(x.no) === String(arg));
        if (!l || cancelled(l)) { await botApi('editMessageText', { chat_id: chat, message_id: mid, text: 'Эта заявка уже отменена.' }); return ok(); }
        l.status = 'declined'; l.clientCancelled = true; l.cancelledAt = new Date().toISOString(); l.updated = l.cancelledAt;
        if (!l.clientChat) { l.clientChat = chat; l.clientTg = uname ? '@' + uname : ''; }
        await redis(['HSET', 'leads', String(l.no), JSON.stringify(l)]);
        await botApi('editMessageText', { chat_id: chat, message_id: mid, parse_mode: 'HTML', disable_web_page_preview: true, text: `Заявка №${esc(l.no)} отменена. Жаль! Если передумаешь — оставь новую на сайте: ${SITE}` });
        await telegram(`❌ Заявка №${esc(l.no)} отменена клиентом в боте${uname ? ' — @' + esc(uname) : ''}`);
      }
      return ok();
    }

    const m = u.message;
    if (!m || !m.chat || m.chat.type !== 'private') return ok();
    const chat = m.chat.id, uname = m.from?.username || '';
    const who = uname ? '@' + uname : (m.from?.first_name || 'без ника');
    const text = String(m.text || '').trim();
    const low = text.toLowerCase().replace(/@\w+$/, '');
    const st = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{6,64}))?$/);
    const isStatus = /^\/(status|orders?|myorders?|my_?orders?|my|zakaz\w*|zayavk\w*|moi\w*|menu)$/.test(low) || /^(мои?|моя)\s+(заказ|заявк)/.test(low);
    const isCancel = /^\/(cancel|otmen\w*)$/.test(low) || /^отмен/.test(low);

    if (st && st[1] && hasStore()) {
      const [no] = await redis(['GET', `start:${st[1]}`]);
      const [cur] = no ? await redis(['HGET', 'leads', String(no)]) : [null];
      if (cur) {
        const lead = JSON.parse(cur);
        const first = !lead.clientChat;
        lead.clientChat = chat; lead.clientTg = uname ? '@' + uname : '';
        await redis(['HSET', 'leads', String(no), JSON.stringify(lead)], ['SADD', 'cb:subs', String(chat)]);
        await showOrders(chat, uname, `Привет! Это чари 💌\nЗаявка №${esc(no)} принята.\n\n`);
        if (first) await telegram(`✅ Заявка №${esc(no)}: клиент подключил бота — ${esc(who)}`);
        return ok();
      }
    }
    if (st && hasStore()) {
      await redis(['SADD', 'cb:subs', String(chat)]);
      const ls = await leadsOf(chat, uname);
      if (active(ls).length) await showOrders(chat, uname);
      else await send(chat, `Привет! Это чари — почтовый клуб стикеров 💌\nОставить заявку на первый выпуск: ${SITE}\nА пока мы в Instagram: ${IG}`);
      return ok();
    }
    console.log('tgbot_msg', JSON.stringify(low.slice(0, 40)), hasStore());
    if ((isStatus || low.startsWith('/')) && !isCancel && hasStore()) { await showOrders(chat, uname); return ok(); }
    if (isCancel && hasStore()) { await askCancel(chat, uname); return ok(); }

    if (!low.startsWith('/')) await telegram(`💬 Сообщение в боте для клиентов от ${esc(who)}:\n${esc(text || '[не текст]')}`);
    await send(chat, 'Спасибо, сообщение получили 💌 Ответим совсем скоро.\nТвои заявки — по команде /myorders.');
  } catch (e) { console.error('tgbot', e.message); }
  return ok();
}
