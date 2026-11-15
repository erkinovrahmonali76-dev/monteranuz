(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = MNZ.esc;
  var S = MNZ.normSettings(), P = [], O = [], U = [], PR = [], rawNull = false;
  var oFilter = 'all', oQ = '', lastPending = -1, timer = null;
  var fColors = [], fImages = [], editingId = null;
  var QUICK = [['Qora', '#1a1a1a'], ['Oq', '#f5f5f5'], ['Kulrang', '#6b6f76'], ["To'q ko'k", '#1f2a44'], ["Och ko'k", '#a9c7e8'], ['Jigarrang', '#5a3b26'], ['Bej', '#c8b08a'], ['Yashil', '#2f5d3a'], ['Zaytun', '#6b7048'], ['Qizil', '#a32a2a']];

  function money(n) { return MNZ.fmt(n, S.currency); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dt(ts) { var d = new Date(ts || 0); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function hx(c) { return /^#[0-9a-f]{3,8}$/i.test(c && c.hex) ? c.hex : '#888888'; }
  function stBadge(s) { var st = MNZ.STATUS[s] || { label: s, color: '#888' }; return '<span class="st" style="background:' + st.color + '">' + esc(st.label) + '</span>'; }
  function isPaid(o) { return !!MNZ.PAID[o.status]; }
  function errMsg(e) { return (e && (e.message || e.code)) || 'Xatolik'; }
  function short(n) { return n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n); }
  function safe(p, what) { return p.catch(function (e) { MNZ.toast(what + " yuklanmadi: " + errMsg(e) + (MNZ.mode === 'firebase' ? " (Firestore qoidalarini tekshiring)" : ''), true); return []; }); }

  /* ---------- kirish ---------- */
  if (MNZ.mode === 'demo') {
    $('emailWrap').style.display = 'none';
    $('loginHint').innerHTML = "DEMO rejim. Birinchi kirish paroli: <b>admin123</b> (Sozlamalar'da almashtiring).";
  } else {
    $('loginEmail').required = true;
    $('loginHint').textContent = "Firebase'da yaratgan admin hisobingiz (email + parol) bilan kiring.";
  }
  function loginErr(m) { $('loginErr').textContent = m; $('loginErr').style.display = ''; }

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault(); $('loginErr').style.display = 'none';
    var btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    MNZ.adminLogin($('loginEmail').value, $('loginPass').value)
      .then(showApp)
      .catch(function (er) { loginErr(errMsg(er)); $('loginPass').value = ''; })
      .then(function () { btn.disabled = false; });
  });
  $('logout').addEventListener('click', function () { MNZ.adminLogout().then(function () { location.reload(); }); });

  function showApp() {
    $('loginView').style.display = 'none'; $('appView').style.display = '';
    $('modeTag').textContent = MNZ.mode === 'demo' ? 'DEMO rejim' : 'Firebase';
    $('modeTag').style.background = MNZ.mode === 'demo' ? '#d9a441' : '#3fb27f';
    $('resetBtn').style.display = MNZ.mode === 'demo' ? '' : 'none';
    $('passHint').textContent = MNZ.mode === 'demo' ? '' : "Firebase rejimida parolni Firebase Console → Authentication orqali o'zgartiring.";
    $('backupHint').textContent = MNZ.mode === 'demo'
      ? "DEMO rejimda ma'lumot faqat shu brauzerda. data.json ni yuklab olib, GitHub'dagi data/data.json ga qo'ysangiz, hamma ko'radi. Haqiqiy buyurtmalar uchun Firebase ulang."
      : "Firebase rejimida ma'lumot bazada saqlanadi. Bu yerdagi fayl faqat zaxira nusxa uchun.";
    reloadAll().then(function () { clearInterval(timer); timer = setInterval(poll, 30000); });
  }

  /* ---------- yuklash ---------- */
  function reloadAll() {
    return Promise.all([
      MNZ.settings().catch(function () { return MNZ.normSettings(); }),
      safe(MNZ.productsRaw().then(function (l) { return l === null ? null : l; }), 'Mahsulotlar'),
      safe(MNZ.orders(), 'Buyurtmalar'), safe(MNZ.users(), 'Mijozlar'), safe(MNZ.promos(), 'Promokodlar')
    ]).then(function (r) {
      S = r[0]; O = r[2] || []; U = r[3] || []; PR = r[4] || [];
      var raw = r[1];
      rawNull = raw === null;
      if (rawNull && MNZ.mode === 'demo') return MNZ.products().then(function (l) { P = l; });
      P = Array.isArray(raw) ? raw : [];
    }).then(function () {
      lastPending = O.filter(function (o) { return o.status === 'pending'; }).length;
      renderAll();
    });
  }
  function poll() {
    MNZ.orders().then(function (l) {
      O = l; var np = O.filter(function (o) { return o.status === 'pending'; }).length;
      if (lastPending >= 0 && np > lastPending) MNZ.toast('🔔 Yangi buyurtma keldi!');
      lastPending = np; renderNewCnt();
      if ($('p-orders').classList.contains('active')) renderOrders();
      if ($('p-dash').classList.contains('active')) renderDash();
    }).catch(function () {});
  }
  function renderAll() { renderInit(); renderNewCnt(); renderDash(); renderOrders(); renderProducts(); renderCustomers(); renderPromos(); fillSettings(); }

  function renderInit() {
    var b = $('initBanner');
    if (MNZ.mode === 'firebase' && rawNull) {
      b.style.display = '';
      b.innerHTML = "Firebase bazasi hali bo'sh. Namunaviy mahsulotlar, sozlamalar va promokodni yuklaysizmi? <button class=\"btn sm\" data-act=\"seed\" style=\"margin-left:10px\">Namunaviy ma'lumotni yuklash</button>";
    } else if (MNZ.mode === 'demo') {
      b.style.display = '';
      b.innerHTML = "⚠️ <b>DEMO rejim:</b> mijozlar va buyurtmalar faqat shu brauzerda saqlanadi. Haqiqiy do'kon uchun Firebase ulang (SETUP.md).";
    } else b.style.display = 'none';
  }
  function renderNewCnt() {
    var n = O.filter(function (o) { return o.status === 'pending'; }).length;
    $('newCnt').textContent = n; $('newCnt').style.display = n ? '' : 'none';
    document.title = (n ? '(' + n + ') ' : '') + 'Admin panel — Monteranuz';
  }

  /* ---------- tablar ---------- */
  document.querySelector('.tabs').addEventListener('click', function (e) {
    var t = e.target.closest('.tab'); if (!t) return;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { b.classList.toggle('active', b === t); });
    Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) { p.classList.toggle('active', p.id === 'p-' + t.dataset.t); });
    if (t.dataset.t === 'dash') renderDash();
  });

  /* ---------- statistika ---------- */
  function renderDash() {
    var now = new Date(), today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var month0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    var paid = O.filter(isPaid);
    var sum = function (l) { return l.reduce(function (a, o) { return a + (o.total || 0); }, 0); };
    var kp = [
      [O.filter(function (o) { return o.status === 'pending'; }).length, 'Tekshirilishi kerak'],
      [O.filter(function (o) { return o.createdAt >= today0; }).length, 'Bugungi buyurtmalar'],
      [money(sum(paid.filter(function (o) { return o.createdAt >= today0; }))), 'Bugungi tushum'],
      [money(sum(paid.filter(function (o) { return o.createdAt >= month0; }))), 'Shu oy tushumi'],
      [money(sum(paid)), 'Jami tushum'],
      [U.length, 'Mijozlar'],
      [P.length, 'Mahsulotlar']
    ];
    $('kpis').innerHTML = kp.map(function (k) { return '<div class="kpi"><b>' + esc(k[0]) + '</b><span>' + k[1] + '</span></div>'; }).join('');

    var days = [], i;
    for (i = 6; i >= 0; i--) { var d0 = today0 - i * 86400000; days.push({ t: d0, label: pad(new Date(d0).getDate()) + '.' + pad(new Date(d0).getMonth() + 1), v: 0 }); }
    paid.forEach(function (o) { days.forEach(function (d) { if (o.createdAt >= d.t && o.createdAt < d.t + 86400000) d.v += o.total || 0; }); });
    var max = Math.max.apply(null, days.map(function (d) { return d.v; }).concat([1]));
    var bw = 56, gap = 22, h = 150, svg = '<svg viewBox="0 0 ' + (days.length * (bw + gap)) + ' ' + (h + 50) + '" width="100%" role="img" aria-label="Tushum grafigi">';
    days.forEach(function (d, k) {
      var bh = Math.round(d.v / max * h), x = k * (bw + gap) + gap / 2;
      svg += '<rect x="' + x + '" y="' + (h + 10 - bh) + '" width="' + bw + '" height="' + Math.max(bh, 2) + '" rx="6" fill="var(--gold)" opacity="' + (d.v ? 1 : 0.25) + '"/>' +
        '<text x="' + (x + bw / 2) + '" y="' + (h + 4 - bh) + '" text-anchor="middle" font-size="13" fill="var(--text)">' + (d.v ? short(d.v) : '') + '</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (h + 32) + '" text-anchor="middle" font-size="13" fill="var(--muted)">' + d.label + '</text>';
    });
    $('chart').innerHTML = svg + '</svg>';

    var cnt = {};
    paid.forEach(function (o) { (o.items || []).forEach(function (it) { cnt[it.name] = (cnt[it.name] || 0) + (it.qty || 0); }); });
    var top = Object.keys(cnt).map(function (n) { return [n, cnt[n]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
    var mx = top.length ? top[0][1] : 1;
    $('topList').innerHTML = top.length ? top.map(function (t) {
      return '<div class="bar-row"><span class="nm">' + esc(t[0]) + '</span><div style="width:80px"><div class="bar" style="width:' + Math.round(t[1] / mx * 100) + '%"></div></div><span class="ct">' + t[1] + '</span></div>';
    }).join('') : '<p class="muted">Tasdiqlangan buyurtmalar paydo bo\'lgach ko\'rinadi</p>';
  }

  /* ---------- buyurtmalar ---------- */
  function renderOrders() {
    var keys = ['all', 'pending', 'confirmed', 'shipping', 'delivered', 'rejected', 'cancelled'];
    $('oChips').innerHTML = keys.map(function (k) {
      var n = k === 'all' ? O.length : O.filter(function (o) { return o.status === k; }).length;
      return '<button class="chip' + (oFilter === k ? ' active' : '') + '" data-act="ofilter" data-k="' + k + '">' + (k === 'all' ? 'Hammasi' : MNZ.STATUS[k].label) + ' (' + n + ')</button>';
    }).join('');
    var ql = oQ.toLowerCase();
    var list = O.filter(function (o) {
      return (oFilter === 'all' || o.status === oFilter) && (!ql || (o.number + ' ' + o.name + ' ' + o.phone).toLowerCase().indexOf(ql) >= 0);
    });
    $('oRows').innerHTML = list.length ? list.map(function (o) {
      return '<tr><td><b>' + esc(o.number) + '</b></td><td>' + esc(o.name) + '<br><span class="muted">' + esc(MNZ.fmtPhone(o.phone)) + '</span></td><td>' + money(o.total) + '</td><td>' + stBadge(o.status) + '</td><td>' + dt(o.createdAt) + '</td>' +
        '<td><button class="btn ' + (o.status === 'pending' ? '' : 'ghost') + ' sm" data-act="oview" data-id="' + esc(o.id) + '">' + (o.status === 'pending' ? 'Tekshirish' : "Ko'rish") + '</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Buyurtma yo\'q</td></tr>';
  }
  $('oSearch').addEventListener('input', function (e) { oQ = e.target.value.trim(); renderOrders(); });
  $('oReload').addEventListener('click', function () { reloadAll().then(function () { MNZ.toast('Yangilandi'); }); });

  function openOrder(id) {
    var o = O.filter(function (x) { return x.id === id; })[0]; if (!o) return;
    var acts = '';
    if (o.status === 'pending') acts += '<button class="btn" data-act="ost" data-s="confirmed" data-id="' + esc(id) + '">✅ To\'lovni tasdiqlash</button><button class="btn danger" data-act="ost" data-s="rejected" data-id="' + esc(id) + '">❌ Rad etish</button>';
    if (o.status === 'confirmed') acts += '<button class="btn" data-act="ost" data-s="shipping" data-id="' + esc(id) + '">🚚 Yo\'lga chiqdi</button>';
    if (o.status === 'shipping') acts += '<button class="btn" data-act="ost" data-s="delivered" data-id="' + esc(id) + '">📦 Yetkazildi</button>';
    if (o.status === 'pending' || o.status === 'confirmed' || o.status === 'shipping') acts += '<button class="btn danger" data-act="ost" data-s="cancelled" data-id="' + esc(id) + '">Bekor qilish</button>';
    if (o.status === 'rejected' || o.status === 'cancelled') acts += '<button class="btn ghost" data-act="ost" data-s="pending" data-id="' + esc(id) + '">↩ Qayta tekshirishga qaytarish</button>';
    var items = (o.items || []).map(function (i) {
      return '<tr><td>' + esc(i.name) + (i.color ? '<br><span class="muted">' + esc(i.color) + (i.size ? ' · ' + esc(i.size) : '') + '</span>' : (i.size ? '<br><span class="muted">' + esc(i.size) + '</span>' : '')) + '</td><td>' + i.qty + '</td><td>' + money(i.price * i.qty) + '</td></tr>';
    }).join('');
    $('modal').innerHTML = '<div class="mbox"><button class="close" data-act="close-modal">✕</button>' +
      '<h2>Buyurtma № ' + esc(o.number) + '</h2><div style="margin:6px 0 14px">' + stBadge(o.status) + ' <span class="muted" style="margin-left:8px">' + dt(o.createdAt) + '</span></div>' +
      '<div class="box-s" style="margin-bottom:12px"><b>' + esc(o.name) + '</b> · <a href="tel:+' + esc(o.phone) + '" style="color:var(--gold2)">' + esc(MNZ.fmtPhone(o.phone)) + '</a><br>' +
      '<span class="muted">' + esc(o.regionLabel || '') + '</span>' + (o.address ? '<br>📍 ' + esc(o.address) : '') + (o.comment ? '<br>💬 ' + esc(o.comment) : '') + '</div>' +
      '<table class="mini-t"><thead><tr><th>Mahsulot</th><th>Soni</th><th>Summa</th></tr></thead><tbody>' + items + '</tbody></table>' +
      '<div class="sumrow" style="margin-top:8px"><span>Mahsulotlar</span><span>' + money(o.subtotal) + '</span></div>' +
      (o.discount ? '<div class="sumrow"><span>Chegirma' + (o.promo ? ' (' + esc(o.promo) + ')' : '') + '</span><span>−' + money(o.discount) + '</span></div>' : '') +
      '<div class="sumrow"><span>Yetkazish</span><span>' + (o.delivery ? money(o.delivery) : 'Bepul') + '</span></div>' +
      '<div class="sumrow total"><span>Mijoz to\'lashi kerak</span><b>' + money(o.total) + '</b></div>' +
      '<h3 style="margin:16px 0 4px">To\'lov cheki</h3><div class="muted" style="font-size:.85rem">Chekdagi summa <b>' + money(o.total) + '</b> ga va karta egasiga (' + esc(S.cardHolder) + ') mosligini tekshiring.</div>' +
      (o.receipt ? '<img class="rec" data-act="zoom" src="' + esc(o.receipt) + '" alt="Chek"><br><a class="link" download="chek-' + esc(o.number) + '.jpg" href="' + esc(o.receipt) + '">⬇ Chekni yuklab olish</a>' : '<p class="muted">Chek yuklanmagan</p>') +
      '<label style="margin-top:14px">Mijozga izoh (profilida ko\'rinadi; rad etishda sababini yozing)<textarea id="oNote">' + esc(o.note || '') + '</textarea></label>' +
      '<div class="st-actions">' + acts + '<button class="btn ghost" data-act="onote" data-id="' + esc(id) + '">Izohni saqlash</button></div></div>';
    $('modal').classList.add('open'); document.body.style.overflow = 'hidden';
  }
  function closeModal() { $('modal').classList.remove('open'); $('modal').innerHTML = ''; document.body.style.overflow = ''; }

  function setStatus(id, s) {
    var note = ($('oNote') ? $('oNote').value : '').trim();
    if (s === 'rejected' && !note) { MNZ.toast("Rad etish sababini izohga yozing", true); $('oNote').focus(); return; }
    if (s === 'cancelled' && !confirm('Buyurtma bekor qilinsinmi?')) return;
    MNZ.updateOrder(id, { status: s, note: note }).then(function () {
      O = O.map(function (o) { return o.id === id ? Object.assign(o, { status: s, note: note }) : o; });
      MNZ.toast('Holat: ' + MNZ.STATUS[s].label); closeModal(); renderNewCnt(); renderOrders(); renderDash(); renderCustomers();
    }).catch(function (e) { MNZ.toast('Saqlanmadi: ' + errMsg(e), true); });
  }

  /* ---------- mahsulotlar ---------- */
  function renderProducts() {
    var q = $('aSearch').value.trim().toLowerCase();
    var list = P.filter(function (p) { return !q || (p.name + ' ' + p.category).toLowerCase().indexOf(q) >= 0; });
    $('rows').innerHTML = list.length ? list.map(function (p) {
      var dots = (p.colors || []).slice(0, 6).map(function (c) { return '<i style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + hx(c) + ';border:1px solid rgba(255,255,255,.3);margin-right:3px"></i>'; }).join('');
      return '<tr><td><img alt="" src="' + esc((p.images && p.images[0]) || MNZ.placeholder(p.name)) + '"></td>' +
        '<td><b>' + esc(p.name) + '</b>' + (p.featured ? ' <span class="badge" style="position:static;margin-left:6px">TOP</span>' : '') + (p.isNew ? ' <span class="badge new" style="position:static;margin-left:4px">YANGI</span>' : '') + '<br>' + dots + '</td>' +
        '<td>' + esc(p.category) + '</td>' +
        '<td>' + money(p.price) + (p.oldPrice > p.price ? '<br><s class="muted">' + money(p.oldPrice) + '</s>' : '') + '</td>' +
        '<td><button class="chip" data-act="pstock" data-id="' + esc(p.id) + '">' + (p.stock ? '✅ Sotuvda' : '⛔ Tugagan') + '</button></td>' +
        '<td><div class="acts"><button class="btn ghost sm" data-act="pedit" data-id="' + esc(p.id) + '">Tahrirlash</button><button class="btn ghost sm" data-act="pdup" data-id="' + esc(p.id) + '" title="Nusxa">⧉</button><button class="btn danger sm" data-act="pdel" data-id="' + esc(p.id) + '">O\'chirish</button></div></td></tr>';
    }).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Mahsulot yo\'q</td></tr>';
  }
  $('aSearch').addEventListener('input', renderProducts);
  $('addBtn').addEventListener('click', function () { openForm(null); });

  function catOptions() {
    var set = {}; MNZ.CATEGORIES.forEach(function (c) { set[c] = 1; }); P.forEach(function (p) { if (p.category) set[p.category] = 1; });
    return Object.keys(set);
  }

  function openForm(p) {
    editingId = p ? p.id : null;
    fColors = p ? p.colors.map(function (c) { return { name: c.name, hex: hx(c) }; }) : [];
    fImages = p ? (p.images || []).slice() : [];
    $('modal').innerHTML = '<div class="mbox" style="width:min(720px,100%)"><button class="close" data-act="close-modal">✕</button>' +
      '<h2 style="margin-bottom:16px">' + (p ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot') + '</h2>' +
      '<form data-form="product" class="form-grid">' +
      '<label class="full">Nomi<input id="fName" required maxlength="80" value="' + esc(p ? p.name : '') + '"></label>' +
      '<label>Toifa<input id="fCat" list="catList" required placeholder="Masalan: Ko\'ylaklar" value="' + esc(p ? p.category : '') + '"><datalist id="catList">' + catOptions().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></label>' +
      '<label>O\'lchamlar (vergul bilan)<input id="fSizes" placeholder="S, M, L, XL" value="' + esc(p ? p.sizes.join(', ') : '') + '"></label>' +
      '<label>Narxi<input id="fPrice" type="number" min="0" step="1000" required value="' + (p ? p.price : '') + '"></label>' +
      '<label>Eski narx (chegirma ko\'rsatish uchun)<input id="fOld" type="number" min="0" step="1000" value="' + (p && p.oldPrice ? p.oldPrice : '') + '"></label>' +
      '<label class="full">Tavsif<textarea id="fDesc">' + esc(p ? p.desc : '') + '</textarea></label>' +
      '<div class="full"><div class="opt-title">Ranglar</div><div id="colBox"></div>' +
      '<div class="acts" style="flex-wrap:wrap;margin-top:6px" id="quickCols"></div>' +
      '<button type="button" class="btn ghost sm" data-act="addcol" style="margin-top:8px">+ Rang qo\'shish</button></div>' +
      '<div class="full"><div class="opt-title">Rasmlar (eng ko\'pi 4 ta, birinchisi asosiy)</div><div class="imgs" id="imgBox"></div>' +
      '<div class="form-grid" style="margin-top:10px"><label>Fayldan yuklash<input type="file" id="fFile" accept="image/*" multiple></label>' +
      '<label>yoki havola (URL)<div class="row" style="flex-wrap:nowrap"><input id="fUrl" placeholder="https://..."><button type="button" class="btn ghost sm" data-act="addurl">Qo\'shish</button></div></label></div></div>' +
      '<label class="check"><input type="checkbox" id="fStock"' + (!p || p.stock ? ' checked' : '') + '> Sotuvda bor</label>' +
      '<label class="check"><input type="checkbox" id="fFeat"' + (p && p.featured ? ' checked' : '') + '> Tavsiya etilgan (TOP)</label>' +
      '<label class="check"><input type="checkbox" id="fNew"' + (p && p.isNew ? ' checked' : '') + '> Yangi (YANGI belgisi)</label>' +
      '<div class="full"><button class="btn" type="submit">Saqlash</button></div></form></div>';
    $('modal').classList.add('open'); document.body.style.overflow = 'hidden';
    renderCols(); renderImgs();
    $('quickCols').innerHTML = QUICK.map(function (c, i) {
      return '<button type="button" class="chip" data-act="quickcol" data-i="' + i + '"><i style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + c[1] + ';border:1px solid rgba(255,255,255,.3);margin-right:6px"></i>' + esc(c[0]) + '</button>';
    }).join('');
  }
  function renderCols() {
    $('colBox').innerHTML = fColors.length ? fColors.map(function (c, i) {
      return '<div class="colrow"><input type="color" value="' + hx(c).slice(0, 7) + '" data-ci="' + i + '" data-f="hex"><input type="text" placeholder="Rang nomi" value="' + esc(c.name) + '" data-ci="' + i + '" data-f="name" maxlength="24"><button type="button" class="btn danger sm" data-act="rmcol" data-i="' + i + '">✕</button></div>';
    }).join('') : '<p class="muted" style="font-size:.85rem">Rang yo\'q. Pastdagi tayyor ranglardan tanlang yoki o\'zingiz qo\'shing.</p>';
  }
  function renderImgs() {
    $('imgBox').innerHTML = fImages.length ? fImages.map(function (u, i) {
      return '<div class="im"><img alt="" src="' + esc(u) + '"><button type="button" data-act="rmimg" data-i="' + i + '">✕</button></div>';
    }).join('') : '<p class="muted" style="font-size:.85rem">Rasm yo\'q (chiroyli joy egasi ko\'rinadi)</p>';
  }

  function saveProductForm() {
    var price = Number($('fPrice').value) || 0, old = Number($('fOld').value) || 0;
    var colors = fColors.filter(function (c) { return c.name.trim(); }).map(function (c) { return { name: c.name.trim(), hex: c.hex }; });
    var prev = P.filter(function (x) { return x.id === editingId; })[0];
    var item = {
      id: editingId || ('p' + Date.now().toString(36)),
      name: $('fName').value.trim(), category: $('fCat').value.trim(), price: price, oldPrice: old > price ? old : 0,
      sizes: $('fSizes').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean), colors: colors,
      images: fImages.slice(), desc: $('fDesc').value.trim(),
      stock: $('fStock').checked, featured: $('fFeat').checked, isNew: $('fNew').checked,
      createdAt: prev && prev.createdAt ? prev.createdAt : Date.now()
    };
    if (!item.name || !item.category) { MNZ.toast('Nomi va toifani kiriting', true); return; }
    var size = item.images.reduce(function (a, u) { return a + u.length; }, 0);
    if (MNZ.mode === 'firebase' && size > 850000) { MNZ.toast("Rasmlar juda og'ir. Kamroq rasm yuklang yoki URL ishlating.", true); return; }
    MNZ.saveProduct(item).then(function () {
      var i = P.map(function (x) { return x.id; }).indexOf(item.id);
      if (i >= 0) P[i] = MNZ.normProduct(item); else P.unshift(MNZ.normProduct(item));
      rawNull = false; MNZ.toast(editingId ? 'Yangilandi' : "Qo'shildi"); closeModal(); renderProducts(); renderInit(); renderDash();
    }).catch(function (e) { MNZ.toast('Saqlanmadi: ' + errMsg(e), true); });
  }

  /* ommaviy narx */
  function openBulk() {
    $('modal').innerHTML = '<div class="mbox"><button class="close" data-act="close-modal">✕</button><h2>Ommaviy narx o\'zgartirish</h2>' +
      '<p class="muted" style="margin:6px 0 14px">Tanlangan toifadagi barcha mahsulot narxlarini foizga o\'zgartiring. Manfiy son = chegirma.</p>' +
      '<form data-form="bulk" class="fgrid"><label>Toifa<select id="bCat"><option value="">Hamma mahsulotlar</option>' + catOptions().map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label>Foiz (masalan: -10 yoki 15)<input id="bPct" type="number" step="1" min="-90" max="300" required></label>' +
      '<label class="check"><input type="checkbox" id="bRound" checked> 1000 ga yaxlitlash</label>' +
      '<label class="check"><input type="checkbox" id="bOld" checked> Chegirmada eski narxni ko\'rsatish</label>' +
      '<button class="btn" type="submit">Qo\'llash</button></form></div>';
    $('modal').classList.add('open'); document.body.style.overflow = 'hidden';
  }
  function applyBulk() {
    var cat = $('bCat').value, pct = Number($('bPct').value);
    if (!pct) { MNZ.toast('Foizni kiriting', true); return; }
    var changed = [];
    P.forEach(function (p) {
      if (cat && p.category !== cat) return;
      var np = p.price * (1 + pct / 100);
      if ($('bRound').checked) np = Math.round(np / 1000) * 1000; else np = Math.round(np);
      np = Math.max(1000, np);
      var q = Object.assign({}, p, { price: np });
      if (pct < 0 && $('bOld').checked) q.oldPrice = p.oldPrice > p.price ? p.oldPrice : p.price;
      if (pct > 0) q.oldPrice = 0;
      changed.push(MNZ.normProduct(q));
    });
    if (!changed.length) { MNZ.toast('Mahsulot topilmadi', true); return; }
    if (!confirm(changed.length + ' ta mahsulot narxi ' + (pct > 0 ? '+' : '') + pct + '% ga o\'zgaradi. Davom etasizmi?')) return;
    MNZ.saveProducts(changed).then(function () {
      changed.forEach(function (c) { var i = P.map(function (x) { return x.id; }).indexOf(c.id); if (i >= 0) P[i] = c; });
      MNZ.toast(changed.length + ' ta narx yangilandi'); closeModal(); renderProducts();
    }).catch(function (e) { MNZ.toast('Saqlanmadi: ' + errMsg(e), true); });
  }
  $('bulkBtn').addEventListener('click', openBulk);

  /* ---------- mijozlar ---------- */
  function renderCustomers() {
    var agg = {};
    O.forEach(function (o) { var a = agg[o.uid] || (agg[o.uid] = { n: 0, sum: 0 }); a.n++; if (isPaid(o)) a.sum += o.total || 0; });
    var list = U.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    $('cRows').innerHTML = list.length ? list.map(function (u) {
      var a = agg[u.uid] || { n: 0, sum: 0 };
      return '<tr><td><b>' + esc(u.name) + '</b></td><td><a href="tel:+' + esc(MNZ.normPhone(u.phone)) + '" style="color:var(--gold2)">' + esc(MNZ.fmtPhone(u.phone)) + '</a></td><td>' + a.n + '</td><td>' + money(a.sum) + '</td><td>' + (u.createdAt ? dt(u.createdAt) : '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:30px">Hali mijoz yo\'q</td></tr>';
  }

  /* ---------- promokodlar ---------- */
  function renderPromos() {
    $('prRows').innerHTML = PR.length ? PR.map(function (p) {
      return '<tr><td><b>' + esc(p.code) + '</b></td><td>' + (p.type === 'amount' ? money(p.value) : p.value + '%') + '</td><td>' + (p.min ? money(p.min) : '—') + '</td><td>' + (p.active === false ? '⛔ O\'chiq' : '✅ Faol') + '</td>' +
        '<td><div class="acts"><button class="btn ghost sm" data-act="predit" data-c="' + esc(p.code) + '">Tahrirlash</button><button class="btn danger sm" data-act="prdel" data-c="' + esc(p.code) + '">O\'chirish</button></div></td></tr>';
    }).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:30px">Promokod yo\'q</td></tr>';
  }
  $('promoForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = { code: $('prCode').value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ''), type: $('prType').value, value: Number($('prValue').value) || 0, min: Number($('prMin').value) || 0, active: $('prActive').checked };
    if (!p.code || p.value <= 0) { MNZ.toast("Kod va qiymatni to'g'ri kiriting", true); return; }
    if (p.type === 'percent' && p.value > 90) { MNZ.toast('Foiz 90 dan oshmasin', true); return; }
    MNZ.savePromo(p).then(function () {
      PR = PR.filter(function (x) { return x.code !== p.code; }); PR.push(p); renderPromos(); $('promoForm').reset(); $('prActive').checked = true; MNZ.toast('Promokod saqlandi');
    }).catch(function (er) { MNZ.toast('Saqlanmadi: ' + errMsg(er), true); });
  });

  /* ---------- sozlamalar ---------- */
  function fillSettings() {
    var s = S;
    $('sBrand').value = s.brand; $('sCur').value = s.currency; $('sPhone').value = s.phone; $('sTg').value = s.telegram; $('sIg').value = s.instagram;
    $('sHours').value = s.hours; $('sAddr').value = s.address; $('sHT').value = s.heroTitle; $('sHX').value = s.heroText;
    $('sCard').value = s.cardNumber; $('sHolder').value = s.cardHolder; $('sBank').value = s.bankName; $('sPayNote').value = s.payNote;
    $('sDC').value = s.deliveryCity; $('sDR').value = s.deliveryRegion; $('sFree').value = s.freeFrom;
  }
  $('setForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var s = Object.assign({}, S, {
      brand: $('sBrand').value.trim() || 'MONTERANUZ', currency: $('sCur').value.trim() || "so'm", phone: $('sPhone').value.trim(),
      telegram: $('sTg').value.trim().replace(/^@/, ''), instagram: $('sIg').value.trim().replace(/^@/, ''), hours: $('sHours').value.trim(),
      address: $('sAddr').value.trim(), heroTitle: $('sHT').value.trim(), heroText: $('sHX').value.trim(),
      cardNumber: $('sCard').value.trim(), cardHolder: $('sHolder').value.trim().toUpperCase(), bankName: $('sBank').value.trim(), payNote: $('sPayNote').value.trim(),
      deliveryCity: Number($('sDC').value) || 0, deliveryRegion: Number($('sDR').value) || 0, freeFrom: Number($('sFree').value) || 0
    });
    MNZ.saveSettings(s).then(function () { S = MNZ.normSettings(s); rawNull = false; MNZ.toast('Sozlamalar saqlandi'); renderInit(); renderAll(); })
      .catch(function (er) { MNZ.toast('Saqlanmadi: ' + errMsg(er), true); });
  });
  $('passForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var a = $('np1').value, b = $('np2').value;
    if (a.length < 6) { MNZ.toast("Parol kamida 6 belgi bo'lsin", true); return; }
    if (a !== b) { MNZ.toast('Parollar mos emas', true); return; }
    MNZ.changeAdminPass(a).then(function () { $('np1').value = ''; $('np2').value = ''; MNZ.toast('Parol yangilandi'); })
      .catch(function (er) { MNZ.toast(errMsg(er), true); });
  });
  $('exportBtn').addEventListener('click', function () {
    MNZ.exportAll().then(function (d) {
      var blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'data.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      MNZ.toast('data.json yuklab olindi');
    });
  });
  $('importFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return; var inp = this;
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result); if (!j || !Array.isArray(j.products)) throw new Error('bad');
        MNZ.importAll(j).then(reloadAll).then(function () { MNZ.toast('Tiklandi'); }).catch(function (er) { MNZ.toast(errMsg(er), true); });
      } catch (er) { MNZ.toast("Fayl noto'g'ri formatda", true); }
      inp.value = '';
    };
    r.readAsText(f);
  });
  $('resetBtn').addEventListener('click', function () {
    if (!confirm("Brauzerdagi demo mahsulot, sozlama va promokodlar o'chirilsinmi?")) return;
    MNZ.clearDemo().then(reloadAll).then(function () { MNZ.toast("Tozalandi"); });
  });

  /* ---------- umumiy hodisalar ---------- */
  var actions = {
    'close-modal': closeModal,
    'ofilter': function (el) { oFilter = el.dataset.k; renderOrders(); },
    'oview': function (el) { openOrder(el.dataset.id); },
    'ost': function (el) { setStatus(el.dataset.id, el.dataset.s); },
    'onote': function (el) {
      var note = $('oNote').value.trim();
      MNZ.updateOrder(el.dataset.id, { note: note }).then(function () {
        O = O.map(function (o) { return o.id === el.dataset.id ? Object.assign(o, { note: note }) : o; }); MNZ.toast('Izoh saqlandi');
      }).catch(function (e) { MNZ.toast(errMsg(e), true); });
    },
    'zoom': function (el) { $('lightbox').firstChild.src = el.src; $('lightbox').classList.add('open'); },
    'pedit': function (el) { openForm(P.filter(function (p) { return p.id === el.dataset.id; })[0]); },
    'pdup': function (el) {
      var p = P.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!p) return;
      var c = MNZ.normProduct(Object.assign({}, p, { id: 'p' + Date.now().toString(36), name: p.name + ' (nusxa)', createdAt: Date.now() }));
      MNZ.saveProduct(c).then(function () { P.unshift(c); renderProducts(); MNZ.toast('Nusxa yaratildi'); }).catch(function (e) { MNZ.toast(errMsg(e), true); });
    },
    'pstock': function (el) {
      var p = P.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!p) return;
      var c = Object.assign({}, p, { stock: !p.stock });
      MNZ.saveProduct(c).then(function () { p.stock = c.stock; renderProducts(); }).catch(function (e) { MNZ.toast(errMsg(e), true); });
    },
    'pdel': function (el) {
      var p = P.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!p) return;
      if (!confirm('"' + p.name + '" o\'chirilsinmi?')) return;
      MNZ.deleteProduct(p.id).then(function () { P = P.filter(function (x) { return x.id !== p.id; }); renderProducts(); renderDash(); MNZ.toast("O'chirildi"); }).catch(function (e) { MNZ.toast(errMsg(e), true); });
    },
    'addcol': function () { fColors.push({ name: '', hex: '#1a1a1a' }); renderCols(); },
    'quickcol': function (el) {
      var c = QUICK[+el.dataset.i];
      if (fColors.some(function (x) { return x.name === c[0]; })) { MNZ.toast('Bu rang bor'); return; }
      fColors.push({ name: c[0], hex: c[1] }); renderCols();
    },
    'rmcol': function (el) { fColors.splice(+el.dataset.i, 1); renderCols(); },
    'rmimg': function (el) { fImages.splice(+el.dataset.i, 1); renderImgs(); },
    'addurl': function () {
      var u = $('fUrl').value.trim();
      if (!/^https?:\/\//i.test(u)) { MNZ.toast("To'liq havola kiriting (https://...)", true); return; }
      if (fImages.length >= 4) { MNZ.toast('Eng ko\'pi 4 ta rasm', true); return; }
      fImages.push(u); $('fUrl').value = ''; renderImgs();
    },
    'predit': function (el) {
      var p = PR.filter(function (x) { return x.code === el.dataset.c; })[0]; if (!p) return;
      $('prCode').value = p.code; $('prType').value = p.type; $('prValue').value = p.value; $('prMin').value = p.min || 0; $('prActive').checked = p.active !== false;
      $('p-promos').scrollIntoView({ behavior: 'smooth' });
    },
    'prdel': function (el) {
      if (!confirm('Promokod o\'chirilsinmi?')) return;
      MNZ.deletePromo(el.dataset.c).then(function () { PR = PR.filter(function (x) { return x.code !== el.dataset.c; }); renderPromos(); }).catch(function (e) { MNZ.toast(errMsg(e), true); });
    },
    'seed': function (el) {
      el.disabled = true;
      MNZ.loadSeed().then(function (d) { return MNZ.importAll(d); }).then(reloadAll).then(function () { MNZ.toast("Namunaviy ma'lumot yuklandi"); })
        .catch(function (e) { el.disabled = false; MNZ.toast(errMsg(e), true); });
    }
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (el && actions[el.dataset.act]) { actions[el.dataset.act](el, e); return; }
    if (e.target === $('modal')) closeModal();
  });
  $('lightbox').addEventListener('click', function () { $('lightbox').classList.remove('open'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeModal(); $('lightbox').classList.remove('open'); } });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.ci !== undefined) { var c = fColors[+t.dataset.ci]; if (c) c[t.dataset.f] = t.value; }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id !== 'fFile') return;
    var files = Array.prototype.slice.call(e.target.files || []);
    var room = 4 - fImages.length;
    if (room <= 0) { MNZ.toast("Eng ko'pi 4 ta rasm", true); e.target.value = ''; return; }
    Promise.all(files.slice(0, room).map(function (f) { return MNZ.fileToDataUrl(f, 700, 0.75); })).then(function (urls) {
      urls.forEach(function (u) { fImages.push(u); }); renderImgs(); e.target.value = '';
    }).catch(function (er) { MNZ.toast(errMsg(er), true); });
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-form]'); if (!f) return;
    e.preventDefault();
    if (f.dataset.form === 'product') saveProductForm();
    else if (f.dataset.form === 'bulk') applyBulk();
  });

  /* boshlash */
  MNZ.adminCheck().then(function (ok) { if (ok) showApp(); });
})();
