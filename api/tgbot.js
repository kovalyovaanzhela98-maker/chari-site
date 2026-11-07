// POST /api/tgbot — вебхук бота для клиентов: подтверждение заявки, «Мои заказы», отмена.
import { redis, hasStore, telegram, esc, readJson, clientBotOn, hookSecret, botApi, ensureClientBot } from './_lib.js';
import { cardSig } from './card.js';

const SITE = 'https://chari-site.vercel.app';
const IG = 'https://www.instagram.com/chari.mail_club/';

const sceneUrl = (k, no = '') => `${SITE}/api/card?scene=${k}${no ? '&no=' + no : ''}&v=1`;
const cardUrl = (l) => `${SITE}/api/card?no=${l.no}&s=${cardSig(l.no)}&v=${encodeURIComponent(l.updated || l.created || '')}`;
// картинка с подписью; если Telegram не принял картинку — отправляем текстом
async function photo(chat_id, url, caption, extra = {}) {
  const r = await botApi('sendPhoto', { chat_id, photo: url, caption, parse_mode: 'HTML', ...extra });
  if (!r.ok) return send(chat_id, caption, extra);
  return r;
}
// стикер из пака чари (или напрямую с сайта, если пак ещё не создан)
async function sticker(chat_id, key) {
  try {
    const [raw] = hasStore() ? await redis(['GET', 'cb:stk']) : [null];
    const id = raw ? JSON.parse(raw)[key] : '';
    await botApi('sendSticker', { chat_id, sticker: id || `${SITE}/img/tg/${key}.webp` });
  } catch (e) { console.error('sticker', e.message); }
}
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
  const lines = [`<b>Заявка №${esc(l.no)}</b> · ${dt(l.created)}`, `Куда: ${esc(l.city)}${l.delivery ? ' · ' + esc(l.delivery) : ''}`];
  if (items.length) {
    lines.push('В корзине:');
    items.forEach((i) => lines.push(`   • ${esc(i.n)} — ${Number(i.p) || 0} BYN${String(i.id).startsWith('club') ? ' в месяц' : ''}`));
    lines.push(`<b>Итого ≈ ${items.reduce((t, i) => t + (Number(i.p) || 0), 0)} BYN</b>`);
  } else lines.push('Корзина пустая — место в первом выпуске');
  return lines.join('\n');
}
const LINE = '— — — — — — — — —';
const KB = { keyboard: [[{ text: '✉︎ Мои заявки' }]], resize_keyboard: true, is_persistent: true };
function menu() {
  return { inline_keyboard: [[{ text: 'Перейти на сайт ↗', url: SITE }], [{ text: '✕ Отменить мою заявку', callback_data: 'cancel' }]] };
}
async function showOrders(chat, username, hello = '', quiet = false) {
  const ls = await leadsOf(chat, username);
  if (!quiet && (!ls.length || !active(ls).length)) await sticker(chat, 's05');
  else if (!quiet && !hello) await sticker(chat, 's08');
  if (!ls.length) return photo(chat, sceneUrl('empty'), `${hello}Пока не нашли твоих заявок. Оставить заявку можно на сайте ↓`, { reply_markup: { inline_keyboard: [[{ text: 'Перейти на сайт ↗', url: SITE }]] } });
  const a = active(ls), off = ls.filter(cancelled);
  if (!a.length) return photo(chat, sceneUrl('empty'), `${hello}Все твои заявки отменены (${off.map((l) => '№' + esc(l.no)).join(', ')}).\nПередумаешь — оставь новую на сайте ↓`, { reply_markup: { inline_keyboard: [[{ text: 'Перейти на сайт ↗', url: SITE }]] } });
  // Каждая заявка — картинкой; под последней — итог и кнопки.
  const list = a.slice(0, 5);
  const total = (l) => (l.items || []).reduce((t, i) => t + (Number(i.p) || 0), 0);
  for (let i = 0; i < list.length; i++) {
    const l = list[i], last = i === list.length - 1;
    const cap = last ? [
      `${hello}✦ <b>${a.length === 1 ? 'Твоя заявка' : `У тебя ${a.length} ${plural(a.length, 'заявка', 'заявки', 'заявок')}`}</b> на первый выпуск`,
      a.length > 1 ? 'Отменить можно любую — кнопкой под её картинкой.' : null,
      off.length ? `Отменённые: ${off.map((x) => '№' + esc(x.no)).join(', ')}` : null,
      'Оплата — только после запуска. Напишем сюда, когда откроем запись ♡',
    ].filter(Boolean).join('\n') : `Заявка №${esc(l.no)}${(l.items || []).length ? ' · ' + total(l) + ' BYN' : ''}`;
    const kb = [[{ text: a.length > 1 ? `✕ Отменить заявку №${l.no}` : '✕ Отменить заявку', callback_data: `cancel:${l.no}` }]];
    if (last) kb.unshift([{ text: 'Перейти на сайт ↗', url: SITE }]);
    const r = await botApi('sendPhoto', { chat_id: chat, photo: cardUrl(l), caption: cap, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
    if (!r.ok) { // запасной вариант — текстом
      return send(chat, [`${hello}✦ <b>Твои заявки</b>`, LINE, a.slice(0, 6).map(card).join(`\n${LINE}\n`), LINE, 'Оплата — только после запуска ♡'].join('\n'), { reply_markup: menu() });
    }
  }
}
async function askCancel(chat, username, no) {
  const ls = await leadsOf(chat, username);
  const a = active(ls);
  if (!a.length) return send(chat, ls.length ? 'Все твои заявки уже отменены.' : `Не нашли твоих заявок. Оставить можно на сайте: ${SITE}`);
  if (!no && a.length > 1) return send(chat, ['<b>Какую заявку отменить?</b>', LINE, a.slice(0, 6).map(card).join(`\n${LINE}\n`), LINE, 'Выбери кнопкой ниже ↓'].join('\n'),
    { reply_markup: { inline_keyboard: [...a.slice(0, 6).map((l) => [{ text: `✕ Отменить заявку №${l.no}`, callback_data: `cancel:${l.no}` }]), [{ text: 'Не отменять', callback_data: 'no' }]] } });
  const l = a.find((x) => String(x.no) === String(no || a[0].no));
  if (!l) return send(chat, 'Эта заявка уже отменена.');
  await sticker(chat, 's13');
  return photo(chat, cardUrl(l), `<b>Точно отменить заявку №${esc(l.no)}?</b>\nМесто в первом выпуске освободится.`,
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
      else if (act === 'no') {
        const e = await botApi('editMessageMedia', { chat_id: chat, message_id: mid, media: { type: 'photo', media: sceneUrl('stay'), caption: 'Отлично, всё в силе ♡' } });
        if (!e.ok) await botApi('editMessageText', { chat_id: chat, message_id: mid, text: 'Отлично, всё в силе ♡' });
        await sticker(chat, 's06');
      }
      else if (act === 'yes') {
        const l = (await leadsOf(chat, uname)).find((x) => String(x.no) === String(arg));
        if (!l || cancelled(l)) { await botApi('editMessageText', { chat_id: chat, message_id: mid, text: 'Эта заявка уже отменена.' }); return ok(); }
        l.status = 'declined'; l.clientCancelled = true; l.cancelledAt = new Date().toISOString(); l.updated = l.cancelledAt;
        if (!l.clientChat) { l.clientChat = chat; l.clientTg = uname ? '@' + uname : ''; }
        await redis(['HSET', 'leads', String(l.no), JSON.stringify(l)]);
        const cap = `<b>Заявка №${esc(l.no)} отменена</b>\nГрустим, но всегда ждём обратно ♡`;
        const e = await botApi('editMessageMedia', { chat_id: chat, message_id: mid, media: { type: 'photo', media: sceneUrl('bye', l.no), caption: cap, parse_mode: 'HTML' }, reply_markup: { inline_keyboard: [[{ text: 'Перейти на сайт ↗', url: SITE }]] } });
        if (!e.ok) await photo(chat, sceneUrl('bye', l.no), cap, { reply_markup: { inline_keyboard: [[{ text: 'Перейти на сайт ↗', url: SITE }]] } });
        await sticker(chat, 's02');
        await telegram(`✕ Заявка №${esc(l.no)} отменена клиентом в боте${uname ? ' — @' + esc(uname) : ''}`);
      }
      return ok();
    }

    const m = u.message;
    if (!m || !m.chat || m.chat.type !== 'private') return ok();
    const chat = m.chat.id, uname = m.from?.username || '';
    const who = uname ? '@' + uname : (m.from?.first_name || 'без ника');
    const text = String(m.text || '').trim();
    const low = text.toLowerCase().replace(/@\w+$/, '').replace(/^[^\p{L}\/]+/u, '').trim();
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
        await sticker(chat, 's16');
        await photo(chat, sceneUrl('hello'), 'Привет! Это чари ♡ Твои заявки — по кнопке «Мои заявки» внизу.', { reply_markup: KB });
        await showOrders(chat, uname, `Заявка №${esc(no)} принята.\n\n`);
        if (first) await telegram(`✓ Заявка №${esc(no)}: клиент подключил бота — ${esc(who)}`);
        return ok();
      }
    }
    if (st && hasStore()) {
      await redis(['SADD', 'cb:subs', String(chat)]);
      const ls = await leadsOf(chat, uname);
      await sticker(chat, 's16');
        await photo(chat, sceneUrl('hello'), 'Привет! Это чари ♡ Твои заявки — по кнопке «Мои заявки» внизу.', { reply_markup: KB });
      if (active(ls).length) await showOrders(chat, uname, '', true);
      else await send(chat, `Привет! Это чари — почтовый клуб стикеров ♡\nОставить заявку на первый выпуск: ${SITE}\nА пока мы в Instagram: ${IG}`);
      return ok();
    }
    console.log('tgbot_msg', JSON.stringify(low.slice(0, 40)), hasStore());
    if ((isStatus || low.startsWith('/')) && !isCancel && hasStore()) { await showOrders(chat, uname); return ok(); }
    if (isCancel && hasStore()) { await askCancel(chat, uname); return ok(); }

    if (!low.startsWith('/')) await telegram(`✎ Сообщение в боте для клиентов от ${esc(who)}:\n${esc(text || '[не текст]')}`);
    await sticker(chat, 's12');
    await photo(chat, sceneUrl('thanks'), 'Спасибо, сообщение получили ♡ Ответим совсем скоро.', { reply_markup: KB });
  } catch (e) { console.error('tgbot', e.message); }
  return ok();
}
