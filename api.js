/* Monteranuz — brauzer tomoni: serverga (/api) murojaat qiluvchi qatlam.
   Sayt (app.js) va admin panel (admin.js) shu faylga tayanadi. */
(function () {
  'use strict';
  var CFG = window.MNZ_CONFIG || {};
  var TK = 'mnz_token', AK = 'mnz_admin';
  var ON_ADMIN = /admin/i.test(location.pathname);

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

  /* ---------- serverga so'rov ---------- */
  function tok(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function setTok(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }

  function call(method, path, body, admin) {
    var key = admin ? AK : TK, h = {}, t = tok(key);
    if (t) h.Authorization = 'Bearer ' + t;
    var o = { method: method, headers: h };
    if (body !== undefined) { h['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch('/api/' + path, o).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (!r.ok) {
          if (r.status === 401) setTok(key, '');
          throw new Error((j && j.error) || ('Server xatosi (' + r.status + ')'));
        }
        return j;
      });
    }, function () { throw new Error('Internet aloqasini tekshiring'); });
  }

  /* ---------- sozlamalar / mahsulotlar / promokodlar ---------- */
  function settings() { return call('GET', 'settings').then(normSettings); }
  function saveSettings(s) { return call('PUT', 'settings', normSettings(s), true); }
  function products() { return call('GET', 'products').then(function (l) { return (l || []).map(normProduct); }); }
  function productsRaw() { return products().then(function (l) { return l.length ? l : null; }); }
  function saveProduct(p) { return call('POST', 'products', { products: [normProduct(p)] }, true); }
  function saveProducts(list) { return call('POST', 'products', { products: list.map(normProduct) }, true); }
  function deleteProduct(id) { return call('DELETE', 'products/' + encodeURIComponent(id), undefined, true); }

  function promo(code) {
    code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    return code ? call('GET', 'promos/' + encodeURIComponent(code)) : Promise.resolve(null);
  }
  function promos() { return call('GET', 'promos', undefined, true); }
  function savePromo(p) { return call('PUT', 'promos', p, true); }
  function deletePromo(code) { return call('DELETE', 'promos/' + encodeURIComponent(code), undefined, true); }

  /* ---------- buyurtmalar ---------- */
  function createOrder(o) {
    return call('POST', 'orders', o).then(function (r) { if (r && r.number) o.number = r.number; return r && r.id; });
  }
  function updateOrder(id, patch) { return call('PATCH', 'orders/' + encodeURIComponent(id), patch, ON_ADMIN); }
  function orders() {
    return call('GET', 'orders', undefined, true).then(function (l) { return (l || []).map(function (o) { o.receipt = ''; return o; }); });
  }
  function orderReceipt(id) {
    return call('GET', 'orders/' + encodeURIComponent(id) + '/receipt', undefined, true).then(function (r) { return (r && r.receipt) || ''; });
  }
  function myOrders() { return call('GET', 'my-orders'); }
  function users() { return call('GET', 'users', undefined, true); }

  /* ---------- mijoz hisobi (telefon + parol) ---------- */
  function register(o) {
    return call('POST', 'register', { name: o.name, phone: o.phone, password: o.password })
      .then(function (r) { setTok(TK, r.token); return r.user; });
  }
  function login(phone, pass) {
    return call('POST', 'login', { phone: phone, password: pass })
      .then(function (r) { setTok(TK, r.token); return r.user; });
  }
  function logout() { setTok(TK, ''); return Promise.resolve(); }
  function saveProfile(uid, patch) { return call('PUT', 'profile', { name: patch.name, address: patch.address }); }
  function onAuth(cb) {
    if (!tok(TK)) { cb(null); return; }
    call('GET', 'me').then(cb, function () { cb(null); });
  }

  /* ---------- admin ---------- */
  function adminLogin(email, pass) {
    return call('POST', 'admin/login', { email: email, password: pass }, true)
      .then(function (r) { setTok(AK, r.token); return true; });
  }
  function adminLogout() { setTok(AK, ''); return Promise.resolve(); }
  function adminCheck() {
    if (!tok(AK)) return Promise.resolve(false);
    return call('GET', 'admin/check', undefined, true).then(function () { return true; }, function () { return false; });
  }
  function changeAdminPass(p) { return call('POST', 'admin/password', { password: p }, true); }

  /* ---------- zaxira / namunaviy ma'lumot ---------- */
  function exportAll() { return call('GET', 'export', undefined, true); }
  function importAll(d) { return call('POST', 'import', d || {}, true); }
  function loadSeed() {
    return fetch('data/data.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('data/data.json topilmadi'); return r.json(); })
      .then(function (j) {
        if (!Array.isArray(j.promos)) j.promos = [{ code: 'YANGI10', type: 'percent', value: 10, min: 0, active: true }];
        return j;
      });
  }
  function clearDemo() { return Promise.resolve(); }

  window.MNZ = {
    mode: 'server', CFG: CFG, STATUS: STATUS, PAID: PAID, CATEGORIES: CATEGORIES,
    esc: esc, fmt: fmt, digits: digits, normPhone: normPhone, validPhone: validPhone, fmtPhone: fmtPhone,
    normSettings: normSettings, normProduct: normProduct, discountFor: discountFor, deliveryFor: deliveryFor,
    orderNumber: orderNumber, placeholder: placeholder, toast: toast, fileToDataUrl: fileToDataUrl,
    settings: settings, products: products, productsRaw: productsRaw,
    saveSettings: saveSettings, saveProduct: saveProduct, saveProducts: saveProducts, deleteProduct: deleteProduct,
    promo: promo, promos: promos, savePromo: savePromo, deletePromo: deletePromo,
    createOrder: createOrder, updateOrder: updateOrder, orders: orders, orderReceipt: orderReceipt, myOrders: myOrders, users: users,
    register: register, login: login, logout: logout, saveProfile: saveProfile, onAuth: onAuth,
    adminLogin: adminLogin, adminLogout: adminLogout, adminCheck: adminCheck, changeAdminPass: changeAdminPass,
    exportAll: exportAll, importAll: importAll, loadSeed: loadSeed, clearDemo: clearDemo
  };
})();
