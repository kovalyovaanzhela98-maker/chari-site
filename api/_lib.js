// Общие помощники: хранилище (Upstash Redis через REST), Telegram, дата по Минску.
import crypto from 'node:crypto';

const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
export const hasStore = () => Boolean(RURL && RTOK);

// Выполнить несколько команд за один запрос. Возвращает массив результатов.
export async function redis(...cmds) {
  if (!hasStore()) throw new Error('store_not_configured');
  const r = await fetch(RURL.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RTOK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('store_http_' + r.status);
  const out = await r.json();
  return out.map((x) => { if (x.error) throw new Error('store_' + x.error); return x.result; });
}

export const tgConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
export async function telegram(text) {
  if (!tgConfigured()) return false;
  const ids = String(process.env.TELEGRAM_CHAT_ID).split(',').map((s) => s.trim()).filter(Boolean);
  const res = await Promise.all(ids.map((chat_id) =>
    fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    }).then(async (r) => { if (!r.ok) { const j = await r.json().catch(() => ({})); console.error('telegram_fail', r.status, j.description || ''); } return r.ok; })
      .catch((e) => { console.error('telegram_net', e.message); return false; })));
  return res.some(Boolean);
}

export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function minskDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

export function isAdmin(req) {
  const pass = process.env.ADMIN_PASSWORD || '';
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!pass || pass.length < 8 || !got) return false;
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
}

export const clip = (v, n) => String(v ?? '').trim().slice(0, n);

// Бот для клиентов: подтверждение заявки человеку в Telegram.
export const clientBotOn = () => Boolean(process.env.TELEGRAM_CLIENT_BOT_TOKEN);
export const hookSecret = () => crypto.createHash('sha256').update('chari-hook:' + (process.env.TELEGRAM_CLIENT_BOT_TOKEN || '')).digest('hex').slice(0, 48);
export async function botApi(method, body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_CLIENT_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.error('clientbot_fail', method, j.description || r.status);
    return j;
  } catch (e) { console.error('clientbot_net', method, e.message); return { ok: false }; }
}
// Подключает вебхук один раз (и после смены адреса/токена) и возвращает ник бота.
export async function ensureClientBot(host) {
  if (!clientBotOn() || !hasStore() || !host) return '';
  const url = `https://${host}/api/tgbot`;
  const sig = 'v5|' + url + '|' + hookSecret();
  const [cur, name] = await redis(['GET', 'cb:hook'], ['GET', 'cb:name']);
  if (cur === sig && name) return name;
  const me = await botApi('getMe');
  const hook = await botApi('setWebhook', { url, secret_token: hookSecret(), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
  // меню со слэш-командами не нужно: внизу у клиента постоянные кнопки «Мои заявки» / «Отменить заявку»
  await botApi('deleteMyCommands', {});
  await botApi('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Сайт', web_app: { url: 'https://chari-site.vercel.app' } } });
  if (!me.ok || !hook.ok) return '';
  await redis(['SET', 'cb:hook', sig], ['SET', 'cb:name', me.result.username]);
  return me.result.username;
}
