# Monteranuz — Cloudflare'da bepul, 24/7 (karta kerak emas)

Kerak bo'ladi: **GitHub akkaunt** va **Cloudflare akkaunt** (ikkalasi ham faqat email bilan bepul).
Hammasini brauzerdan, kompyuterda bajarish qulay.

## 1. GitHub'ga yuklash
1. github.com → **New repository** → nom: `monteranuz` → **Create**.
2. **uploading an existing file** → shu papkadagi hamma fayl va papkani sudrab tashlang
   (`index.html`, `admin.html`, `app.js`, `admin.js`, `api.js`, `style.css`, `schema.sql`, **`data`** va **`functions`** papkalari).
3. **Commit changes** bosing.

## 2. Cloudflare akkaunti va baza
1. dash.cloudflare.com → Sign up (email + parol).
2. Chap menyu: **Storage & databases → D1 SQL database → Create database** → nom: `monteranuz` → Create.
3. Baza ichida **Console** yorlig'ini oching, `schema.sql` faylidagi matnni to'liq qo'yib **Execute** bosing.
   (Xato bersa, har bir qatorni alohida bajaring.)

## 3. Saytni ulash
1. **Workers & Pages → Create → Pages → Connect to Git** → GitHub'ni ulang → `monteranuz` repo'ni tanlang.
2. Build command: **bo'sh qoldiring**. Build output directory: **`/`**. **Save and Deploy**.
3. Deploy tugagach, loyiha → **Settings** bo'limiga kiring:
   - **Bindings → Add → D1 database**: Variable name **`DB`**, baza: `monteranuz` → Save.
   - **Variables and secrets → Add** (turi: **Secret**), uchta qiymat:
     - `JWT_SECRET` — uzun tasodifiy matn (kamida 32 belgi, masalan klaviaturada bosib yozing)
     - `ADMIN_EMAIL` — o'zingizning email
     - `ADMIN_PASSWORD` — admin paroli (kuchli qiling)
4. **Deployments → oxirgi deploy → Retry deployment** (sozlamalar yangi deployda kuchga kiradi).

Sayt `https://monteranuz.pages.dev` kabi manzilda ochiladi (aniq manzil loyiha sahifasida ko'rinadi).

## 4. Birinchi ishga tushirish
1. `https://MANZIL/admin` ni oching, `ADMIN_EMAIL` va `ADMIN_PASSWORD` bilan kiring.
2. Sariq bannerdagi **"Namunaviy ma'lumotni yuklash"** ni bosing.
3. **Sozlamalar** bo'limida karta raqami, karta egasi, telefon, Telegram, yetkazish narxlarini kiriting.
4. Saytni ochib sinab ko'ring: ro'yxatdan o'ting, savatga qo'shing, buyurtma bering, adminda tasdiqlang.

## Ishlash tartibi
- Mijoz telefon + parol bilan ro'yxatdan o'tadi, kartaga pul o'tkazadi va chek rasmini yuklaydi.
- Admin chekni ko'rib **tasdiqlaydi** yoki **rad etadi**. Mijoz holatni profilida ko'radi.
- Mijoz admin tasdiqlamaguncha buyurtmani o'zi bekor qila oladi. Tasdiqlangandan keyin Telegram orqali yozadi, admin bekor qiladi.
- Narx, chegirma va yetkazish summasi **serverda qayta hisoblanadi**, mijoz brauzerda o'zgartira olmaydi. Baribir chekdagi summani buyurtma summasiga solishtiring.

## Bepul limitlar
- Funksiyalar: kuniga 100 000 so'rov. D1 baza: 5 GB, kuniga 5 mln o'qish va 100 000 yozish.
- Sayt uxlab qolmaydi, 24/7 ishlaydi.

## Tez-tez uchraydigan muammolar
- **"Baza ulanmagan"** yozuvi: 3-qadamdagi `DB` binding qo'shilmagan yoki qayta deploy qilinmagan.
- **"JWT_SECRET sozlanmagan"**: secret qo'shilmagan yoki qayta deploy qilinmagan.
- **Admin parolini unutdingiz**: D1 → Console: `DELETE FROM kv WHERE k = 'admin_pass';` — keyin `ADMIN_PASSWORD` ishlaydi.
- **Mijoz parolini unutdi**: D1 → Console: `DELETE FROM users WHERE phone = '998901234567';` — mijoz qayta ro'yxatdan o'tadi.
- Kod o'zgartirsangiz, GitHub'ga yuklang — Cloudflare o'zi qayta joylaydi.
