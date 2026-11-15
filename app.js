(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = MNZ.esc;
  var S = MNZ.normSettings(), P = [], user = null;
  var activeCat = 'Barchasi', q = '', sortBy = 'feat';
  var cart = ls('mnz_cart', []), favs = ls('mnz_favs', []);
  var promoApplied = null;           // { code, promo }
  var pm = null;                     // mahsulot oynasi holati
  var afterAuth = null, receipt = '', region = 'city', ptab = 'orders';

  /* ---------- yordamchilar ---------- */
  function ls(k, d) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function money(n) { return MNZ.fmt(n, S.currency); }
  function prod(id) { return P.filter(function (x) { return x.id === id; })[0]; }
  function pimg(p, i) { return (p.images && p.images[i || 0]) || MNZ.placeholder(p.name); }
  function hx(c) { return /^#[0-9a-f]{3,8}$/i.test(c && c.hex) ? c.hex : '#888888'; }
  function colorOf(p, name) { return (p.colors || []).filter(function (c) { return c.name === name; })[0]; }
  function tgName() { return String(S.telegram || '').replace(/^@/, ''); }
  function tg() { return 'https://t.me/' + tgName(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dt(ts) { var d = new Date(ts || 0); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function stBadge(s) { var st = MNZ.STATUS[s] || { label: s, color: '#888' }; return '<span class="st" style="background:' + st.color + '">' + esc(st.label) + '</span>'; }
  function regionLabel(r) { return r === 'city' ? 'Toshkent shahri' : r === 'region' ? 'Viloyat / boshqa shahar' : "Do'kondan olib ketish"; }
  function saveCart() { lsSet('mnz_cart', cart); updateBadges(); }
  function saveFavs() { lsSet('mnz_favs', favs); updateBadges(); }

  function updateBadges() {
    var n = cart.reduce(function (a, i) { return a + i.qty; }, 0);
    $('cartCnt').textContent = n; $('cartCnt').style.display = n ? '' : 'none';
    $('favCnt').textContent = favs.length; $('favCnt').style.display = favs.length ? '' : 'none';
    $('userLbl').textContent = user ? (user.name || 'Profil').split(' ')[0] : 'Kirish';
  }

  /* ---------- asosiy sahifa ---------- */
  function uniqueCats() {
    var seen = [];
    P.forEach(function (p) { if (p.category && seen.indexOf(p.category) < 0) seen.push(p.category); });
    return seen;
  }

  function render() {
    document.title = S.brand + " — Erkaklar kiyimi do'koni";
    $('heroTitle').innerHTML = S.heroTitle;
    $('heroText').textContent = S.heroText;
    $('footBrand').textContent = S.brand;
    $('year').textContent = new Date().getFullYear();
    $('statProducts').textContent = P.length + '+';

    var cats = ['Barchasi'].concat(uniqueCats());
    $('chips').innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === activeCat ? ' active' : '') + '" data-act="cat" data-c="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');

    var icons = { "Ko'ylaklar": '👔', 'Shimlar': '👖', 'Kostyumlar': '🤵', 'Futbolkalar': '👕', 'Kurtkalar': '🧥', 'Poyabzal': '👞', 'Aksessuarlar': '⌚' };
    $('cats').innerHTML = uniqueCats().map(function (c) {
      var n = P.filter(function (p) { return p.category === c; }).length;
      return '<div class="cat-tile" data-act="cat-go" data-c="' + esc(c) + '"><div class="ic">' + (icons[c] || '🛍️') + '</div><h3>' + esc(c) + '</h3><p>' + n + ' ta mahsulot</p></div>';
    }).join('');

    var cl = '';
    if (S.phone) cl += '<a href="tel:' + MNZ.digits(S.phone) + '">📞 <span>' + esc(S.phone) + '</span></a>';
    if (tgName()) cl += '<a href="' + tg() + '" target="_blank" rel="noopener">✈️ <span>Telegram: @' + esc(tgName()) + '</span></a>';
    if (S.instagram) cl += '<a href="https://instagram.com/' + esc(String(S.instagram).replace(/^@/, '')) + '" target="_blank" rel="noopener">📷 <span>Instagram: @' + esc(String(S.instagram).replace(/^@/, '')) + '</span></a>';
    if (S.address) cl += '<div>📍 <span>' + esc(S.address) + '</span></div>';
    if (S.hours) cl += '<div>🕘 <span>' + esc(S.hours) + '</span></div>';
    $('contactList').innerHTML = cl;

    if (tgName()) { $('tgFloat').href = tg(); $('tgFloat').style.display = ''; }
    renderGrid(); updateBadges();
  }

  function cardHtml(p) {
    var disc = p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    var badge = !p.stock ? '<span class="badge out">Tugagan</span>' : (disc ? '<span class="badge">-' + disc + '%</span>' : (p.featured ? '<span class="badge">TOP</span>' : ''));
    if (p.stock && p.isNew) badge += '<span class="badge new">YANGI</span>';
    var dots = (p.colors || []).slice(0, 6).map(function (c) { return '<i style="background:' + hx(c) + '" title="' + esc(c.name) + '"></i>'; }).join('');
    var on = favs.indexOf(p.id) >= 0;
    return '<article class="card"><div class="img" data-act="open-product" data-id="' + esc(p.id) + '">' + badge +
      '<button class="heart' + (on ? ' on' : '') + '" data-act="fav" data-id="' + esc(p.id) + '" aria-label="Sevimli">' + (on ? '♥' : '♡') + '</button>' +
      '<img loading="lazy" alt="' + esc(p.name) + '" src="' + esc(pimg(p)) + '" onerror="this.onerror=null;this.src=MNZ.placeholder(this.alt)"></div>' +
      '<div class="body" data-act="open-product" data-id="' + esc(p.id) + '" style="cursor:pointer"><span class="cat">' + esc(p.category) + '</span><h3>' + esc(p.name) + '</h3>' +
      (dots ? '<div class="dots">' + dots + '</div>' : '') +
      '<div class="price"><b>' + money(p.price) + '</b>' + (p.oldPrice > p.price ? '<s>' + money(p.oldPrice) + '</s>' : '') + '</div></div></article>';
  }

  function renderGrid() {
    var list = P.filter(function (p) {
      var okC = activeCat === 'Barchasi' || p.category === activeCat;
      var okQ = !q || (p.name + ' ' + p.category + ' ' + (p.desc || '')).toLowerCase().indexOf(q) >= 0;
      return okC && okQ;
    });
    list.sort(function (a, b) {
      if (sortBy === 'asc') return a.price - b.price;
      if (sortBy === 'desc') return b.price - a.price;
      if (sortBy === 'new') return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0);
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    });
    $('grid').innerHTML = list.length ? list.map(cardHtml).join('') : '<div class="empty">Hech narsa topilmadi 🙁</div>';
  }

  /* ---------- modal / drawer ---------- */
  function setModal(html, cls) {
    $('modal').innerHTML = '<div class="mbox ' + (cls || '') + '"><button class="close" data-act="close-modal" aria-label="Yopish">✕</button>' + html + '</div>';
    $('modal').classList.add('open'); document.body.style.overflow = 'hidden';
  }
  function closeModal() { $('modal').classList.remove('open'); $('modal').innerHTML = ''; if (!$('drawer').classList.contains('open')) document.body.style.overflow = ''; }
  function closeDrawer() { $('drawer').classList.remove('open'); $('drawer').innerHTML = ''; if (!$('modal').classList.contains('open')) document.body.style.overflow = ''; }

  /* ---------- mahsulot oynasi ---------- */
  function openProduct(id) {
    var p = prod(id); if (!p) return;
    pm = { id: id, color: p.colors.length === 1 ? p.colors[0].name : '', size: p.sizes.length === 1 ? p.sizes[0] : '', qty: 1, img: 0 };
    renderProduct();
  }
  function renderProduct() {
    var p = prod(pm.id); if (!p) return;
    var imgs = p.images && p.images.length ? p.images : [''];
    var thumbs = imgs.length > 1 ? '<div class="thumbs">' + imgs.map(function (u, i) {
      return '<img class="' + (i === pm.img ? 'on' : '') + '" data-act="pimg" data-i="' + i + '" src="' + esc(u || MNZ.placeholder(p.name)) + '" alt="">';
    }).join('') + '</div>' : '';
    var col = p.colors.length ? '<div><div class="opt-title">Rang: <b>' + esc(pm.color || 'tanlang') + '</b></div><div class="swatches">' + p.colors.map(function (c) {
      return '<button type="button" class="sw' + (c.name === pm.color ? ' active' : '') + '" data-act="pcolor" data-v="' + esc(c.name) + '" title="' + esc(c.name) + '"><i style="background:' + hx(c) + '"></i></button>';
    }).join('') + '</div></div>' : '';
    var sz = p.sizes.length ? '<div><div class="opt-title">O\'lcham: <b>' + esc(pm.size || 'tanlang') + '</b></div><div class="sizes">' + p.sizes.map(function (s) {
      return '<button type="button" class="size' + (s === pm.size ? ' active' : '') + '" data-act="psize" data-v="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('') + '</div></div>' : '';
    var on = favs.indexOf(p.id) >= 0;
    var html = '<div class="gallery"><div class="main"><img id="pmImg" alt="' + esc(p.name) + '" src="' + esc(imgs[pm.img] || MNZ.placeholder(p.name)) + '" onerror="this.onerror=null;this.src=MNZ.placeholder(this.alt)"></div>' + thumbs + '</div>' +
      '<div class="pinfo"><span class="cat muted">' + esc(p.category) + '</span><h2>' + esc(p.name) + '</h2>' +
      '<div class="price"><b style="font-size:1.5rem">' + money(p.price) + '</b>' + (p.oldPrice > p.price ? '<s>' + money(p.oldPrice) + '</s>' : '') + '</div>' +
      (p.desc ? '<p class="muted">' + esc(p.desc) + '</p>' : '') + col + sz +
      (p.stock ? '<div class="row"><div class="qty"><button type="button" data-act="pqty" data-d="-1">−</button><span>' + pm.qty + '</span><button type="button" data-act="pqty" data-d="1">+</button></div>' +
        '<button type="button" class="btn ghost sm" data-act="fav" data-id="' + esc(p.id) + '">' + (on ? '♥ Sevimlida' : '♡ Sevimli') + '</button></div>' +
        '<div class="row"><button type="button" class="btn" data-act="add-cart">🛒 Savatga qo\'shish</button><button type="button" class="btn ghost" data-act="buy-now">Hozir sotib olish</button></div>'
        : '<div class="alert">Hozircha mavjud emas</div><a class="btn ghost" target="_blank" rel="noopener" href="' + tg() + '?text=' + encodeURIComponent("Assalomu alaykum! \"" + p.name + "\" qachon bo'ladi?") + '">Telegramda so\'rash</a>') +
      '</div>';
    setModal(html, 'wide');
  }
  function validPick(p) {
    if (p.colors.length && !pm.color) { MNZ.toast('Rangni tanlang', true); return false; }
    if (p.sizes.length && !pm.size) { MNZ.toast("O'lchamni tanlang", true); return false; }
    return true;
  }
  function addToCart() {
    var p = prod(pm.id); if (!p || !validPick(p)) return false;
    var hit = cart.filter(function (i) { return i.pid === p.id && i.size === pm.size && i.color === pm.color; })[0];
    if (hit) hit.qty = Math.min(20, hit.qty + pm.qty); else cart.push({ pid: p.id, size: pm.size, color: pm.color, qty: pm.qty });
    saveCart(); return true;
  }

  /* ---------- savat ---------- */
  function calc(rg) {
    var lines = [];
    cart.forEach(function (it, idx) {
      var p = prod(it.pid); if (!p) return;
      lines.push({ idx: idx, p: p, qty: it.qty, size: it.size, color: it.color, sum: p.price * it.qty });
    });
    var subtotal = lines.reduce(function (a, l) { return a + l.sum; }, 0);
    var discount = 0, promoErr = '';
    if (promoApplied) {
      var d = MNZ.discountFor(promoApplied.promo, subtotal);
      if (d.error) promoErr = d.error; else discount = d.amount;
    }
    var after = subtotal - discount;
    var delivery = lines.length ? MNZ.deliveryFor(S, rg || 'city', after) : 0;
    return { lines: lines, subtotal: subtotal, discount: discount, promoErr: promoErr, after: after, delivery: delivery, total: after + delivery };
  }

  function lineMeta(l) {
    var c = l.color ? colorOf(l.p, l.color) : null;
    return (c ? '<span><i style="background:' + hx(c) + '"></i> ' + esc(l.color) + '</span>' : (l.color ? '<span>' + esc(l.color) + '</span>' : '')) + (l.size ? '<span>O\'lcham: ' + esc(l.size) + '</span>' : '');
  }

  function openCart() {
    var c = calc('city');
    var items = c.lines.length ? c.lines.map(function (l) {
      return '<div class="citem"><img alt="" src="' + esc(pimg(l.p)) + '" onerror="this.onerror=null;this.src=MNZ.placeholder(\'M\')">' +
        '<div><h4>' + esc(l.p.name) + '</h4><div class="meta">' + lineMeta(l) + '</div>' +
        '<div class="qty"><button data-act="cq" data-i="' + l.idx + '" data-d="-1">−</button><span>' + l.qty + '</span><button data-act="cq" data-i="' + l.idx + '" data-d="1">+</button></div>' +
        (l.p.stock ? '' : '<div style="color:var(--danger);font-size:.82rem;margin-top:4px">Tugagan — olib tashlang</div>') + '</div>' +
        '<div style="text-align:right"><button class="rm" data-act="crm" data-i="' + l.idx + '" aria-label="O\'chirish">✕</button><div style="margin-top:8px;font-weight:600">' + money(l.sum) + '</div></div></div>';
    }).join('') : '<div class="empty" style="padding:50px 0">Savat bo\'sh 🛒<br><br><button class="btn ghost sm" data-act="close-drawer">Xaridni boshlash</button></div>';
    var foot = c.lines.length ? '<footer>' +
      '<div class="promo-row"><input id="promoIn" placeholder="Promokod" value="' + esc(promoApplied ? promoApplied.code : '') + '"><button class="btn ghost sm" data-act="promo">Qo\'llash</button></div>' +
      (c.promoErr ? '<div style="color:var(--danger);font-size:.85rem">' + esc(c.promoErr) + '</div>' : '') +
      '<div class="sumrow"><span>Mahsulotlar</span><span>' + money(c.subtotal) + '</span></div>' +
      (c.discount ? '<div class="sumrow"><span>Chegirma (' + esc(promoApplied.code) + ')</span><span>−' + money(c.discount) + '</span></div>' : '') +
      '<div class="sumrow"><span>Yetkazish</span><span class="muted" style="font-size:.85rem">keyingi bosqichda hisoblanadi' + (S.freeFrom > 0 ? ' · ' + money(S.freeFrom) + ' dan bepul' : '') + '</span></div>' +
      '<button class="btn" data-act="checkout">Rasmiylashtirish →</button></footer>' : '';
    $('drawer').innerHTML = '<div class="bg" data-act="close-drawer"></div><div class="panel-d"><header><h3>Savat</h3><button class="rm" data-act="close-drawer" aria-label="Yopish">✕</button></header><div class="items">' + items + '</div>' + foot + '</div>';
    $('drawer').classList.add('open'); document.body.style.overflow = 'hidden';
  }

  function applyPromo() {
    var code = ($('promoIn').value || '').trim();
    if (!code) { promoApplied = null; openCart(); return; }
    MNZ.promo(code).then(function (p) {
      if (!p || p.active === false) { promoApplied = null; MNZ.toast("Promokod topilmadi", true); openCart(); return; }
      var d = MNZ.discountFor(p, calc('city').subtotal);
      if (d.error) { promoApplied = null; MNZ.toast(d.error, true); } else { promoApplied = { code: code.toUpperCase(), promo: p }; MNZ.toast('Promokod qo\'llandi: −' + money(d.amount)); }
      openCart();
    }).catch(function () { MNZ.toast('Promokodni tekshirib bo\'lmadi', true); });
  }

  /* ---------- kirish / ro'yxatdan o'tish ---------- */
  function openAuth(tab) {
    tab = tab || 'login';
    var isReg = tab === 'register';
    setModal('<h2>' + (isReg ? "Ro'yxatdan o'tish" : 'Kirish') + '</h2>' +
      '<p class="muted" style="margin-bottom:14px">' + (afterAuth === 'checkout' ? 'Buyurtma berish uchun hisobingizga kiring.' : "Profil orqali buyurtmalaringizni kuzatib boring.") + '</p>' +
      '<div class="tabs" style="margin:0 0 16px"><button class="tab' + (!isReg ? ' active' : '') + '" data-act="auth-tab" data-t="login">Kirish</button><button class="tab' + (isReg ? ' active' : '') + '" data-act="auth-tab" data-t="register">Ro\'yxatdan o\'tish</button></div>' +
      '<form data-form="' + tab + '" class="fgrid">' +
      (isReg ? '<label>Ismingiz<input id="aName" required maxlength="40" autocomplete="name"></label>' : '') +
      '<label>Telefon raqam<input id="aPhone" required inputmode="tel" placeholder="90 123 45 67" autocomplete="tel"></label>' +
      '<label>Parol' + (isReg ? ' (kamida 6 belgi)' : '') + '<input id="aPass" type="password" required minlength="6" autocomplete="' + (isReg ? 'new-password' : 'current-password') + '"></label>' +
      '<div id="aErr" class="alert" style="display:none"></div>' +
      '<button class="btn" type="submit">' + (isReg ? "Ro'yxatdan o'tish" : 'Kirish') + '</button></form>');
  }
  function authError(msg) { var e = $('aErr'); if (e) { e.textContent = msg; e.style.display = ''; } }
  function afterLogin() {
    var a = afterAuth; afterAuth = null; closeModal();
    if (a === 'checkout') checkout(); else if (a === 'profile') openProfile();
  }
  function submitAuth(form) {
    var phone = $('aPhone').value, pass = $('aPass').value;
    if (!MNZ.validPhone(phone)) { authError("Telefon raqamni to'g'ri kiriting (masalan: 90 123 45 67)"); return; }
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    var job = form.dataset.form === 'register'
      ? MNZ.register({ name: $('aName').value.trim(), phone: phone, password: pass })
      : MNZ.login(phone, pass);
    job.then(function (u) { user = u; updateBadges(); MNZ.toast('Xush kelibsiz, ' + (u.name || '') + '!'); afterLogin(); })
      .catch(function (e) { btn.disabled = false; authError(e.message || 'Xatolik'); });
  }

  /* ---------- buyurtma rasmiylashtirish ---------- */
  function checkout() {
    if (!cart.length) { MNZ.toast("Savat bo'sh", true); return; }
    if (!user) { afterAuth = 'checkout'; openAuth('login'); return; }
    closeDrawer(); receipt = ''; region = 'city';
    var c = calc('city');
    var lines = c.lines.map(function (l) {
      return '<div class="sumrow"><span>' + esc(l.p.name) + ' × ' + l.qty + (l.color ? ' · ' + esc(l.color) : '') + (l.size ? ' · ' + esc(l.size) : '') + '</span><span>' + money(l.sum) + '</span></div>';
    }).join('');
    function opt(v, txt, fee) { return '<option value="' + v + '">' + txt + (v === 'pickup' ? ' (bepul)' : ' (' + (fee ? '+' + money(fee) : 'bepul') + ')') + '</option>'; }
    setModal('<h2>Buyurtmani rasmiylashtirish</h2><form data-form="order" class="fgrid" style="margin-top:14px">' +
      '<div class="fgrid two"><label>Ismingiz<input id="ckName" required value="' + esc(user.name || '') + '"></label><label>Telefon<input id="ckPhone" required inputmode="tel" value="' + esc(MNZ.fmtPhone(user.phone)) + '"></label></div>' +
      '<label>Yetkazish usuli<select id="ckRegion">' + opt('city', 'Toshkent shahri', S.deliveryCity) + opt('region', 'Viloyat / boshqa shahar', S.deliveryRegion) + opt('pickup', "Do'kondan olib ketaman", 0) + '</select></label>' +
      '<label id="ckAddrWrap">Manzil<textarea id="ckAddr" placeholder="Tuman, ko\'cha, uy, mo\'ljal">' + esc(user.address || '') + '</textarea></label>' +
      '<label>Izoh (ixtiyoriy)<input id="ckNote" maxlength="200"></label>' +
      '<div style="border:1px solid var(--line);border-radius:12px;padding:14px;display:grid;gap:6px">' + lines +
      '<div class="sumrow"><span>Mahsulotlar</span><span>' + money(c.subtotal) + '</span></div>' +
      (c.discount ? '<div class="sumrow"><span>Chegirma</span><span>−' + money(c.discount) + '</span></div>' : '') +
      '<div class="sumrow"><span>Yetkazish</span><span id="ckDeliv"></span></div>' +
      '<div class="sumrow total"><span>Jami</span><b id="ckTotal"></b></div></div>' +
      '<div class="paybox"><div style="font-weight:700">💳 To\'lov (karta orqali)</div>' +
      '<div class="muted" style="font-size:.88rem">O\'tkazilishi kerak summa:</div><div class="amount" id="ckPay"></div>' +
      '<div class="cardnum"><span id="cardTxt">' + esc(S.cardNumber) + '</span><button type="button" data-act="copy-card">Nusxa</button></div>' +
      '<div><b>' + esc(S.cardHolder) + '</b>' + (S.bankName ? ' · ' + esc(S.bankName) : '') + '</div>' +
      '<ol class="steps"><li>Yuqoridagi summani shu kartaga o\'tkazing</li><li>To\'lov chekini (skrinshot) pastga yuklang</li><li>Buyurtmani yuboring — admin chekni tekshirib tasdiqlaydi</li></ol>' +
      (S.payNote ? '<div class="muted" style="font-size:.85rem">' + esc(S.payNote) + '</div>' : '') + '</div>' +
      '<label class="upload" for="ckFile"><div id="upTxt">📎 To\'lov chekini yuklash (rasm)</div><div id="upPrev"></div></label>' +
      '<input type="file" id="ckFile" accept="image/*" hidden>' +
      '<div id="ckErr" class="alert" style="display:none"></div>' +
      '<button class="btn" type="submit" id="ckSubmit">Buyurtmani yuborish</button></form>');
    updateCk();
  }
  function updateCk() {
    var rg = $('ckRegion').value; region = rg;
    var c = calc(rg);
    $('ckDeliv').textContent = c.delivery ? money(c.delivery) : 'Bepul';
    $('ckTotal').textContent = money(c.total); $('ckPay').textContent = money(c.total);
    $('ckAddrWrap').style.display = rg === 'pickup' ? 'none' : '';
  }
  function ckError(m) { var e = $('ckErr'); e.textContent = m; e.style.display = ''; e.scrollIntoView({ block: 'nearest' }); }

  function pickReceipt(file) {
    if (!file) return;
    MNZ.fileToDataUrl(file, 1000, 0.72).then(function (u) {
      if (u.length > 700000) return MNZ.fileToDataUrl(file, 800, 0.6);
      return u;
    }).then(function (u) {
      receipt = u;
      $('upTxt').textContent = '✅ Chek yuklandi (o\'zgartirish uchun bosing)';
      $('upPrev').innerHTML = '<img alt="Chek" src="' + u + '">';
    }).catch(function (e) { MNZ.toast(e.message || "Rasmni o'qib bo'lmadi", true); });
  }

  function submitOrder(form) {
    var name = $('ckName').value.trim(), phone = $('ckPhone').value, addr = $('ckAddr').value.trim();
    if (!name) return ckError('Ismingizni kiriting');
    if (!MNZ.validPhone(phone)) return ckError("Telefon raqamni to'g'ri kiriting");
    if (region !== 'pickup' && addr.length < 5) return ckError('Yetkazish manzilini kiriting');
    var c = calc(region);
    if (!c.lines.length) return ckError("Savat bo'sh");
    var out = c.lines.filter(function (l) { return !l.p.stock; })[0];
    if (out) return ckError('"' + out.p.name + '" tugagan. Savatdan olib tashlang.');
    if (!receipt) return ckError("To'lov chekini yuklang (rasm)");
    var order = {
      number: MNZ.orderNumber(), uid: user.uid, name: name, phone: MNZ.normPhone(phone),
      region: region, regionLabel: regionLabel(region), address: region === 'pickup' ? '' : addr, comment: $('ckNote').value.trim(),
      items: c.lines.map(function (l) { return { pid: l.p.id, name: l.p.name, price: l.p.price, qty: l.qty, size: l.size || '', color: l.color || '' }; }),
      subtotal: c.subtotal, discount: c.discount, promo: promoApplied ? promoApplied.code : '', delivery: c.delivery, total: c.total,
      receipt: receipt, status: 'pending', note: '', createdAt: Date.now()
    };
    var btn = $('ckSubmit'); btn.disabled = true; btn.textContent = 'Yuborilmoqda...';
    MNZ.createOrder(order).then(function () {
      if (region !== 'pickup' && addr && addr !== user.address) MNZ.saveProfile(user.uid, { address: addr }).catch(function () {});
      cart = []; promoApplied = null; receipt = ''; saveCart();
      setModal('<div class="okbox"><div class="big">✅</div><h2>Buyurtma qabul qilindi!</h2>' +
        '<p>Buyurtma raqami: <b style="color:var(--gold2)">' + esc(order.number) + '</b></p>' +
        '<p class="muted">To\'lov chekingiz adminga yuborildi. Tekshiruvdan so\'ng buyurtmangiz holati profilingizda yangilanadi.</p>' +
        '<button class="btn" data-act="open-profile">Buyurtmalarim</button>' +
        '<a class="btn ghost" target="_blank" rel="noopener" href="' + tg() + '?text=' + encodeURIComponent('Assalomu alaykum! Buyurtma ' + order.number + " bo'yicha to'lov qildim.") + '">Telegramda xabar berish</a></div>');
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Buyurtmani yuborish';
      ckError((e && e.message) || "Yuborib bo'lmadi. Internetni tekshirib qayta urinib ko'ring.");
    });
  }

  /* ---------- profil ---------- */
  function openProfile(tab) {
    if (!user) { afterAuth = 'profile'; openAuth('login'); return; }
    ptab = typeof tab === 'string' ? tab : 'orders';
    setModal('<h2>Salom, ' + esc(user.name || '') + ' 👋</h2><p class="muted" style="margin-bottom:12px">' + esc(MNZ.fmtPhone(user.phone)) + '</p>' +
      '<div class="tabs" style="margin:0 0 14px"><button class="tab' + (ptab === 'orders' ? ' active' : '') + '" data-act="ptab" data-t="orders">Buyurtmalarim</button>' +
      '<button class="tab' + (ptab === 'info' ? ' active' : '') + '" data-act="ptab" data-t="info">Ma\'lumotlarim</button>' +
      '<button class="tab" data-act="logout">Chiqish</button></div><div id="pBody"></div>');
    if (ptab === 'info') {
      $('pBody').innerHTML = '<form data-form="profile" class="fgrid"><label>Ism<input id="pfName" required value="' + esc(user.name || '') + '"></label>' +
        '<label>Telefon<input value="' + esc(MNZ.fmtPhone(user.phone)) + '" disabled></label>' +
        '<label>Yetkazish manzili<textarea id="pfAddr">' + esc(user.address || '') + '</textarea></label><button class="btn" type="submit">Saqlash</button></form>';
      return;
    }
    $('pBody').innerHTML = '<p class="muted">Yuklanmoqda...</p>';
    MNZ.myOrders(user.uid).then(function (list) {
      if (!$('pBody') || ptab !== 'orders') return;
      $('pBody').innerHTML = list.length ? '<div class="fgrid">' + list.map(function (o) {
        return '<div class="ocard"><div class="top"><b>№ ' + esc(o.number) + '</b>' + stBadge(o.status) + '</div>' +
          '<div class="muted" style="font-size:.82rem">' + dt(o.createdAt) + ' · ' + esc(o.regionLabel || '') + '</div>' +
          '<ul>' + (o.items || []).map(function (i) { return '<li>' + esc(i.name) + ' × ' + i.qty + (i.color ? ' · ' + esc(i.color) : '') + (i.size ? ' · ' + esc(i.size) : '') + '</li>'; }).join('') + '</ul>' +
          '<div class="sumrow total"><span>Jami</span><b>' + money(o.total) + '</b></div>' +
          (o.note ? '<div class="' + (o.status === 'rejected' || o.status === 'cancelled' ? 'alert' : 'muted') + '" style="font-size:.88rem">Admin: ' + esc(o.note) + '</div>' : '') + '</div>';
      }).join('') + '</div>' : '<div class="empty" style="padding:30px 0">Hali buyurtma yo\'q</div>';
    }).catch(function () { if ($('pBody')) $('pBody').innerHTML = '<div class="alert">Buyurtmalarni yuklab bo\'lmadi</div>'; });
  }

  function openFavs() {
    var list = favs.map(prod).filter(Boolean);
    setModal('<h2>Sevimlilar ♥</h2><div class="grid" style="margin-top:14px;grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">' +
      (list.length ? list.map(cardHtml).join('') : '<div class="empty">Sevimli mahsulotlar yo\'q</div>') + '</div>', 'wide-grid');
    $('modal').firstChild.style.width = 'min(820px,100%)';
  }

  function toggleFav(id) {
    var i = favs.indexOf(id);
    if (i >= 0) favs.splice(i, 1); else favs.push(id);
    saveFavs(); renderGrid();
    if ($('modal').classList.contains('open') && pm && pm.id === id && $('pmImg')) renderProduct();
  }

  /* ---------- hodisalar ---------- */
  var actions = {
    'cat': function (el) { activeCat = el.dataset.c; render(); },
    'cat-go': function (el) { activeCat = el.dataset.c; render(); $('catalog').scrollIntoView({ behavior: 'smooth' }); },
    'open-product': function (el) { openProduct(el.dataset.id); },
    'fav': function (el) { toggleFav(el.dataset.id); },
    'pimg': function (el) { pm.img = +el.dataset.i; renderProduct(); },
    'pcolor': function (el) { pm.color = el.dataset.v; var p = prod(pm.id), c = colorOf(p, pm.color); renderProduct(); },
    'psize': function (el) { pm.size = el.dataset.v; renderProduct(); },
    'pqty': function (el) { pm.qty = Math.max(1, Math.min(20, pm.qty + (+el.dataset.d))); renderProduct(); },
    'add-cart': function () { if (addToCart()) { closeModal(); MNZ.toast("Savatga qo'shildi ✓"); } },
    'buy-now': function () { if (addToCart()) { closeModal(); checkout(); } },
    'open-cart': function () { closeModal(); openCart(); },
    'open-favs': function () { closeDrawer(); openFavs(); },
    'open-profile': function () { closeDrawer(); openProfile(); },
    'close-modal': closeModal,
    'close-drawer': closeDrawer,
    'cq': function (el) { var it = cart[+el.dataset.i]; if (!it) return; it.qty = Math.max(1, Math.min(20, it.qty + (+el.dataset.d))); saveCart(); openCart(); },
    'crm': function (el) { cart.splice(+el.dataset.i, 1); saveCart(); openCart(); },
    'promo': applyPromo,
    'checkout': checkout,
    'auth-tab': function (el) { openAuth(el.dataset.t); },
    'ptab': function (el) { openProfile(el.dataset.t); },
    'logout': function () { MNZ.logout().then(function () { user = null; updateBadges(); closeModal(); MNZ.toast('Chiqdingiz'); }); },
    'copy-card': function () {
      var num = String(S.cardNumber).replace(/\s+/g, '');
      function ok() { MNZ.toast('Karta raqami nusxalandi'); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(num).then(ok, function () { window.prompt('Karta raqami:', num); });
      else window.prompt('Karta raqami:', num);
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el, e); return; }
    if (e.target === $('modal')) closeModal();
    if (e.target.closest('#menu a')) $('menu').classList.remove('open');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeModal(); closeDrawer(); $('lightbox').classList.remove('open'); } });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'ckRegion') updateCk();
    if (e.target.id === 'ckFile') pickReceipt(e.target.files[0]);
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-form]'); if (!f) return;
    e.preventDefault();
    var k = f.dataset.form;
    if (k === 'login' || k === 'register') submitAuth(f);
    else if (k === 'order') submitOrder(f);
    else if (k === 'profile') {
      MNZ.saveProfile(user.uid, { name: $('pfName').value.trim(), address: $('pfAddr').value.trim() })
        .then(function () { user.name = $('pfName').value.trim(); user.address = $('pfAddr').value.trim(); updateBadges(); MNZ.toast('Saqlandi'); })
        .catch(function (er) { MNZ.toast(er.message || 'Saqlanmadi', true); });
    }
  });

  $('burger').addEventListener('click', function () { $('menu').classList.toggle('open'); });
  $('search').addEventListener('input', function (e) { q = e.target.value.trim().toLowerCase(); renderGrid(); });
  $('sort').addEventListener('change', function (e) { sortBy = e.target.value; renderGrid(); });
  $('lead').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = "Yangi so'rov:\nIsm: " + $('lName').value + '\nTelefon: ' + $('lPhone').value + ($('lMsg').value ? '\nXabar: ' + $('lMsg').value : '');
    window.open(tg() + '?text=' + encodeURIComponent(t), '_blank');
    MNZ.toast('Telegram ochilmoqda...');
  });

  /* ---------- boshlash ---------- */
  if (MNZ.mode === 'demo' && MNZ.CFG.demoBanner !== false) {
    $('demoBar').innerHTML = '<div class="demo-bar">⚠️ DEMO rejim: buyurtmalar va profillar faqat shu brauzerda saqlanadi. Haqiqiy ishlash uchun Firebase ulang (SETUP.md).</div>';
  }
  updateBadges();
  Promise.all([MNZ.settings(), MNZ.products()]).then(function (r) {
    S = r[0]; P = r[1]; render();
  }).catch(function () { render(); MNZ.toast("Ma'lumotlarni yuklab bo'lmadi", true); });
  MNZ.onAuth(function (u) { user = u; updateBadges(); });
})();
