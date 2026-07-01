// SakuKilat - Achievement/Badge System
// Reconstructed from APK reverse engineering

import type { Badge, BadgeContext, Transaction } from '@/types';
import { streakStatus } from './analytics';

// localStorage key helpers
export const BACKUP_COUNT_KEY = 'sakukilat:v2:backup-count';
export const IMPORT_COUNT_KEY = 'sakukilat:v2:import-count';
export const ZEN_USED_KEY = 'sakukilat:v2:zen-used';
export const VOICE_COUNT_KEY = 'sakukilat:v2:voice-count';
export const EDIT_COUNT_KEY = 'sakukilat:v2:edit-count';
export const UNDO_COUNT_KEY = 'sakukilat:v2:undo-count';
export const GUIDE_OPENED_KEY = 'sakukilat:v2:guide-opened';
export const PHOTO_CHANGED_KEY = 'sakukilat:v2:photo-changed';
export const TABS_SEEN_KEY = 'sakukilat:v2:tabs-seen';
export const REKAP_DAYS_KEY = 'sakukilat:v2:rekap-days';
export const BADGE_UNLOCKS_KEY = 'sakukilat:v2:badge-unlocks';
export const BADGE_UNLOCK_QUEUE_KEY = 'sakukilat:v2:badge-unlock-queue';

function getCount(key: string): number {
  try { return Math.max(0, Number(window.localStorage.getItem(key) ?? 0)) || 0; } catch { return 0; }
}
function getFlag(key: string): boolean {
  try { return '1' === window.localStorage.getItem(key); } catch { return false; }
}
function setFlag(key: string): void {
  try { window.localStorage.setItem(key, '1'); } catch {}
}
function getSetSize(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? new Set(arr).size : 0;
  } catch { return 0; }
}
function addToSet(key: string, value: string): void {
  try {
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    const set = new Set(Array.isArray(arr) ? arr : []);
    set.add(value);
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {}
}
function bumpCount(key: string, by = 1): void {
  try { window.localStorage.setItem(key, String(getCount(key) + by)); } catch {}
}
function markZenUsed(): void { setFlag(ZEN_USED_KEY); }

function isRealTx(t: Transaction): boolean { return t.kind !== 'transfer' && t.kind !== 'saving'; }
function isMoveTx(t: Transaction): boolean { return t.kind === 'transfer' || t.kind === 'saving'; }
function descIncludes(t: Transaction, kw: string): boolean { return t.description.toLowerCase().includes(kw); }
function txCount(ctx: BadgeContext): number { return ctx.transactions.filter(isRealTx).length; }
function currentStreak(ctx: BadgeContext): number { return streakStatus(ctx.transactions).current; }
function totalSpent(ctx: BadgeContext): number {
  return ctx.transactions.filter((t) => isRealTx(t) && t.type === 'expense').reduce((a, t) => a + t.amount, 0);
}
function countMatching(ctx: BadgeContext, predicate: (t: Transaction) => boolean): number {
  return ctx.transactions.filter(predicate).length;
}
function hasTxInHourRange(ctx: BadgeContext, start: number, end: number): boolean {
  return ctx.transactions.some((t) => { const h = t.date.getHours(); return h >= start && h < end; });
}

// Badge group labels
const GROUP_STREAK = 'Streak & Kebiasaan';
const GROUP_VOLUME = 'Pencapaian & Volume';
const GROUP_BUDGET = 'Disiplin Anggaran';
const GROUP_ZEN = 'Psikologi & Zen';
const GROUP_LORE = 'Lore & Easter Egg';

// Helper: progress badge (threshold-based)
function progressBadge(
  id: string, group: string, title: string, howTo: string, copy: string,
  tier: Badge['tier'], trigger: Badge['trigger'],
  getValue: (ctx: BadgeContext) => number, target: number
): Badge {
  return {
    id, group, title, howTo, copy, tier, trigger,
    evaluate: (ctx) => {
      const current = getValue(ctx);
      return { progress: target <= 0 ? 1 : Math.max(0, Math.min(1, current / target)), current, target };
    },
  };
}

// Helper: boolean badge (condition-based)
function booleanBadge(
  id: string, group: string, title: string, howTo: string, copy: string,
  tier: Badge['tier'], trigger: Badge['trigger'],
  check: (ctx: BadgeContext) => boolean
): Badge {
  return {
    id, group, title, howTo, copy, tier, trigger,
    evaluate: (ctx) => ({ progress: +!!check(ctx) }),
  };
}

// Achievement flag helper
function achFlag(suffix: string): boolean {
  return getFlag(`sakukilat:v2:ach-${suffix}`);
}

export const BADGES: Badge[] = [
  // === Streak & Kebiasaan ===
  booleanBadge('a-egg', GROUP_STREAK, 'Pecah Telur', 'Catat transaksi pertamamu.', 'Telurnya pecah! Perjalanan dompet sehatmu dimulai.', 'bronze', 'ON_TX_SUBMIT', (c) => txCount(c) >= 1),
  progressBadge('a-7', GROUP_STREAK, 'Seminggu Tegak', 'Catat 7 hari beruntun.', '7 hari tanpa absen. Disiplinmu mulai kelihatan.', 'silver', 'ON_TX_SUBMIT', currentStreak, 7),
  progressBadge('a-30', GROUP_STREAK, 'Sebulan Penuh', 'Catat 30 hari beruntun.', 'Sebulan nonstop! Ini bukan kebetulan, ini kebiasaan.', 'gold', 'ON_TX_SUBMIT', currentStreak, 30),
  progressBadge('a-100', GROUP_STREAK, 'Si Kepala Batu', 'Catat 100 hari beruntun.', '100 hari?! Kepala batu finansial sejati.', 'gold', 'ON_TX_SUBMIT', currentStreak, 100),
  progressBadge('a-365', GROUP_STREAK, 'Setahun Setia', 'Catat 365 hari beruntun.', 'Setahun penuh. Kamu legenda, titik.', 'special', 'ON_TX_SUBMIT', currentStreak, 365),
  progressBadge('a-active90', GROUP_STREAK, 'Konsisten Sejati', 'Capai 90 hari aktif mencatat (total).', '90 hari penuh jejak. Konsistensi level dewa.', 'gold', 'ON_APP_MOUNT', (c) => streakStatus(c.transactions).totalDaysLogged, 90),
  progressBadge('a-dawn', GROUP_STREAK, 'Pejuang Subuh', 'Catat sebelum jam 6 pagi sebanyak 7 kali.', 'Belum melek penuh tapi dompet udah dicatat. Salut.', 'silver', 'ON_TX_SUBMIT', (c) => countMatching(c, (t) => 6 > t.date.getHours()), 7),
  booleanBadge('a-weekend', GROUP_STREAK, 'Anak Weekend', 'Catat di Sabtu dan Minggu.', 'Libur boleh, catat jalan terus.', 'bronze', 'ON_TX_SUBMIT', (c) => { const days = new Set(c.transactions.map((t) => t.date.getDay())); return days.has(0) && days.has(6); }),
  booleanBadge('a-night-routine', GROUP_STREAK, 'Penunggu Malam', 'Catat di malam hari (18.00-23.00).', 'Tutup hari dengan catatan. Tidurmu lebih tenang.', 'bronze', 'ON_TX_SUBMIT', (c) => hasTxInHourRange(c, 18, 23)),
  progressBadge('a-longest14', GROUP_STREAK, 'Dua Minggu Beruntun', 'Capai rekor streak 14 hari.', 'Dua minggu nonstop. Momentummu ngebut.', 'silver', 'ON_TX_SUBMIT', (c) => streakStatus(c.transactions).longest, 14),
  booleanBadge('a-comeback', GROUP_STREAK, 'Bangkit Lagi', 'Bangun streak 7 hari setelah sempat putus.', 'Jatuh bukan akhir. Kamu bangkit dan lari lagi.', 'silver', 'ON_TX_SUBMIT', (c) => { const s = streakStatus(c.transactions); return s.current >= 7 && s.longest > s.current; }),
  booleanBadge('a-lives-full', GROUP_STREAK, 'Nyawa Utuh', 'Catat hari ini dengan 5 nyawa penuh.', '5 nyawa aman. Rajinmu nggak main-main.', 'bronze', 'ON_TX_SUBMIT', (c) => { const s = streakStatus(c.transactions); return s.loggedToday && s.lives === s.maxLives; }),

  // === Pencapaian & Volume ===
  progressBadge('b-50', GROUP_VOLUME, 'Setengah Ratus', 'Catat 50 transaksi.', '50 catatan! Dompetmu makin terbaca.', 'bronze', 'ON_TX_SUBMIT', txCount, 50),
  progressBadge('b-500', GROUP_VOLUME, 'Lima Ratus Jejak', 'Catat 500 transaksi.', '500 jejak keuangan. Arsiparis beneran.', 'silver', 'ON_TX_SUBMIT', txCount, 500),
  progressBadge('b-2500', GROUP_VOLUME, 'Dua Ribu Lima Ratus', 'Catat 2.500 transaksi.', '2.500 catatan. Ini sih hobi, bukan tugas lagi.', 'gold', 'ON_TX_SUBMIT', txCount, 2500),
  progressBadge('b-10000', GROUP_VOLUME, 'Maha Pencatat', 'Catat 10.000 transaksi.', '10.000! Tugu peringatan layak dibangun untukmu.', 'special', 'ON_TX_SUBMIT', txCount, 10000),
  progressBadge('b-spent1jt', GROUP_VOLUME, 'Juta Pertama Tercatat', 'Total pengeluaran tercatat tembus Rp1 juta.', 'Sejuta rupiah terlacak. Nggak ada yang lolos.', 'bronze', 'ON_TX_SUBMIT', totalSpent, 1000000),
  progressBadge('b-spent100jt', GROUP_VOLUME, 'Sultan Pencatat', 'Total pengeluaran tercatat tembus Rp100 juta.', '100 juta lewat tanganmu, semua tercatat rapi.', 'special', 'ON_TX_SUBMIT', totalSpent, 100000000),
  progressBadge('b-wallet5', GROUP_VOLUME, 'Dompet Lengkap', 'Punya 5 saku.', '5 saku aktif. Manajer dompet profesional.', 'silver', 'ON_ROUTE_CHANGE', (c) => c.walletsCount, 5),
  progressBadge('b-cat10', GROUP_VOLUME, 'Kolektor Kategori', 'Pakai 10 kategori berbeda.', '10 warna pengeluaran. Hidupmu berwarna (dan tercatat).', 'silver', 'ON_TX_SUBMIT', (c) => new Set(c.transactions.filter(isRealTx).map((t) => t.category)).size, 10),
  booleanBadge('b-goal1', GROUP_VOLUME, 'Goal Perdana', 'Buat goal tabungan pertama.', 'Mimpi pertama dipasang. Ayo dikejar!', 'bronze', 'ON_ROUTE_CHANGE', (c) => c.goalsTotal >= 1),
  booleanBadge('b-goaldone', GROUP_VOLUME, 'Mimpi Terwujud', 'Capai 1 goal tabungan.', 'Target tembus! Rasanya beda kan kalau direncanakan.', 'gold', 'ON_TX_SUBMIT', (c) => c.goalsCompleted >= 1),
  progressBadge('b-goal5', GROUP_VOLUME, 'Pemburu Lima Mimpi', 'Capai 5 goal tabungan.', '5 mimpi terwujud. Kamu mesin pewujud target.', 'gold', 'ON_TX_SUBMIT', (c) => c.goalsCompleted, 5),
  booleanBadge('b-backup1', GROUP_VOLUME, 'Backup Perdana', 'Lakukan backup atau ekspor pertama.', 'Data diamankan. Tidur lebih nyenyak.', 'bronze', 'ON_ROUTE_CHANGE', (c) => c.backupCount >= 1),
  progressBadge('b-backup10', GROUP_VOLUME, 'Tukang Arsip', 'Backup 10 kali.', '10 backup. Paranoid sehat, kami suka.', 'silver', 'ON_ROUTE_CHANGE', (c) => c.backupCount, 10),
  booleanBadge('b-import', GROUP_VOLUME, 'Migrasi Sukses', 'Impor data pertama kali.', 'Pindah rumah lancar. Data lama selamat sampai tujuan.', 'silver', 'ON_APP_MOUNT', (c) => c.importCount >= 1),
  booleanBadge('b-veteran', GROUP_VOLUME, 'Veteran Data', 'Pernah impor dan sudah backup 10 kali.', 'Pindahan + rajin backup. Anti kehilangan sejati.', 'gold', 'ON_ROUTE_CHANGE', (c) => c.importCount >= 1 && c.backupCount >= 10),

  // === Disiplin Anggaran ===
  booleanBadge('c-setbudget', GROUP_BUDGET, 'Set Budget Pertama', 'Tetapkan budget bulanan.', 'Pagar sudah dipasang. Sekarang tinggal jaga.', 'bronze', 'ON_ROUTE_CHANGE', () => getFlag('sakukilat:v2:budget-set')),
  booleanBadge('c-surplus', GROUP_BUDGET, 'Surplus Bulanan', 'Pemasukan lebih besar dari pengeluaran bulan ini.', 'Plus, bukan minus. Bulan ini kamu menang.', 'silver', 'ON_CRON_MIDNIGHT', (c) => monthIncome(c) > monthExpense(c) && monthIncome(c) > 0),
  booleanBadge('c-nodebt', GROUP_BUDGET, 'Bebas Utang', 'Pastikan semua saku bersaldo positif.', 'Nggak ada yang minus. Lega tanpa beban.', 'silver', 'ON_TX_SUBMIT', (c) => c.transactions.length > 0 && [...walletBalances(c).values()].every((v) => v >= 0)),
  booleanBadge('c-mindful', GROUP_BUDGET, 'Mindful Spender', 'Buka Rekapan untuk evaluasi.', 'Evaluasi dulu, belanja kemudian. Bijak.', 'bronze', 'ON_ROUTE_CHANGE', (c) => c.rekapDaysSeen >= 1),
  progressBadge('c-detektif', GROUP_BUDGET, 'Detektif Duit', 'Buka Rekapan di 30 hari berbeda.', 'Rajin investigasi dompet sendiri. Nggak ada misteri.', 'gold', 'ON_ROUTE_CHANGE', (c) => c.rekapDaysSeen, 30),
  booleanBadge('c-paket', GROUP_BUDGET, 'Si Bijak', 'Aktifkan budget, goal, dan backup sekaligus.', 'Pagar, mimpi, dan cadangan lengkap. Paket komplit.', 'gold', 'ON_ROUTE_CHANGE', (c) => getFlag('sakukilat:v2:budget-set') && c.goalsTotal >= 1 && c.backupCount >= 1),
  booleanBadge('c-tutup-aman', GROUP_BUDGET, 'Tutup Bulan Aman', 'Akhiri satu bulan dengan pengeluaran di bawah budget.', 'Bulan ditutup dengan senyum. Budget terjaga.', 'silver', 'ON_CRON_MIDNIGHT', () => achFlag('tutup-aman')),
  booleanBadge('c-hemat-trio', GROUP_BUDGET, 'Hemat Trilogi', '3 bulan beruntun di bawah budget.', 'Tiga bulan irit berturut. Ini bukan keberuntungan.', 'gold', 'ON_CRON_MIDNIGHT', () => achFlag('hemat-trio')),
  booleanBadge('c-master', GROUP_BUDGET, 'Master Anggaran', '12 bulan keuangan sehat.', 'Setahun anggaran terkendali. Sensei budgeting.', 'special', 'ON_CRON_MIDNIGHT', () => achFlag('master')),
  booleanBadge('c-under50', GROUP_BUDGET, 'Di Bawah Separuh', 'Pakai kurang dari 50% budget sebulan.', 'Setengah budget aja cukup. Hemat tingkat lanjut.', 'silver', 'ON_CRON_MIDNIGHT', () => achFlag('under50')),
  booleanBadge('c-under25', GROUP_BUDGET, 'Irit Maksimal', 'Pakai kurang dari 25% budget sebulan.', 'Cuma seperempat budget?! Ajarin dong.', 'gold', 'ON_CRON_MIDNIGHT', () => achFlag('under25')),
  booleanBadge('c-week-green', GROUP_BUDGET, 'Minggu Hijau', '4 minggu tanpa lewat jatah.', 'Empat minggu hijau berturut. Stabil banget.', 'silver', 'ON_CRON_MIDNIGHT', () => achFlag('week-green')),
  booleanBadge('c-anti-bocor', GROUP_BUDGET, 'Anti Bocor', 'Sebulan tanpa satu pun hari over jatah.', 'Nol kebocoran sebulan. Dompet kedap air.', 'gold', 'ON_CRON_MIDNIGHT', () => achFlag('anti-bocor')),
  booleanBadge('c-budget-up', GROUP_BUDGET, 'Budget Naik Kelas', 'Revisi/ubah nilai budget bulanan setelah evaluasi.', 'Budget di-upgrade berdasarkan data. Makin matang.', 'silver', 'ON_ROUTE_CHANGE', () => achFlag('budget-up')),

  // === Psikologi & Zen ===
  booleanBadge('d-zen', GROUP_ZEN, 'Zen Master', 'Aktifkan Zen Mode.', 'Angka disembunyikan. Pikiran lebih damai.', 'bronze', 'ON_ROUTE_CHANGE', (c) => c.zenUsed),
  booleanBadge('d-zen30', GROUP_ZEN, 'Filosof Dompet', 'Pakai Zen Mode (lanjutkan kebiasaan 30 hari).', 'Sebulan dalam ketenangan. Uang bukan tuanmu.', 'gold', 'ON_CRON_MIDNIGHT', () => achFlag('zen30')),
  booleanBadge('d-noskip', GROUP_ZEN, 'Hari Tanpa Jajan', 'Lewati satu hari penuh tanpa pengeluaran.', 'Seharian nol jajan. Dompetmu istirahat.', 'bronze', 'ON_CRON_MIDNIGHT', () => achFlag('noskip')),
  booleanBadge('d-puasa', GROUP_ZEN, 'Puasa Belanja', '3 hari beruntun tanpa pengeluaran.', '3 hari puasa belanja. Tahan godaan, naik level.', 'silver', 'ON_CRON_MIDNIGHT', () => achFlag('puasa')),
  booleanBadge('d-weekend-hemat', GROUP_ZEN, 'Akhir Pekan Hemat', 'Sabtu-Minggu tanpa pengeluaran.', 'Weekend nol jajan. Healing nggak harus mahal.', 'silver', 'ON_CRON_MIDNIGHT', () => achFlag('weekend-hemat')),
  booleanBadge('d-turun', GROUP_ZEN, 'Lebih Irit dari Lalu', 'Pengeluaran mingguan turun dari minggu lalu.', 'Minggu ini lebih hemat. Grafik turun, hati senang.', 'silver', 'ON_CRON_MIDNIGHT', () => achFlag('turun')),
  booleanBadge('d-refleksi', GROUP_ZEN, 'Refleksi Tenang', 'Buka aplikasi dan lihat data tanpa belanja.', 'Sekadar merenungi angka. Sadar diri itu kaya.', 'bronze', 'ON_APP_MOUNT', (c) => c.transactions.length >= 5),
  booleanBadge('d-mindful2', GROUP_ZEN, 'Pembaca Data', 'Buka Rekapan di 10 hari berbeda.', 'Rajin baca laporan sendiri. Nggak buta arah.', 'silver', 'ON_ROUTE_CHANGE', (c) => c.rekapDaysSeen >= 10),
  booleanBadge('d-frugal', GROUP_ZEN, 'Frugal Sejati', 'Rasio tabungan di atas 50% selama 3 bulan.', 'Tiga bulan hemat ekstrem. Mindset kaya beneran.', 'gold', 'ON_CRON_MIDNIGHT', () => achFlag('frugal')),
  booleanBadge('d-napas', GROUP_ZEN, 'Napas Panjang', 'Savings rate positif selama 6 bulan.', 'Setengah tahun selalu nyisihkan. Napas finansialmu panjang.', 'special', 'ON_CRON_MIDNIGHT', () => achFlag('napas')),
  booleanBadge('d-dingin', GROUP_ZEN, 'Kepala Dingin', 'Seminggu tanpa belanja impulsif di atas Rp500rb.', 'Nggak ada checkout panas. Kepala tetap dingin.', 'silver', 'ON_CRON_MIDNIGHT', () => achFlag('dingin')),
  booleanBadge('d-antifomo', GROUP_ZEN, 'Anti FOMO', 'Seminggu tanpa pengeluaran kategori hiburan.', 'Skip hiburan seminggu. FOMO kalah sama logika.', 'silver', 'ON_CRON_MIDNIGHT', () => achFlag('antifomo')),
  booleanBadge('d-jujur', GROUP_ZEN, 'Sadar Diri', 'Catat dengan jujur 30 hari aktif.', 'Sebulan jujur sama dompet sendiri. Itu langka.', 'gold', 'ON_APP_MOUNT', (c) => streakStatus(c.transactions).totalDaysLogged >= 30),
  booleanBadge('d-evaluator', GROUP_ZEN, 'Si Evaluator', 'Buka tampilan Tren di Rekapan.', 'Lihat tren, ambil pelajaran. Otak finansial nyala.', 'bronze', 'ON_ROUTE_CHANGE', () => getFlag('sakukilat:v2:tren-seen')),
  booleanBadge('d-planner', GROUP_ZEN, 'Perencana Ulung', 'Buat goal dengan tenggat waktu.', 'Mimpi dengan deadline. Itu rencana, bukan angan.', 'silver', 'ON_ROUTE_CHANGE', () => getFlag('sakukilat:v2:goal-deadline')),
  booleanBadge('d-balance', GROUP_ZEN, 'Hidup Seimbang', 'Punya pemasukan dan pengeluaran tercatat di bulan yang sama.', 'Masuk dan keluar seimbang tercatat. Gambaran utuh.', 'bronze', 'ON_TX_SUBMIT', (c) => monthIncome(c) > 0 && monthExpense(c) > 0),
  booleanBadge('d-tepat-deadline', GROUP_ZEN, 'Tepat Deadline', 'Capai goal sebelum atau tepat tenggatnya.', 'Target kelar tepat waktu. Perencanaan jempolan.', 'gold', 'ON_TX_SUBMIT', () => achFlag('tepat-deadline')),
  booleanBadge('d-mahir', GROUP_ZEN, 'Mahir Mengelola', 'Punya 3+ saku dan minimal 1 goal aktif.', 'Banyak dompet, terarah ke tujuan. Pengelola handal.', 'silver', 'ON_ROUTE_CHANGE', (c) => c.walletsCount >= 3 && c.goalsTotal >= 1),

  // === Lore & Easter Egg ===
  booleanBadge('e-gaji-lewat', GROUP_LORE, 'Gaji Numpang Lewat', 'Catat income besar (≥Rp3jt), lalu pengeluaran menggerus >90% income itu.', 'Gaji cuma mampir say hi. Sabar, akhir bulan masih jauh.', 'gold', 'ON_TX_SUBMIT', (c) => {
    for (const inc of c.transactions.filter((t) => isRealTx(t) && t.type === 'income' && t.amount >= 3000000)) {
      const deadline = inc.date.getTime() + 432000000;
      const spent = c.transactions.filter((t) => isRealTx(t) && t.type === 'expense' && t.date.getTime() >= inc.date.getTime() && t.date.getTime() <= deadline).reduce((a, t) => a + t.amount, 0);
      if (spent >= 0.9 * inc.amount) return true;
    }
    return false;
  }),
  booleanBadge('e-survivor', GROUP_LORE, 'Survivor Tanggal Tua', 'Bertahan 5 hari (tgl 20-25) dengan pengeluaran harian < Rp20.000.', 'Bertahan di tanggal tua dengan elegan. Hidup keras, kamu lebih keras.', 'gold', 'ON_CRON_MIDNIGHT', () => achFlag('survivor')),
  progressBadge('e-parkir', GROUP_LORE, 'Pawang Parkir', 'Catat 10 transaksi tunai senilai tepat Rp2.000.', 'Receh parkir terlacak semua. Nggak ada yang lolos, pak.', 'silver', 'ON_TX_SUBMIT', (c) => countMatching(c, (t) => isRealTx(t) && 2000 === t.amount && 'tunai' === t.paymentMethod), 10),
  booleanBadge('e-paylater', GROUP_LORE, 'Budak Paylater', 'Catat pengeluaran pertama via metode bayar mengandung paylater.', 'Beli sekarang, nangis nanti. Tercatat ya, jangan lupa.', 'silver', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => /paylater|pay later|pinjol|kredivo|akulaku|spaylater/.test(t.paymentMethod.toLowerCase()))),
  progressBadge('e-gakjadi', GROUP_LORE, 'Gak Jadi Beli', 'Pakai tombol Urungkan 3 kali.', 'Maju mundur cantik. Akhirnya nggak jadi beli juga, hemat!', 'bronze', 'ON_TX_SUBMIT', (c) => c.undoCount, 3),
  booleanBadge('e-diskon', GROUP_LORE, 'Korban Diskon', 'Belanja di atas Rp300rb pada tanggal kembar (mis. 12 Des).', 'Diskon emang jebakan. Tapi tercatat, jadi nggak sepenuhnya kalah.', 'silver', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => isRealTx(t) && t.type === 'expense' && t.amount > 300000 && t.date.getDate() === t.date.getMonth() + 1)),
  booleanBadge('e-checkout-malam', GROUP_LORE, 'Racun Checkout Malam', 'Catat belanja antara jam 00.00-03.00.', 'Jempol gatel tengah malam. Besok pagi baru nyesel.', 'silver', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => isRealTx(t) && t.type === 'expense' && 3 > t.date.getHours() && ('belanja' === t.category || 'hiburan' === t.category))),
  booleanBadge('e-sultan', GROUP_LORE, 'Sultan Sehari', 'Catat satu transaksi di atas Rp10 juta.', 'Sekali transaksi, gaji orang sebulan. Hormat, bos.', 'special', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => isRealTx(t) && t.amount >= 10000000)),
  booleanBadge('e-receh', GROUP_LORE, 'Receh Hunter', 'Catat transaksi di bawah Rp1.000.', 'Recehan pun nggak luput. Detail banget kamu.', 'bronze', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => isRealTx(t) && t.amount > 0 && t.amount < 1000)),
  progressBadge('e-kopi', GROUP_LORE, 'Caffeine Dependent', "Catat 'kopi' sebanyak 7 kali.", 'Tujuh kali ngopi. Dompet & jantung sama-sama deg-degan.', 'silver', 'ON_TX_SUBMIT', (c) => countMatching(c, (t) => descIncludes(t, 'kopi')), 7),
  booleanBadge('e-boba', GROUP_LORE, 'Korban Boba', "Catat transaksi mengandung 'boba' atau 'milk tea'.", 'Boba lagi, boba lagi. Manisnya nempel di pengeluaran.', 'bronze', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => descIncludes(t, 'boba') || descIncludes(t, 'milk tea') || descIncludes(t, 'milktea'))),
  progressBadge('e-ojol', GROUP_LORE, 'Ojol Setia', 'Catat 10 transaksi ojek online (gojek/grab/ojol).', 'Mitra setia ojol. Abang driver berterima kasih.', 'silver', 'ON_TX_SUBMIT', (c) => countMatching(c, (t) => descIncludes(t, 'gojek') || descIncludes(t, 'grab') || descIncludes(t, 'ojol') || descIncludes(t, 'ojek')), 10),
  progressBadge('e-minimarket', GROUP_LORE, 'Anak Minimarket', 'Catat 10 transaksi di minimarket (indomaret/alfamart).', "Mampir 'cuma beli air', keluar bawa kresek. Klasik.", 'silver', 'ON_TX_SUBMIT', (c) => countMatching(c, (t) => descIncludes(t, 'indomaret') || descIncludes(t, 'alfamart') || descIncludes(t, 'minimarket')), 10),
  progressBadge('e-ongkir', GROUP_LORE, 'Korban Ongkir', "Catat 5 transaksi mengandung 'ongkir'.", 'Barang Rp10rb, ongkir Rp20rb. Logika belanja online.', 'bronze', 'ON_TX_SUBMIT', (c) => countMatching(c, (t) => descIncludes(t, 'ongkir')), 5),
  booleanBadge('e-tipis', GROUP_LORE, 'Dompet Tipis', 'Total saldo semua saku di bawah Rp50.000.', 'Tinggal segini? Tarik napas, akhir bulan ujian sesungguhnya.', 'bronze', 'ON_TX_SUBMIT', (c) => c.transactions.length >= 5 && 50000 > [...walletBalances(c).values()].reduce((a, b) => a + b, 0)),
  booleanBadge('e-tajir', GROUP_LORE, 'Tajir Mendadak', 'Catat pemasukan di atas Rp5 juta sekaligus.', 'Dari mana nih durian runtuh? Selamat menikmati (sebentar).', 'gold', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => isRealTx(t) && t.type === 'income' && t.amount >= 5000000)),
  booleanBadge('e-thr', GROUP_LORE, 'THR Cair!', 'Catat pemasukan kategori bonus/THR/hadiah.', 'THR turun! Tahan, jangan langsung ludes ya.', 'silver', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => isRealTx(t) && t.type === 'income' && ('hadiah' === t.category || descIncludes(t, 'thr') || descIncludes(t, 'bonus')))),
  booleanBadge('e-gajian', GROUP_LORE, 'Gajian!', 'Catat pemasukan kategori gaji.', 'Saldo hijau lagi! Tarik napas, ini cuma titipan tagihan.', 'bronze', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => isRealTx(t) && t.type === 'income' && 'gaji' === t.category)),
  booleanBadge('e-tekor-awal', GROUP_LORE, 'Tekor Awal Bulan', 'Pengeluaran besar di tanggal 1-5.', 'Baru awal bulan udah ngebut. Hati-hati, finish line jauh.', 'silver', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => isRealTx(t) && t.type === 'expense' && 5 >= t.date.getDate() && t.amount >= 500000)),
  progressBadge('e-padang', GROUP_LORE, 'Anak Padang', "Catat 'padang' sebanyak 5 kali.", 'Rendang lover sejati. Lauknya boleh, dompetnya dijaga.', 'bronze', 'ON_TX_SUBMIT', (c) => countMatching(c, (t) => descIncludes(t, 'padang')), 5),
  booleanBadge('e-patungan', GROUP_LORE, 'Patungan Pro', 'Pakai fitur bagi (split bill) — deskripsi berisi [1/n].', 'Bayar bareng, hemat bareng. Temen-temen sayang kamu.', 'silver', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => /\[1\/\d+\]/.test(t.description))),
  progressBadge('e-geser', GROUP_LORE, 'Tukang Geser', 'Lakukan 10 kali pindah uang antar saku.', 'Geser sana geser sini. Bendahara grup ya?', 'silver', 'ON_TX_SUBMIT', (c) => countMatching(c, (t) => 'transfer' === t.kind), 10),
  booleanBadge('e-nabung-malam', GROUP_LORE, 'Nabung Tengah Malam', 'Simpan uang antara jam 00.00-04.00.', 'Insaf tengah malam, langsung nabung. Hidayah finansial.', 'silver', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => 'saving' === t.kind && 4 > t.date.getHours())),
  booleanBadge('e-begadang', GROUP_LORE, 'Begadang Finansial', 'Catat transaksi antara jam 00.00-04.00.', 'Mata panda, tapi dompet tetap tercatat. Respect.', 'bronze', 'ON_TX_SUBMIT', (c) => hasTxInHourRange(c, 0, 4)),
  progressBadge('e-voice', GROUP_LORE, 'Voice Note Master', 'Pakai input suara 10 kali.', 'Ngomong doang, langsung tercatat. Generasi rebahan.', 'silver', 'ON_TX_SUBMIT', (c) => c.voiceCount, 10),
  booleanBadge('e-kilat', GROUP_LORE, 'Ketik Kilat', 'Pakai singkatan (jt/k/rb) saat mencatat.', 'Ngetik 5jt bukan 5000000. Time is money, literally.', 'bronze', 'ON_TX_SUBMIT', (c) => c.transactions.some((t) => /\d+(k|rb|jt|ribu|juta)\b/i.test(t.description) || t.amount >= 1000)),
  booleanBadge('e-telat', GROUP_LORE, 'Si Telat Catat', 'Catat transaksi untuk tanggal yang sudah lewat (3+ hari lalu).', 'Telat tapi tetap dicatat. Mending telat daripada lupa.', 'bronze', 'ON_TX_SUBMIT', (c) => {
    const now = Date.now();
    return c.transactions.some((t) => isRealTx(t) && now - t.date.getTime() > 259200000 && now - t.date.getTime() < 2592000000);
  }),
  progressBadge('e-edit', GROUP_LORE, 'Tukang Edit', 'Edit 10 transaksi.', 'Perfeksionis dompet. Harus pas sampai koma terakhir.', 'silver', 'ON_TX_SUBMIT', (c) => c.editCount, 10),
  booleanBadge('e-panduan', GROUP_LORE, 'Pembaca Setia', 'Buka Buku Panduan.', 'Baca dulu sebelum nanya. Kamu user idaman.', 'bronze', 'ON_ROUTE_CHANGE', (c) => c.guideOpened),
  booleanBadge('e-kepo', GROUP_LORE, 'Kepo Fitur', 'Buka semua tab (Beranda, Rekapan, Saku, Profil).', 'Diubek-ubek semua fiturnya. Rasa penasaran tingkat dewa.', 'bronze', 'ON_ROUTE_CHANGE', (c) => c.tabsSeen >= 4),
  booleanBadge('e-photo', GROUP_LORE, 'Ganti Wajah', 'Ubah foto profil.', 'Tampil beda. Dompet rapi, profil juga harus kece.', 'bronze', 'ON_ROUTE_CHANGE', (c) => c.photoChanged),
  progressBadge('e-kolektor-saku', GROUP_LORE, 'Kolektor Saku', 'Punya 8 saku berbeda.', 'Dompet bercabang ke mana-mana. Sultan multi-rekening.', 'gold', 'ON_ROUTE_CHANGE', (c) => c.walletsCount, 8),
  booleanBadge('e-kreatif', GROUP_LORE, 'Si Kreatif', 'Buat kategori kustom sendiri.', 'Kategori bawaan kurang? Bikin sendiri, bos. Merdeka!', 'bronze', 'ON_ROUTE_CHANGE', (c) => c.customCategoriesCount >= 1),
  booleanBadge('e-combo', GROUP_LORE, 'Komplit Sehari', 'Catat pemasukan, pengeluaran, dan pindah uang dalam satu hari.', 'Triple combo dalam sehari. Aktivitas dompet padat merayap.', 'gold', 'ON_CRON_MIDNIGHT', (c) => {
    const dayMap = new Map<string, Set<string>>();
    for (const t of c.transactions) {
      const key = `${t.date.getFullYear()}-${t.date.getMonth()}-${t.date.getDate()}`;
      const type = isMoveTx(t) ? 'move' : t.type;
      const set = dayMap.get(key) ?? new Set<string>();
      set.add(type); dayMap.set(key, set);
    }
    return [...dayMap.values()].some((s) => s.has('income') && s.has('expense') && s.has('move'));
  }),
  booleanBadge('e-khatam', GROUP_LORE, 'Khatam SakuKilat', 'Buka semua tab, buka panduan, dan raih 50 lencana lain.', 'Tamat sudah! Kamu menguasai SakuKilat luar dalam.', 'special', 'ON_ROUTE_CHANGE', (c) => c.tabsSeen >= 4 && c.guideOpened && unlockedCount >= 50),
];

// Helpers for badge evaluation
function monthIncome(ctx: BadgeContext): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return ctx.transactions.filter((t) => isRealTx(t) && t.type === 'income' && t.date >= start && t.date < end).reduce((a, t) => a + t.amount, 0);
}
function monthExpense(ctx: BadgeContext): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return ctx.transactions.filter((t) => isRealTx(t) && t.type === 'expense' && t.date >= start && t.date < end).reduce((a, t) => a + t.amount, 0);
}
function walletBalances(ctx: BadgeContext): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of ctx.transactions) {
    if (isMoveTx(t) && t.fromWalletId && t.toWalletId) {
      map.set(t.fromWalletId, (map.get(t.fromWalletId) ?? 0) - t.amount);
      map.set(t.toWalletId, (map.get(t.toWalletId) ?? 0) + t.amount);
    } else if (t.type === 'expense') {
      map.set(t.paymentMethod, (map.get(t.paymentMethod) ?? 0) - t.amount);
    } else if (t.type === 'income') {
      map.set(t.paymentMethod, (map.get(t.paymentMethod) ?? 0) + t.amount);
    }
  }
  return map;
}

let unlockedCount = 0;

export function buildBadgeContext(base: Partial<BadgeContext>): BadgeContext {
  return {
    ...base,
    backupCount: getCount(BACKUP_COUNT_KEY),
    importCount: getCount(IMPORT_COUNT_KEY),
    zenUsed: getFlag(ZEN_USED_KEY),
    voiceCount: getCount(VOICE_COUNT_KEY),
    editCount: getCount(EDIT_COUNT_KEY),
    undoCount: getCount(UNDO_COUNT_KEY),
    guideOpened: getFlag(GUIDE_OPENED_KEY),
    photoChanged: getFlag(PHOTO_CHANGED_KEY),
    tabsSeen: getSetSize(TABS_SEEN_KEY),
    rekapDaysSeen: getSetSize(REKAP_DAYS_KEY),
  } as BadgeContext;
}

export function evaluateBadges(ctx: BadgeContext): Badge[] {
  const unlocks = getUnlocksMap();
  const evaluated = BADGES.map((badge) => {
    const { progress, current, target } = badge.evaluate(ctx);
    return { ...badge, unlocked: progress >= 1, progress, current, target, unlockedAt: unlocks[badge.id] };
  });
  unlockedCount = evaluated.filter((b) => b.unlocked).length;
  return evaluated;
}

function getUnlocksMap(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(BADGE_UNLOCKS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

export function syncUnlocks(badges: Badge[], silent?: boolean): Badge[] {
  const unlocks = getUnlocksMap();
  const newlyUnlocked: Badge[] = [];
  let changed = false;
  for (const badge of badges) {
    if (badge.unlocked && !unlocks[badge.id]) {
      unlocks[badge.id] = new Date().toISOString();
      badge.unlockedAt = unlocks[badge.id];
      changed = true;
      if (!silent) newlyUnlocked.push(badge);
    }
  }
  if (changed) {
    try { window.localStorage.setItem(BADGE_UNLOCKS_KEY, JSON.stringify(unlocks)); } catch {}
  }
  return newlyUnlocked;
}

export function consumeUnlockCelebrations(): string[] {
  try {
    const raw = window.localStorage.getItem(BADGE_UNLOCK_QUEUE_KEY);
    window.localStorage.removeItem(BADGE_UNLOCK_QUEUE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : [];
  } catch { return []; }
}

export function queueUnlockCelebrations(badges: Badge[]): void {
  if (badges.length === 0) return;
  try {
    const existing = JSON.parse(window.localStorage.getItem(BADGE_UNLOCK_QUEUE_KEY) ?? '[]');
    const ids = Array.from(new Set([...(Array.isArray(existing) ? existing : []), ...badges.map((b) => b.id)]));
    window.localStorage.setItem(BADGE_UNLOCK_QUEUE_KEY, JSON.stringify(ids));
  } catch {}
}

export function formatUnlockDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export { setFlag, addToSet, bumpCount, markZenUsed };
