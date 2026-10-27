import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
const env = window.ENV ?? import.meta.env ?? {};
if (!env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL.includes('YOUR-PROJECT')) console.error('config.js غير موجود أو غير مضبوط');
const sb = createClient(env.VITE_SUPABASE_URL || 'https://missing.supabase.co', env.VITE_SUPABASE_ANON_KEY || 'missing');
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n).toLocaleString('ar-EG') + ' ج';
const eff = b => +(b.discount_price ?? b.price);
let settings = {}, qry = '', user = null, isAdmin = false, books = [], cats = [], bc = [], wish = new Set(), links = [], qty = {}, filter = 'all';
let cart = JSON.parse(localStorage.getItem('cart') || '{}');
const uname = () => user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';
const dlg = $('#dlg'), show = h => { $('#dlgBody').innerHTML = h; if (!dlg.open) dlg.showModal(); };

/* ---------- Intro + theme + petals ---------- */
const w = $('#welcome');
for (let i = 0; i < 14; i++) { const s = document.createElement('span'); s.innerHTML = '<svg><use href="#fl"/></svg>'; s.style.cssText = `left:${Math.random() * 100}%;width:${16 + Math.random() * 16}px;animation-duration:${10 + Math.random() * 12}s;animation-delay:${-Math.random() * 15}s`; $('#petals').append(s); }
const setTheme = t => { document.documentElement.dataset.theme = t; localStorage.theme = t; $('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙'; };
setTheme(localStorage.theme || 'light');
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

/* ---------- Data ---------- */
async function load() {
  const { data: s } = await sb.auth.getSession(); user = s.session?.user ?? null;
  $('#authBtn').textContent = user ? 'خروج · ' + uname() : 'دخول';
  if (user) { const { data } = await sb.rpc('is_admin'); isAdmin = !!data; } else isAdmin = false;
  const [b, c, k, l] = await Promise.all([sb.from('books_public').select('*').order('created_at', { ascending: false }), sb.from('categories').select('*'), sb.from('book_categories').select('*'), sb.from('site_links').select('*')]);
  books = b.data || []; cats = c.data || []; bc = k.data || []; links = l.data || [];
  wish = new Set(); if (user) { const { data } = await sb.from('wishlist').select('book_id'); (data || []).forEach(x => wish.add(x.book_id)); }
  if (isAdmin) { const { data } = await sb.from('books').select('id,quantity'); qty = Object.fromEntries((data || []).map(x => [x.id, x.quantity])); }
  { const { data: st } = await sb.from('settings').select('*'); settings = Object.fromEntries((st || []).map(x => [x.key, x.value])); }
  render(); renderSiteReviews(); if (isAdmin && !$('#dash').hidden) dash(curTab);
  $('#adminLink').hidden = $('#adminBtn').hidden = !isAdmin;
}
async function trackVisit() { const d = new Date().toDateString(); if (localStorage.v !== d) { localStorage.v = d; await sb.from('visits').insert({}); } }

/* ---------- Rendering ---------- */
const badge = b => ({ out: '<em class="bd out">نفذت الكمية</em>', last: '<em class="bd">الطبعة الأخيرة</em>', low: '<em class="bd">قاربت الكمية على النفاذ</em>' }[b.stock_status] || '');
const price = b => b.discount_price ? `<s>${money(b.price)}</s> <b>${money(b.discount_price)}</b>` : `<b>${money(b.price)}</b>`;
const card = b => `<article class="card"><button class="star ${wish.has(b.id) ? 'on' : ''}" data-act="wish" data-id="${b.id}">★</button>
<div class="cover" data-act="open" data-id="${b.id}" ${b.cover_url ? `style="background-image:url('${esc(b.cover_url)}')"` : ''}>${b.cover_url ? '' : esc(b.title)}</div>
<h4>${esc(b.title)}</h4>${b.is_new ? '<em class="bd new">جديد</em> ' : ''}${badge(b)}
<div>${price(b)}</div>${isAdmin ? `<small>الكمية: ${qty[b.id] ?? '-'} · <a href="#" data-act="edit" data-id="${b.id}">تعديل</a></small>` : ''}
<div class="row"><button data-act="add" data-id="${b.id}" ${b.stock_status === 'out' ? 'disabled' : ''}>${b.stock_status === 'out' ? 'نفذت الكمية' : 'أضف للسلة'}</button></div></article>`;
function render() {
  $('#newGrid').innerHTML = books.filter(b => b.is_new).map(card).join('') || '<p>لا توجد إضافات هذا الأسبوع.</p>';
  $('#chips').innerHTML = [['all', 'الكل'], ...cats.map(c => [c.id, c.name])].map(([id, n]) => `<button class="${filter === id ? 'on' : ''}" data-act="filter" data-id="${id}">${esc(n)}</button>`).join('');
  const ids = filter === 'all' ? null : new Set(bc.filter(x => x.category_id === filter).map(x => x.book_id));
  $('#grid').innerHTML = books.filter(b => (!ids || ids.has(b.id)) && (!qry || b.title.includes(qry))).map(card).join('');
  $('#cartN').textContent = Object.values(cart).reduce((a, b) => a + b, 0); $('#wishN').textContent = wish.size;
  $('#sideCats').innerHTML = [['all', 'الكل'], ...cats.map(c => [c.id, c.name])].map(([id, n]) => `<button data-act="sfilter" data-id="${id}">${esc(n)}</button>`).join('');
  $('#links').innerHTML = links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('');
}
const saveCart = () => { localStorage.setItem('cart', JSON.stringify(cart)); render(); };
const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
const revForm = bid => user ? `<div class="box"><select id="rr">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${stars(n)}</option>`).join('')}</select><textarea id="rc" placeholder="اكتب تعليقك"></textarea><button data-act="postrev" data-id="${bid || ''}">نشر</button></div>` : '<p class="note">سجّل الدخول لإضافة تقييم.</p>';
const revList = r => (r || []).map(x => `<div class="rev"><b>${esc(x.user_name)}</b> <span>${stars(x.rating)}</span><p>${esc(x.comment)}</p></div>`).join('') || '<p>لا توجد تقييمات بعد.</p>';
async function renderSiteReviews() { const { data } = await sb.from('reviews').select('*').is('book_id', null).order('created_at', { ascending: false }); $('#siteRev').innerHTML = revForm('') + revList(data); }
async function openBook(id) {
  const b = books.find(x => x.id === id); const { data } = await sb.from('reviews').select('*').eq('book_id', id).order('created_at', { ascending: false });
  show(`${b.cover_url ? `<img class="bimg" src="${esc(b.cover_url)}">` : ''}<h3>${esc(b.title)}</h3><p>${esc(b.description)}</p><p>عدد الصفحات: ${b.pages ?? '-'}</p>${badge(b)}<div>${price(b)}</div>
  <div class="row"><button data-act="add" data-id="${id}" ${b.stock_status === 'out' ? 'disabled' : ''}>أضف للسلة</button><button data-act="wish" data-id="${id}">★ مفضلة</button></div><h4>التقييمات</h4>${revForm(id)}${revList(data)}`);
}
function openCart() {
  const rows = Object.entries(cart).map(([id, n]) => ({ b: books.find(x => x.id === id), n })).filter(r => r.b);
  const total = rows.reduce((a, r) => a + eff(r.b) * r.n, 0);
  show(`<h3>سلة الشراء</h3>${rows.map(r => `<div class="row"><span>${esc(r.b.title)}</span><span><button data-act="dec" data-id="${r.b.id}">−</button> ${r.n} <button data-act="inc" data-id="${r.b.id}">+</button> <button data-act="del" data-id="${r.b.id}">🗑</button></span></div>`).join('') || '<p>السلة فارغة</p>'}
  <hr><div class="row"><b>الإجمالي</b><b>${money(total)}</b></div>
  ${rows.length && total < 100 ? '<p class="note">ملحوظة: لا نسترجع أي أوردر أقل من 100 جنيه، ولك الحق في معاينة الكتب والتأكد من سلامتها قبل الاستلام. كما أن صاحب الموقع غير مسؤول عن سعر التوصيل للأوردرات الأقل من 100 جنيه ويتحمّله العميل.</p>' : ''}
  ${rows.length ? '<button data-act="checkout">لاستكمال الأوردر الخاص بك</button>' : ''}`);
}
function authDlg(m = 'login') {
  const up = m === 'signup';
  show(`<div class="auth"><svg class="fw big"><use href="#fl"/></svg><h3>${up ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}</h3>
  ${up ? '<input id="nm" placeholder="الاسم">' : ''}<input id="em" type="email" placeholder="البريد الإلكتروني"><input id="pw" type="password" placeholder="كلمة المرور (6 أحرف على الأقل)">
  <p id="aerr" class="err"></p><button class="wide" data-act="${up ? 'signup' : 'login'}">${up ? 'إنشاء الحساب' : 'دخول'}</button>
  ${up ? '' : '<p><a href="#" data-act="reset">نسيت كلمة المرور؟</a></p>'}
  <p>${up ? 'عندك حساب؟ <a href="#" data-act="tologin">سجّل دخول</a>' : 'جديد هنا؟ <a href="#" data-act="tosignup">أنشئ حساب</a>'}</p></div>`);
}
let map, pin;
const waNum = () => String(settings.whatsapp || env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');
const PAY = [['cod', 'الدفع عند الاستلام', '💵'], ['visa', 'فيزا عند الاستلام', '💳'], ['instapay', 'تحويل InstaPay', '📲'], ['vodafone', 'تحويل فودافون كاش', '📱']];
const PAYN = Object.fromEntries(PAY.map(p => [p[0], p[1]]));
const payInfo = () => { const m = document.querySelector('[name=pm]:checked').value; $('#pinfo').textContent = m === 'cod' ? 'ادفعي المبلغ للمندوب عند استلام الكتب.' : m === 'visa' ? 'الدفع بالفيزا بيتم عند الاستلام مع المندوب.' : `حوّلي المبلغ على ${(m === 'instapay' ? settings.instapay : settings.vodafone) || 'الرقم اللي هيوصلك على واتساب'} وابعتي صورة التحويل على واتساب بعد التأكيد.`; };
const closeSide = () => document.body.classList.remove('side');
function checkout() { if (!user) return authDlg(); checkoutForm(); }
function setPin(a, b, z) { if (pin) pin.setLatLng([a, b]); else pin = L.marker([a, b], { draggable: true }).addTo(map); z ? map.setView([a, b], z) : map.panTo([a, b]); }
function checkoutForm() {
  const v = JSON.parse(localStorage.ship || '{}');
  const total = Object.entries(cart).reduce((a, [id, n]) => a + eff(books.find(b => b.id === id) || { price: 0 }) * n, 0);
  const lim = +settings.cod_limit || 100, opts = PAY.filter(p => total <= lim || (p[0] !== 'cod' && p[0] !== 'visa')), def = opts.some(p => p[0] === v.pay) ? v.pay : opts[0][0];
  show(`<h3>بيانات التوصيل</h3><input id="sn" placeholder="الاسم بالكامل" value="${esc(v.name || uname())}"><input id="sp" type="tel" placeholder="رقم التليفون" value="${esc(v.phone)}"><input id="sp2" type="tel" placeholder="رقم تليفون احتياطي (اختياري)" value="${esc(v.phone2)}">
  <input id="ss" placeholder="الشارع" value="${esc(v.street)}"><input id="spl" placeholder="المكان: المنطقة / رقم العمارة / علامة مميزة" value="${esc(v.place)}">
  <div class="row"><b>حدّدي موقعك على الخريطة</b><button type="button" data-act="locate">📍 موقعي الحالي</button></div><div id="map"></div><h4>طريقة الدفع</h4><div class="pay">${opts.map(([k, n, i]) => `<label class="pm"><input type="radio" name="pm" value="${k}" ${k === def ? 'checked' : ''}><span>${i} ${n}</span></label>`).join('')}</div><p id="pinfo" class="note"></p><p class="note">${total > lim ? `الأوردرات الأكبر من ${lim} جنيه الدفع فيها بالتحويل فقط (InstaPay أو فودافون كاش).` : `الدفع عند الاستلام أو بالفيزا متاح للأوردرات حتى ${lim} جنيه.`}</p>${total < 100 ? '<p class="note">⚠️ إجمالي الأوردر أقل من 100 جنيه: صاحب الموقع غير مسؤول عن سعر التوصيل ويتحمّله العميل.</p>' : ''}<p id="aerr" class="err"></p><button class="wide" data-act="confirm">تأكيد الأوردر</button>`);
  setTimeout(() => { document.querySelectorAll('[name=pm]').forEach(r => r.onchange = payInfo); payInfo(); if (typeof L === 'undefined') return $('#aerr').textContent = 'تعذّر تحميل الخريطة، تأكدي من الإنترنت.'; pin = null; map = L.map('map').setView([v.lat || 30.0444, v.lng || 31.2357], v.lat ? 15 : 11); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map); if (v.lat) setPin(v.lat, v.lng); map.on('click', e => setPin(e.latlng.lat, e.latlng.lng)); map.invalidateSize(); }, 150);
}
async function confirmOrder() {
  const f = { name: $('#sn').value.trim(), phone: $('#sp').value.trim(), phone2: $('#sp2').value.trim(), street: $('#ss').value.trim(), place: $('#spl').value.trim() }, err = m => $('#aerr').textContent = m, ph = /^\+?\d{10,15}$/;
  if (!waNum()) return err('رقم الواتساب لم يُضبط بعد.');
  if (!f.name || !f.street || !f.place) return err('اكتبي الاسم والشارع والمكان.');
  if (!ph.test(f.phone)) return err('رقم التليفون غير صحيح.'); if (f.phone2 && !ph.test(f.phone2)) return err('رقم التليفون الاحتياطي غير صحيح.');
  if (!pin) return err('حدّدي موقعك على الخريطة (اضغطي عليها أو استخدمي موقعي الحالي).');
  f.pay = document.querySelector('[name=pm]:checked').value; const ll = pin.getLatLng(); f.lat = ll.lat; f.lng = ll.lng; localStorage.ship = JSON.stringify(f);
  const items = Object.entries(cart).map(([id, q]) => ({ id, qty: q }));
  const { data, error } = await sb.rpc('place_order', { items, info: f }); if (error) return err(error.message);
  sb.functions.invoke('notify-order', { body: { order_id: data.id } }).catch(() => {});
  const lines = items.map(i => `• ${books.find(x => x.id === i.id)?.title} × ${i.qty}`).join('\n');
  const msg = `طلب جديد #${data.id.slice(0, 6)}\n${lines}\nالإجمالي: ${data.total} ج\n\nالاسم: ${f.name}\nالتليفون: ${f.phone}${f.phone2 ? ' / ' + f.phone2 : ''}\nالعنوان: ${f.street} - ${f.place}\nطريقة الدفع: ${PAYN[f.pay]}\nالموقع: https://www.google.com/maps?q=${f.lat},${f.lng}`;
  cart = {}; saveCart(); location.href = `https://wa.me/${waNum()}?text=${encodeURIComponent(msg)}`;
}

/* ---------- Admin ---------- */
const bar = (rows, k, label) => { const m = Math.max(1, ...rows.map(r => r[k])); return `<div class="bar">${rows.map(r => `<div style="height:${r[k] / m * 100}%" title="${label(r)}"><i>${r[k]}</i></div>`).join('')}</div>`; };
async function saveBook(id) {
  const row = { title: $('#bt').value, pages: +$('#bp').value || null, description: $('#bd').value, price: +$('#bpr').value, discount_price: $('#bdp').value ? +$('#bdp').value : null, quantity: +$('#bq').value || 0 };
  const f = $('#bimg')?.files[0]; if (f) { const path = `${crypto.randomUUID()}.${f.name.split('.').pop()}`; const up = await sb.storage.from('covers').upload(path, f, { contentType: f.type }); if (up.error) return alert(up.error.message); row.cover_url = sb.storage.from('covers').getPublicUrl(path).data.publicUrl; }
  let r = id ? await sb.from('books').update(row).eq('id', id).select().single() : await sb.from('books').insert(row).select().single();
  if (r.error) return alert(r.error.message);
  await sb.from('book_categories').delete().eq('book_id', r.data.id);
  const sel = [...document.querySelectorAll('.cc:checked')].map(c => ({ book_id: r.data.id, category_id: c.value }));
  if (sel.length) await sb.from('book_categories').insert(sel);
  await load();
}

/* ---------- Admin dashboard ---------- */
let curTab = 'over';
const DT = [['over', '📊 نظرة عامة'], ['books', '📚 الكتب'], ['cats', '🏷 التصنيفات'], ['orders', '🧾 الأوردرات'], ['revs', '💬 التقييمات'], ['links', '🔗 الروابط'], ['settings', '⚙ الإعدادات']];
const sum = (a, k) => a.reduce((x, r) => x + (+r[k] || 0), 0);
async function dash(tab = curTab, editId) {
  curTab = tab; const el = $('#dash'); el.hidden = false; document.body.style.overflow = 'hidden';
  el.innerHTML = `<aside><div class="logo"><svg class="fw"><use href="#fl"/></svg><span>Velvet</span></div>${DT.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-id="${k}">${n}</button>`).join('')}<button data-act="closedash">⬅ العودة للموقع</button></aside><div id="dc">جارٍ التحميل…</div>`;
  $('#dc').innerHTML = await ({ over: dOver, books: dBooks, cats: dCats, orders: dOrders, revs: dRevs, links: dLinks, settings: dSettings }[tab])(editId);
}
async function dOver() {
  const [{ data: st }, { data: o }] = await Promise.all([sb.rpc('admin_stats'), sb.from('orders').select('total')]);
  const m = st?.monthly || [], D = st?.daily || [], t = D[D.length - 1] || {}, low = Object.values(qty).filter(q => q <= 3).length;
  const cmp = k => m.length > 1 ? m.slice(1).map((r, i) => { const p = m[i][k]; return `${new Date(r.d).toLocaleDateString('ar-EG', { month: 'long' })}: ${p ? Math.round((r[k] - p) / p * 100) + '%' : '—'}`; }).join(' · ') : '';
  const kp = [['زيارات اليوم', t.visits ?? 0], ['أوردرات اليوم', t.orders ?? 0], ['إجمالي الأوردرات', (o || []).length], ['إجمالي المبيعات', money(sum(o || [], 'total'))], ['كتب قاربت على النفاذ', low]];
  const ch = (title, rows, k) => `<div class="box"><h4>${title}</h4>${bar(rows, k, r => r.d)}</div>`;
  return `<h2>نظرة عامة</h2><div class="kpis">${kp.map(([a, b]) => `<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join('')}</div>
  <div class="two">${ch('الزيارات اليومية', D, 'visits')}${ch('الأوردرات اليومية', D, 'orders')}${ch('الزيارات الأسبوعية', st?.weekly || [], 'visits')}${ch('الأوردرات الأسبوعية', st?.weekly || [], 'orders')}${ch('الزيارات الشهرية', m, 'visits')}${ch('الأوردرات الشهرية', m, 'orders')}</div>
  <p class="note">مقارنة بالشهر السابق — زيارات: ${cmp('visits')}<br>أوردرات: ${cmp('orders')}</p>`;
}
async function dBooks(editId) {
  const e = books.find(b => b.id === editId), eC = new Set(bc.filter(x => x.book_id === editId).map(x => x.category_id));
  return `<h2>الكتب</h2><div class="box"><h3>${e ? 'تعديل كتاب' : 'إضافة كتاب'}</h3><div class="two"><div><input id="bt" placeholder="اسم الكتاب" value="${esc(e?.title)}"><input id="bp" type="number" placeholder="عدد الصفحات" value="${e?.pages ?? ''}"><input id="bq" type="number" placeholder="الكمية المتاحة" value="${e ? qty[e.id] ?? '' : ''}"></div>
  <div><input id="bpr" type="number" placeholder="السعر قبل الخصم" value="${e?.price ?? ''}"><input id="bdp" type="number" placeholder="السعر بعد الخصم (اختياري)" value="${e?.discount_price ?? ''}"></div></div>
  <textarea id="bd" placeholder="وصف الكتاب">${esc(e?.description)}</textarea><label>صورة الغلاف</label><input id="bimg" type="file" accept="image/*">${e?.cover_url ? `<img class="th" src="${esc(e.cover_url)}">` : ''}<div class="cats">${cats.map(c => `<label><input type="checkbox" class="cc" value="${c.id}" ${eC.has(c.id) ? 'checked' : ''} style="width:auto"> ${esc(c.name)}</label>`).join('') || '<small>أنشئي تصنيفاً من تبويب التصنيفات أولاً</small>'}</div>
  <button data-act="savebook" data-id="${e?.id || ''}">حفظ</button> ${e ? '<button data-act="tab" data-id="books">إلغاء</button>' : ''}</div>
  <div class="tw"><table><tr><th>الكتاب</th><th>السعر</th><th>بعد الخصم</th><th>الكمية</th><th></th></tr>${books.map(b => `<tr><td>${b.cover_url ? `<img class="th" src="${esc(b.cover_url)}"> ` : ''}${esc(b.title)}</td><td>${money(b.price)}</td><td>${b.discount_price ? money(b.discount_price) : '—'}</td><td class="${(qty[b.id] ?? 9) <= 3 ? 'low' : ''}">${qty[b.id] ?? '-'}</td><td><button data-act="edit" data-id="${b.id}">تعديل</button> <button data-act="adel" data-t="books" data-id="${b.id}">حذف</button></td></tr>`).join('')}</table></div>`;
}
async function dCats() {
  return `<h2>التصنيفات</h2><div class="box"><input id="cn" placeholder="مثال: رومانس"><button data-act="addcat">إضافة تصنيف</button></div><div class="tw"><table>${cats.map(c => `<tr><td>${esc(c.name)}</td><td>${bc.filter(x => x.category_id === c.id).length} كتاب</td><td><button data-act="adel" data-t="categories" data-id="${c.id}">حذف</button></td></tr>`).join('')}</table></div>`;
}
async function dOrders() {
  const { data: o } = await sb.from('orders').select('id,total,created_at,user_id,customer_name,phone,phone2,street,place,lat,lng,payment_method,order_items(qty,unit_price,book_id)').order('created_at', { ascending: false }).limit(50);
  const { data: p } = await sb.from('profiles').select('id,full_name'); const nm = Object.fromEntries((p || []).map(x => [x.id, x.full_name]));
  return `<h2>الأوردرات (آخر 50)</h2><div class="tw"><table><tr><th>التاريخ</th><th>العميل</th><th>الكتب</th><th>الإجمالي</th></tr>${(o || []).map(r => `<tr><td>${new Date(r.created_at).toLocaleString('ar-EG')}</td><td>${esc(r.customer_name || nm[r.user_id] || '—')}<br><small dir="ltr">${esc(r.phone || '')}${r.phone2 ? ' / ' + esc(r.phone2) : ''}</small><br><small>${esc(r.street || '')} - ${esc(r.place || '')}</small><br><b>${PAYN[r.payment_method] || ''}</b><br>${r.lat ? `<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${r.lat},${r.lng}">📍 الخريطة</a>` : ''}</td><td>${r.order_items.map(i => esc(books.find(b => b.id === i.book_id)?.title || '؟') + ' × ' + i.qty).join('<br>')}</td><td>${money(r.total)}</td></tr>`).join('') || '<tr><td>لا توجد أوردرات بعد</td></tr>'}</table></div>`;
}
async function dRevs() {
  const { data } = await sb.from('reviews').select('*').order('created_at', { ascending: false }).limit(100);
  return `<h2>التقييمات</h2>${(data || []).map(r => `<div class="rev"><div class="row"><span><b>${esc(r.user_name)}</b> ${stars(r.rating)} · <small>${esc(books.find(b => b.id === r.book_id)?.title || 'ريفيو Velvet')}</small></span><button data-act="adel" data-t="reviews" data-id="${r.id}">حذف</button></div><p>${esc(r.comment)}</p></div>`).join('') || '<p>لا توجد تقييمات.</p>'}`;
}
async function dLinks() {
  return `<h2>روابط التواصل</h2><div class="box"><input id="ln" placeholder="الاسم: فيسبوك / تيك توك"><input id="lu" placeholder="https://..."><button data-act="addlink">إضافة رابط</button></div><div class="tw"><table>${links.map(l => `<tr><td>${esc(l.label)}</td><td dir="ltr">${esc(l.url)}</td><td><button data-act="adel" data-t="site_links" data-id="${l.id}">حذف</button></td></tr>`).join('')}</table></div>`;
}

async function dSettings() {
  const { data: ms } = await sb.from('mail_status').select('*').maybeSingle();
  return `<h2>الإعدادات</h2><div class="box"><h3>رقم الواتساب (بتتحول له الأوردرات)</h3><input id="s_wa" type="tel" dir="ltr" placeholder="مثال: 201012345678" value="${esc(settings.whatsapp)}"><small>بصيغة دولية بدون + أو أصفار زيادة (مصر تبدأ بـ 20).</small></div>
  <div class="box"><h3>حد الدفع عند الاستلام / الفيزا (بالجنيه)</h3><input id="s_lim" type="number" value="${esc(settings.cod_limit || 100)}"><small>الأوردرات الأكبر من الرقم ده بتدفع بالتحويل فقط.</small></div>
  <div class="box"><h3>أرقام التحويل (تظهر للعميل لما يختار تحويل)</h3><label>InstaPay (رقم أو عنوان)</label><input id="s_ip" dir="ltr" value="${esc(settings.instapay)}"><label>فودافون كاش</label><input id="s_vf" type="tel" dir="ltr" placeholder="01012345678" value="${esc(settings.vodafone)}"></div>
  <div class="box"><h3>📧 إشعار الأوردرات على Gmail</h3><label>حساب Gmail اللي هيبعت الإيميل</label><input id="m_user" type="email" dir="ltr" placeholder="name@gmail.com" value="${esc(ms?.gmail_user)}">
  <label>كلمة مرور التطبيق (App Password)</label><input id="m_pw" type="password" dir="ltr" placeholder="${ms?.has_password ? '•••• محفوظة — اتركيها فاضية لو مش هتغيريها' : '16 حرف من جوجل'}">
  <label>الإيميل اللي هيوصله الإشعار (اختياري، الافتراضي نفس الحساب)</label><input id="m_to" type="email" dir="ltr" value="${esc(ms?.notify_to)}">
  <p class="note">جيميل <b>لا يقبل كلمة مرور حسابك العادية</b> للإرسال. فعّلي «التحقق بخطوتين» على حسابك، ثم افتحي myaccount.google.com/apppasswords واعملي كلمة مرور تطبيق (16 حرف) والصقيها هنا. الباسورد بيتحفظ ومش بيظهر تاني.</p></div>
  <button data-act="savesettings">حفظ الإعدادات</button> <button data-act="testmail">✉ إرسال إيميل تجريبي</button>`;
}

/* ---------- Events ---------- */
document.addEventListener('click', async ev => {
  const t = ev.target.closest('[data-act]'); if (!t) return; const { act, id } = t.dataset; if (t.getAttribute('href') === '#') ev.preventDefault();
  const need = () => { if (!user) { authDlg(); return true; } };
  if (act === 'open') openBook(id);
  else if (act === 'add') { cart[id] = (cart[id] || 0) + 1; saveCart(); }
  else if (act === 'inc') { cart[id]++; saveCart(); openCart(); } else if (act === 'dec') { cart[id] = Math.max(1, cart[id] - 1); saveCart(); openCart(); }
  else if (act === 'del') { delete cart[id]; saveCart(); openCart(); }
  else if (act === 'filter') { filter = id; render(); }
  else if (act === 'wish') { if (need()) return; if (wish.has(id)) { await sb.from('wishlist').delete().eq('book_id', id); wish.delete(id); } else { await sb.from('wishlist').insert({ book_id: id }); wish.add(id); } render(); }
  else if (act === 'checkout') checkout(); else if (act === 'confirm') confirmOrder();
  else if (act === 'locate') navigator.geolocation?.getCurrentPosition(p => setPin(p.coords.latitude, p.coords.longitude, 16), () => { $('#aerr').textContent = 'تعذّر تحديد موقعك، اضغطي على الخريطة يدوياً.'; });
  else if (act === 'closeside') closeSide();
  else if (act === 'togcats') $('#sideCats').hidden = !$('#sideCats').hidden;
  else if (act === 'nav') { closeSide(); if (id === '#books') { filter = 'all'; render(); } document.querySelector(id).scrollIntoView({ behavior: 'smooth' }); }
  else if (act === 'sfilter') { filter = id; render(); closeSide(); $('#books').scrollIntoView({ behavior: 'smooth' }); }
  else if (act === 'tologin') authDlg('login'); else if (act === 'tosignup') authDlg('signup');
  else if (act === 'reset') { const { error } = await sb.auth.resetPasswordForEmail($('#em').value); $('#aerr').textContent = error ? error.message : 'تم إرسال رابط استعادة كلمة المرور لبريدك.'; }
  else if (act === 'login' || act === 'signup') { const c = { email: $('#em').value, password: $('#pw').value }; const r = act === 'login' ? await sb.auth.signInWithPassword(c) : await sb.auth.signUp({ ...c, options: { data: { full_name: $('#nm').value } } }); if (r.error) return $('#aerr').textContent = r.error.message; if (!r.data.session) { $('#dlgBody').innerHTML = '<p class="note">تم إنشاء الحساب. افتح بريدك لتأكيد الإيميل ثم سجّل الدخول.</p>'; return; } dlg.close(); load(); }
  else if (act === 'postrev') { if (need()) return; const { error } = await sb.from('reviews').insert({ book_id: id || null, rating: +$('#rr').value, comment: $('#rc').value, user_name: uname() }); if (error) return alert(error.message); id ? openBook(id) : renderSiteReviews(); }
  else if (act === 'savebook') saveBook(id);
  else if (act === 'savesettings') { const { error } = await sb.from('settings').upsert([{ key: 'whatsapp', value: $('#s_wa').value.trim() }, { key: 'instapay', value: $('#s_ip').value.trim() }, { key: 'vodafone', value: $('#s_vf').value.trim() }, { key: 'cod_limit', value: $('#s_lim').value || '100' }]); const e2 = (await sb.rpc('save_mail_settings', { p_user: $('#m_user').value.trim(), p_pw: $('#m_pw').value, p_to: $('#m_to').value.trim() })).error; if (error || e2) return alert((error || e2).message); alert('تم حفظ الإعدادات ✅'); load(); }
  else if (act === 'testmail') { const { data, error } = await sb.functions.invoke('notify-order', { body: { test: true } }); let msg = data; if (error) { try { msg = await error.context.text(); } catch { msg = error.message; } } alert(msg === 'sent' ? 'تم الإرسال، افتحي Gmail وشوفي الرسالة ✅' : 'النتيجة: ' + msg); }
  else if (act === 'edit') dash('books', id); else if (act === 'opendash') { closeSide(); dash('over'); }
  else if (act === 'tab') dash(id); else if (act === 'closedash') { $('#dash').hidden = true; document.body.style.overflow = ''; }
  else if (act === 'adel') { if (!confirm('متأكدة من الحذف؟')) return; const { error } = await sb.from(t.dataset.t).delete().eq('id', id); if (error) return alert(error.message.includes('foreign') ? 'لا يمكن حذف كتاب له طلبات سابقة. صفّري كميته بدلاً من ذلك.' : error.message); load(); }
  else if (act === 'addcat') { await sb.from('categories').insert({ name: $('#cn').value }); load(); }
  else if (act === 'addlink') { await sb.from('site_links').insert({ label: $('#ln').value, url: $('#lu').value }); load(); }
});
$('#cartBtn').onclick = openCart;
$('#wishBtn').onclick = () => { if (!user) return authDlg(); show(`<h3>المفضلة ★</h3><div class="grid">${books.filter(b => wish.has(b.id)).map(card).join('') || '<p>لا شيء بعد.</p>'}</div>`); };
$('#authBtn').onclick = async () => { if (user) { await sb.auth.signOut(); load(); } else authDlg(); };
trackVisit(); load();

$('#menuBtn').onclick = () => document.body.classList.toggle('side');
$('#q').oninput = e => { qry = e.target.value.trim(); render(); };