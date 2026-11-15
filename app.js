(function () {
  var $ = function (id) { return document.getElementById(id); };
  var S, P = [], activeCat = 'Barchasi', q = '', curSize = '', curProduct = null;

  function tg() { return 'https://t.me/' + String(S.telegram || '').replace(/^@/, ''); }
  function digits(p) { return String(p || '').replace(/[^\d+]/g, ''); }

  function render() {
    // hero & brand
    document.title = S.brand + " — Erkaklar kiyimi do'koni";
    $('heroTitle').innerHTML = S.heroTitle;
    $('heroText').textContent = S.heroText;
    $('footBrand').textContent = S.brand;
    $('year').textContent = new Date().getFullYear();
    $('statProducts').textContent = P.length + '+';

    // chips
    var cats = ['Barchasi'].concat(uniqueCats());
    $('chips').innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === activeCat ? ' active' : '') + '" data-c="' + MNZ.esc(c) + '">' + MNZ.esc(c) + '</button>';
    }).join('');

    // category tiles
    var icons = { "Ko'ylaklar": '👔', 'Shimlar': '👖', 'Kostyumlar': '🤵', 'Futbolkalar': '👕', 'Kurtkalar': '🧥', 'Poyabzal': '👞', 'Aksessuarlar': '⌚' };
    $('cats').innerHTML = uniqueCats().map(function (c) {
      var n = P.filter(function (p) { return p.category === c; }).length;
      return '<div class="cat-tile" data-c="' + MNZ.esc(c) + '"><div class="ic">' + (icons[c] || '🛍️') + '</div><h3>' + MNZ.esc(c) + '</h3><p>' + n + ' ta mahsulot</p></div>';
    }).join('');

    // contacts
    var cl = '';
    if (S.phone) cl += '<a href="tel:' + digits(S.phone) + '">📞 <span>' + MNZ.esc(S.phone) + '</span></a>';
    if (S.telegram) cl += '<a href="' + tg() + '" target="_blank" rel="noopener">✈️ <span>Telegram: @' + MNZ.esc(String(S.telegram).replace(/^@/, '')) + '</span></a>';
    if (S.instagram) cl += '<a href="https://instagram.com/' + MNZ.esc(String(S.instagram).replace(/^@/, '')) + '" target="_blank" rel="noopener">📷 <span>Instagram: @' + MNZ.esc(String(S.instagram).replace(/^@/, '')) + '</span></a>';
    if (S.address) cl += '<div>📍 <span>' + MNZ.esc(S.address) + '</span></div>';
    if (S.hours) cl += '<div>🕘 <span>' + MNZ.esc(S.hours) + '</span></div>';
    $('contactList').innerHTML = cl;

    renderGrid();
  }

  function uniqueCats() {
    var seen = [];
    P.forEach(function (p) { if (p.category && seen.indexOf(p.category) < 0) seen.push(p.category); });
    return seen;
  }

  function renderGrid() {
    var list = P.filter(function (p) {
      var okC = activeCat === 'Barchasi' || p.category === activeCat;
      var okQ = !q || (p.name + ' ' + p.category + ' ' + (p.desc || '')).toLowerCase().indexOf(q) >= 0;
      return okC && okQ;
    });
    // tavsiya etilganlar birinchi
    list.sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });
    if (!list.length) { $('grid').innerHTML = '<div class="empty">Hech narsa topilmadi 🙁</div>'; return; }
    $('grid').innerHTML = list.map(function (p) {
      var disc = p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
      var badge = !p.stock ? '<span class="badge out">Tugagan</span>' : (disc ? '<span class="badge">-' + disc + '%</span>' : (p.featured ? '<span class="badge">TOP</span>' : ''));
      return '<article class="card" data-id="' + MNZ.esc(p.id) + '">' +
        '<div class="img">' + badge + '<img loading="lazy" alt="' + MNZ.esc(p.name) + '" src="' + MNZ.esc(p.image || MNZ.placeholder(p.name)) + '" onerror="this.onerror=null;this.src=MNZ.placeholder(this.alt)"></div>' +
        '<div class="body"><span class="cat">' + MNZ.esc(p.category) + '</span><h3>' + MNZ.esc(p.name) + '</h3>' +
        '<div class="price"><b>' + MNZ.fmt(p.price, S.currency) + '</b>' + (p.oldPrice > p.price ? '<s>' + MNZ.fmt(p.oldPrice, S.currency) + '</s>' : '') + '</div></div></article>';
    }).join('');
  }

  function openModal(id) {
    var p = P.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    curProduct = p; curSize = '';
    $('mImg').src = p.image || MNZ.placeholder(p.name);
    $('mImg').onerror = function () { this.onerror = null; this.src = MNZ.placeholder(p.name); };
    $('mCat').textContent = p.category;
    $('mName').textContent = p.name;
    $('mPrice').textContent = MNZ.fmt(p.price, S.currency);
    $('mOld').textContent = p.oldPrice > p.price ? MNZ.fmt(p.oldPrice, S.currency) : '';
    $('mDesc').textContent = p.desc || '';
    var sizes = p.sizes || [];
    $('mSizesWrap').style.display = sizes.length ? '' : 'none';
    $('mSizes').innerHTML = sizes.map(function (s) { return '<button class="size" data-s="' + MNZ.esc(s) + '">' + MNZ.esc(s) + '</button>'; }).join('');
    $('mCall').href = 'tel:' + digits(S.phone);
    updateOrderLink();
    $('modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() { $('modal').classList.remove('open'); document.body.style.overflow = ''; }

  function updateOrderLink() {
    var p = curProduct; if (!p) return;
    var text = 'Assalomu alaykum! Buyurtma bermoqchiman:\n' + p.name + (curSize ? '\nO\'lcham: ' + curSize : '') + '\nNarxi: ' + MNZ.fmt(p.price, S.currency);
    var a = $('mOrder');
    if (!p.stock) { a.textContent = 'Hozircha mavjud emas'; a.removeAttribute('href'); a.style.opacity = .5; a.style.pointerEvents = 'none'; return; }
    a.textContent = 'Telegram orqali buyurtma'; a.style.opacity = ''; a.style.pointerEvents = '';
    a.href = tg() + '?text=' + encodeURIComponent(text);
  }

  // events
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip'); if (chip) { activeCat = chip.dataset.c; render(); return; }
    var tile = e.target.closest('.cat-tile'); if (tile) { activeCat = tile.dataset.c; render(); $('catalog').scrollIntoView({ behavior: 'smooth' }); return; }
    var card = e.target.closest('.card'); if (card) { openModal(card.dataset.id); return; }
    var sz = e.target.closest('.size'); if (sz) {
      curSize = sz.dataset.s;
      Array.prototype.forEach.call(document.querySelectorAll('.size'), function (b) { b.classList.toggle('active', b === sz); });
      updateOrderLink(); return;
    }
    if (e.target === $('modal') || e.target.id === 'mClose') closeModal();
    if (e.target.closest('#menu a')) $('menu').classList.remove('open');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  $('burger').addEventListener('click', function () { $('menu').classList.toggle('open'); });
  $('search').addEventListener('input', function (e) { q = e.target.value.trim().toLowerCase(); renderGrid(); });
  $('lead').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = "Yangi so'rov:\nIsm: " + $('lName').value + '\nTelefon: ' + $('lPhone').value + ($('lMsg').value ? '\nXabar: ' + $('lMsg').value : '');
    window.open(tg() + '?text=' + encodeURIComponent(t), '_blank');
    MNZ.toast("Telegram ochilmoqda...");
  });

  MNZ.load().then(function (res) {
    S = res.data.settings; P = res.data.products;
    render();
    if (res.draft) {
      var b = document.createElement('div');
      b.style.cssText = 'background:#c9a45c;color:#16120a;text-align:center;padding:6px;font-size:.85rem';
      b.textContent = "Qoralama rejimi: siz admin paneldagi o'zgarishlarni ko'ryapsiz (faqat shu brauzerda).";
      document.body.insertBefore(b, document.body.firstChild);
    }
  });
})();
