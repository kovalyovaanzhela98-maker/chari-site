# Сайт чари — как запустить на Vercel

Внутри: сайт (index.html), админка (admin.html), картинки (img) и серверная часть (папка api), которая принимает заявки.

## 1. Залить на Vercel (5 минут)
1. Создай репозиторий на GitHub → «Add file → Upload files» → перетащи ВСЁ содержимое этой папки → «Commit changes».
2. На vercel.com: «Add New → Project» → выбери репозиторий → «Deploy». Настройки не трогай.

## 2. Заявки в Telegram
1. В Telegram открой @BotFather → /newbot → придумай имя → он пришлёт ТОКЕН (длинная строка).
2. Напиши своему новому боту любое сообщение.
3. Узнай свой chat id: напиши боту @userinfobot — он ответит числом (Id).
4. В Vercel: Project → Settings → Environment Variables → добавь:
   - `TELEGRAM_BOT_TOKEN` = токен от BotFather
   - `TELEGRAM_CHAT_ID` = твой Id (можно несколько через запятую, если заявки нужны двоим)

## 3. Хранилище заявок для админки
1. В Vercel: Project → Storage → «Create Database» → Upstash for Redis (бесплатный план) → Connect to project.
   Vercel сам добавит переменные `KV_REST_API_URL` и `KV_REST_API_TOKEN`.
2. Добавь переменную `ADMIN_PASSWORD` = надёжный пароль (от 8 символов) — это вход в админку.

## 4. Перезапустить
Deployments → у последнего «⋯» → Redeploy. Готово.

- Сайт: `https://<твой-проект>.vercel.app`
- Админка: `https://<твой-проект>.vercel.app/admin`

Проверь: отправь тестовую заявку на сайте — она придёт в Telegram и появится в админке. Тестовую потом можно удалить крестиком.

Работает и без хранилища (только Telegram), и без Telegram (только админка), но лучше подключить оба.
