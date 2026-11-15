# Monteranuz — bepul, 24/7 ishlaydigan qilib ulash

Hammasi bepul: **Firebase (Spark tarif)** baza va kirish uchun, **GitHub Pages** sayt uchun. Karta kerak emas.

## 1. Firebase loyihasi
1. https://console.firebase.google.com → **Add project** → nom: `monteranuz` (Analytics kerak emas).
2. Loyiha sahifasida **`</>` (Web)** belgisini bosing → nom bering → **Register app**.
3. Chiqqan `firebaseConfig` ichidagi `apiKey`, `authDomain`, `projectId`, `appId` ni **config.js** ga ko'chiring.

## 2. Kirish (Authentication)
**Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**

## 3. Baza (Firestore)
1. **Build → Firestore Database → Create database** → joylashuv: `eur3` (Yevropa) → **Production mode**.
2. **Rules** bo'limiga `firestore.rules` faylidagi matnni to'liq qo'yib, **Publish** bosing.

## 4. Admin hisobini yaratish
1. **Authentication → Users → Add user** → o'zingizning email va kuchli parolingiz.
2. Yaratilgan foydalanuvchining **User UID** ni nusxalang.
3. **Firestore → Start collection** → nomi `admins` → **Document ID** = o'sha UID → maydon: `ok` (boolean) = `true` → Save.

Shundan keyingina `admin.html` ga shu email va parol bilan kirish mumkin.

## 5. Saytni joylash (GitHub Pages, bepul)
1. GitHub'da repo oching, shu papkadagi hamma faylni yuklang (`config.js` ham to'ldirilgan holda).
2. **Settings → Pages → Branch: main, folder: /(root) → Save.**
3. 1–2 daqiqadan so'ng sayt `https://<login>.github.io/<repo>/` manzilida ochiladi.

Boshqa bepul variant: Firebase Hosting (`firebase deploy`) yoki Cloudflare Pages.

## 6. Birinchi ishga tushirish
1. `.../admin.html` ni oching va admin email + parol bilan kiring.
2. Chiqqan sariq banner ichidagi **"Namunaviy ma'lumotni yuklash"** tugmasini bosing (mahsulotlar, sozlamalar, `YANGI10` promokodi yuklanadi).
3. **Sozlamalar** bo'limida **karta raqami**, karta egasi, telefon, Telegram, yetkazish narxlarini kiriting. To'lov oynasi shu ma'lumotni ko'rsatadi.

## Ishlash tartibi
- Mijoz telefon raqam + parol bilan ro'yxatdan o'tadi, buyurtma beradi, kartaga pul o'tkazib chek rasmini yuklaydi.
- Admin chekni tekshirib **tasdiqlaydi** yoki **rad etadi**. Mijoz holatni profilida ko'radi.
- Mijoz tasdiqlanishidan oldin buyurtmani o'zi bekor qila oladi. Tasdiqlangandan keyin Telegram orqali yozadi, admin bekor qiladi.

## Bepul limitlar (Spark)
- Firestore: kuniga 50 000 o'qish, 20 000 yozish, 1 GB saqlash.
- Chek rasmlari bazada saqlanadi (har biri taxminan 100–400 KB), 1 GB ga taxminan 3000+ buyurtma sig'adi. Eski buyurtmalarni vaqti-vaqti bilan tozalab turing.
- Sayt 24/7 ishlaydi, uxlab qolmaydi.

## Muhim eslatmalar
- `apiKey` ochiq bo'lishi normal, himoyani `firestore.rules` beradi. Qoidalarni albatta joylang.
- Narx hisoblash mijoz brauzerida bajariladi, shuning uchun admin har bir chekdagi summani buyurtma summasiga **qo'lda solishtirib** tasdiqlashi kerak.
- Parolni unutgan mijoz uchun: Firebase Console → Authentication → shu foydalanuvchini o'chiring, mijoz qayta ro'yxatdan o'tadi.
- `store.js` eski demo versiya, endi ishlatilmaydi, o'chirib tashlasangiz bo'ladi.
