# Aziz Academy Quiz Bot v1.5 — 3 yo‘nalish

Yo‘nalishlar:
- 💻 Kompyuter savodxonligi — Word, Excel, PowerPoint
- 🌐 HTML & CSS
- 🟨 JavaScript

## Yangiliklar
- `/register` guruh ichida yo‘nalish tanlatadi.
- Excel yuklashdan oldin yo‘nalish tanlanadi.
- Har yo‘nalishning queue’i alohida.
- 09:00, 14:00, 19:00 da scheduler uchala yo‘nalishdan bittadan quiz olib, faqat mos guruhlarga yuboradi.
- Bir yo‘nalishda nechta guruh bo‘lsa, o‘sha yo‘nalishning bitta savoli hammasiga bir xil yuboriladi.
- Bir yo‘nalish queue’i tugasa, qolgan yo‘nalishlar ishlashda davom etadi.
- `/sendnow` da bitta yo‘nalish yoki barcha yo‘nalishlarni tanlash mumkin.
- `/queue` database ID’larini ko‘rsatmaydi.
- `/groups` orqali mavjud guruh yo‘nalishini o‘zgartirish mumkin.
- Backup yo‘nalishlarni ham saqlaydi.

## Upgrade
1. Supabase SQL Editor’da `supabase/migration_v1.5.sql` ni bir marta Run qiling.
2. v1.5 fayllarini mavjud loyiha ustiga Replace qiling. `.env.local`, `.git`, `node_modules` ni saqlang.
3. `npm install`
4. `npm audit`
5. `git add . && git commit -m "quiz bot v1.5 tracks" && git push`
6. Vercel Ready bo‘lgach `npm run webhook`.
7. Eski guruhlarga `/register` yuborib yo‘nalish tanlang yoki Admin panel → Guruhlar orqali yo‘nalish biriktiring.

### Muhim
Migration mavjud quizlarni o‘chirmaydi. Yo‘nalishi bo‘lmagan eski quizlar `HTML & CSS` ga biriktiriladi. General reset guruhlar va ularning yo‘nalishini saqlab qoladi.
