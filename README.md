# Asadbek Quiz Bot

Telegram guruhlariga dushanbadan shanbagacha kuniga 3 marta bir xil quiz yuboradigan bot.

## Bot imkoniyatlari

- Quizni Telegram ichida bosqichma-bosqich kiritish
- 4 ta javob variantidan to‘g‘risini belgilash
- Quizlarni navbatga saqlash
- Barcha ro‘yxatdan o‘tgan guruhlarga bir xil quiz yuborish
- Guruhlarni `/register` va `/removegroup` bilan boshqarish
- `/sendnow` orqali keyingi quizni darhol yuborish
- Keyinchalik statistika, fanlar, darajalar va Excel import qo‘shishga tayyor tuzilma

## 1. ADMIN_ID ni olish

Telegram’da `@userinfobot` ga `/start` yuboring. U bergan raqam sizning `ADMIN_ID` qiymatingiz bo‘ladi.

## 2. Supabase bazasini yaratish

1. Supabase’da yangi loyiha yarating.
2. `SQL Editor` bo‘limini oching.
3. `supabase/schema.sql` faylidagi kodni to‘liq ishga tushiring.
4. `Project Settings → API` dan:
   - Project URL
   - `service_role` secret key
   qiymatlarini oling.

`service_role` kalitini hech qachon GitHub’ga joylamang va foydalanuvchiga ko‘rsatmang.

## 3. Vercel Environment Variables

Vercel loyihasining `Settings → Environment Variables` bo‘limiga kiriting:

```env
TELEGRAM_BOT_TOKEN=BotFather bergan token
ADMIN_ID=sizning Telegram ID raqamingiz
TELEGRAM_WEBHOOK_SECRET=uzun tasodifiy maxfiy so‘z
CRON_SECRET=boshqa uzun tasodifiy maxfiy so‘z
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service_role kaliti
```

## 4. GitHub va Vercel

1. Papkani GitHub repository’ga yuklang.
2. Repository’ni Vercel’ga import qiling.
3. Environment Variables’ni kiriting.
4. Deploy qiling.
5. Tekshirish:

```text
https://LOYIHA-NOMI.vercel.app/api/health
```

Natija `{"ok":true,...}` bo‘lishi kerak.

## 5. Webhook o‘rnatish

Kompyuterda `.env.example` nusxasini `.env.local` deb nomlang va qiymatlarni kiriting. `WEBHOOK_URL`:

```env
WEBHOOK_URL=https://LOYIHA-NOMI.vercel.app/api/webhook
```

Terminalda:

```bash
npm run webhook
```

Webhook holatini tekshirish:

```bash
npm run check-webhook
```

## 6. Guruhlarni ulash

1. Botni har bir guruhga qo‘shing.
2. Botga xabar/quiz yuborish ruxsatini bering. Eng ishonchli usul — admin qilish.
3. Guruh ichida o‘zingiz `/register` yuboring.
4. Bot tasdiqlovchi xabar yuboradi.

## 7. Quiz kiritish

Botga shaxsiy chatda:

```text
/addquiz
```

Keyin bot ketma-ket so‘raydi:

1. Savol
2. 1-variant
3. 2-variant
4. 3-variant
5. 4-variant
6. To‘g‘ri javob raqami
7. Izoh yoki `-`

Navbatni ko‘rish:

```text
/queue
```

Darhol yuborish:

```text
/sendnow
```

## 8. Kuniga 3 marta avtomatik yuborish

Vercel Hobby rejasi ichki Cron’ni kuniga bir martadan ko‘p ishlatmaydi. Shu sabab tashqi scheduler’da 3 ta vazifa yarating.

Manzil:

```text
https://LOYIHA-NOMI.vercel.app/api/cron/send?key=CRON_SECRET
```

Toshkent vaqti bo‘yicha tavsiya:

- 09:00
- 14:00
- 19:00
- Dushanba–shanba
- Yakshanba o‘chiq

Scheduler vaqt zonasi UTC bo‘lsa:

- 04:00 UTC = 09:00 Toshkent
- 09:00 UTC = 14:00 Toshkent
- 14:00 UTC = 19:00 Toshkent

Har bir chaqiriqda navbatdagi faqat bitta quiz barcha faol guruhlarga yuboriladi.

## Xavfsizlik

- Token, `service_role` va maxfiy kalitlarni chatga yoki GitHub’ga yubormang.
- `.env.local` Git tomonidan e’tiborsiz qoldirilgan.
- Webhook va cron endpointlari maxfiy kalit bilan himoyalangan.
