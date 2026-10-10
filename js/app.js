/* E-Kasir — bootstrap: rute, pemanasan server, prefetch */
(function () {
  'use strict';
  K.initCustomer();
  [['/admin/login', 'login'], ['/admin/dashboard', 'dashboard'], ['/admin/pesanan', 'pesanan'], ['/admin/pos', 'pos'], ['/admin/pelanggan', 'pelanggan']].forEach(r => K.route(r[0], r[1]));
  [['menu', 'menu'], ['master', 'master'], ['laporan', 'laporan'], ['akun', 'akun'], ['log', 'log'], ['notif', 'notif'], ['dokumen', 'dokumen'], ['migrasi', 'migrasi'], ['pengaturan', 'pengaturan']].forEach(r => K.route('/admin/' + r[0], r[1], { owner: true }));
  K.nav().finally(() => { const b = document.getElementById('boot'); if (b) { b.classList.add('off'); setTimeout(() => b.remove(), 400); } });
  // Pemanasan: bangunkan server GAS (cold start) tanpa menunggu
  setTimeout(() => { try { fetch(window.EKASIR_CONFIG.API_URL + '?ping=1', { mode: 'no-cors' }).catch(() => {}); } catch (e) {} }, 800);
  // Admin: muat bundel admin di latar saat idle agar perpindahan menu instan
  if (K.S.token && 'requestIdleCallback' in window) requestIdleCallback(() => K.loadAdmin().catch(() => {}), { timeout: 4000 });
})();
