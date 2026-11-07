// Картинка-открытка заявки для Telegram (PNG 1080×1080), рисуется через @vercel/og.
import { ImageResponse } from '@vercel/og';
import { readFile } from 'node:fs/promises';

const IMG = {
  club01: 'flatlay', k1: 'c-cat', k2: 'c-tree', k3: 'c-wizard', k4: 'c-sheet', k5: 'c-detox', k6: 'c-sudoku', k7: 'c-21',
  o1: 'c-grumpy', o2: 'c-good', o3: 'c-mozhno', o4: 'c-mush', o5: 'c-newyear', o6: 'c-blur', o7: 'c-treedraw', o8: 'c-dog',
};

const cache = new Map();
const file = (n) => new URL(`./_og/${n}`, import.meta.url);
async function asset(n) { if (!cache.has(n)) cache.set(n, readFile(file(n))); return cache.get(n); }
async function pic(n) { return 'data:image/png;base64,' + (await asset(n + '.png')).toString('base64'); }

const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat().filter((c) => c !== null && c !== false && c !== undefined) } });
const img = (src, style) => ({ type: 'img', props: { src, style } });
const dt = (iso) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Minsk', day: 'numeric', month: 'long' }).format(new Date(iso));

const INK = '#030303', MUTED = '#77716A', PINK = '#FF0088', PINKD = '#D6006F', BLUSH = '#FAC2DF', LIME = '#D4FF00', AQUA = '#96FFFB';

// раскладка коллажа: позиции «наклеенных» стикеров
const SPOTS = {
  1: [{ x: 40, y: 30, w: 360, r: -4 }],
  2: [{ x: 10, y: 10, w: 270, r: -7 }, { x: 160, y: 190, w: 250, r: 6 }],
  3: [{ x: 0, y: 0, w: 240, r: -8 }, { x: 190, y: 40, w: 220, r: 7 }, { x: 70, y: 230, w: 230, r: -3 }],
  4: [{ x: 0, y: 0, w: 215, r: -8 }, { x: 205, y: 10, w: 205, r: 6 }, { x: 10, y: 220, w: 205, r: 5 }, { x: 205, y: 225, w: 200, r: -6 }],
};

export async function renderCard(lead) {
  const items = (lead.items || []).slice(0, 30);
  const total = items.reduce((t, i) => t + (Number(i.p) || 0), 0);
  const off = lead.status === 'declined';
  const coll = items.slice(0, 4);
  const spots = SPOTS[Math.max(1, coll.length)].map((p) => ({ x: Math.round(p.x * 0.86), y: Math.round(p.y * 0.86), w: Math.round(p.w * 0.86), r: p.r }));

  // коллаж
  const stickers = [];
  if (coll.length) {
    for (let i = 0; i < coll.length; i++) {
      const it = coll[i], s = spots[i], key = IMG[it.id] || 'flatlay', club = String(it.id).startsWith('club');
      stickers.push(h('div', { position: 'absolute', left: s.x, top: s.y, width: s.w, height: s.w, transform: `rotate(${s.r}deg)`,
        ...(club ? { background: '#fff', padding: 12, borderRadius: 18, boxShadow: '0 14px 26px rgba(120,0,60,.18)' } : {}) },
        img(await pic(key), { width: '100%', height: '100%', objectFit: club ? 'cover' : 'contain', borderRadius: club ? 10 : 0 })));
    }
  } else {
    stickers.push(h('div', { position: 'absolute', left: 10, top: 10, width: 340, height: 340, background: '#fff', padding: 12, borderRadius: 20, transform: 'rotate(-4deg)', boxShadow: '0 14px 26px rgba(120,0,60,.18)' },
      img(await pic('set-frame-800'), { width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 })));
  }

  // список-чек
  const rows = items.slice(0, 7).map((it) => {
    const club = String(it.id).startsWith('club');
    return h('div', { alignItems: 'flex-end', gap: 10, fontSize: 24, lineHeight: 1.25 },
      h('span', { fontWeight: 600, maxWidth: 280, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }, club ? 'Набор выпуска №01' : it.n),
      h('div', { flex: 1, borderBottom: '3px dashed #E2D9CC', marginBottom: 7 }),
      h('span', { fontWeight: 800, whiteSpace: 'nowrap' }, `${Number(it.p) || 0} BYN${club ? '/мес' : ''}`));
  });
  if (items.length > 7) rows.push(h('span', { fontSize: 23, fontWeight: 600, color: MUTED }, `и ещё ${items.length - 7}…`));

  const receipt = items.length
    ? h('div', { flexDirection: 'column', flex: 1, minWidth: 0, gap: 14 },
        h('span', { fontSize: 22, fontWeight: 800, letterSpacing: 2, color: MUTED }, 'В КОРЗИНЕ'),
        h('div', { flexDirection: 'column', gap: 12 }, rows),
        h('div', { marginTop: 14, borderTop: '3px dashed #E2D9CC', paddingTop: 18, justifyContent: 'space-between', alignItems: 'center' },
          h('span', { fontSize: 28, fontWeight: 800 }, 'Итого'),
          h('span', { fontSize: 44, fontWeight: 800, color: PINKD }, `${total} BYN`)))
    : h('div', { flexDirection: 'column', flex: 1, minWidth: 0, gap: 14 },
        h('span', { fontSize: 22, fontWeight: 800, letterSpacing: 2, color: MUTED }, 'В КОРЗИНЕ'),
        h('span', { fontSize: 34, fontWeight: 800, lineHeight: 1.2 }, 'Место в первом выпуске'),
        h('span', { fontSize: 25, fontWeight: 600, color: MUTED, lineHeight: 1.4 }, 'Набор и стикеры можно выбрать, когда откроем запись.'));

  const el = h('div', { width: 1080, height: 1080, background: BLUSH, padding: 44, fontFamily: 'Manrope', color: INK, position: 'relative' },
    // лист-письмо
    h('div', { width: '100%', height: '100%', background: '#FFFDF8', borderRadius: 40, padding: '48px 52px', flexDirection: 'column', position: 'relative', boxShadow: '0 20px 40px rgba(150,0,80,.12)' },
      // шапка
      h('div', { justifyContent: 'space-between', alignItems: 'flex-start' },
        h('div', { flexDirection: 'column' },
          h('span', { fontFamily: 'Leotaro', fontSize: 52, lineHeight: 1 }, 'чари'),
          h('span', { fontSize: 20, fontWeight: 800, letterSpacing: 3, color: MUTED, marginTop: 6 }, 'ПОЧТОВЫЙ КЛУБ СТИКЕРОВ')),
        // марка
        h('div', { width: 132, height: 156, background: '#fff', border: '6px dashed ' + BLUSH, borderRadius: 10, padding: 8, transform: 'rotate(6deg)' },
          h('div', { width: '100%', height: '100%', background: LIME, borderRadius: 4, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' },
            img(await pic('star'), { width: 76, height: 76 }),
            h('span', { fontSize: 15, fontWeight: 800, marginTop: 4 }, '№01')))),
      // заголовок + штемпель
      h('div', { marginTop: 4, alignItems: 'center', gap: 28 },
        h('div', { alignItems: 'baseline' }, h('span', { fontFamily: 'Leotaro', fontSize: 124, lineHeight: 1 }, 'Заявка'), h('span', { fontWeight: 600, fontSize: 96, marginLeft: 22 }, `№${lead.no}`)),
        h('div', { width: 170, height: 170, borderRadius: 99, border: '4px solid ' + PINK, color: PINK, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-12deg)', opacity: 0.85 },
          h('span', { fontSize: 22, fontWeight: 800 }, dt(lead.created).toUpperCase()),
          h('div', { width: 120, borderTop: '3px solid ' + PINK, margin: '8px 0' }),
          h('span', { fontSize: 19, fontWeight: 800, maxWidth: 150, textAlign: 'center' }, String(lead.city || '').toUpperCase().slice(0, 14)))),
      h('span', { fontSize: 26, fontWeight: 600, color: MUTED, marginTop: 6 }, `${lead.city || ''}${lead.delivery ? ' · ' + lead.delivery : ''}`),
      // коллаж + чек
      h('div', { marginTop: 30, gap: 36, flex: 1, minHeight: 0 },
        h('div', { width: 360, height: 400, position: 'relative', flex: 'none' }, stickers),
        receipt),
      // подвал
      h('div', { justifyContent: 'space-between', alignItems: 'center', borderTop: '3px dashed #E2D9CC', paddingTop: 22 },
        h('span', { fontSize: 24, fontWeight: 600, color: MUTED }, off ? 'Заявка отменена' : 'Оплата — только после запуска'),
        h('span', { fontSize: 24, fontWeight: 800 }, 'chari.by'))),
    off ? h('div', { position: 'absolute', left: 0, top: 0, width: 1080, height: 1080, background: 'rgba(250,194,223,.45)', alignItems: 'center', justifyContent: 'center' },
      h('div', { border: '10px solid ' + PINKD, color: PINKD, borderRadius: 30, padding: '20px 50px', fontSize: 96, fontWeight: 800, transform: 'rotate(-10deg)', background: 'rgba(255,255,255,.92)', letterSpacing: 4 }, 'ОТМЕНЕНА')) : null);

  const fonts = [];
  for (const w of [600, 800]) fonts.push({ name: 'Manrope', data: await asset(`manrope-${w}.ttf`), weight: w, style: 'normal' });
  fonts.push({ name: 'Leotaro', data: await asset('leotaro.ttf'), weight: 400, style: 'normal' });
  return new ImageResponse(el, { width: 1080, height: 1080, fonts });
}

// Настроечные картинки для сообщений без заявки: отмена, «всё в силе», пусто, привет, спасибо.
const SCENES = {
  bye: { bg: BLUSH, st: ['c-grumpy', 'c-blur'], kick: 'ЗАЯВКА ОТМЕНЕНА', title: 'Грусть-печаль', text: 'Будем скучать. Захочешь вернуться — оставь новую заявку на сайте.' },
  stay: { bg: LIME, st: ['c-cat', 'c-wizard'], kick: 'ВСЁ В СИЛЕ', title: 'Ура, остаёмся!', text: 'Заявка на месте. Напишем, когда откроем запись.' },
  empty: { bg: AQUA, st: ['c-mush', 'c-tree'], kick: 'ЗАЯВОК ПОКА НЕТ', title: 'Тут пустовато', text: 'Оставь заявку на сайте — и она появится здесь.' },
  hello: { bg: BLUSH, st: ['c-wizard', 'c-cat'], kick: 'ПОЧТОВЫЙ КЛУБ СТИКЕРОВ', title: 'Привет! Это чари', text: 'Здесь твои заявки и новости о первом выпуске.' },
  thanks: { bg: AQUA, st: ['c-dog', 'c-good'], kick: 'СООБЩЕНИЕ ПОЛУЧЕНО', title: 'Спасибо!', text: 'Прочитаем и ответим совсем скоро.' },
};
export async function renderScene(kind, no) {
  const sc = SCENES[kind] || SCENES.hello;
  const kick = no && kind === 'bye' ? `ЗАЯВКА №${no} ОТМЕНЕНА` : sc.kick;
  const el = h('div', { width: 1080, height: 720, background: sc.bg, fontFamily: 'Manrope', color: INK, position: 'relative', overflow: 'hidden' },
    h('div', { position: 'absolute', left: 64, top: 0, bottom: 0, width: 520, flexDirection: 'column', justifyContent: 'center' },
      h('div', { alignItems: 'center', gap: 14 }, img(await pic('star'), { width: 56, height: 56 }), h('span', { fontFamily: 'Leotaro', fontSize: 44 }, 'чари')),
      h('span', { marginTop: 40, fontSize: 24, fontWeight: 800, letterSpacing: 3 }, kick),
      h('span', { marginTop: 10, fontFamily: 'Leotaro', fontSize: 88, lineHeight: 1.02 }, sc.title),
      h('span', { marginTop: 26, fontSize: 32, fontWeight: 600, lineHeight: 1.35, maxWidth: 500 }, sc.text),
      h('span', { marginTop: 34, background: '#fff', borderRadius: 99, padding: '12px 24px', fontSize: 24, fontWeight: 800, alignSelf: 'flex-start' }, 'chari.by')),
    h('div', { position: 'absolute', right: 50, top: 50, width: 310, height: 310, transform: 'rotate(8deg)' }, img(await pic(sc.st[0]), { width: '100%', height: '100%', objectFit: 'contain' })),
    h('div', { position: 'absolute', right: 270, bottom: 40, width: 250, height: 250, transform: 'rotate(-9deg)' }, img(await pic(sc.st[1]), { width: '100%', height: '100%', objectFit: 'contain' })));
  const fonts = [];
  for (const w of [600, 800]) fonts.push({ name: 'Manrope', data: await asset(`manrope-${w}.ttf`), weight: w, style: 'normal' });
  fonts.push({ name: 'Leotaro', data: await asset('leotaro.ttf'), weight: 400, style: 'normal' });
  return new ImageResponse(el, { width: 1080, height: 720, fonts });
}
