/* Monteranuz — ma'lumotlar qatlami (Firebase: Auth + Firestore).
   Sayt (app.js) va admin panel (admin.js) shu faylga tayanadi. */
(function () {
  'use strict';
  var CFG = window.MNZ_CONFIG || {};
  var FB = CFG.firebase || {};
  var DOMAIN = CFG.phoneEmailDomain || 'monteranuz.app';
  var configured = !!(FB.apiKey && FB.projectId && window.firebase);
  var auth = null, db = null;

  if (configured) {
    if (!firebase.apps.length) firebase.initializeApp(FB);
    auth = firebase.auth();
    db = firebase.firestore();
  }

  function run(f) {
    return new Promise(function (res) {
      if (!configured) throw new Error("Firebase ulanmagan. config.js ni to'ldiring (SETUP.md).");
      res(f());
    });
  }

  /* ---------- konstantalar ---------- */
  var STATUS = {
    pending:   { label: 'Tekshirilmoqda', color: '#d9a441' },
    confirmed: { label: 'Tasdiqlandi',    color: '#3fb27f' },
    shipping:  { label: "Yo'lda",         color: '#4a90e2' },
    delivered: { label: 'Yetkazildi',     color: '#2f9e6b' },
    rejected:  { label: 'Rad etildi',     color: '#e5484d' },
    cancelled: { label: 'Bekor qilindi',  color: '#7a7a82' }
  };
  var PAID = { confirmed: 1, shipping: 1, delivered: 1 };
  var CATEGORIES = ["Ko'ylaklar", 'Shimlar', 'Kostyumlar', 'Futbolkalar', 'Kurtkalar', 'Poyabzal', 'Aksessuarlar'];

  var DEFAULT_SETTINGS = {
    brand: 'MONTERANUZ', phone: '+998 90 123 45 67', telegram: 'monteranuz', instagram: 'monteranuz',
    address: 'Toshkent shahri, Chilonzor tumani', hours: 'Har kuni 09:00 – 21:00',
    heroTitle: 'Erkaklar uchun <em>haqiqiy</em> uslub',
    heroText: "Sifatli matolar, ideal kesim va hamyonbop narxlar. Kundalik kiyimdan tantanali liboslargacha — hammasi bir joyda.",
    currency: "so'm", cardNumber: '', cardHolder: '', bankName: '', payNote: '',
    deliveryCity: 25000, deliveryRegion: 40000, freeFrom: 0
  };

  /* ---------- yordamchilar ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n, cur) { return Number(n || 0).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ' + (cur || ''); }
  function digits(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  function normPhone(s) {
    var d = digits(s);
    if (d.length === 9) d = '998' + d;
    return d;
  }
  function validPhone(s) { var d = normPhone(s); return d.length === 12 && d.indexOf('998') === 0; }
  function fmtPhone(s) {
    var d = normPhone(s);
    if (d.length !== 12) return s ? String(s) : '';
    return '+998 ' + d.slice(3, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8, 10) + ' ' + d.slice(10, 12);
  }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : (d || 0); }
  function str(v) { return v == null ? '' : String(v); }

  function normSettings(s) {
    var o = Object.assign({}, DEFAULT_SETTINGS, s || {});
    ['deliveryCity', 'deliveryRegion', 'freeFrom'].forEach(function (k) { o[k] = num(o[k], DEFAULT_SETTINGS[k]); });
    ['brand', 'phone', 'telegram', 'instagram', 'address', 'hours', 'heroTitle', 'heroText', 'currency', 'cardNumber', 'cardHolder', 'bankName', 'payNote']
      .forEach(function (k) { o[k] = str(o[k]); });
    return o;
  }

  function normProduct(p) {
    p = p || {};
    return {
      id: str(p.id) || 'p' + Date.now().toString(36),
      name: str(p.name), category: str(p.category),
      price: num(p.price), oldPrice: num(p.oldPrice),
      sizes: Array.isArray(p.sizes) ? p.sizes.map(str).filter(Boolean) : [],
      colors: Array.isArray(p.colors) ? p.colors.filter(function (c) { return c && c.name; }).map(function (c) { return { name: str(c.name), hex: str(c.hex) || '#888888' }; }) : [],
      images: Array.isArray(p.images) ? p.images.map(str).filter(Boolean) : (p.image ? [str(p.image)] : []),
      desc: str(p.desc), stock: p.stock !== false, featured: !!p.featured, isNew: !!p.isNew,
      createdAt: num(p.createdAt, 0)
    };
  }

  function discountFor(promo, subtotal) {
    if (!promo || promo.active === false) return { error: 'Promokod faol emas' };
    if (promo.min && subtotal < promo.min) return { error: 'Promokod uchun minimal buyurtma: ' + fmt(promo.min, "so'm") };
    var a = promo.type === 'amount' ? Math.min(num(promo.value), subtotal) : Math.round(subtotal * num(promo.value) / 100);
    return { amount: Math.max(0, a) };
  }
  function deliveryFor(S, region, after) {
    if (region === 'pickup') return 0;
    if (S.freeFrom > 0 && after >= S.freeFrom) return 0;
    return region === 'region' ? S.deliveryRegion : S.deliveryCity;
  }
  function orderNumber() {
    return 'MN-' + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random() * 36).toString(36).toUpperCase();
  }

  function placeholder(name) {
    var t = (name || 'M').trim().charAt(0).toUpperCase();
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#26262c"/><stop offset="1" stop-color="#121214"/></linearGradient></defs>' +
      '<rect width="400" height="500" fill="url(#g)"/>' +
      '<circle cx="200" cy="230" r="86" fill="none" stroke="#c9a45c" stroke-opacity=".55" stroke-width="2"/>' +
      '<text x="200" y="258" text-anchor="middle" font-family="Georgia,serif" font-size="84" fill="#c9a45c">' + t + '</text>' +
      '<text x="200" y="440" text-anchor="middle" font-family="Arial" font-size="16" letter-spacing="6" fill="#6b6b73">MONTERANUZ</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function toast(msg, err) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(t._h); t._h = setTimeout(function () { t.className = 'toast' + (err ? ' err' : ''); }, 2800);
  }

  /* Rasmni kichraytirib JPEG data-URL qiladi (Firestore hujjati 1 MB dan oshmasligi uchun) */
  function fileToDataUrl(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Faqat rasm fayli yuklang'));
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error("Faylni o'qib bo'lmadi")); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("Rasmni o'qib bo'lmadi")); };
        img.onload = function () {
          var k = Math.min(1, (maxSide || 1000) / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality || 0.75));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- xatolarni o'zbekchaga o'girish ---------- */
  function authErr(e) {
    var m = {
      'auth/invalid-credential': "Telefon raqam yoki parol noto'g'ri",
      'auth/wrong-password': "Telefon raqam yoki parol noto'g'ri",
      'auth/user-not-found': "Telefon raqam yoki parol noto'g'ri",
      'auth/invalid-email': "Email noto'g'ri",
      'auth/email-already-in-use': "Bu raqam allaqachon ro'yxatdan o'tgan. Kirish bo'limidan kiring",
      'auth/weak-password': "Parol kamida 6 belgidan iborat bo'lsin",
      'auth/too-many-requests': "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring",
      'auth/network-request-failed': 'Internet aloqasini tekshiring',
      'auth/requires-recent-login': "Xavfsizlik uchun chiqib, qayta kiring va parolni yangilang",
      'permission-denied': "Ruxsat yo'q (Firestore qoidalarini tekshiring)"
    };
    var code = e && e.code ? String(e.code) : '';
    return new Error(m[code] || (e && e.message) || 'Xatolik');
  }
  function wrap(p) { return p.catch(function (e) { throw authErr(e); }); }

  /* ---------- sozlamalar / mahsulotlar / promokodlar ---------- */
  function settings() {
    return run(function () { return wrap(db.collection('settings').doc('main').get()); })
      .then(function (d) { return normSettings(d.exists ? d.data() : {}); });
  }
  function productsRaw() {
    return run(function () { return wrap(db.collection('products').get()); }).then(function (snap) {
      if (snap.empty) return null;
      return snap.docs.map(function (d) { return normProduct(Object.assign({ id: d.id }, d.data())); })
        .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    });
  }
  function products() { return productsRaw().then(function (l) { return l || []; }); }

  function saveSettings(s) {
    return run(function () { return wrap(db.collection('settings').doc('main').set(normSettings(s))); });
  }
  function saveProduct(p) {
    var n = normProduct(p);
    return run(function () { return wrap(db.collection('products').doc(n.id).set(n)); });
  }
  function saveProducts(list) {
    return run(function () {
      var b = db.batch();
      list.forEach(function (p) { var n = normProduct(p); b.set(db.collection('products').doc(n.id), n); });
      return wrap(b.commit());
    });
  }
  function deleteProduct(id) { return run(function () { return wrap(db.collection('products').doc(id).delete()); }); }

  function promo(code) {
    code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code) return Promise.resolve(null);
    return run(function () { return wrap(db.collection('promos').doc(code).get()); })
      .then(function (d) { return d.exists ? Object.assign({ code: d.id }, d.data()) : null; });
  }
  function promos() {
    return run(function () { return wrap(db.collection('promos').get()); })
      .then(function (s) { return s.docs.map(function (d) { return Object.assign({ code: d.id }, d.data()); }); });
  }
  function savePromo(p) {
    var o = { code: p.code, type: p.type === 'amount' ? 'amount' : 'percent', value: num(p.value), min: num(p.min), active: p.active !== false };
    return run(function () { return wrap(db.collection('promos').doc(o.code).set(o)); });
  }
  function deletePromo(code) { return run(function () { return wrap(db.collection('promos').doc(code).delete()); }); }

  /* ---------- buyurtmalar ---------- */
  function createOrder(o) {
    return run(function () { return wrap(db.collection('orders').add(o)); }).then(function (ref) { return ref.id; });
  }
  function updateOrder(id, patch) {
    return run(function () { return wrap(db.collection('orders').doc(id).update(patch)); });
  }
  function orders() {
    return run(function () { return wrap(db.collection('orders').orderBy('createdAt', 'desc').limit(500).get()); })
      .then(function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); });
  }
  function myOrders(uid) {
    return run(function () { return wrap(db.collection('orders').where('uid', '==', uid).get()); }).then(function (s) {
      return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
        .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    });
  }
  function users() {
    return run(function () { return wrap(db.collection('users').get()); })
      .then(function (s) { return s.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); }); });
  }

  /* ---------- mijoz hisobi (telefon + parol) ---------- */
  function phoneEmail(phone) { return normPhone(phone) + '@' + DOMAIN; }
  function userFrom(u, data) {
    data = data || {};
    var ph = data.phone || (u.email ? u.email.split('@')[0] : '');
    return { uid: u.uid, name: data.name || u.displayName || '', phone: ph, address: data.address || '' };
  }
  function isCustomer(u) { return !!(u && u.email && u.email.slice(-('@' + DOMAIN).length) === '@' + DOMAIN); }
  function loadUser(u) {
    return db.collection('users').doc(u.uid).get().then(function (d) { return userFrom(u, d.exists ? d.data() : null); })
      .catch(function () { return userFrom(u, null); });
  }

  function register(o) {
    return run(function () {
      return wrap(auth.createUserWithEmailAndPassword(phoneEmail(o.phone), o.password)).then(function (cred) {
        var u = cred.user, data = { uid: u.uid, name: o.name, phone: normPhone(o.phone), address: '', createdAt: Date.now() };
        return u.updateProfile({ displayName: o.name }).catch(function () {})
          .then(function () { return wrap(db.collection('users').doc(u.uid).set(data)); })
          .then(function () { return userFrom(u, data); });
      });
    });
  }
  function login(phone, pass) {
    return run(function () {
      return wrap(auth.signInWithEmailAndPassword(phoneEmail(phone), pass)).then(function (cred) { return loadUser(cred.user); });
    });
  }
  function logout() { return run(function () { return auth.signOut(); }); }
  function saveProfile(uid, patch) {
    var p = {};
    if (patch.name != null) p.name = str(patch.name);
    if (patch.address != null) p.address = str(patch.address);
    return run(function () { return wrap(db.collection('users').doc(uid).set(p, { merge: true })); });
  }
  function onAuth(cb) {
    if (!configured) { cb(null); return; }
    auth.onAuthStateChanged(function (u) {
      if (!u || !isCustomer(u)) { cb(null); return; }
      loadUser(u).then(cb);
    });
  }

  /* ---------- admin ---------- */
  function isAdminUser(u) {
    if (!u) return Promise.resolve(false);
    return db.collection('admins').doc(u.uid).get().then(function (d) { return d.exists; }).catch(function () { return false; });
  }
  function adminLogin(email, pass) {
    return run(function () {
      return wrap(auth.signInWithEmailAndPassword(String(email || '').trim(), pass)).then(function (cred) {
        return isAdminUser(cred.user).then(function (ok) {
          if (!ok) return auth.signOut().then(function () { throw new Error("Bu hisob admin emas (admins ro'yxatida yo'q)"); });
          return true;
        });
      });
    });
  }
  function adminLogout() { return run(function () { return auth.signOut(); }); }
  function adminCheck() {
    if (!configured) return Promise.resolve(false);
    return new Promise(function (res) {
      var off = auth.onAuthStateChanged(function (u) { off(); isAdminUser(u).then(res); });
    });
  }
  function changeAdminPass(p) {
    return run(function () {
      if (!auth.currentUser) throw new Error('Avval tizimga kiring');
      return wrap(auth.currentUser.updatePassword(p));
    });
  }

  /* ---------- zaxira / namunaviy ma'lumot ---------- */
  function exportAll() {
    return Promise.all([settings(), productsRaw(), promos()]).then(function (r) {
      return { settings: r[0], products: r[1] || [], promos: r[2] };
    });
  }
  function importAll(d) {
    d = d || {};
    return run(function () {
      var jobs = [];
      if (d.settings) jobs.push(saveSettings(d.settings));
      var ps = Array.isArray(d.products) ? d.products : [];
      for (var i = 0; i < ps.length; i += 400) jobs.push(saveProducts(ps.slice(i, i + 400)));
      (Array.isArray(d.promos) ? d.promos : []).forEach(function (p) { if (p && p.code) jobs.push(savePromo(p)); });
      return Promise.all(jobs);
    });
  }
  function loadSeed() {
    return fetch('data/data.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('data/data.json topilmadi'); return r.json(); })
      .then(function (j) {
        if (!Array.isArray(j.promos)) j.promos = [{ code: 'YANGI10', type: 'percent', value: 10, min: 0, active: true }];
        return j;
      });
  }
  function clearDemo() { return Promise.resolve(); }

  /* sozlanmagan bo'lsa ko'rinadigan ogohlantirish */
  if (!configured) {
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('div');
      b.style.cssText = 'background:#e5484d;color:#fff;padding:10px 16px;text-align:center;font:14px Arial;position:relative;z-index:999';
      b.textContent = "Firebase ulanmagan: config.js ni to'ldiring (SETUP.md ga qarang).";
      document.body.insertBefore(b, document.body.firstChild);
    });
  }

  window.MNZ = {
    mode: 'firebase', CFG: CFG, STATUS: STATUS, PAID: PAID, CATEGORIES: CATEGORIES,
    esc: esc, fmt: fmt, digits: digits, normPhone: normPhone, validPhone: validPhone, fmtPhone: fmtPhone,
    normSettings: normSettings, normProduct: normProduct, discountFor: discountFor, deliveryFor: deliveryFor,
    orderNumber: orderNumber, placeholder: placeholder, toast: toast, fileToDataUrl: fileToDataUrl,
    settings: settings, products: products, productsRaw: productsRaw,
    saveSettings: saveSettings, saveProduct: saveProduct, saveProducts: saveProducts, deleteProduct: deleteProduct,
    promo: promo, promos: promos, savePromo: savePromo, deletePromo: deletePromo,
    createOrder: createOrder, updateOrder: updateOrder, orders: orders, myOrders: myOrders, users: users,
    register: register, login: login, logout: logout, saveProfile: saveProfile, onAuth: onAuth,
    adminLogin: adminLogin, adminLogout: adminLogout, adminCheck: adminCheck, changeAdminPass: changeAdminPass,
    exportAll: exportAll, importAll: importAll, loadSeed: loadSeed, clearDemo: clearDemo
  };
})();
