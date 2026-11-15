(function () {
  var $ = function (id) { return document.getElementById(id); };
  var SESSION = 'mnz_admin_ok';
  var data = null;      // { settings, products }
  var editingId = null;
  var imageData = '';   // joriy rasm (dataURL yoki URL)

  /* ---------- kirish ---------- */
  function isLogged() { try { return sessionStorage.getItem(SESSION) === '1'; } catch (e) { return false; } }

  function showApp() {
    $('loginView').style.display = 'none';
    $('appView').style.display = '';
    MNZ.load().then(function (res) {
      data = res.data;
      // birinchi marta ochilganda qoralamani boshlaymiz
      renderAll();
    });
  }

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    MNZ.checkPass($('loginPass').value).then(function (ok) {
      if (ok) { try { sessionStorage.setItem(SESSION, '1'); } catch (x) {} showApp(); }
      else { MNZ.toast("Parol noto'g'ri", true); $('loginPass').value = ''; }
    });
  });
  $('logout').addEventListener('click', function () {
    try { sessionStorage.removeItem(SESSION); } catch (e) {}
    location.reload();
  });

  /* ---------- tablar ---------- */
  document.querySelector('.tabs').addEventListener('click', function (e) {
    var t = e.target.closest('.tab'); if (!t) return;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { b.classList.toggle('active', b === t); });
    Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) { p.classList.toggle('active', p.id === 'p-' + t.dataset.t); });
  });

  /* ---------- saqlash ---------- */
  function persist(okMsg) {
    if (MNZ.save(data)) { if (okMsg) MNZ.toast(okMsg); return true; }
    MNZ.toast("Saqlab bo'lmadi: xotira to'ldi. Rasmlarni kichikroq qiling yoki URL ishlating.", true);
    return false;
  }

  /* ---------- mahsulotlar ro'yxati ---------- */
  function renderAll() { renderKpis(); renderRows(); renderCats(); fillSettings(); }

  function renderKpis() {
    var P = data.products;
    var cats = {}; P.forEach(function (p) { cats[p.category] = 1; });
    $('kTotal').textContent = P.length;
    $('kStock').textContent = P.filter(function (p) { return p.stock; }).length;
    $('kOut').textContent = P.filter(function (p) { return !p.stock; }).length;
    $('kCats').textContent = Object.keys(cats).length;
  }

  function renderCats() {
    var set = {}; MNZ.CATEGORIES.forEach(function (c) { set[c] = 1; });
    data.products.forEach(function (p) { if (p.category) set[p.category] = 1; });
    $('catList').innerHTML = Object.keys(set).map(function (c) { return '<option value="' + MNZ.esc(c) + '">'; }).join('');
  }

  function renderRows() {
    var q = $('aSearch').value.trim().toLowerCase();
    var list = data.products.filter(function (p) { return !q || (p.name + ' ' + p.category).toLowerCase().indexOf(q) >= 0; });
    if (!list.length) { $('rows').innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Mahsulot yo\'q</td></tr>'; return; }
    $('rows').innerHTML = list.map(function (p) {
      return '<tr data-id="' + MNZ.esc(p.id) + '">' +
        '<td><img alt="" src="' + MNZ.esc(p.image || MNZ.placeholder(p.name)) + '"></td>' +
        '<td><b>' + MNZ.esc(p.name) + '</b>' + (p.featured ? ' <span class="badge" style="position:static;margin-left:6px">TOP</span>' : '') + '</td>' +
        '<td>' + MNZ.esc(p.category) + '</td>' +
        '<td>' + MNZ.fmt(p.price, data.settings.currency) + (p.oldPrice > p.price ? '<br><s class="muted">' + MNZ.fmt(p.oldPrice, data.settings.currency) + '</s>' : '') + '</td>' +
        '<td><button class="chip" data-a="stock">' + (p.stock ? '✅ Sotuvda' : '⛔ Tugagan') + '</button></td>' +
        '<td><div class="acts"><button class="btn ghost sm" data-a="edit">Tahrirlash</button><button class="btn danger sm" data-a="del">O\'chirish</button></div></td></tr>';
    }).join('');
  }

  $('aSearch').addEventListener('input', renderRows);

  $('rows').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var tr = b.closest('tr'); var id = tr.dataset.id;
    var p = data.products.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    if (b.dataset.a === 'edit') openForm(p);
    if (b.dataset.a === 'stock') { p.stock = !p.stock; if (persist()) { renderKpis(); renderRows(); } }
    if (b.dataset.a === 'del') {
      if (confirm('"' + p.name + '" o\'chirilsinmi?')) {
        data.products = data.products.filter(function (x) { return x.id !== id; });
        if (persist("O'chirildi")) renderAll();
      }
    }
  });

  /* ---------- mahsulot formasi ---------- */
  function setPreview(src, name) { $('fPrev').src = src || MNZ.placeholder(name || 'M'); }

  function openForm(p) {
    editingId = p ? p.id : null;
    $('pTitle').textContent = p ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot';
    $('fName').value = p ? p.name : '';
    $('fCat').value = p ? p.category : '';
    $('fSizes').value = p ? (p.sizes || []).join(', ') : '';
    $('fPrice').value = p ? p.price : '';
    $('fOld').value = p && p.oldPrice ? p.oldPrice : '';
    $('fDesc').value = p ? (p.desc || '') : '';
    $('fStock').checked = p ? !!p.stock : true;
    $('fFeat').checked = p ? !!p.featured : false;
    imageData = p ? (p.image || '') : '';
    $('fUrl').value = /^https?:/.test(imageData) ? imageData : '';
    $('fFile').value = '';
    setPreview(imageData, p ? p.name : '');
    $('pModal').classList.add('open');
  }
  function closeForm() { $('pModal').classList.remove('open'); }

  $('addBtn').addEventListener('click', function () { openForm(null); });
  $('pClose').addEventListener('click', closeForm);
  $('pModal').addEventListener('click', function (e) { if (e.target === $('pModal')) closeForm(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeForm(); });

  $('fUrl').addEventListener('input', function () { imageData = $('fUrl').value.trim(); setPreview(imageData, $('fName').value); });
  $('fClear').addEventListener('click', function () { imageData = ''; $('fUrl').value = ''; $('fFile').value = ''; setPreview('', $('fName').value); });

  /* rasmni yuklash va kichraytirish (localStorage tez to'lmasligi uchun) */
  $('fFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 800, w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        imageData = c.toDataURL('image/jpeg', 0.8);
        $('fUrl').value = '';
        setPreview(imageData);
      };
      img.onerror = function () { MNZ.toast("Rasmni o'qib bo'lmadi", true); };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  });

  $('pForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var price = Number($('fPrice').value) || 0;
    var old = Number($('fOld').value) || 0;
    var item = {
      id: editingId || ('p' + Date.now().toString(36)),
      name: $('fName').value.trim(),
      category: $('fCat').value.trim(),
      price: price,
      oldPrice: old > price ? old : 0,
      sizes: $('fSizes').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      desc: $('fDesc').value.trim(),
      image: imageData,
      stock: $('fStock').checked,
      featured: $('fFeat').checked
    };
    if (!item.name || !item.category) { MNZ.toast("Nomi va toifani kiriting", true); return; }
    var prev = data.products.slice();
    if (editingId) {
      data.products = data.products.map(function (x) { return x.id === editingId ? item : x; });
    } else {
      data.products.unshift(item);
    }
    if (persist(editingId ? 'Yangilandi' : "Qo'shildi")) { closeForm(); renderAll(); }
    else data.products = prev;
  });

  /* ---------- sozlamalar ---------- */
  function fillSettings() {
    var s = data.settings;
    $('sBrand').value = s.brand; $('sCur').value = s.currency; $('sPhone').value = s.phone;
    $('sTg').value = s.telegram; $('sIg').value = s.instagram; $('sHours').value = s.hours;
    $('sAddr').value = s.address; $('sHT').value = s.heroTitle; $('sHX').value = s.heroText;
  }
  $('setForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var s = data.settings;
    s.brand = $('sBrand').value.trim() || 'MONTERANUZ';
    s.currency = $('sCur').value.trim() || "so'm";
    s.phone = $('sPhone').value.trim();
    s.telegram = $('sTg').value.trim().replace(/^@/, '');
    s.instagram = $('sIg').value.trim().replace(/^@/, '');
    s.hours = $('sHours').value.trim();
    s.address = $('sAddr').value.trim();
    s.heroTitle = $('sHT').value.trim();
    s.heroText = $('sHX').value.trim();
    if (persist('Sozlamalar saqlandi')) renderRows();
  });

  $('passForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var a = $('np1').value, b = $('np2').value;
    if (a.length < 6) { MNZ.toast("Parol kamida 6 belgi bo'lsin", true); return; }
    if (a !== b) { MNZ.toast('Parollar mos emas', true); return; }
    MNZ.setPass(a).then(function () { $('np1').value = ''; $('np2').value = ''; MNZ.toast('Parol yangilandi'); });
  });

  /* ---------- eksport / import ---------- */
  $('exportBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'data.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    MNZ.toast('data.json yuklab olindi');
  });

  $('importFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        if (!j || !Array.isArray(j.products)) throw new Error('bad');
        data = MNZ.normalize(j);
        if (persist('Tiklandi')) renderAll();
      } catch (err) { MNZ.toast("Fayl noto'g'ri formatda", true); }
    };
    r.readAsText(f);
    this.value = '';
  });

  $('resetBtn').addEventListener('click', function () {
    if (!confirm("Brauzerdagi barcha o'zgarishlar (qoralama) o'chirilsinmi? Sayt GitHub'dagi data.json'ga qaytadi.")) return;
    MNZ.clearDraft();
    MNZ.load().then(function (res) { data = res.data; renderAll(); MNZ.toast("Qoralama o'chirildi"); });
  });

  if (isLogged()) showApp();
})();
