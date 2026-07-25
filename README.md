# Aziz Academy Quiz Bot v1.3.1

## Yangi funksiyalar

- `/panel` — tugmali admin panel
- `/stats` — jami, navbat, yuborilgan, guruhlar, bugungi holat
- `/clearqueue` — yuborilmagan quizlarni tasdiq bilan tozalash
- `/resetbot` — quizlar va tarixni nollash, guruhlar va jadval saqlanadi
- Excel importda takroriy savollar avtomatik tashlab ketiladi
- Excel importdan keyin kategoriya bo‘yicha hisobot
- Variantlar Telegram tomonidan har safar random aralashtiriladi
- `/settings` — Telegram ichidan 3 ta vaqt va queue ogohlantirish chegarasini o‘zgartirish
- `/pause` va `/resume`
- Navbat kamayganda admin uchun avtomatik ogohlantirish
- `/backup` — quizlar va guruhlarni `.xlsx` fayl qilib olish
- GitHub Action endi har 5 daqiqada jadvalni tekshiradi; haqiqiy vaqt Supabase sozlamasidan olinadi


## v1.3.1 xavfsizlik yangilanishi

- `xlsx` / SheetJS npm paketi olib tashlandi.
- Excel import `read-excel-file` orqali ishlaydi.
- `/backup` Excel fayli `write-excel-file` orqali yaratiladi.
- Funksiyalar v1.3 bilan bir xil; Supabase migrationni qayta ishlatish shart emas, agar v1.3 migration allaqachon bajarilgan bo‘lsa.

## MUHIM: yangilash tartibi

### 1. Avval Supabase migration

Supabase → SQL Editor → New query.
`supabase/migration_v1.3.sql` faylini to‘liq nusxalab `Run` bosing.

Bu migration eski quizlar va guruhlarni o‘chirmaydi.

### 2. Fayllarni loyihaga almashtiring

v1.3.1 ichidagi fayllarni eski loyiha ustiga qo‘ying.
`.env.local` faylingizga tegmang va GitHubga yubormang.

### 3. Kutubxonalarni o‘rnating

```bash
npm install
```

### 4. GitHubga push

```bash
git add .
git commit -m "Quiz bot v1.3.1 xavfsiz Excel backup"
git push
```

Vercel avtomatik redeploy qiladi.

### 5. GitHub Actions

`.github/workflows/quiz-schedule.yml` fayli har 5 daqiqada endpointni tekshiradi.
`CRON_SECRET` GitHub Repository Secret avvalgidek qoladi.

### 6. Tekshirish

Telegram botda:

```text
/panel
/stats
/settings
```

`/settings` orqali 3 ta vaqtni o‘zgartirsangiz kod yoki GitHub cronni tahrirlash shart emas.

## Excel formati

Birinchi varaq ustunlari:

```text
Savol | Variant 1 | Variant 2 | Variant 3 | Variant 4 | To'g'ri javob | Izoh | Kategoriya
```

`Kategoriya` va `Izoh` ixtiyoriy. Savol bir xil bo‘lsa bot takroriy deb hisoblaydi va qayta qo‘shmaydi.
