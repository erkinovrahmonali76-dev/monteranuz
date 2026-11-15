/* Monteranuz — umumiy ma'lumotlar qatlami (sayt + admin) */
(function () {
  var LS_DATA = 'mnz_data_v1';
  var LS_PASS = 'mnz_pass_v1';

  var DEFAULT_SETTINGS = {
    brand: 'MONTERANUZ',
    phone: '+998 90 123 45 67',
    telegram: 'monteranuz',
    instagram: 'monteranuz',
    address: "Toshkent shahri, Chilonzor tumani",
    hours: 'Har kuni 09:00 – 21:00',
    heroTitle: 'Erkaklar uchun <em>haqiqiy</em> uslub',
    heroText: "Sifatli matolar, ideal kesim va hamyonbop narxlar. Kundalik kiyimdan tantanali liboslargacha — hammasi bir joyda.",
    currency: "so'm"
  };

  var CATEGORIES = ['Ko\'ylaklar', 'Shimlar', 'Kostyumlar', 'Futbolkalar', 'Kurtkalar', 'Poyabzal', 'Aksessuarlar'];

  var DEFAULT_PRODUCTS = [
    { id: 'p1', name: 'Klassik oq ko\'ylak', category: "Ko'ylaklar", price: 289000, oldPrice: 349000, sizes: ['S','M','L','XL'], desc: "100% paxta, slim fit kesim. Ofis va tantanali tadbirlar uchun.", image: '', stock: true, featured: true },
    { id: 'p2', name: 'Qora chino shim', category: 'Shimlar', price: 345000, oldPrice: 0, sizes: ['30','32','34','36'], desc: "Cho'ziluvchan mato, qulay o'tirish. Har kuni kiyish uchun.", image: '', stock: true, featured: true },
    { id: 'p3', name: 'Ikki tugmali kostyum', category: 'Kostyumlar', price: 1450000, oldPrice: 1690000, sizes: ['48','50','52','54'], desc: "Jun aralash mato, ikki qismli to'plam: pidjak va shim.", image: '', stock: true, featured: true },
    { id: 'p4', name: 'Oversize futbolka', category: 'Futbolkalar', price: 129000, oldPrice: 0, sizes: ['M','L','XL'], desc: "Yumshoq paxta, yozgi mavsum uchun ideal.", image: '', stock: true, featured: false },
    { id: 'p5', name: "Charm kurtka", category: 'Kurtkalar', price: 1190000, oldPrice: 0, sizes: ['M','L','XL'], desc: "Ekologik charm, issiq astarli. Kuz-qish mavsumi uchun.", image: '', stock: false, featured: false },
    { id: 'p6', name: 'Klassik tufli', category: 'Poyabzal', price: 590000, oldPrice: 690000, sizes: ['41','42','43','44'], desc: "Tabiiy charm, qulay tagcharm.", image: '', stock: true, featured: false }
  ];

  function defaults() {
    return { settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), products: JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)) };
  }

  function normalize(d) {
    var base = defaults();
    d = d || {};
    return {
      settings: Object.assign(base.settings, d.settings || {}),
      products: Array.isArray(d.products) ? d.products : base.products
    };
  }

  function readLocal() {
    try { var raw = localStorage.getItem(LS_DATA); return raw ? normalize(JSON.parse(raw)) : null; }
    catch (e) { return null; }
  }

  /* Ma'lumotni yuklash: avval brauzerdagi qoralama (admin), bo'lmasa data/data.json */
  function load() {
    var local = readLocal();
    if (local) return Promise.resolve({ data: local, draft: true });
    return fetch('data/data.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { return { data: normalize(j), draft: false }; })
      .catch(function () { return { data: defaults(), draft: false }; });
  }

  function save(data) {
    try { localStorage.setItem(LS_DATA, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  }
  function clearDraft() { try { localStorage.removeItem(LS_DATA); } catch (e) {} }

  function sha256(str) {
    var enc = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }
  function getPassHash() { try { return localStorage.getItem(LS_PASS); } catch (e) { return null; } }
  function setPass(p) { return sha256(p).then(function (h) { localStorage.setItem(LS_PASS, h); }); }
  function checkPass(p) {
    return sha256(p).then(function (h) {
      var saved = getPassHash();
      if (saved) return h === saved;
      return sha256('admin123').then(function (d) { return h === d; });
    });
  }

  function fmt(n, cur) { return Number(n || 0).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ' + (cur || ''); }

  /* Rasm bo'lmasa chiroyli joy egasi (SVG) */
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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg, err) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(t._h); t._h = setTimeout(function () { t.className = 'toast' + (err ? ' err' : ''); }, 2600);
  }

  window.MNZ = {
    CATEGORIES: CATEGORIES, defaults: defaults, normalize: normalize,
    load: load, save: save, clearDraft: clearDraft, readLocal: readLocal,
    checkPass: checkPass, setPass: setPass, fmt: fmt, placeholder: placeholder, esc: esc, toast: toast
  };
})();
