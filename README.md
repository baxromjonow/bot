# Aziz Academy Quiz Bot v1.6

## Adaptive Group Progress
- 6 fan: Word, Excel, PowerPoint, HTML, CSS, JavaScript.
- Har fan banki: 72 quiz.
- /connect: fan + joriy dars (1–12). Har dars 72/12 = 6 quiz segment. Masalan 7-dars => 37/72 dan boshlaydi.
- Har scheduler slotida (masalan 09:00, 14:00, 19:00) guruhga joriy progressidagi bitta quiz ketadi va progress +1 bo‘ladi.
- 72 tugasa avtomatik keyingi fanga 1/72 dan o‘tadi.
- Queue tozalash yoki yangi Excel yuklash group subject/quiz_position ni o‘chirmaydi.

## MUHIM: deploydan oldin
Supabase SQL Editor’da `supabase/migration_v1.6.sql` ni bir marta Run qiling.

## Excel
Admin `/excel` -> fan tanlaydi -> 72 qatorli `.xlsx` yuboradi. Fayldagi qator tartibi 1..72 progress tartibi hisoblanadi.

## Xavfsizlik
`/connect` faqat guruh adminiga ishlaydi; tanlov tugmalarini faqat connectni boshlagan admin bosa oladi.


## v1.6.1
- Statistika 6 fan bo‘yicha ko‘rsatiladi.
- Navbat guruhning fan, dars va 72 talik progressini ko‘rsatadi.
- Secure connect, Excel import va sender progress mexanizmi saqlandi.


## v1.6.2 — Maxsus quiz
- Maxsus Excel alohida navbatga yuklanadi.
- Admin xohlagan vaqtda keyingi maxsus quizni barcha faol guruhlarga birdan yuboradi.
- Maxsus yuborish fan, dars, quiz_position va avtomatik jadval progressiga tegmaydi.
- Maxsus navbatni ko‘rish va yuborilmagan maxsus quizlarni tozalash mavjud.
- Ishga tushirishdan oldin supabase/migration_v1.6.2.sql ni bir marta Run qiling.


## v1.6.3 Clean UI
- Maxsus quiz boshqaruvi bitta xabarni edit qilib ishlaydi.
- Tasdiq, bekor qilish, navbat va natija oynalari chatni to‘ldirib yubormaydi.
- Reply menu persistent emas: foydalanuvchi yopsa majburan qayta ochilmaydi.
