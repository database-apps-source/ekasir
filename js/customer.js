/* E-Kasir — Customer (Open Access, tanpa login): katalog → checkout → konfirmasi → riwayat */
(function () {
  'use strict';
  const { $, $$, esc, rp, ic, store } = K;
  const C = (K.C = {
    cat: store.get('cat', null) && store.get('cat').d || null,
    cart: store.get('cart', []), tipe: store.get('tipe', 'Dine In'), meja: store.get('meja', ''), voucher: null,
    cust: store.get('cust', null), orders: store.get('orders', []), q: '', jenis: 'all', sel: {}, metode: null, bukti: null
  });
  if (!C.cust || !/^CUS-[A-Z0-9]{6,20}$/.test(C.cust.id)) { const a = new Uint8Array(10); crypto.getRandomValues(a); C.cust = { id: 'CUS-' + Array.from(a).map(x => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join(''), nama: '', wa: '' }; store.set('cust', C.cust); }
  const qm = new URLSearchParams(location.search).get('meja'); if (qm) { C.meja = qm.replace(/[^0-9A-Za-z\-]/g, '').slice(0, 10); store.set('meja', C.meja); }
  const saveCart = () => { store.set('cart', C.cart); store.set('tipe', C.tipe); store.set('meja', C.meja); };
  const menuById = id => ((C.cat && C.cat.menu) || []).find(m => m.id === id);
  const toko = () => (C.cat && C.cat.toko) || { nama: 'E-Kasir', pb1: 10, servis: 0, meja: 20 };
  K.stLabel = o => { const bs = o.bayar && o.bayar.status; if (o.status === 'Dibatalkan') return { t: 'Dibatalkan', c: 'b-bad' }; if (o.status === 'Selesai') return { t: 'Selesai & Lunas', c: 'b-ok' }; if (o.status === 'Diproses') return { t: 'Diproses Barista', c: 'b-info' }; return { t: bs === 'Menunggu' ? 'Menunggu Verifikasi Kasir' : o.status, c: 'b-warn' }; };
  const mejaTxt = () => C.meja ? 'Meja ' + C.meja : 'Pilih meja';

  // ---------- util harga ----------
  const unitPrice = (m, pilih) => m.opsi.reduce((s, g) => { const p = g.pilihan.find(x => x.nama === pilih[g.kunci]); return s + (p ? p.tambah : 0); }, m.harga);
  const defaults = m => { const p = {}; m.opsi.forEach(g => { if (g.wajib) p[g.kunci] = g.pilihan[0].nama; }); return p; };
  const calc = () => {
    const t = toko(), sub = C.cart.reduce((s, l) => s + l.unit * l.qty, 0), pajak = Math.round(sub * t.pb1 / 100), servis = Math.round(sub * t.servis / 100);
    const diskon = C.voucher ? Math.min(C.voucher.diskon, sub) : 0;
    return { sub, pajak, servis, diskon, total: Math.max(0, sub + pajak + servis - diskon), n: C.cart.reduce((s, l) => s + l.qty, 0) };
  };
  const lineKey = (id, p, c) => id + '|' + JSON.stringify(p) + '|' + (c || '');
  function addToCart(m, pilih, qty, catatan) {
    if (!m.ready) return K.toast(m.nama + ' sedang habis', 'err');
    const key = lineKey(m.id, pilih, catatan), ex = C.cart.find(l => l.key === key);
    if (ex) ex.qty = Math.min(50, ex.qty + qty); else C.cart.push({ key, menuId: m.id, nama: m.nama, unit: unitPrice(m, pilih), qty, pilih, catatan: catatan || '', foto: m.foto });
    saveCart(); revalVoucher(); drawCart(); K.toast(m.nama + ' ditambahkan', 'ok');
  }
  const revalVoucher = K.debounce(async () => {
    if (!C.voucher) return; const c = calc();
    try { const r = await K.api('voucherCek', { kode: C.voucher.kode, subtotal: c.sub }, { silent: true }); C.voucher = { kode: r.kode, diskon: r.diskon, desk: r.deskripsi }; } catch (e) { C.voucher = null; K.toast('Voucher dilepas: ' + e.message, 'err'); }
    drawCart(); if (K.pages.checkout.el && K.pages.checkout.el.classList.contains('on')) drawCheckout();
  }, 400);

  // ---------- shell ----------
  function buildShell() {
    $('#cust').innerHTML = `
    <aside class="c-side"><div class="logo"><div class="mk">${ic('coffee')}</div><div><b>E-Kasir</b><small>Artisan Cafe</small></div></div>
      <nav class="nav" id="cnav"><a href="#/" data-n="katalog">${ic('store')}<span>Katalog</span></a><a href="#/pesanan" data-n="pesanan">${ic('receipt-text')}<span>Pesanan Saya</span></a><a href="#/riwayat" data-n="riwayat">${ic('history')}<span>Riwayat</span></a><a href="#/pengaturan" data-n="pengaturan">${ic('settings')}<span>Pengaturan</span></a></nav>
      <div style="margin-top:auto"><a class="btn btn-s btn-sm" href="#/admin/login" style="width:100%">${ic('lock')}<span>Login Staf</span></a></div></aside>
    <div class="c-main"><header class="c-top"><div class="search">${ic('search')}<input class="in" id="csearch" data-i="cari" placeholder="Cari kopi, pastry, snack…" autocomplete="off"></div><button class="pill" data-a="pickMeja" id="mejaPill">${ic('armchair')}<span></span></button><a class="avatar" href="#/pengaturan" aria-label="Akun">${ic('user')}</a></header><div id="c-view"></div></div>
    <div class="cartbar hide" id="cartbar"><div class="row grow" data-a="openCart" style="cursor:pointer">${ic('shopping-bag')}<div><b id="cb-t"></b><div class="sm" id="cb-s"></div></div></div><button class="btn" data-a="openCart"><b>Lihat Keranjang</b>${ic('arrow-right')}</button></div>
    <nav class="bnav" id="bnav"><a href="#/" data-n="katalog">${ic('store')}Catalog</a><a href="#/riwayat" data-n="riwayat">${ic('receipt-text')}Orders</a><a href="#" data-a="pickMeja">${ic('armchair')}Table</a><a href="#/pengaturan" data-n="pengaturan">${ic('user')}Account</a></nav>`;
    ['katalog', 'checkout', 'konfirmasi', 'riwayat', 'akunku', 'pesananku'].forEach(id => K.pages[id].mount = '#c-view');
  }
  K.zoneShow = function (zone, id) {
    if (zone !== 'cust') return;
    const m = { katalog: 'katalog', checkout: 'katalog', konfirmasi: 'riwayat', riwayat: 'riwayat', akunku: 'pengaturan', pesananku: 'pesanan' }[id] || id;
    $$('[data-n]', $('#cust')).forEach(a => a.classList.toggle('on', a.dataset.n === m));
    $('#mejaPill span').textContent = C.tipe === 'Dine In' ? mejaTxt() : C.tipe;
    drawCartBar(id === 'katalog');
  };
  function drawCartBar(show) { const c = calc(), b = $('#cartbar'); if (!b) return; b.classList.toggle('hide', !(show && c.n)); $('#cb-t').textContent = c.n + ' items · ' + rp(c.total); $('#cb-s').textContent = 'Termasuk PPN & Servis'; }
  K.act.pickMeja = () => {
    const n = toko().meja || 20, opts = Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, '0'));
    const m = K.modal(`<div class="mh"><div class="grow"><h3 class="ttl">Pilih Nomor Meja</h3><div class="sub">Nomor meja ada di stiker/QR pada meja Anda.</div></div><button class="btn btn-ic btn-s" data-a="mclose">${ic('x')}</button></div><div class="mb"><div class="row wrap" style="gap:8px">${opts.map(o => `<button class="opt ${C.meja === o ? 'on' : ''}" data-a="setMeja" data-v="${o}" style="min-width:52px;justify-content:center">${o}</button>`).join('')}</div></div>`, { w: 420 });
    K.act.mclose = () => m.close();
  };
  K.act.setMeja = el => { C.meja = el.dataset.v; C.tipe = C.tipe === 'Take Away' ? 'Dine In' : C.tipe; saveCart(); K.closeTop(); $('#mejaPill span').textContent = mejaTxt(); drawCart(); if (K.pages.checkout.el && K.pages.checkout.el.classList.contains('on')) drawCheckout(); };

  // ---------- katalog ----------
  const foto = m => m.foto ? `<img src="${esc(m.foto)}" alt="${esc(m.nama)}" loading="lazy" onerror="this.remove()">` : '';
  const jenisIcon = id => { const j = ((C.cat && C.cat.jenis) || []).find(x => x.id === id); return (j && j.ikon) || 'coffee'; };
  const short = p => p.nama.split(' ')[0] + (p.tambah ? ' +' + (p.tambah % 1000 ? K.n(p.tambah) : p.tambah / 1000 + 'k') : '');
  function cardHtml(m) {
    const s = C.sel[m.id] || (C.sel[m.id] = { qty: 1, pilih: defaults(m) }), g = m.opsi[0], inline = g && g.pilihan.length <= 3;
    const price = unitPrice(m, s.pilih);
    return `<article class="mi ${m.ready ? '' : 'off'}" data-m="${m.id}"><div class="ph" data-a="detail" data-m="${m.id}">${m.badge || !m.ready ? `<span class="bd" style="${m.ready ? '' : 'background:#bbb'}">${m.ready ? esc(m.badge) : 'Habis'}</span>` : ''}${foto(m)}${ic(jenisIcon(m.jenis))}</div>
      <div class="hd"><h3 data-a="detail" data-m="${m.id}">${esc(m.nama)}</h3><span class="pr num">${rp(m.ready ? price : m.harga)}</span></div><p>${esc(m.desk)}</p>
      ${m.ready ? `${inline ? `<div class="segs">${g.pilihan.map(p => `<button class="${s.pilih[g.kunci] === p.nama ? 'on' : ''}" data-a="seg" data-m="${m.id}" data-k="${g.kunci}" data-v="${esc(p.nama)}">${esc(short(p))}</button>`).join('')}</div>` : (g ? `<button class="segs" data-a="detail" data-m="${m.id}" style="justify-content:center;padding:7px;font-size:12px;font-weight:600;color:var(--primary)">${ic('sliders-horizontal')}&nbsp;Atur pilihan</button>` : `<div class="segs"><button class="on" style="cursor:default">Varian Default</button></div>`)}
      <div class="act"><div class="step"><button data-a="q" data-m="${m.id}" data-d="-1" aria-label="Kurangi">${ic('minus')}</button><b class="num">${s.qty}</b><button data-a="q" data-m="${m.id}" data-d="1" aria-label="Tambah">${ic('plus')}</button></div><button class="btn btn-p grow" data-a="add" data-m="${m.id}">${ic('shopping-cart')}Tambah</button></div>` : `<div class="segs"><button style="cursor:default">Varian Default</button></div><button class="btn btn-t" disabled>${ic('ban')}Stok Kosong</button>`}</article>`;
  }
  function drawKatalog() {
    const el = $('#kat-grid'); if (!el) return;
    if (!C.cat) { el.innerHTML = Array(6).fill('<div class="mi"><div class="sk" style="aspect-ratio:16/10"></div><div class="sk" style="height:20px"></div><div class="sk" style="height:32px"></div></div>').join(''); return; }
    const q = C.q.toLowerCase(), list = C.cat.menu.filter(m => (C.jenis === 'all' || m.jenis === C.jenis) && (!q || (m.nama + ' ' + m.desk).toLowerCase().includes(q)));
    K.render(el, list.length ? list.map(cardHtml).join('') : `<div class="empty" style="grid-column:1/-1">${ic('search-x')}<div>Menu tidak ditemukan</div></div>`);
    K.render($('#kat-cats'), `<button class="chip ${C.jenis === 'all' ? 'on' : ''}" data-a="jenis" data-v="all">${ic('utensils-crossed')}All Menu</button>` + C.cat.jenis.map(j => `<button class="chip ${C.jenis === j.id ? 'on' : ''}" data-a="jenis" data-v="${j.id}">${ic(j.ikon)}${esc(j.nama)}</button>`).join(''));
    const t = C.cat.toko; K.render($('#kat-hero'), `<div class="grow"><small>SPESIAL HARI INI</small><h2>Pilih Seduhan & Kudapan Favorit</h2><div class="sm muted">Bahan artisanal segar, espresso double shot standar barista, dan croissant yang dipanggang segar setiap hari.</div></div><div class="st"><b>${C.cat.menu.length}+</b><span class="sm muted">Varian Menu</span></div><div class="st"><b>${esc(t.buka)}</b><span class="sm muted">Jam Buka</span></div>`);
  }
  function drawCart() {
    const c = calc(), html = cartHtml(c); K.render($('#cartp'), html); drawCartBar($('#pg-katalog') && $('#pg-katalog').classList.contains('on'));
    const mc = $('#cart-modal'); if (mc) mc.innerHTML = html;
    $('#mejaPill') && ($('#mejaPill span').textContent = C.tipe === 'Dine In' ? mejaTxt() : C.tipe);
  }
  function cartHtml(c) {
    return `<div class="card col" style="gap:12px"><div class="row"><h3 class="ttl row" style="gap:8px">${ic('shopping-bag')}Ringkasan Pesanan</h3><span class="chip right">${c.n} Item</span></div>
      <div class="seg" style="display:flex">${['Dine In', 'Take Away', 'Delivery'].map(t => `<button class="grow ${C.tipe === t ? 'on' : ''}" data-a="tipe" data-v="${t}">${t === 'Dine In' ? 'Dine-In' : t}</button>`).join('')}</div>
      ${C.tipe === 'Dine In' ? `<div class="pill" style="justify-content:space-between">${ic('armchair')}<span class="grow">Lokasi: <b>${esc(mejaTxt())}</b></span><a data-a="pickMeja" href="#" style="font-weight:700">Ganti</a></div>` : ''}
      ${C.cart.length ? C.cart.map(l => `<div class="cart-line"><div class="th">${l.foto ? `<img src="${esc(l.foto)}" alt="" onerror="this.remove()">` : ic('coffee')}</div><div class="grow"><div class="row"><b class="grow ell">${esc(l.nama)}</b><b class="num">${rp(l.unit * l.qty)}</b></div><div class="sm muted">${esc(Object.values(l.pilih).join(' • '))}${l.catatan ? ' • ' + esc(l.catatan) : ''}</div><div class="row" style="margin-top:6px"><span class="sm pri">@${rp(l.unit)}</span><div class="step right"><button data-a="cq" data-k="${esc(l.key)}" data-d="-1">${ic('minus')}</button><b class="num">${l.qty}</b><button data-a="cq" data-k="${esc(l.key)}" data-d="1">${ic('plus')}</button></div></div></div></div>`).join('') : `<div class="empty">${ic('shopping-bag')}<div>Keranjang masih kosong</div></div>`}
      ${C.voucher ? `<div class="pill" style="justify-content:space-between;border-radius:12px;padding:10px 12px">${ic('tag')}<span class="grow"><b>Voucher '${esc(C.voucher.kode)}'</b><br><span class="pri sm">Hemat ${rp(C.voucher.diskon)} terpasang</span></span><button data-a="rmVoucher">${ic('x')}</button></div>` : ''}
      <div class="col" style="gap:4px"><div class="tot-row"><span>Subtotal (${c.n} items)</span><b class="num">${rp(c.sub)}</b></div><div class="tot-row"><span>Pajak Resto PB1 (${toko().pb1}%)</span><b class="num">${rp(c.pajak)}</b></div>${c.servis ? `<div class="tot-row"><span>Biaya Layanan</span><b class="num">${rp(c.servis)}</b></div>` : ''}${c.diskon ? `<div class="tot-row pri"><span>Diskon Promo</span><b class="num">-${rp(c.diskon)}</b></div>` : ''}</div>
      <div class="tot-big"><span class="b">Total Tagihan</span><b class="num">${rp(c.total)}</b></div>
      <button class="btn btn-p btn-lg" data-a="checkout" ${C.cart.length ? '' : 'disabled'}>Lanjut ke Pembayaran ${ic('arrow-right')}</button>
      <div class="sm muted row">${ic('zap')}Pesanan langsung masuk ke antrean kasir & barista otomatis.</div></div>`;
  }
  K.act.jenis = el => { C.jenis = el.dataset.v; drawKatalog(); };
  K.inp.cari = el => { C.q = el.value; if (!$('#pg-katalog') || !$('#pg-katalog').classList.contains('on')) K.go('/'); drawKatalog(); };
  K.act.seg = el => { const s = C.sel[el.dataset.m]; s.pilih[el.dataset.k] = el.dataset.v; refreshCard(el.dataset.m); };
  K.act.q = el => { const s = C.sel[el.dataset.m]; s.qty = Math.max(1, Math.min(50, s.qty + (+el.dataset.d))); refreshCard(el.dataset.m); };
  function refreshCard(id) { const old = $(`#kat-grid [data-m="${id}"].mi`); if (old) { const t = document.createElement('div'); t.innerHTML = cardHtml(menuById(id)); old.replaceWith(t.firstChild); } }
  K.act.add = el => { const m = menuById(el.dataset.m), s = C.sel[m.id]; addToCart(m, Object.assign({}, s.pilih), s.qty, ''); s.qty = 1; refreshCard(m.id); };
  K.act.tipe = el => { C.tipe = el.dataset.v; saveCart(); drawCart(); if (K.pages.checkout.el && K.pages.checkout.el.classList.contains('on')) drawCheckout(); };
  K.act.cq = el => { const l = C.cart.find(x => x.key === el.dataset.k); if (!l) return; l.qty += +el.dataset.d; if (l.qty < 1) C.cart.splice(C.cart.indexOf(l), 1); saveCart(); revalVoucher(); drawCart(); if (!C.cart.length && $('#cart-modal')) K.closeTop(); if (K.pages.checkout.el && K.pages.checkout.el.classList.contains('on')) { C.cart.length ? drawCheckout() : K.go('/'); } };
  K.act.rmVoucher = () => { C.voucher = null; drawCart(); if (K.pages.checkout.el.classList.contains('on')) drawCheckout(); };
  K.act.checkout = () => { if ($('#cart-modal')) K.closeTop(); K.go('/checkout'); };
  K.act.openCart = () => { K.modal(`<div class="mb" id="cart-modal" style="padding:12px">${cartHtml(calc())}</div>`, { w: 480 }); };
  K.act.detail = el => openDetail(el.dataset.m);
  function openDetail(id) {
    const m = menuById(id); if (!m) return; const st = { pilih: Object.assign({}, (C.sel[id] || {}).pilih || defaults(m)), qty: 1 };
    const body = () => { const u = unitPrice(m, st.pilih); return `<div style="display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)" class="det"><div style="background:var(--peach);padding:16px;display:flex;flex-direction:column;gap:12px"><div class="ph mi" style="aspect-ratio:1;border:0;padding:0;box-shadow:none;background:linear-gradient(135deg,#f6d5bd,#e9b58f);position:relative;border-radius:16px;overflow:hidden;display:grid;place-items:center;font-size:56px;color:rgba(143,73,20,.5)">${foto(m)}${ic(jenisIcon(m.jenis))}</div>${m.badge ? `<div class="pill">${ic('badge-check')}${esc(m.badge)}</div>` : ''}</div>
        <div class="col" style="padding:20px;gap:14px"><div class="row"><h2 class="ttl grow" style="font-size:22px">${esc(m.nama)}</h2><button class="btn btn-ic btn-s" data-a="mclose2">${ic('x')}</button></div><div class="h1 pri num" style="font-size:26px">${rp(u)}</div><p class="muted">${esc(m.desk)}</p>
        ${m.opsi.map(g => `<div class="col" style="gap:6px"><div class="row"><b>${esc(g.label)}</b>${g.wajib ? '<span class="sm muted right">Wajib dipilih</span>' : ''}</div><div class="row wrap">${g.pilihan.map(p => `<button class="opt ${st.pilih[g.kunci] === p.nama ? 'on' : ''}" data-a="dopt" data-k="${g.kunci}" data-v="${esc(p.nama)}">${esc(p.nama)}${p.tambah ? ' (+' + rp(p.tambah) + ')' : ''}</button>`).join('')}</div></div>`).join('')}
        <div class="fld"><label>Catatan untuk barista (opsional)</label><input class="in" id="d-cat" maxlength="120" placeholder="Mis. tanpa sedotan plastik"></div>
        <div class="row" style="justify-content:space-between"><div class="step" style="padding:2px"><button data-a="dq" data-d="-1">${ic('minus')}</button><b class="num">${st.qty}</b><button data-a="dq" data-d="1">${ic('plus')}</button></div><div class="tr"><div class="sm muted">Subtotal Pesanan</div><b class="num" style="font-size:20px">${rp(u * st.qty)}</b></div></div>
        <button class="btn btn-p btn-lg" data-a="dadd" ${m.ready ? '' : 'disabled'}>${ic('shopping-bag')}${m.ready ? 'Tambah ke Keranjang — ' + rp(u * st.qty) : 'Stok Kosong'}</button></div></div>`; };
    const md = K.modal(`<div id="det-body">${body()}</div>`, { w: 820 }), redraw = () => { const d = $('#det-body'), c = $('#d-cat') ? $('#d-cat').value : ''; d.innerHTML = body(); $('#d-cat').value = c; };
    K.act.mclose2 = () => md.close();
    K.act.dopt = el => { st.pilih[el.dataset.k] = el.dataset.v; redraw(); };
    K.act.dq = el => { st.qty = Math.max(1, Math.min(50, st.qty + (+el.dataset.d))); redraw(); };
    K.act.dadd = () => { addToCart(m, st.pilih, st.qty, ($('#d-cat').value || '').trim()); (C.sel[id] = C.sel[id] || { qty: 1 }).pilih = Object.assign({}, st.pilih); md.close(); refreshCard(id); };
  }
  K.page('katalog', {
    init(el) { el.innerHTML = `<div class="c-body"><div><div id="kat-hero" class="hero"></div><div class="cats" id="kat-cats"></div><div class="menu-grid" id="kat-grid"></div></div><aside class="cartp" id="cartp"></aside></div>`; },
    show() { drawKatalog(); drawCart(); loadCatalog(); }
  });
  let catAt = 0;
  async function loadCatalog(force) {
    if (!force && C.cat && Date.now() - catAt < 30000) return; catAt = Date.now();
    try { await K.swr('catalog', 'catalog', {}, { ttl: 20000, force, render: d => { C.cat = d; store.set('cat', { d }); drawKatalog(); drawCart(); } }); } catch (e) { if (!C.cat) K.toast(e.message, 'err'); }
  }
  K.loadCatalog = loadCatalog;

  // ---------- checkout ----------
  const ICO = { qris: 'qr-code', bank: 'landmark', ewallet: 'wallet', cash: 'banknote' };
  function drawCheckout() {
    const el = K.pages.checkout.el, c = calc(), t = toko(), metodes = (C.cat && C.cat.metode) || [];
    if (!C.metode || !metodes.find(m => m.id === C.metode)) C.metode = metodes[0] && metodes[0].id;
    const mt = metodes.find(m => m.id === C.metode) || {}, sv = [['Dine In', 'utensils', 'Makan di Tempat', C.meja ? 'Meja ' + C.meja : 'Pilih nomor meja'], ['Take Away', 'shopping-bag', 'Bawa Pulang', 'Pengambilan di Bar Counter'], ['Delivery', 'bike', 'Antar ke Lokasi', 'Kurir internal kafe']];
    const keep = { nama: $('#co-nama') ? $('#co-nama').value : C.cust.nama, wa: $('#co-wa') ? $('#co-wa').value : C.cust.wa, alamat: $('#co-alamat') ? $('#co-alamat').value : '', cat: $('#co-cat') ? $('#co-cat').value : '', v: $('#co-v') ? $('#co-v').value : '' };
    el.innerHTML = `<div class="c-body one"><div><div class="stepper"><div class="s done"><span class="n">${ic('check')}</span>Pilih Menu</div><i></i><div class="s on"><span class="n">2</span><b>Checkout & Bayar</b></div><i></i><div class="s"><span class="n">3</span>Konfirmasi</div></div>
      <div class="col" style="gap:16px;padding-bottom:110px">
      <section class="card"><div class="row"><h3 class="ttl row">${ic('layout-grid')}Jenis Layanan</h3><span class="chip right">Diperlukan</span></div><div class="svc mt16">${sv.map(s => `<button class="${C.tipe === s[0] ? 'on' : ''}" data-a="tipe" data-v="${s[0]}"><span class="ico">${ic(s[1])}</span><b>${s[0]}</b><span class="sm muted">${s[2]}</span><span class="sm ${C.tipe === s[0] ? 'pri' : 'muted'} b" style="margin-top:4px">${s[3]}</span></button>`).join('')}</div>
        ${C.tipe === 'Dine In' ? `<div class="row mt16"><button class="btn btn-t btn-sm" data-a="pickMeja">${ic('armchair')}${C.meja ? 'Ganti Meja' : 'Pilih Nomor Meja'}</button>${C.meja ? '' : '<span class="sm" style="color:var(--bad)">Nomor meja wajib untuk Dine In</span>'}</div>` : ''}
        ${C.tipe === 'Delivery' ? `<div class="fld mt16"><label>Alamat Pengantaran *</label><textarea class="in" id="co-alamat" maxlength="200" placeholder="Nama jalan, nomor, patokan">${esc(keep.alamat)}</textarea></div>` : ''}</section>
      <section class="card"><h3 class="ttl row">${ic('user-round')}Data Pemesan</h3><div class="grid g2 mt16"><div class="fld"><label>Nama</label><input class="in" id="co-nama" maxlength="60" value="${esc(keep.nama)}" placeholder="Nama Anda"></div><div class="fld"><label>WhatsApp ${C.tipe === 'Delivery' ? '*' : '(opsional)'}</label><input class="in" id="co-wa" inputmode="tel" value="${esc(keep.wa)}" placeholder="08xxxxxxxxxx"><div class="hint">Untuk kabar pesanan siap. Tidak dibagikan.</div></div></div></section>
      <section class="card"><div class="row"><h3 class="ttl row">${ic('receipt-text')}Rincian Pesanan</h3><span class="sm muted right">${C.cart.length} Menu Dipilih</span></div><div class="mt16">${C.cart.map(l => `<div class="it" style="align-items:center"><div class="th cart-line" style="padding:0;width:44px;height:44px;border-radius:8px;overflow:hidden;background:linear-gradient(135deg,#f6d5bd,#e9b58f);display:grid;place-items:center;color:rgba(143,73,20,.5)">${l.foto ? `<img src="${esc(l.foto)}" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()">` : ic('coffee')}</div><div class="grow"><b>${l.qty}× ${esc(l.nama)}</b><div class="sm muted">${esc(Object.values(l.pilih).join(' • '))}</div>${l.catatan ? `<div class="sm pri">Catatan: ${esc(l.catatan)}</div>` : ''}</div><div class="tr"><b class="num">${rp(l.unit * l.qty)}</b>${l.qty > 1 ? `<div class="sm muted">@${rp(l.unit)}</div>` : ''}</div><div class="step"><button data-a="cq" data-k="${esc(l.key)}" data-d="-1">${ic('minus')}</button><b>${l.qty}</b><button data-a="cq" data-k="${esc(l.key)}" data-d="1">${ic('plus')}</button></div></div>`).join('')}</div>
        <div class="grid g2 mt16"><div class="fld"><label>Kode Voucher</label><div class="row"><input class="in" id="co-v" value="${esc(C.voucher ? C.voucher.kode : keep.v)}" placeholder="Mis. NGOPIDULU" style="text-transform:uppercase" ${C.voucher ? 'disabled' : ''}>${C.voucher ? `<button class="btn btn-s" data-a="rmVoucher">${ic('x')}</button>` : `<button class="btn btn-t" data-a="applyV">Pakai</button>`}</div>${C.voucher ? `<div class="hint pri">${esc(C.voucher.desk || '')} — hemat ${rp(C.voucher.diskon)}</div>` : ''}</div><div class="fld"><label>Catatan untuk barista/kasir</label><input class="in" id="co-cat" maxlength="200" value="${esc(keep.cat)}" placeholder="Opsional"></div></div>
        <div class="col mt16" style="gap:4px"><div class="tot-row"><span>Subtotal</span><b class="num">${rp(c.sub)}</b></div><div class="tot-row"><span>Pajak Resto PB1 (${t.pb1}%)</span><b class="num">${rp(c.pajak)}</b></div>${c.diskon ? `<div class="tot-row pri"><span>Diskon Promo</span><b class="num">-${rp(c.diskon)}</b></div>` : ''}</div>
        <div class="card tint row mt16" style="justify-content:space-between;box-shadow:none"><div><b>Total Pembayaran</b><div class="sm muted">Sudah termasuk pajak & biaya layanan</div></div><b class="num pri" style="font:700 28px var(--f-head)">${rp(c.total)}</b></div></section>
      <section class="card"><div class="row"><h3 class="ttl row">${ic('wallet-cards')}Pilih Metode Pembayaran</h3><span class="sm muted right row">${ic('shield-check')}Terverifikasi aman</span></div><div class="pay mt16">${metodes.map(m => `<button class="${C.metode === m.id ? 'on' : ''}" data-a="metode" data-v="${m.id}"><span class="ico">${ic(ICO[m.tipe] || 'wallet')}</span><span class="grow"><b>${esc(m.nama)}</b><br><span class="sm muted">${esc(m.desk)}</span></span></button>`).join('')}</div>
        ${mt.tipe === 'qris' ? `<div class="qrbox mt16"><div class="qr">${t.qris ? `<img src="${esc(t.qris)}" alt="QRIS" onerror="this.parentNode.textContent='QRIS belum diunggah Owner'">` : 'QRIS toko akan tampil di sini setelah Owner mengunggahnya'}</div><div class="col"><span class="chip" style="background:#fff;width:max-content">${ic('qr-code')}QRIS Standar Bank Indonesia</span><h4 class="ttl">Pindai lewat M-Banking / E-Wallet</h4><div class="sm muted">${esc(mt.info || '')}</div><div class="sm"><b>Nominal: ${rp(c.total)}</b></div></div></div>` : `<div class="card tint mt16 col" style="box-shadow:none;gap:4px"><b>${esc(mt.nama || '')}</b><div class="muted">${esc(mt.info || mt.desk || '')}</div>${mt.tipe === 'cash' ? '' : `<div class="sm"><b>Nominal transfer: ${rp(c.total)}</b></div>`}</div>`}</section>
      ${mt.tipe && mt.tipe !== 'cash' ? `<section class="card"><div class="row"><h3 class="ttl row">${ic('image-up')}Unggah Bukti Pembayaran</h3><span class="chip right">Opsional</span></div><div class="drop mt16" data-a="pickBukti">${C.bukti && C.bukti.preview ? `<img src="${C.bukti.preview}" alt="Bukti"><div class="sm mt8 muted">Ketuk untuk mengganti</div>` : `${ic('image-plus', '')}<div class="b">Klik untuk mengunggah tangkapan layar</div><div class="sm muted">JPG, PNG atau PDF (maks. 3 MB) — dikompres otomatis</div>`}</div><div class="sm muted mt8 row">${ic('info')}Kasir akan memverifikasi pembayaran Anda. Bukti mempercepat proses.</div></section>` : ''}</div></div></div>
      <div class="sticky-pay"><div><div class="sm muted">Total Tagihan ${C.tipe === 'Dine In' && C.meja ? 'Meja #' + esc(C.meja) : ''}</div><b class="t num">${rp(c.total)}</b></div><button class="btn btn-p btn-xl" data-a="submit" id="btn-submit">Konfirmasi & Bayar — ${rp(c.total)} ${ic('arrow-right')}</button></div>`;
    $('#co-v') && ($('#co-v').onkeydown = e => { if (e.key === 'Enter') K.act.applyV($('#co-v')); });
  }
  K.act.applyV = async el => { const v = ($('#co-v').value || '').trim(); if (!v) return; await K.btnBusy(el, async () => { const r = await K.api('voucherCek', { kode: v, subtotal: calc().sub }); C.voucher = { kode: r.kode, diskon: r.diskon, desk: r.deskripsi }; K.toast('Voucher terpasang', 'ok'); drawCheckout(); drawCart(); }); };
  K.act.metode = el => { C.metode = el.dataset.v; drawCheckout(); };
  K.act.pickBukti = async () => { try { const f = await K.pickFile('image/*,application/pdf'); if (!f) return; C.bukti = await K.fileToB64(f); drawCheckout(); } catch (e) { K.toast(e.message, 'err'); } };
  K.act.submit = async el => {
    const nama = ($('#co-nama').value || '').trim(), wa = ($('#co-wa').value || '').trim(), alamat = $('#co-alamat') ? $('#co-alamat').value.trim() : '';
    if (!C.cart.length) return K.toast('Keranjang kosong', 'err');
    if (C.tipe === 'Dine In' && !C.meja) { K.toast('Pilih nomor meja dulu', 'err'); return K.act.pickMeja(); }
    if (C.tipe === 'Delivery' && (!alamat || !/^(\+?62|0)8\d{8,12}$/.test(wa.replace(/[\s-]/g, '')))) return K.toast('Delivery butuh alamat dan nomor WhatsApp valid', 'err');
    if (wa && !/^(\+?62|0)8\d{8,12}$/.test(wa.replace(/[\s-]/g, ''))) return K.toast('Nomor WhatsApp tidak valid', 'err');
    C.cust.nama = nama; C.cust.wa = wa; store.set('cust', C.cust);
    await K.btnBusy(el, async () => {
      const payload = { customer: { id: C.cust.id, nama, wa }, meja: C.meja, tipe: C.tipe, alamat, metodeId: C.metode, voucher: C.voucher ? C.voucher.kode : '', catatan: $('#co-cat').value.trim(), items: C.cart.map(l => ({ menuId: l.menuId, qty: l.qty, pilih: l.pilih, catatan: l.catatan })) };
      const r = await K.api('orderCreate', payload, { write: true }), p = r.pesanan;
      C.orders.unshift({ id: p.id, akses: p.akses, total: p.total, t: Date.now() }); C.orders = C.orders.slice(0, 40); store.set('orders', C.orders);
      const bukti = C.bukti; C.cart = []; C.voucher = null; C.bukti = null; C.sel = {}; saveCart();
      if (bukti) K.api('uploadBukti', { id: p.id, akses: p.akses, file: { mime: bukti.mime, base64: bukti.base64 } }, { write: true }).catch(e => K.toast('Bukti belum terunggah: ' + e.message, 'err'));
      K.store.set('o:' + p.id, p); K.go('/pesanan/' + p.id);
    });
  };
  K.page('checkout', { show() { if (!C.cart.length) return K.go('/', true); if (!C.cat) loadCatalog(); drawCheckout(); if (C.voucher) revalVoucher(); } });

  // ---------- konfirmasi ----------
  let pollT = null, curOrder = null;
  const stepIdx = o => o.status === 'Dibatalkan' ? -1 : o.status === 'Selesai' ? 2 : o.status === 'Diproses' ? 1 : 0;
  function drawKonf() {
    const el = K.pages.konfirmasi.el, o = curOrder; if (!o) return; const st = K.stLabel(o), i = stepIdx(o), t = toko();
    const sub = o.subtotal, ok = o.bayar && o.bayar.status === 'Disetujui';
    el.innerHTML = `<div class="c-body one"><div class="col" style="gap:16px;align-items:stretch"><div style="text-align:center"><div style="width:72px;height:72px;border-radius:50%;background:${o.status === 'Dibatalkan' ? 'var(--bad-bg)' : 'var(--peach-3)'};display:grid;place-items:center;margin:0 auto 12px;font-size:34px;color:${o.status === 'Dibatalkan' ? 'var(--bad)' : 'var(--primary)'}">${ic(o.status === 'Dibatalkan' ? 'circle-x' : 'circle-check')}</div>
      <h1 class="h1" style="font-size:26px">${o.status === 'Dibatalkan' ? 'Pesanan Dibatalkan' : o.status === 'Selesai' ? 'Pesanan Selesai — Selamat Menikmati!' : 'Pesanan Berhasil Dikirim ke Kasir & Barista!'}</h1><p class="muted mt8">${o.status === 'Dibatalkan' ? esc(o.bayar && o.bayar.catatan || 'Hubungi kasir untuk bantuan.') : 'Mohon tunggu sejenak, barista kami sedang menyiapkan pesanan terbaik Anda.'}</p>
      <div class="row wrap" style="justify-content:center;margin-top:12px"><span class="badge ${st.c}"><i class="dot"></i>${st.t}</span><span class="chip">#${esc(o.id)}</span>${o.meja ? `<span class="chip">${ic('armchair')}Meja ${esc(o.meja)} (${esc(o.layanan)})</span>` : `<span class="chip">${esc(o.layanan)}</span>`}</div></div>
      ${i >= 0 ? `<div class="card"><div class="timeline">${['Menunggu Verifikasi', 'Diproses Barista', 'Selesai'].map((s, k) => `<div class="tk ${k <= i ? 'on' : ''}"><i>${k < i ? ic('check') : k + 1}</i>${s}</div>`).join('')}</div></div>` : ''}
      ${o.bayar && o.bayar.status === 'Menunggu' && !o.bayar.adaBukti && o.bayar.tipe !== 'cash' ? `<div class="card tint row wrap">${ic('image-up')}<span class="grow">Belum ada bukti pembayaran. Unggah agar kasir lebih cepat memverifikasi.</span><button class="btn btn-p btn-sm" data-a="upBukti">Unggah Bukti</button></div>` : ''}
      ${o.bayar && o.bayar.tipe === 'cash' && o.status === 'Baru' ? `<div class="card tint row">${ic('banknote')}<span>Silakan menuju kasir dan sebutkan ID pesanan <b>${esc(o.id)}</b> untuk membayar tunai.</span></div>` : ''}
      <div class="receipt print-area"><div style="text-align:center"><div style="width:44px;height:44px;border-radius:50%;background:var(--peach);display:grid;place-items:center;margin:0 auto 8px;color:var(--primary);font-size:20px">${ic('coffee')}</div><h3 style="font-size:17px;letter-spacing:.02em">${esc((t.nama || '').toUpperCase())}</h3><div class="sm muted">${esc(t.alamat || '')}${t.telp ? '<br>Telp: ' + esc(t.telp) : ''}</div></div><hr>
        <div class="row sm wrap" style="justify-content:space-between;background:var(--peach-1);padding:8px 12px;border-radius:8px"><span>${ic('clock')} ${esc(K.tglJam(o.waktu))}</span><span>${ic('user')} ${o.oleh ? 'Kasir: ' + esc(o.oleh) : 'Self-Order'}</span></div>
        <div class="sm muted mt16" style="letter-spacing:.06em;display:flex;justify-content:space-between"><span>ITEM & RINCIAN</span><span>SUBTOTAL</span></div>
        ${o.items.map(it => `<div class="ln" style="align-items:flex-start"><div class="row" style="align-items:flex-start"><span class="chip" style="padding:2px 8px;border-radius:6px;background:var(--peach-3);color:var(--primary)">${it.qty}x</span><div><b>${esc(it.nama)}</b><div class="sm muted">${esc((it.opsi || []).join(' • '))}${it.catatan ? ' • ' + esc(it.catatan) : ''}</div></div></div><b class="num">${rp(it.subtotal)}</b></div>`).join('')}<hr>
        <div class="ln sm"><span>Subtotal Item (${o.items.reduce((s, x) => s + x.qty, 0)} item)</span><span class="num">${rp(sub)}</span></div><div class="ln sm"><span>Pajak Restoran PB1</span><span class="num">${rp(o.pajak)}</span></div>${o.servis ? `<div class="ln sm"><span>Biaya Layanan</span><span class="num">${rp(o.servis)}</span></div>` : ''}${o.diskon ? `<div class="ln sm pri"><span>Diskon ${esc(o.voucher || 'Promo')}</span><span class="num">-${rp(o.diskon)}</span></div>` : ''}
        <div class="card tint row" style="justify-content:space-between;box-shadow:none;margin-top:8px"><div><div class="sm muted">TOTAL TAGIHAN</div><b style="font-size:16px">TOTAL AKHIR</b></div><b class="num pri" style="font:700 28px var(--f-head)">${rp(o.total)}</b></div>
        <div class="row sm mt16" style="background:var(--peach-1);padding:10px 12px;border-radius:10px;justify-content:space-between"><span><b>${esc(o.bayar ? o.bayar.metode : '-')}</b><br><span class="muted">Ref: ${esc(o.id)}</span></span><span class="badge ${ok ? 'b-ok' : o.bayar && o.bayar.status === 'Ditolak' ? 'b-bad' : 'b-warn'}"><i class="dot"></i>${ok ? 'Terverifikasi kasir' : o.bayar ? o.bayar.status : '-'}</span></div>
        <div style="text-align:center;margin-top:16px"><svg id="bc" width="260" height="56" style="max-width:100%"></svg><div class="sm muted mono">*${esc(o.id)}*</div><div class="sm muted" style="font-style:italic;margin-top:8px">Simpan bukti ini sebagai tanda pengambilan pesanan di Bar Counter.</div></div></div>
      <div class="row wrap" style="justify-content:center"><button class="btn btn-p btn-lg" data-a="invoice" ${ok ? '' : 'disabled'} title="${ok ? '' : 'Tersedia setelah pembayaran disetujui kasir'}">${ic('download')}Unduh Invoice (PDF)</button><button class="btn btn-s btn-lg" data-a="printStruk">${ic('printer')}Cetak Struk / Receipt</button></div>
      ${ok ? '' : '<div class="sm muted" style="text-align:center">Invoice PDF tersedia setelah pembayaran disetujui kasir.</div>'}
      <a href="#/" style="text-align:center" class="b">${ic('arrow-left')} Pesan Menu Tambahan (Kembali ke Katalog)</a></div></div>`;
    drawBarcode($('#bc'), o.id);
  }
  function drawBarcode(svg, text) { if (!svg) return; let x = 0, out = ''; for (let i = 0; i < text.length * 3; i++) { const c = text.charCodeAt(i % text.length) + i * 7, w = 1 + (c % 3), g = 1 + ((c >> 2) % 2); out += `<rect x="${x}" y="0" width="${w}" height="56" fill="#27180d"/>`; x += w + g; if (x > 258) break; } svg.setAttribute('viewBox', `0 0 ${Math.max(x, 100)} 56`); svg.innerHTML = out; }
  K.act.printStruk = () => window.print();
  K.act.upBukti = async el => { try { const f = await K.pickFile('image/*,application/pdf'); if (!f) return; const b = await K.fileToB64(f); await K.btnBusy(el, async () => { await K.api('uploadBukti', { id: curOrder.id, akses: curOrder.akses, file: { mime: b.mime, base64: b.base64 } }, { write: true }); K.toast('Bukti terunggah', 'ok'); fetchOrder(); }); } catch (e) { K.toast(e.message, 'err'); } };
  K.act.invoice = async el => { await K.btnBusy(el, async () => { const r = await K.api('invoicePublic', { id: curOrder.id, akses: curOrder.akses }, { timeout: 90000 }); K.download(r.base64, r.mime, r.nama); K.toast('Invoice diunduh', 'ok'); }); };
  async function fetchOrder(silent) {
    const id = curOrder && curOrder.id; if (!id) return;
    try { const d = await K.api('orderStatus', { id, akses: curOrder.akses }, { silent: true }); d.akses = curOrder.akses; const prev = curOrder.status + (curOrder.bayar && curOrder.bayar.status); curOrder = d; K.store.set('o:' + id, d); if (K.pages.konfirmasi.el.classList.contains('on')) { drawKonf(); if (prev !== d.status + (d.bayar && d.bayar.status) && silent) { K.toast('Status: ' + K.stLabel(d).t, 'ok'); K.beep(); } } } catch (e) { if (!silent) K.toast(e.message, 'err'); }
  }
  K.page('konfirmasi', {
    show(p) {
      const rec = C.orders.find(o => o.id === p.id), cached = K.store.get('o:' + p.id);
      if (!rec) { K.toast('Pesanan tidak ditemukan di perangkat ini.', 'err'); return K.go('/riwayat', true); }
      curOrder = Object.assign({}, cached || { id: p.id, items: [], bayar: null, status: 'Baru', layanan: '', waktu: '' }, { akses: rec.akses }); drawKonf(); fetchOrder();
      clearInterval(pollT); pollT = setInterval(() => { if (document.hidden || !curOrder || curOrder.status === 'Selesai' || curOrder.status === 'Dibatalkan') return; fetchOrder(true); }, 6000);
    },
    hide() { clearInterval(pollT); }
  });
  K.page('pesananku', { show() { C.orders.length ? K.go('/pesanan/' + C.orders[0].id, true) : K.go('/riwayat', true); } });

  // ---------- riwayat ----------
  let hist = [], hFilter = 'Semua', hQ = '';
  function reorder(o) {
    if (!C.cat) return K.toast('Katalog belum siap', 'err'); let n = 0;
    o.items.forEach(it => { const m = menuById(it.menuId); if (!m || !m.ready) return; const pilih = defaults(m); m.opsi.forEach(g => { const f = g.pilihan.find(p => (it.opsi || []).includes(p.nama)); if (f) pilih[g.kunci] = f.nama; }); const key = lineKey(m.id, pilih, it.catatan); const ex = C.cart.find(l => l.key === key); if (ex) ex.qty += it.qty; else C.cart.push({ key, menuId: m.id, nama: m.nama, unit: unitPrice(m, pilih), qty: it.qty, pilih, catatan: it.catatan || '', foto: m.foto }); n++; });
    saveCart(); n ? (K.toast(n + ' menu ditambahkan ke keranjang', 'ok'), K.go('/')) : K.toast('Menu pada pesanan ini sudah tidak tersedia', 'err');
  }
  K.act.reorder = el => { const o = hist.find(x => x.id === el.dataset.id); o && reorder(o); };
  K.act.hf = el => { hFilter = el.dataset.v; drawRiwayat(); };
  K.inp.hq = el => { hQ = el.value; drawRiwayat(true); };
  function drawRiwayat(listOnly) {
    const el = K.pages.riwayat.el, today = K.today(), list = hist.filter(o => (hFilter === 'Semua' || K.stLabel(o).t.startsWith(hFilter)) && (!hQ || (o.id + ' ' + o.items.map(i => i.nama).join(' ')).toLowerCase().includes(hQ.toLowerCase())));
    const hariIni = hist.filter(o => String(o.waktu).slice(0, 10) === today && o.status !== 'Dibatalkan'), totalH = hariIni.reduce((s, o) => s + o.total, 0), lunas = hariIni.filter(o => o.bayar && o.bayar.status === 'Disetujui').length;
    const cnt = k => hist.filter(o => K.stLabel(o).t.startsWith(k)).length, stamps = Math.min(5, Math.floor(hist.filter(o => o.bayar && o.bayar.status === 'Disetujui' && String(o.waktu).slice(0, 10) === today).reduce((s, o) => s + o.total, 0) / 50000));
    const cards = list.length ? list.map(o => { const st = K.stLabel(o), ok = o.bayar && o.bayar.status === 'Disetujui'; return `<article class="ord-card"><div class="row wrap"><b class="pri" style="font:700 18px var(--f-head)">#${esc(o.id)}</b><span class="chip">${ic('clock')}${K.jam(o.waktu)} WIB</span><span class="chip">${esc(o.layanan)}${o.meja ? ' (Meja ' + esc(o.meja) + ')' : ''}</span><span class="badge ${st.c} right"><i class="dot"></i>${st.t}</span></div>
        <div class="it-box mt16">${o.items.map(it => `<div class="it"><span class="q">${it.qty}x</span><div class="grow"><b>${esc(it.nama)}</b><div class="sm muted">${esc((it.opsi || []).join(', '))}</div></div><b class="num">${rp(it.subtotal)}</b></div>`).join('')}</div>
        <div class="row wrap mt16"><div><div class="sm muted">Total Tagihan</div><b class="num pri" style="font:700 24px var(--f-head)">${rp(o.total)}</b></div><span class="chip">${esc(o.bayar ? o.bayar.metode : '')}</span><div class="row right wrap"><a class="btn btn-t" href="#/pesanan/${esc(o.id)}">${ic(o.status === 'Baru' || o.status === 'Diproses' ? 'refresh-cw' : 'receipt-text')}${o.status === 'Baru' || o.status === 'Diproses' ? 'Cek Status Live' : 'Lihat Struk'}</a>${o.status === 'Selesai' || o.status === 'Dibatalkan' ? `<button class="btn btn-p" data-a="reorder" data-id="${esc(o.id)}">${ic('rotate-ccw')}Pesan Lagi</button>` : ''}</div></div></article>`; }).join('') : `<div class="empty card">${ic('receipt-text')}<div>Belum ada pesanan${hQ || hFilter !== 'Semua' ? ' yang cocok' : ''}.</div><a class="btn btn-p mt16" href="#/">Mulai Pesan</a></div>`;
    if (listOnly && $('#h-list')) return K.render($('#h-list'), cards);
    el.innerHTML = `<div class="c-body"><div><div class="eyebrow row">${ic('receipt-text')}Buku Riwayat Transaksi</div><div class="row wrap" style="align-items:flex-end;margin:4px 0 16px"><h1 class="h1 grow">Riwayat Pesanan Pelanggan</h1><button class="btn btn-s" data-a="reloadH">${ic('refresh-cw')}Segarkan</button></div>
      <div class="card col" style="gap:12px;margin-bottom:16px"><div class="search">${ic('search')}<input class="in" data-i="hq" placeholder="Cari ID pesanan atau nama menu…" value="${esc(hQ)}"></div><div class="row wrap">${[['Semua', hist.length], ['Menunggu', cnt('Menunggu')], ['Diproses', cnt('Diproses')], ['Selesai', cnt('Selesai')], ['Dibatalkan', cnt('Dibatalkan')]].map(f => `<button class="chip ${hFilter === f[0] ? 'on' : ''}" data-a="hf" data-v="${f[0]}" style="min-height:32px;font-size:12px">${f[0]} (${f[1]})</button>`).join('')}</div></div><div id="h-list">${cards}</div></div>
      <aside class="col" style="gap:16px;position:sticky;top:76px"><div class="card"><div class="row"><div class="th" style="width:40px;height:40px;border-radius:10px;background:var(--peach);display:grid;place-items:center;color:var(--primary)">${ic('armchair')}</div><div><b style="font-size:16px">${C.meja ? 'Meja ' + esc(C.meja) : 'Perangkat Ini'}</b><div class="sm muted">Ringkasan Kunjungan</div></div><span class="chip right">Hari Ini</span></div><div class="grid g2 mt16"><div class="card tint" style="box-shadow:none"><div class="sm muted">Total Tagihan</div><b class="num pri" style="font:700 20px var(--f-head)">${rp(totalH)}</b></div><div class="card tint" style="box-shadow:none"><div class="sm muted">Total Pesanan</div><b style="font:700 20px var(--f-head)">${hariIni.length} Nota</b><div class="sm muted">${lunas} lunas</div></div></div></div>
      <div class="card dark"><div class="sm b" style="color:var(--amber);letter-spacing:.06em">${ic('star')} PROGRAM LOYALITAS</div><h3 class="ttl mt8" style="color:#fff">Kumpulkan Stamp Kunjungan</h3><p class="sm mt8" style="color:#e9dccd">Setiap kelipatan Rp 50.000 mendapatkan 1 stamp. Hari ini kamu menghasilkan ${stamps} stamp aktif!</p><div class="row mt16">${[1, 2, 3, 4, 5].map(n => `<span style="width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:${n <= stamps ? 'var(--primary-2)' : 'rgba(255,255,255,.12)'}">${n <= stamps ? ic('coffee') : n}</span>`).join('')}</div></div></aside></div>`;
  }
  K.act.reloadH = () => loadHist(true);
  async function loadHist(force) {
    const local = C.orders.map(o => K.store.get('o:' + o.id)).filter(Boolean); if (local.length && !hist.length) { hist = local; drawRiwayat(); }
    try { const d = await K.api('orderHistory', { cid: C.cust.id }, { silent: !force }); hist = d.rows; drawRiwayat(); } catch (e) { if (force) K.toast(e.message, 'err'); }
  }
  K.page('riwayat', { show() { if (!hist.length) K.pages.riwayat.el.innerHTML = `<div class="c-body"><div class="sk" style="height:300px"></div></div>`; if (!C.cat) loadCatalog(); loadHist(); } });

  // ---------- pengaturan ----------
  K.page('akunku', {
    show(p, el) {
      el.innerHTML = `<div class="c-body one"><div class="col" style="gap:16px;max-width:560px"><h1 class="h1">Pengaturan</h1><div class="card col gap16"><div class="fld"><label>Nama</label><input class="in" id="s-nama" maxlength="60" value="${esc(C.cust.nama)}"></div><div class="fld"><label>WhatsApp (opsional)</label><input class="in" id="s-wa" inputmode="tel" value="${esc(C.cust.wa)}"></div><div class="fld"><label>Nomor Meja</label><input class="in" id="s-meja" maxlength="10" value="${esc(C.meja)}" placeholder="Mis. 08"></div><button class="btn btn-p" data-a="saveSet">Simpan</button></div>
      <div class="card col"><b>Data di perangkat ini</b><div class="sm muted">Keranjang dan riwayat pesanan disimpan di perangkat Anda. Menghapus data tidak membatalkan pesanan yang sudah masuk.</div><button class="btn btn-d" data-a="wipe" style="width:max-content">${ic('trash-2')}Hapus Data Perangkat</button></div></div></div>`;
    }
  });
  K.act.saveSet = () => { C.cust.nama = $('#s-nama').value.trim(); C.cust.wa = $('#s-wa').value.trim(); C.meja = $('#s-meja').value.trim().replace(/[^0-9A-Za-z\-]/g, ''); store.set('cust', C.cust); saveCart(); K.toast('Tersimpan', 'ok'); };
  K.act.wipe = async () => { if (await K.confirm('Hapus data perangkat?', 'Keranjang & riwayat lokal akan dihapus.', { danger: true })) { store.clearPrefix(''); location.hash = '#/'; location.reload(); } };

  K.route('/', 'katalog'); K.route('/checkout', 'checkout'); K.route('/pesanan', 'pesananku'); K.route('/pesanan/:id', 'konfirmasi'); K.route('/riwayat', 'riwayat'); K.route('/pengaturan', 'akunku');
  K.initCustomer = function () { buildShell(); loadCatalog(true); };
})();
