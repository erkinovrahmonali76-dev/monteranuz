/* Monteranuz — server (Cloudflare Pages Function + D1 baza).
   Barcha /api/* so'rovlar shu yerga keladi. */

const enc = new TextEncoder();
const DEF = { deliveryCity: 25000, deliveryRegion: 40000, freeFrom: 0 };
const STATUSES = ['pending', 'confirmed', 'shipping', 'delivered', 'rejected', 'cancelled'];
const REGION_LABEL = { city: 'Toshkent shahri', region: 'Viloyat / boshqa shahar', pickup: "Do'kondan olib ketish" };
const MAX_BODY = 4 * 1024 * 1024;

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const json = (d, status = 200) => new Response(JSON.stringify(d), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

/* ---------- kripto yordamchilar ---------- */
const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => new Uint8Array(h.match(/.{2}/g).map((x) => parseInt(x, 16)));
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uDec = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

function eq(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

async function hmacKey(env) {
  return crypto.subtle.importKey('raw', enc.encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function makeToken(env, payload, days) {
  const body = b64u(enc.encode(JSON.stringify({ ...payload, e: Date.now() + days * 86400000 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body));
  return body + '.' + b64u(sig);
}
async function readToken(env, request) {
  const h = request.headers.get('Authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [body, sig] = t.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), b64uDec(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64uDec(body)));
    return p.e > Date.now() ? p : null;
  } catch (e) { return null; }
}

async function hashPw(pw, saltHex) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return toHex(salt) + ':' + toHex(bits);
}
async function checkPw(pw, stored) { return eq(await hashPw(pw, stored.split(':')[0]), stored); }
async function sha(s) { return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }

/* ---------- urinishlarni cheklash (parol topishdan himoya) ---------- */
async function rlCheck(env, key) {
  const r = await env.DB.prepare('SELECT n, t FROM rl WHERE k = ?').bind(key).first();
  if (r && r.n >= 8 && Date.now() - r.t < 900000) throw new HttpError(429, "Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring");
}
async function rlFail(env, key) {
  const now = Date.now();
  await env.DB.prepare('INSERT INTO rl (k, n, t) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN ? - t > 900000 THEN 1 ELSE n + 1 END, t = ?')
    .bind(key, now, now, now).run();
}
async function rlClear(env, key) { await env.DB.prepare('DELETE FROM rl WHERE k = ?').bind(key).run(); }

/* ---------- umumiy ---------- */
const str = (v, max = 500) => (v == null ? '' : String(v)).slice(0, max);
const num = (v, d = 0) => { v = Number(v); return Number.isFinite(v) ? v : d; };
function normPhone(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 9) d = '998' + d;
  return d;
}
const validPhone = (s) => { const d = normPhone(s); return d.length === 12 && d.startsWith('998'); };
const parse = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };

async function getSettings(env) {
  const r = await env.DB.prepare("SELECT v FROM kv WHERE k = 'settings'").first();
  return { ...DEF, ...(r ? parse(r.v, {}) : {}) };
}

function discountFor(p, sub) {
  if (!p || p.active === false) return { error: 'Promokod faol emas' };
  if (p.min && sub < p.min) return { error: "Promokod uchun minimal buyurtma: " + p.min + " so'm" };
  const a = p.type === 'amount' ? Math.min(num(p.value), sub) : Math.round(sub * num(p.value) / 100);
  return { amount: Math.max(0, a) };
}
function deliveryFor(S, region, after) {
  if (region === 'pickup') return 0;
  if (num(S.freeFrom) > 0 && after >= num(S.freeFrom)) return 0;
  return region === 'region' ? num(S.deliveryRegion) : num(S.deliveryCity);
}

/* ---------- rasmlar: base64 ni alohida jadvalga, mahsulotda faqat havola ---------- */
const IMG_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

async function storeImages(env, imgs) {
  const out = [], stmts = [];
  for (const u of (Array.isArray(imgs) ? imgs : []).slice(0, 4)) {
    const s = String(u || '');
    if (s.startsWith('data:')) {
      if (!IMG_RE.test(s)) throw new HttpError(400, "Rasm formati noto'g'ri (faqat JPG, PNG, WEBP, GIF)");
      if (s.length > 1500000) throw new HttpError(400, "Rasm juda og'ir");
      const id = (await sha(s)).slice(0, 32);
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO images (id, data) VALUES (?, ?)').bind(id, s));
      out.push('/api/img/' + id);
    } else if (/^https?:\/\//.test(s) || s.startsWith('/api/img/')) {
      out.push(s.slice(0, 1000));
    }
  }
  return { urls: out, stmts };
}

async function cleanProduct(env, p) {
  const id = String((p && p.id) || '').trim();
  if (!/^[\w-]{1,40}$/.test(id)) throw new HttpError(400, "Mahsulot ID noto'g'ri");
  const name = str(p.name, 80).trim(), category = str(p.category, 40).trim();
  if (!name || !category) throw new HttpError(400, 'Nomi va toifani kiriting');
  const imgs = await storeImages(env, p.images || (p.image ? [p.image] : []));
  const data = {
    id, name, category, price: Math.max(0, num(p.price)), oldPrice: Math.max(0, num(p.oldPrice)),
    sizes: (Array.isArray(p.sizes) ? p.sizes : []).map((x) => str(x, 12).trim()).filter(Boolean).slice(0, 20),
    colors: (Array.isArray(p.colors) ? p.colors : []).filter((c) => c && c.name).slice(0, 20)
      .map((c) => ({ name: str(c.name, 24), hex: /^#[0-9a-f]{3,8}$/i.test(c.hex) ? c.hex : '#888888' })),
    images: imgs.urls, desc: str(p.desc, 1000), stock: p.stock !== false, featured: !!p.featured, isNew: !!p.isNew,
    createdAt: num(p.createdAt, Date.now())
  };
  return { data, imgStmts: imgs.stmts };
}
function upsertProductStmt(env, d) {
  return env.DB.prepare('INSERT INTO products (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, data = excluded.data')
    .bind(d.id, d.createdAt, JSON.stringify(d));
}
async function saveProducts(env, list) {
  const stmts = [];
  for (const p of list) {
    const c = await cleanProduct(env, p);
    stmts.push(...c.imgStmts, upsertProductStmt(env, c.data));
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
}

function cleanPromo(p) {
  const code = String((p && p.code) || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20);
  if (!code) throw new HttpError(400, 'Promokod noto\'g\'ri');
  const type = p.type === 'amount' ? 'amount' : 'percent';
  const value = Math.max(0, num(p.value));
  if (value <= 0 || (type === 'percent' && value > 90)) throw new HttpError(400, "Promokod qiymati noto'g'ri");
  return { code, type, value, min: Math.max(0, num(p.min)), active: p.active !== false };
}
const savePromoStmt = (env, p) => env.DB.prepare('INSERT INTO promos (code, data) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data').bind(p.code, JSON.stringify(p));

/* ---------- buyurtma ---------- */
async function createOrder(env, me, b) {
  const items = Array.isArray(b.items) ? b.items.slice(0, 50) : [];
  if (!items.length) throw new HttpError(400, "Savat bo'sh");
  const name = str(b.name, 60).trim();
  if (!name) throw new HttpError(400, 'Ismingizni kiriting');
  if (!validPhone(b.phone)) throw new HttpError(400, "Telefon raqamni to'g'ri kiriting");
  const region = ['city', 'region', 'pickup'].includes(b.region) ? b.region : 'city';
  const address = region === 'pickup' ? '' : str(b.address, 300).trim();
  if (region !== 'pickup' && address.length < 5) throw new HttpError(400, 'Yetkazish manzilini kiriting');
  const receipt = String(b.receipt || '');
  if (!IMG_RE.test(receipt)) throw new HttpError(400, "To'lov chekini rasm sifatida yuklang");
  if (receipt.length > 1500000) throw new HttpError(400, "Chek rasmi juda og'ir");

  const rows = (await env.DB.prepare('SELECT data FROM products').all()).results || [];
  const map = {};
  rows.forEach((r) => { const p = parse(r.data, null); if (p) map[p.id] = p; });

  let subtotal = 0;
  const lines = items.map((it) => {
    const p = map[it && it.pid];
    if (!p) throw new HttpError(400, 'Mahsulot topilmadi. Savatni yangilang');
    if (p.stock === false) throw new HttpError(400, '"' + p.name + '" tugagan. Savatdan olib tashlang');
    const qty = Math.max(1, Math.min(20, Math.floor(num(it.qty, 1))));
    const size = str(it.size, 12), color = str(it.color, 24);
    if (p.sizes.length && !p.sizes.includes(size)) throw new HttpError(400, '"' + p.name + "\" uchun o'lcham tanlanmagan");
    if (p.colors.length && !p.colors.some((c) => c.name === color)) throw new HttpError(400, '"' + p.name + '" uchun rang tanlanmagan');
    subtotal += p.price * qty;
    return { pid: p.id, name: p.name, price: p.price, qty, size, color };
  });

  let discount = 0, promoCode = '';
  if (b.promo) {
    const code = String(b.promo).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const r = await env.DB.prepare('SELECT data FROM promos WHERE code = ?').bind(code).first();
    const d = discountFor(r ? parse(r.data, null) : null, subtotal);
    if (d.error) throw new HttpError(400, d.error);
    discount = d.amount; promoCode = code;
  }
  const S = await getSettings(env);
  const after = subtotal - discount;
  const delivery = deliveryFor(S, region, after);
  const total = after + delivery;

  const id = crypto.randomUUID();
  let number = String(b.number || '');
  if (!/^MN-[A-Z0-9]{5,8}$/.test(number)) number = '';
  const taken = number ? await env.DB.prepare('SELECT 1 AS x FROM orders WHERE number = ?').bind(number).first() : true;
  if (!number || taken) number = 'MN-' + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random() * 36).toString(36).toUpperCase();

  const data = {
    number, uid: me.u, name, phone: normPhone(b.phone), region, regionLabel: REGION_LABEL[region], address,
    comment: str(b.comment, 200), items: lines, subtotal, discount, promo: promoCode, delivery, total,
    status: 'pending', note: '', createdAt: Date.now()
  };
  await env.DB.prepare('INSERT INTO orders (id, uid, number, status, created_at, data, receipt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, me.u, number, 'pending', data.createdAt, JSON.stringify(data), receipt).run();
  return { id, number, total };
}

function orderRow(r) {
  return { ...parse(r.data, {}), id: r.id, status: r.status, createdAt: r.created_at, hasReceipt: !!r.has_receipt };
}

/* ---------- yo'naltirish ---------- */
async function route(ctx) {
  const { request, env } = ctx;
  if (!env.DB) throw new HttpError(500, "Baza ulanmagan: Pages → Settings → Functions → D1 binding (nomi: DB)");
  if (!env.JWT_SECRET) throw new HttpError(500, 'JWT_SECRET sozlanmagan');

  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const m = request.method;
  const [a, b2, c] = parts;
  const ip = request.headers.get('CF-Connecting-IP') || 'x';

  const readBody = async () => {
    if (num(request.headers.get('content-length')) > MAX_BODY) throw new HttpError(413, "So'rov juda katta");
    try { return await request.json(); } catch (e) { throw new HttpError(400, "Noto'g'ri so'rov"); }
  };
  const tok = await readToken(env, request);
  const needUser = () => { if (!tok || tok.r !== 'user') throw new HttpError(401, 'Avval tizimga kiring'); return tok; };
  const needAdmin = () => { if (!tok || tok.r !== 'admin') throw new HttpError(401, 'Admin sifatida kiring'); return tok; };
  const userObj = (r) => ({ uid: r.uid, name: r.name || '', phone: r.phone, address: r.address || '' });

  /* sozlamalar */
  if (a === 'settings') {
    if (m === 'GET') {
      const r = await env.DB.prepare("SELECT v FROM kv WHERE k = 'settings'").first();
      return json(r ? parse(r.v, {}) : {});
    }
    if (m === 'PUT') {
      needAdmin(); const s = await readBody();
      await env.DB.prepare("INSERT INTO kv (k, v) VALUES ('settings', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(s)).run();
      return json({ ok: true });
    }
  }

  /* mahsulotlar */
  if (a === 'products') {
    if (m === 'GET' && !b2) {
      const rows = (await env.DB.prepare('SELECT data FROM products ORDER BY created_at DESC').all()).results || [];
      return json(rows.map((r) => parse(r.data, null)).filter(Boolean));
    }
    if (m === 'POST' && !b2) {
      needAdmin(); const body = await readBody();
      await saveProducts(env, Array.isArray(body.products) ? body.products : [body]);
      return json({ ok: true });
    }
    if (m === 'DELETE' && b2) {
      needAdmin();
      await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(b2).run();
      return json({ ok: true });
    }
  }

  /* rasm */
  if (a === 'img' && b2 && m === 'GET') {
    const r = await env.DB.prepare('SELECT data FROM images WHERE id = ?').bind(b2).first();
    const mt = r && IMG_RE.exec(r.data);
    if (!mt) return new Response('Not found', { status: 404 });
    const bin = Uint8Array.from(atob(mt[2]), (ch) => ch.charCodeAt(0));
    return new Response(bin, { headers: {
      'content-type': mt[1], 'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'"
    } });
  }

  /* promokodlar */
  if (a === 'promos') {
    if (m === 'GET' && b2) {
      const code = b2.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      const r = await env.DB.prepare('SELECT data FROM promos WHERE code = ?').bind(code).first();
      return json(r ? parse(r.data, null) : null);
    }
    if (m === 'GET') {
      needAdmin();
      const rows = (await env.DB.prepare('SELECT data FROM promos ORDER BY code').all()).results || [];
      return json(rows.map((r) => parse(r.data, null)).filter(Boolean));
    }
    if (m === 'PUT') { needAdmin(); await savePromoStmt(env, cleanPromo(await readBody())).run(); return json({ ok: true }); }
    if (m === 'DELETE' && b2) { needAdmin(); await env.DB.prepare('DELETE FROM promos WHERE code = ?').bind(b2.toUpperCase()).run(); return json({ ok: true }); }
  }

  /* mijoz hisobi */
  if (a === 'register' && m === 'POST') {
    const b = await readBody();
    const name = str(b.name, 40).trim(), phone = normPhone(b.phone), pw = String(b.password || '');
    if (!name) throw new HttpError(400, 'Ismingizni kiriting');
    if (!validPhone(phone)) throw new HttpError(400, "Telefon raqamni to'g'ri kiriting");
    if (pw.length < 6 || pw.length > 72) throw new HttpError(400, "Parol 6 dan 72 belgigacha bo'lsin");
    const exists = await env.DB.prepare('SELECT 1 AS x FROM users WHERE phone = ?').bind(phone).first();
    if (exists) throw new HttpError(409, "Bu raqam allaqachon ro'yxatdan o'tgan. Kirish bo'limidan kiring");
    const uid = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO users (uid, phone, name, address, pass, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(uid, phone, name, '', await hashPw(pw), Date.now()).run();
    return json({ token: await makeToken(env, { u: uid, r: 'user' }, 30), user: { uid, name, phone, address: '' } });
  }
  if (a === 'login' && m === 'POST') {
    const b = await readBody(), phone = normPhone(b.phone), key = 'u:' + ip + ':' + phone;
    await rlCheck(env, key);
    const r = await env.DB.prepare('SELECT * FROM users WHERE phone = ?').bind(phone).first();
    if (!r || !(await checkPw(String(b.password || ''), r.pass))) {
      await rlFail(env, key); throw new HttpError(401, "Telefon raqam yoki parol noto'g'ri");
    }
    await rlClear(env, key);
    return json({ token: await makeToken(env, { u: r.uid, r: 'user' }, 30), user: userObj(r) });
  }
  if (a === 'me' && m === 'GET') {
    const me = needUser();
    const r = await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(me.u).first();
    if (!r) throw new HttpError(401, 'Hisob topilmadi');
    return json(userObj(r));
  }
  if (a === 'profile' && m === 'PUT') {
    const me = needUser(), b = await readBody();
    const name = str(b.name, 40).trim();
    if (!name) throw new HttpError(400, 'Ismni kiriting');
    await env.DB.prepare('UPDATE users SET name = ?, address = ? WHERE uid = ?').bind(name, str(b.address, 300), me.u).run();
    return json({ ok: true });
  }

  /* admin kirishi */
  if (a === 'admin') {
    if (b2 === 'login' && m === 'POST') {
      if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new HttpError(500, 'ADMIN_EMAIL va ADMIN_PASSWORD sozlanmagan');
      const b = await readBody(), key = 'a:' + ip;
      await rlCheck(env, key);
      const saved = await env.DB.prepare("SELECT v FROM kv WHERE k = 'admin_pass'").first();
      const pw = String(b.password || '');
      const passOk = saved ? await checkPw(pw, saved.v) : eq(pw, env.ADMIN_PASSWORD);
      const mailOk = eq(String(b.email || '').trim().toLowerCase(), String(env.ADMIN_EMAIL).trim().toLowerCase());
      if (!passOk || !mailOk) { await rlFail(env, key); throw new HttpError(401, "Email yoki parol noto'g'ri"); }
      await rlClear(env, key);
      return json({ token: await makeToken(env, { u: 'admin', r: 'admin' }, 7) });
    }
    if (b2 === 'check' && m === 'GET') { needAdmin(); return json({ ok: true }); }
    if (b2 === 'password' && m === 'POST') {
      needAdmin(); const b = await readBody(), pw = String(b.password || '');
      if (pw.length < 6 || pw.length > 72) throw new HttpError(400, "Parol 6 dan 72 belgigacha bo'lsin");
      await env.DB.prepare("INSERT INTO kv (k, v) VALUES ('admin_pass', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(await hashPw(pw)).run();
      return json({ ok: true });
    }
  }

  /* buyurtmalar */
  const LIST = "SELECT id, status, created_at, data, (length(receipt) > 0) AS has_receipt FROM orders";
  if (a === 'orders') {
    if (m === 'GET' && !b2) {
      needAdmin();
      const rows = (await env.DB.prepare(LIST + ' ORDER BY created_at DESC LIMIT 500').all()).results || [];
      return json(rows.map(orderRow));
    }
    if (m === 'POST' && !b2) { return json(await createOrder(env, needUser(), await readBody())); }
    if (m === 'GET' && b2 && c === 'receipt') {
      const r = await env.DB.prepare('SELECT uid, receipt FROM orders WHERE id = ?').bind(b2).first();
      if (!r) throw new HttpError(404, 'Topilmadi');
      if (!(tok && (tok.r === 'admin' || (tok.r === 'user' && tok.u === r.uid)))) throw new HttpError(401, 'Ruxsat yoq');
      return json({ receipt: r.receipt || '' });
    }
    if (m === 'PATCH' && b2) {
      if (!tok) throw new HttpError(401, 'Avval tizimga kiring');
      const patch = await readBody();
      const r = await env.DB.prepare('SELECT id, uid, status, data FROM orders WHERE id = ?').bind(b2).first();
      if (!r) throw new HttpError(404, 'Buyurtma topilmadi');
      const data = parse(r.data, {});
      let status = r.status;
      if (tok.r === 'admin') {
        if (patch.status !== undefined) {
          if (!STATUSES.includes(patch.status)) throw new HttpError(400, "Holat noto'g'ri");
          status = patch.status;
        }
        if (patch.note !== undefined) data.note = str(patch.note, 500);
      } else if (tok.r === 'user' && tok.u === r.uid) {
        if (r.status !== 'pending' || patch.status !== 'cancelled') {
          throw new HttpError(403, "Bu buyurtmani saytdan bekor qilib bo'lmaydi. Telegram orqali yozing");
        }
        status = 'cancelled'; data.note = 'Mijoz tomonidan bekor qilindi';
      } else throw new HttpError(403, 'Ruxsat yoq');
      data.status = status;
      await env.DB.prepare('UPDATE orders SET status = ?, data = ? WHERE id = ?').bind(status, JSON.stringify(data), b2).run();
      return json({ ok: true });
    }
  }
  if (a === 'my-orders' && m === 'GET') {
    const me = needUser();
    const rows = (await env.DB.prepare(LIST + ' WHERE uid = ? ORDER BY created_at DESC LIMIT 100').bind(me.u).all()).results || [];
    return json(rows.map(orderRow));
  }
  if (a === 'users' && m === 'GET') {
    needAdmin();
    const rows = (await env.DB.prepare('SELECT uid, name, phone, address, created_at FROM users ORDER BY created_at DESC LIMIT 2000').all()).results || [];
    return json(rows.map((r) => ({ uid: r.uid, name: r.name, phone: r.phone, address: r.address, createdAt: r.created_at })));
  }

  /* zaxira */
  if (a === 'export' && m === 'GET') {
    needAdmin();
    const settings = await (async () => { const r = await env.DB.prepare("SELECT v FROM kv WHERE k = 'settings'").first(); return r ? parse(r.v, {}) : {}; })();
    const prodRows = (await env.DB.prepare('SELECT data FROM products ORDER BY created_at DESC').all()).results || [];
    const imgRows = (await env.DB.prepare('SELECT id, data FROM images').all()).results || [];
    const imgMap = {}; imgRows.forEach((r) => { imgMap['/api/img/' + r.id] = r.data; });
    const products = prodRows.map((r) => parse(r.data, null)).filter(Boolean)
      .map((p) => ({ ...p, images: (p.images || []).map((u) => imgMap[u] || u) }));
    const promoRows = (await env.DB.prepare('SELECT data FROM promos').all()).results || [];
    return json({ settings, products, promos: promoRows.map((r) => parse(r.data, null)).filter(Boolean) });
  }
  if (a === 'import' && m === 'POST') {
    needAdmin(); const d = await readBody();
    if (d.settings) await env.DB.prepare("INSERT INTO kv (k, v) VALUES ('settings', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(d.settings)).run();
    if (Array.isArray(d.products)) await saveProducts(env, d.products);
    if (Array.isArray(d.promos)) for (const p of d.promos) await savePromoStmt(env, cleanPromo(p)).run();
    return json({ ok: true });
  }

  throw new HttpError(404, 'Topilmadi');
}

async function onRequest(ctx) {
  try { return await route(ctx); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Server xatosi. Birozdan so\'ng qayta urinib ko\'ring' }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return onRequest({ request, env, ctx });
    }
    return env.ASSETS.fetch(request);
  }
};
