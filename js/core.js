/* E-Kasir — core: Store, API (gas-pro-api), SWR cache (gas-instant-ux-pro), router, UI */
(function () {
  'use strict';
  const CFG = window.EKASIR_CONFIG, K = (window.K = {});
  const PFX = 'ek1:';
  K.$ = (s, r) => (r || document).querySelector(s);
  K.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  K.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  K.rp = n => 'Rp' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  K.rp0 = n => 'Rp ' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  K.n = n => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  K.jam = iso => String(iso || '').slice(11, 16);
  K.tgl = iso => { const s = String(iso || ''); return s.length < 10 ? '' : (+s.slice(8, 10)) + ' ' + BLN[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4); };
  K.tglJam = iso => K.tgl(iso) + ', ' + K.jam(iso) + ' WIB';
  K.today = () => { const d = new Date(Date.now() + (7 * 60 + new Date().getTimezoneOffset()) * 60000); return d.toISOString().slice(0, 10); };
  K.addDays = (k, n) => { const p = k.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); };
  K.ago = iso => { if (!iso) return '-'; const ms = Date.now() - new Date(String(iso).slice(0, 19) + '+07:00').getTime(), m = Math.floor(ms / 60000); if (m < 1) return 'baru saja'; if (m < 60) return m + ' mnt lalu'; if (m < 1440) return Math.floor(m / 60) + ' jam lalu'; return Math.floor(m / 1440) + ' hari lalu'; };
  K.debounce = (f, ms) => { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => f.apply(c, a), ms); }; };
  K.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  K.ic = (n, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${(window.ICONS || {})[n] || ''}</svg>`;
  K.initial = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();

  // ---------- Store ----------
  K.store = {
    get(k, d) { try { const v = localStorage.getItem(PFX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(PFX + k, JSON.stringify(v)); } catch (e) { /* kuota penuh: abaikan */ } },
    del(k) { try { localStorage.removeItem(PFX + k); } catch (e) {} },
    clearPrefix(p) { try { Object.keys(localStorage).filter(x => x.indexOf(PFX + p) === 0).forEach(x => localStorage.removeItem(x)); } catch (e) {} }
  };
  K.S = { token: K.store.get('token', ''), user: K.store.get('user', null) };

  // ---------- Indikator ----------
  let busyN = 0;
  K.busy = d => { busyN = Math.max(0, busyN + d); const b = K.$('#topline'); if (!b) return; if (busyN) { b.style.opacity = 1; b.style.width = '70%'; } else { b.style.width = '100%'; setTimeout(() => { if (!busyN) { b.style.opacity = 0; b.style.width = '0'; } }, 250); } };
  window.addEventListener('offline', () => K.$('#netbar') && K.$('#netbar').classList.add('on'));
  window.addEventListener('online', () => { K.$('#netbar') && K.$('#netbar').classList.remove('on'); K.toast('Kembali online', 'ok'); });

  // ---------- API ----------
  K.api = async function (action, data, o) {
    o = o || {};
    if (!CFG.API_URL || /GANTI_DENGAN/.test(CFG.API_URL)) throw new Error('URL backend belum diatur. Isi API_URL di js/config.js.');
    const body = JSON.stringify({ action, data: data || {}, token: K.S.token || '', reqId: o.write ? K.uid() : '' });
    const tries = o.write ? 2 : 2;
    let last;
    if (!o.silent) K.busy(1);
    try {
      for (let i = 0; i < tries; i++) {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), o.timeout || 45000);
        try {
          const res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, signal: ctl.signal, redirect: 'follow' });
          clearTimeout(to);
          const j = await res.json();
          if (!j.success) { const e = new Error(j.message || 'Gagal'); e.code = j.data && j.data.code; e.data = j.data; if (e.code === 'AUTH') K.expire(); throw e; }
          return j.data;
        } catch (e) {
          clearTimeout(to);
          if (e.code) throw e;
          last = new Error(navigator.onLine === false ? 'Anda sedang offline.' : 'Koneksi bermasalah. Coba lagi.');
          if (i < tries - 1) await new Promise(r => setTimeout(r, 700));
        }
      }
      throw last;
    } finally { if (!o.silent) K.busy(-1); }
  };
  /** Stale-while-revalidate: tampilkan cache seketika, segarkan di latar. */
  K.swr = function (key, action, data, o) {
    o = o || {}; const ck = 'c:' + key, c = K.store.get(ck);
    if (c && o.render) { try { o.render(c.d, true); } catch (e) { console.error(e); } }
    if (c && !o.force && Date.now() - c.t < (o.ttl || 30000)) return Promise.resolve(c.d);
    return K.api(action, data, { silent: !!c }).then(d => {
      const same = c && JSON.stringify(c.d) === JSON.stringify(d);
      K.store.set(ck, { t: Date.now(), d });
      if (o.render && !same) o.render(d, false);
      return d;
    });
  };
  K.expire = () => { if (!K.S.token) return; K.logout(true); };
  K.logout = function (expired) {
    K.S.token = ''; K.S.user = null; K.store.del('token'); K.store.del('user'); K.store.clearPrefix('c:a');
    if (K.stopPoll) K.stopPoll();
    if (expired) K.toast('Sesi berakhir. Silakan masuk lagi.', 'err');
    K.go('/admin/login');
  };

  // ---------- UI ----------
  K.toast = function (msg, type) {
    const w = K.$('#toasts'); if (!w) return;
    const t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.innerHTML = (type === 'err' ? K.ic('circle-alert') : type === 'ok' ? K.ic('circle-check') : K.ic('info')) + '<span>' + K.esc(msg) + '</span>';
    w.appendChild(t); setTimeout(() => { t.style.opacity = 0; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, type === 'err' ? 4500 : 2600);
  };
  const stack = [];
  K.modal = function (html, o) {
    o = o || {};
    const ov = document.createElement('div'); ov.className = 'ov'; ov.innerHTML = `<div class="modal" style="--w:${o.w || 560}px" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    const api = { el: ov.firstChild, close() { const i = stack.indexOf(api); if (i > -1) stack.splice(i, 1); ov.remove(); if (!stack.length) document.body.style.overflow = ''; o.onclose && o.onclose(); } };
    ov.addEventListener('mousedown', e => { if (e.target === ov && !o.lock) api.close(); });
    stack.push(api); const f = ov.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 50);
    return api;
  };
  K.drawer = function (html, o) {
    const ov = document.createElement('div'); ov.className = 'ov'; ov.style.justifyContent = 'flex-end'; ov.style.padding = '0'; ov.style.alignItems = 'stretch';
    ov.innerHTML = `<div class="drawer" style="position:relative">${html}</div>`; document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    const api = { el: ov.firstChild, close() { const i = stack.indexOf(api); if (i > -1) stack.splice(i, 1); ov.remove(); if (!stack.length) document.body.style.overflow = ''; o && o.onclose && o.onclose(); } };
    ov.addEventListener('mousedown', e => { if (e.target === ov) api.close(); }); stack.push(api); return api;
  };
  K.closeTop = () => { const t = stack[stack.length - 1]; if (t) t.close(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') K.closeTop(); });
  K.confirm = (title, msg, o) => new Promise(res => {
    o = o || {};
    const m = K.modal(`<div class="mb"><h3 class="ttl">${K.esc(title)}</h3><p class="mt8 muted">${msg}</p></div><div class="mf"><button class="btn btn-s" data-x="0">${o.no || 'Batal'}</button><button class="btn ${o.danger ? 'btn-d' : 'btn-p'}" data-x="1" autofocus>${o.yes || 'Ya, lanjutkan'}</button></div>`, { w: 420, onclose: () => res(false) });
    m.el.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (b) { const v = b.dataset.x === '1'; m.el.dataset.done = 1; res(v); m.close(); } });
  });
  /** Dialog isian singkat → {nilai} atau null. fields: [{k,label,type,ph,val}] */
  K.ask = (title, fields, o) => new Promise(res => {
    o = o || {};
    const m = K.modal(`<div class="mh"><div class="grow"><h3 class="ttl">${K.esc(title)}</h3>${o.sub ? `<div class="sub">${o.sub}</div>` : ''}</div><button class="btn btn-ic btn-s" data-x="0">${K.ic('x')}</button></div><div class="mb col gap16">${fields.map((f, i) => `<div class="fld"><label>${K.esc(f.label)}</label>${f.type === 'textarea' ? `<textarea class="in" data-k="${f.k}" placeholder="${K.esc(f.ph || '')}">${K.esc(f.val || '')}</textarea>` : `<input class="in" data-k="${f.k}" type="${f.type || 'text'}" placeholder="${K.esc(f.ph || '')}" value="${K.esc(f.val || '')}" ${i === 0 ? 'autofocus' : ''} autocomplete="off">`}${f.hint ? `<div class="hint">${f.hint}</div>` : ''}</div>`).join('')}</div><div class="mf"><button class="btn btn-s" data-x="0">Batal</button><button class="btn ${o.danger ? 'btn-d' : 'btn-p'}" data-x="1">${o.yes || 'Simpan'}</button></div>`, { w: o.w || 440, onclose: () => res(null) });
    m.el.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (!b) return; if (b.dataset.x === '1') { const v = {}; K.$$('[data-k]', m.el).forEach(i => v[i.dataset.k] = i.value); res(v); m.close(); } else m.close(); });
    m.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') K.$('[data-x="1"]', m.el).click(); });
  });
  K.btnBusy = async function (btn, fn) {
    if (!btn || btn.classList.contains('loading')) return;
    btn.classList.add('loading');
    try { return await fn(); } catch (e) { K.toast(e.message, 'err'); } finally { btn.classList.remove('loading'); }
  };
  /** Render hanya bila HTML berubah (hemat DOM). */
  K.render = (el, html) => { if (!el) return; if (el._h === html) return; el._h = html; el.innerHTML = html; };
  K.beep = () => { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .5); o.start(); o.stop(c.currentTime + .5); } catch (e) {} };
  K.download = (b64, mime, name) => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); const u = URL.createObjectURL(new Blob([a], { type: mime })); const l = document.createElement('a'); l.href = u; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); };
  K.downloadText = (text, name, mime) => { const u = URL.createObjectURL(new Blob([text], { type: mime || 'text/csv;charset=utf-8' })); const l = document.createElement('a'); l.href = u; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); };
  K.csv = rows => rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  /** Baca gambar → kompres (maks 1280px, JPEG .82). PDF dikirim apa adanya. */
  K.fileToB64 = file => new Promise((res, rej) => {
    if (!file) return rej(new Error('Tidak ada file.'));
    if (file.type === 'application/pdf') { if (file.size > 3 * 1024 * 1024) return rej(new Error('PDF maksimal 3 MB.')); const r = new FileReader(); r.onload = () => res({ mime: file.type, base64: String(r.result).split(',')[1], preview: '' }); return r.readAsDataURL(file); }
    if (!/^image\//.test(file.type)) return rej(new Error('Gunakan JPG, PNG, atau PDF.'));
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => { const m = 1280, s = Math.min(1, m / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); const d = c.toDataURL('image/jpeg', .82); res({ mime: 'image/jpeg', base64: d.split(',')[1], preview: d }); };
    img.onerror = () => rej(new Error('Gambar tidak dapat dibaca.')); img.src = u;
  });
  K.pickFile = (accept) => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept || 'image/*'; i.onchange = () => res(i.files[0] || null); i.click(); });
  K.loadScript = src => new Promise((res, rej) => { if (K.$(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat ' + src)); document.head.appendChild(s); });

  // ---------- Event delegation ----------
  K.act = {}; K.inp = {};
  document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (!el) return; const f = K.act[el.dataset.a]; if (f) { if (el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault(); f(el, e); } });
  document.addEventListener('input', e => { const el = e.target.closest('[data-i]'); if (el && K.inp[el.dataset.i]) K.inp[el.dataset.i](el, e); });
  document.addEventListener('change', e => { const el = e.target.closest('[data-c]'); if (el && K.inp[el.dataset.c]) K.inp[el.dataset.c](el, e); });

  // ---------- Router ----------
  K.pages = {}; const routes = []; let cur = null;
  K.page = (id, def) => { K.pages[id] = def; return def; };
  K.route = (pattern, id, o) => { const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (m, k) => { keys.push(k); return '([^/]+)'; }) + '$'); routes.push({ re, keys, id, o: o || {} }); };
  K.go = (p, replace) => { const h = '#' + p; if (location.hash === h) return K.nav(); if (replace) location.replace(h); else location.hash = h; };
  K.nav = async function () {
    const path = (location.hash.slice(1) || '/').split('?')[0];
    let hit = null, params = {};
    for (const r of routes) { const m = r.re.exec(path); if (m) { hit = r; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1])); break; } }
    if (!hit) return K.go('/', true);
    const admin = path.indexOf('/admin') === 0;
    if (admin && hit.id !== 'login' && !K.S.token) return K.go('/admin/login', true);
    if (hit.id === 'login' && K.S.token) return K.go('/admin/dashboard', true);
    if (hit.o.owner && K.S.user && K.S.user.peran !== 'Owner') { K.toast('Menu ini khusus Owner.', 'err'); return K.go('/admin/dashboard', true); }
    if (admin && !K.adminReady) { try { await K.loadAdmin(); } catch (e) { K.toast(e.message, 'err'); return; } }
    const zone = hit.id === 'login' ? 'login' : admin ? 'adm' : 'cust';
    ['cust', 'adm', 'login'].forEach(z => { const el = K.$('#' + z); if (el) el.classList.toggle('hide', z !== zone); });
    if (K.zoneShow) K.zoneShow(zone, hit.id, params);
    const pg = K.pages[hit.id]; if (!pg) return;
    if (cur && cur !== pg && cur.hide) cur.hide();
    K.$$('.page.on').forEach(p => { if (p.id !== 'pg-' + hit.id) p.classList.remove('on'); });
    if (!pg.el) { pg.el = document.createElement('section'); pg.el.id = 'pg-' + hit.id; pg.el.className = 'page'; (K.$(pg.mount) || K.$('#' + zone)).appendChild(pg.el); pg.init && pg.init(pg.el); }
    pg.el.classList.add('on'); cur = pg; window.scrollTo(0, 0);
    pg.show && pg.show(params, pg.el);
    document.body.classList.remove('nav-open'); const sd = K.$('.a-side'); sd && sd.classList.remove('open'); const sc = K.$('.a-scrim'); sc && sc.remove();
  };
  K.loadAdmin = async function () {
    if (K.adminReady) return; K.busy(1);
    try { for (const f of ['js/admin-shell.js', 'js/admin-data.js', 'js/admin-tools.js']) await K.loadScript(f + '?v=' + CFG.VERSION); K.adminReady = true; } finally { K.busy(-1); }
  };
  window.addEventListener('hashchange', () => K.nav());
})();
