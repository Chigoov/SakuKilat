'use client'

/**
 * SakuKilat — Achievement Engine "Century Project" (100 lencana, lokal-first)
 * --------------------------------------------------------------------------
 * Semua badge DERIVED dari data lokal (transaksi, streak, goal, saku) +
 * sejumlah counter event ringan di localStorage. Tidak ada server.
 *
 * Optimasi CPU: tiap badge punya `trigger` agar pemanggil bisa memilih kapan
 * mengevaluasi (saat submit, mount, pindah route, atau tengah malam) — tidak
 * perlu menghitung 100 fungsi tiap ketukan keyboard.
 */

import type { Transaction } from './mock-data'
import { streakStatus } from './stats'

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'special'
export type EvalTrigger = 'ON_TX_SUBMIT' | 'ON_APP_MOUNT' | 'ON_ROUTE_CHANGE' | 'ON_CRON_MIDNIGHT'
export type BadgeGroup = 'Streak & Kebiasaan' | 'Pencapaian & Volume' | 'Disiplin Anggaran' | 'Psikologi & Zen' | 'Lore & Easter Egg'

export interface BadgeDef {
  id: string
  group: BadgeGroup
  title: string
  /** Syarat nyata (cara mendapatkan). */
  howTo: string
  /** Teks pop-up perayaan. */
  copy: string
  tier: BadgeTier
  trigger: EvalTrigger
  evaluate: (ctx: AchievementContext) => { progress: number; current?: number; target?: number }
}

export interface UnlockedBadge extends BadgeDef {
  unlocked: boolean
  progress: number
  current?: number
  target?: number
  /** Tanggal (ISO) saat badge pertama kali terbuka, jika sudah. */
  unlockedAt?: string
}

export interface AchievementContext {
  transactions: Transaction[]
  walletsCount: number
  customPaymentsCount: number
  customCategoriesCount: number
  goalsTotal: number
  goalsCompleted: number
  backupCount: number
  importCount: number
  zenUsed: boolean
  editCount: number
  undoCount: number
  guideOpened: boolean
  photoChanged: boolean
  tabsSeen: number
  rekapDaysSeen: number
}

// ── Counter & flag ringan di localStorage ────────────────────────────────────
export const BACKUP_COUNT_KEY = 'sakukilat:v2:backup-count'
export const IMPORT_COUNT_KEY = 'sakukilat:v2:import-count'
export const ZEN_USED_KEY = 'sakukilat:v2:zen-used'
export const EDIT_COUNT_KEY = 'sakukilat:v2:edit-count'
export const UNDO_COUNT_KEY = 'sakukilat:v2:undo-count'
export const GUIDE_OPENED_KEY = 'sakukilat:v2:guide-opened'
export const PHOTO_CHANGED_KEY = 'sakukilat:v2:photo-changed'
export const TABS_SEEN_KEY = 'sakukilat:v2:tabs-seen'
export const REKAP_DAYS_KEY = 'sakukilat:v2:rekap-days'
const UNLOCK_MAP_KEY = 'sakukilat:v2:badge-unlocks'
const PENDING_UNLOCK_QUEUE_KEY = 'sakukilat:v2:badge-unlock-queue'

function readCount(key: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const n = Number(window.localStorage.getItem(key) ?? 0)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch { return 0 }
}
export function bumpCount(key: string, by = 1): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, String(readCount(key) + by)) } catch { /* quota */ }
}
function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem(key) === '1' } catch { return false }
}
export function setFlag(key: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, '1') } catch { /* quota */ }
}
/** Tambahkan nilai unik ke set tersimpan (mis. tab yang pernah dibuka). */
export function addToSet(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    const set = new Set(Array.isArray(arr) ? arr : [])
    set.add(value)
    window.localStorage.setItem(key, JSON.stringify([...set]))
  } catch { /* quota */ }
}
function readSetSize(key: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? new Set(arr).size : 0
  } catch { return 0 }
}

export function markZenUsed() { setFlag(ZEN_USED_KEY) }

// ── Helper hitung ─────────────────────────────────────────────────────────────
function isRealTx(t: Transaction): boolean { return t.kind !== 'transfer' && t.kind !== 'saving' }
function isMove(t: Transaction): boolean { return t.kind === 'transfer' || t.kind === 'saving' }
function ratio(v: number, target: number): number {
  if (target <= 0) return 1
  return Math.max(0, Math.min(1, v / target))
}
function descHas(t: Transaction, kw: string): boolean {
  return t.description.toLowerCase().includes(kw)
}
function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function totalReal(c: AchievementContext): number { return c.transactions.filter(isRealTx).length }
function streakNow(c: AchievementContext): number { return streakStatus(c.transactions).current }
function totalSpent(c: AchievementContext): number {
  return c.transactions.filter(t => isRealTx(t) && t.type === 'expense').reduce((s, t) => s + t.amount, 0)
}
function countWhere(c: AchievementContext, pred: (t: Transaction) => boolean): number {
  return c.transactions.filter(pred).length
}
function hasHour(c: AchievementContext, from: number, to: number): boolean {
  return c.transactions.some(t => { const h = t.date.getHours(); return h >= from && h < to })
}
function distinctCategories(c: AchievementContext): number {
  return new Set(c.transactions.filter(isRealTx).map(t => t.category)).size
}
function comboDay(c: AchievementContext): boolean {
  const m = new Map<string, Set<string>>()
  for (const t of c.transactions) {
    const k = dayKeyOf(t.date)
    const kind = isMove(t) ? 'move' : t.type
    const s = m.get(k) ?? new Set<string>()
    s.add(kind); m.set(k, s)
  }
  return [...m.values()].some(s => s.has('income') && s.has('expense') && s.has('move'))
}

// ── Builder ringkas ───────────────────────────────────────────────────────────
type NumPick = (c: AchievementContext) => number
function B(
  id: string, group: BadgeGroup, title: string, howTo: string, copy: string,
  tier: BadgeTier, trigger: EvalTrigger, pick: NumPick, target: number,
): BadgeDef {
  return { id, group, title, howTo, copy, tier, trigger,
    evaluate: c => { const cur = pick(c); return { progress: ratio(cur, target), current: cur, target } } }
}
function Bb(
  id: string, group: BadgeGroup, title: string, howTo: string, copy: string,
  tier: BadgeTier, trigger: EvalTrigger, pick: (c: AchievementContext) => boolean,
): BadgeDef {
  return { id, group, title, howTo, copy, tier, trigger, evaluate: c => ({ progress: pick(c) ? 1 : 0 }) }
}

const G_STREAK: BadgeGroup = 'Streak & Kebiasaan'
const G_VOL: BadgeGroup = 'Pencapaian & Volume'
const G_BUDGET: BadgeGroup = 'Disiplin Anggaran'
const G_ZEN: BadgeGroup = 'Psikologi & Zen'
const G_LORE: BadgeGroup = 'Lore & Easter Egg'

export const BADGES: BadgeDef[] = [
  // ── A. Streak & Kebiasaan (12) ──
  Bb('a-egg', G_STREAK, 'Pecah Telur', 'Catat transaksi pertamamu.', 'Telurnya pecah! Perjalanan dompet sehatmu dimulai.', 'bronze', 'ON_TX_SUBMIT', c => totalReal(c) >= 1),
  B('a-7', G_STREAK, 'Seminggu Tegak', 'Catat 7 hari beruntun.', '7 hari tanpa absen. Disiplinmu mulai kelihatan.', 'silver', 'ON_TX_SUBMIT', streakNow, 7),
  B('a-30', G_STREAK, 'Sebulan Penuh', 'Catat 30 hari beruntun.', 'Sebulan nonstop! Ini bukan kebetulan, ini kebiasaan.', 'gold', 'ON_TX_SUBMIT', streakNow, 30),
  B('a-100', G_STREAK, 'Si Kepala Batu', 'Catat 100 hari beruntun.', '100 hari?! Kepala batu finansial sejati.', 'gold', 'ON_TX_SUBMIT', streakNow, 100),
  B('a-365', G_STREAK, 'Setahun Setia', 'Catat 365 hari beruntun.', 'Setahun penuh. Kamu legenda, titik.', 'special', 'ON_TX_SUBMIT', streakNow, 365),
  B('a-active90', G_STREAK, 'Konsisten Sejati', 'Capai 90 hari aktif mencatat (total).', '90 hari penuh jejak. Konsistensi level dewa.', 'gold', 'ON_APP_MOUNT', c => streakStatus(c.transactions).totalDaysLogged, 90),
  B('a-dawn', G_STREAK, 'Pejuang Subuh', 'Catat sebelum jam 6 pagi sebanyak 7 kali.', 'Belum melek penuh tapi dompet udah dicatat. Salut.', 'silver', 'ON_TX_SUBMIT', c => countWhere(c, t => t.date.getHours() < 6), 7),
  Bb('a-weekend', G_STREAK, 'Anak Weekend', 'Catat di Sabtu dan Minggu.', 'Libur boleh, catat jalan terus.', 'bronze', 'ON_TX_SUBMIT', c => {
    const days = new Set(c.transactions.map(t => t.date.getDay()))
    return days.has(0) && days.has(6)
  }),
  Bb('a-night-routine', G_STREAK, 'Penunggu Malam', 'Catat di malam hari (18.00-23.00).', 'Tutup hari dengan catatan. Tidurmu lebih tenang.', 'bronze', 'ON_TX_SUBMIT', c => hasHour(c, 18, 23)),
  B('a-longest14', G_STREAK, 'Dua Minggu Beruntun', 'Capai rekor streak 14 hari.', 'Dua minggu nonstop. Momentummu ngebut.', 'silver', 'ON_TX_SUBMIT', c => streakStatus(c.transactions).longest, 14),
  Bb('a-comeback', G_STREAK, 'Bangkit Lagi', 'Bangun streak 7 hari setelah sempat putus.', 'Jatuh bukan akhir. Kamu bangkit dan lari lagi.', 'silver', 'ON_TX_SUBMIT', c => {
    const s = streakStatus(c.transactions)
    return s.current >= 7 && s.longest > s.current
  }),
  Bb('a-lives-full', G_STREAK, 'Nyawa Utuh', 'Catat hari ini dengan 5 nyawa penuh.', '5 nyawa aman. Rajinmu nggak main-main.', 'bronze', 'ON_TX_SUBMIT', c => {
    const s = streakStatus(c.transactions)
    return s.loggedToday && s.lives === s.maxLives
  }),

  // ── B. Pencapaian & Volume (15) ──
  B('b-50', G_VOL, 'Setengah Ratus', 'Catat 50 transaksi.', '50 catatan! Dompetmu makin terbaca.', 'bronze', 'ON_TX_SUBMIT', totalReal, 50),
  B('b-500', G_VOL, 'Lima Ratus Jejak', 'Catat 500 transaksi.', '500 jejak keuangan. Arsiparis beneran.', 'silver', 'ON_TX_SUBMIT', totalReal, 500),
  B('b-2500', G_VOL, 'Dua Ribu Lima Ratus', 'Catat 2.500 transaksi.', '2.500 catatan. Ini sih hobi, bukan tugas lagi.', 'gold', 'ON_TX_SUBMIT', totalReal, 2500),
  B('b-10000', G_VOL, 'Maha Pencatat', 'Catat 10.000 transaksi.', '10.000! Tugu peringatan layak dibangun untukmu.', 'special', 'ON_TX_SUBMIT', totalReal, 10000),
  B('b-spent1jt', G_VOL, 'Juta Pertama Tercatat', 'Total pengeluaran tercatat tembus Rp1 juta.', 'Sejuta rupiah terlacak. Nggak ada yang lolos.', 'bronze', 'ON_TX_SUBMIT', totalSpent, 1_000_000),
  B('b-spent100jt', G_VOL, 'Sultan Pencatat', 'Total pengeluaran tercatat tembus Rp100 juta.', '100 juta lewat tanganmu, semua tercatat rapi.', 'special', 'ON_TX_SUBMIT', totalSpent, 100_000_000),
  B('b-wallet5', G_VOL, 'Dompet Lengkap', 'Punya 5 saku.', '5 saku aktif. Manajer dompet profesional.', 'silver', 'ON_ROUTE_CHANGE', c => c.walletsCount, 5),
  B('b-cat10', G_VOL, 'Kolektor Kategori', 'Pakai 10 kategori berbeda.', '10 warna pengeluaran. Hidupmu berwarna (dan tercatat).', 'silver', 'ON_TX_SUBMIT', distinctCategories, 10),
  Bb('b-goal1', G_VOL, 'Goal Perdana', 'Buat goal tabungan pertama.', 'Mimpi pertama dipasang. Ayo dikejar!', 'bronze', 'ON_ROUTE_CHANGE', c => c.goalsTotal >= 1),
  Bb('b-goaldone', G_VOL, 'Mimpi Terwujud', 'Capai 1 goal tabungan.', 'Target tembus! Rasanya beda kan kalau direncanakan.', 'gold', 'ON_TX_SUBMIT', c => c.goalsCompleted >= 1),
  B('b-goal5', G_VOL, 'Pemburu Lima Mimpi', 'Capai 5 goal tabungan.', '5 mimpi terwujud. Kamu mesin pewujud target.', 'gold', 'ON_TX_SUBMIT', c => c.goalsCompleted, 5),
  Bb('b-backup1', G_VOL, 'Backup Perdana', 'Lakukan backup atau ekspor pertama.', 'Data diamankan. Tidur lebih nyenyak.', 'bronze', 'ON_ROUTE_CHANGE', c => c.backupCount >= 1),
  B('b-backup10', G_VOL, 'Tukang Arsip', 'Backup 10 kali.', '10 backup. Paranoid sehat, kami suka.', 'silver', 'ON_ROUTE_CHANGE', c => c.backupCount, 10),
  Bb('b-import', G_VOL, 'Migrasi Sukses', 'Impor data pertama kali.', 'Pindah rumah lancar. Data lama selamat sampai tujuan.', 'silver', 'ON_APP_MOUNT', c => c.importCount >= 1),
  Bb('b-veteran', G_VOL, 'Veteran Data', 'Pernah impor dan sudah backup 10 kali.', 'Pindahan + rajin backup. Anti kehilangan sejati.', 'gold', 'ON_ROUTE_CHANGE', c => c.importCount >= 1 && c.backupCount >= 10),

  // ── C. Disiplin Anggaran (20) — sebagian butuh evaluasi historis ──
  Bb('c-setbudget', G_BUDGET, 'Set Budget Pertama', 'Tetapkan budget bulanan.', 'Pagar sudah dipasang. Sekarang tinggal jaga.', 'bronze', 'ON_ROUTE_CHANGE', () => readFlag('sakukilat:v2:budget-set')),
  Bb('c-savings30', G_BUDGET, 'Penabung 30%', 'Capai rasio tabungan 30% dalam sebulan.', '30% disisihkan. Masa depanmu berterima kasih.', 'silver', 'ON_TX_SUBMIT', c => savingsRateThisMonth(c) >= 0.3),
  Bb('c-savings50', G_BUDGET, 'Penabung 50%', 'Capai rasio tabungan 50% dalam sebulan.', 'Separuh disimpan?! Disiplin baja.', 'gold', 'ON_TX_SUBMIT', c => savingsRateThisMonth(c) >= 0.5),
  Bb('c-surplus', G_BUDGET, 'Surplus Bulanan', 'Pemasukan lebih besar dari pengeluaran bulan ini.', 'Plus, bukan minus. Bulan ini kamu menang.', 'silver', 'ON_CRON_MIDNIGHT', c => monthIncome(c) > monthExpense(c) && monthIncome(c) > 0),
  Bb('c-nodebt', G_BUDGET, 'Bebas Utang', 'Pastikan semua saku bersaldo positif (tidak ada minus).', 'Nggak ada yang minus. Lega tanpa beban.', 'silver', 'ON_TX_SUBMIT', c => c.transactions.length > 0 && noNegativeWallet(c)),
  B('c-save-streak', G_BUDGET, 'Rajin Nabung', 'Sumbang ke tabungan 30 hari berbeda.', 'Sebulan nabung tiap hari. Tetes demi tetes jadi danau.', 'gold', 'ON_TX_SUBMIT', c => new Set(c.transactions.filter(t => t.kind === 'saving').map(t => dayKeyOf(t.date))).size, 30),
  Bb('c-celengan', G_BUDGET, 'Celengan Tebal', 'Capai saldo Tabungan Rp5 juta.', 'Celengan gemuk. Bunyinya udah berat.', 'gold', 'ON_TX_SUBMIT', c => savingsWalletBalance(c) >= 5_000_000),
  Bb('c-multi-cuan', G_BUDGET, 'Multi Cuan', 'Catat pemasukan dari 3 kategori berbeda.', 'Banyak keran cuan. Nggak gantung satu sumber.', 'silver', 'ON_TX_SUBMIT', c => new Set(c.transactions.filter(t => isRealTx(t) && t.type === 'income').map(t => t.category)).size >= 3),
  Bb('c-mindful', G_BUDGET, 'Mindful Spender', 'Buka Rekapan untuk evaluasi.', 'Evaluasi dulu, belanja kemudian. Bijak.', 'bronze', 'ON_ROUTE_CHANGE', c => c.rekapDaysSeen >= 1),
  B('c-detektif', G_BUDGET, 'Detektif Duit', 'Buka Rekapan di 30 hari berbeda.', 'Rajin investigasi dompet sendiri. Nggak ada misteri.', 'gold', 'ON_ROUTE_CHANGE', c => c.rekapDaysSeen, 30),
  Bb('c-rapi', G_BUDGET, 'Tukang Rapi', 'Pastikan semua transaksi punya kategori (bukan lainnya).', "Nggak ada yang nyasar ke 'lainnya'. Rapi total.", 'silver', 'ON_TX_SUBMIT', c => {
    const real = c.transactions.filter(isRealTx)
    return real.length >= 20 && real.every(t => t.category && t.category !== 'lainnya')
  }),
  Bb('c-paket', G_BUDGET, 'Si Bijak', 'Aktifkan budget, goal, dan backup sekaligus.', 'Pagar, mimpi, dan cadangan lengkap. Paket komplit.', 'gold', 'ON_ROUTE_CHANGE', c => readFlag('sakukilat:v2:budget-set') && c.goalsTotal >= 1 && c.backupCount >= 1),
  // Badge berbasis evaluasi historis bulanan (disetel via cron) — pakai flag tersimpan.
  Bb('c-tutup-aman', G_BUDGET, 'Tutup Bulan Aman', 'Akhiri satu bulan dengan pengeluaran di bawah budget.', 'Bulan ditutup dengan senyum. Budget terjaga.', 'silver', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-tutup-aman')),
  Bb('c-hemat-trio', G_BUDGET, 'Hemat Trilogi', '3 bulan beruntun di bawah budget.', 'Tiga bulan irit berturut. Ini bukan keberuntungan.', 'gold', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-hemat-trio')),
  Bb('c-master', G_BUDGET, 'Master Anggaran', '12 bulan keuangan sehat.', 'Setahun anggaran terkendali. Sensei budgeting.', 'special', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-master')),
  Bb('c-under50', G_BUDGET, 'Di Bawah Separuh', 'Pakai kurang dari 50% budget sebulan.', 'Setengah budget aja cukup. Hemat tingkat lanjut.', 'silver', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-under50')),
  Bb('c-under25', G_BUDGET, 'Irit Maksimal', 'Pakai kurang dari 25% budget sebulan.', 'Cuma seperempat budget?! Ajarin dong.', 'gold', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-under25')),
  Bb('c-week-green', G_BUDGET, 'Minggu Hijau', '4 minggu tanpa lewat jatah.', 'Empat minggu hijau berturut. Stabil banget.', 'silver', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-week-green')),
  Bb('c-anti-bocor', G_BUDGET, 'Anti Bocor', 'Sebulan tanpa satu pun hari over jatah.', 'Nol kebocoran sebulan. Dompet kedap air.', 'gold', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-anti-bocor')),
  Bb('c-budget-up', G_BUDGET, 'Budget Naik Kelas', 'Revisi/ubah nilai budget bulanan setelah evaluasi.', 'Budget di-upgrade berdasarkan data. Makin matang.', 'silver', 'ON_ROUTE_CHANGE', () => readFlag('sakukilat:v2:ach-budget-up')),

  // ── D. Psikologi & Zen (18) ──
  Bb('d-zen', G_ZEN, 'Zen Master', 'Aktifkan Zen Mode.', 'Angka disembunyikan. Pikiran lebih damai.', 'bronze', 'ON_ROUTE_CHANGE', c => c.zenUsed),
  Bb('d-zen30', G_ZEN, 'Filosof Dompet', 'Pakai Zen Mode (lanjutkan kebiasaan 30 hari).', 'Sebulan dalam ketenangan. Uang bukan tuanmu.', 'gold', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-zen30')),
  Bb('d-noskip', G_ZEN, 'Hari Tanpa Jajan', 'Lewati satu hari penuh tanpa pengeluaran (tetap buka app).', 'Seharian nol jajan. Dompetmu istirahat.', 'bronze', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-noskip')),
  Bb('d-puasa', G_ZEN, 'Puasa Belanja', '3 hari beruntun tanpa pengeluaran.', '3 hari puasa belanja. Tahan godaan, naik level.', 'silver', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-puasa')),
  Bb('d-weekend-hemat', G_ZEN, 'Akhir Pekan Hemat', 'Sabtu-Minggu tanpa pengeluaran.', 'Weekend nol jajan. Healing nggak harus mahal.', 'silver', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-weekend-hemat')),
  Bb('d-turun', G_ZEN, 'Lebih Irit dari Lalu', 'Pengeluaran mingguan turun dari minggu lalu.', 'Minggu ini lebih hemat. Grafik turun, hati senang.', 'silver', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-turun')),
  Bb('d-refleksi', G_ZEN, 'Refleksi Tenang', 'Buka aplikasi dan lihat data tanpa belanja.', 'Sekadar merenungi angka. Sadar diri itu kaya.', 'bronze', 'ON_APP_MOUNT', c => c.transactions.length >= 5),
  Bb('d-mindful2', G_ZEN, 'Pembaca Data', 'Buka Rekapan di 10 hari berbeda.', 'Rajin baca laporan sendiri. Nggak buta arah.', 'silver', 'ON_ROUTE_CHANGE', c => c.rekapDaysSeen >= 10),
  Bb('d-frugal', G_ZEN, 'Frugal Sejati', 'Rasio tabungan di atas 50% selama 3 bulan.', 'Tiga bulan hemat ekstrem. Mindset kaya beneran.', 'gold', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-frugal')),
  Bb('d-napas', G_ZEN, 'Napas Panjang', 'Savings rate positif selama 6 bulan.', 'Setengah tahun selalu nyisihkan. Napas finansialmu panjang.', 'special', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-napas')),
  Bb('d-dingin', G_ZEN, 'Kepala Dingin', 'Seminggu tanpa belanja impulsif di atas Rp500rb.', 'Nggak ada checkout panas. Kepala tetap dingin.', 'silver', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-dingin')),
  Bb('d-antifomo', G_ZEN, 'Anti FOMO', 'Seminggu tanpa pengeluaran kategori hiburan.', 'Skip hiburan seminggu. FOMO kalah sama logika.', 'silver', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-antifomo')),
  Bb('d-jujur', G_ZEN, 'Sadar Diri', 'Catat dengan jujur 30 hari aktif.', 'Sebulan jujur sama dompet sendiri. Itu langka.', 'gold', 'ON_APP_MOUNT', c => streakStatus(c.transactions).totalDaysLogged >= 30),
  Bb('d-evaluator', G_ZEN, 'Si Evaluator', 'Buka tampilan Tren di Rekapan.', 'Lihat tren, ambil pelajaran. Otak finansial nyala.', 'bronze', 'ON_ROUTE_CHANGE', () => readFlag('sakukilat:v2:tren-seen')),
  Bb('d-planner', G_ZEN, 'Perencana Ulung', 'Buat goal dengan tenggat waktu.', 'Mimpi dengan deadline. Itu rencana, bukan angan.', 'silver', 'ON_ROUTE_CHANGE', () => readFlag('sakukilat:v2:goal-deadline')),
  Bb('d-balance', G_ZEN, 'Hidup Seimbang', 'Punya pemasukan dan pengeluaran tercatat di bulan yang sama.', 'Masuk dan keluar seimbang tercatat. Gambaran utuh.', 'bronze', 'ON_TX_SUBMIT', c => monthIncome(c) > 0 && monthExpense(c) > 0),
  Bb('d-tepat-deadline', G_ZEN, 'Tepat Deadline', 'Capai goal sebelum atau tepat tenggatnya.', 'Target kelar tepat waktu. Perencanaan jempolan.', 'gold', 'ON_TX_SUBMIT', () => readFlag('sakukilat:v2:ach-tepat-deadline')),
  Bb('d-mahir', G_ZEN, 'Mahir Mengelola', 'Punya 3+ saku dan minimal 1 goal aktif.', 'Banyak dompet, terarah ke tujuan. Pengelola handal.', 'silver', 'ON_ROUTE_CHANGE', c => c.walletsCount >= 3 && c.goalsTotal >= 1),

  // ── E. Lore & Easter Egg (35) — prioritas ──
  Bb('e-gaji-lewat', G_LORE, 'Gaji Numpang Lewat', 'Catat income besar (≥Rp3jt), lalu pengeluaran menggerus >90% income itu.', 'Gaji cuma mampir say hi. Sabar, akhir bulan masih jauh.', 'gold', 'ON_TX_SUBMIT', c => gajiNumpangLewat(c)),
  Bb('e-survivor', G_LORE, 'Survivor Tanggal Tua', 'Bertahan 5 hari (tgl 20-25) dengan pengeluaran harian < Rp20.000.', 'Bertahan di tanggal tua dengan elegan. Hidup keras, kamu lebih keras.', 'gold', 'ON_CRON_MIDNIGHT', () => readFlag('sakukilat:v2:ach-survivor')),
  B('e-parkir', G_LORE, 'Pawang Parkir', 'Catat 10 transaksi tunai senilai tepat Rp2.000.', 'Receh parkir terlacak semua. Nggak ada yang lolos, pak.', 'silver', 'ON_TX_SUBMIT', c => countWhere(c, t => isRealTx(t) && t.amount === 2000 && t.paymentMethod === 'tunai'), 10),
  Bb('e-paylater', G_LORE, 'Budak Paylater', "Catat pengeluaran pertama via metode bayar mengandung 'paylater'.", 'Beli sekarang, nangis nanti. Tercatat ya, jangan lupa.', 'silver', 'ON_TX_SUBMIT', c => c.transactions.some(t => /paylater|pay later|pinjol|kredivo|akulaku|spaylater/.test(t.paymentMethod.toLowerCase()))),
  B('e-gakjadi', G_LORE, 'Gak Jadi Beli', 'Pakai tombol Urungkan 3 kali.', 'Maju mundur cantik. Akhirnya nggak jadi beli juga, hemat!', 'bronze', 'ON_TX_SUBMIT', c => c.undoCount, 3),
  Bb('e-diskon', G_LORE, 'Korban Diskon', 'Belanja di atas Rp300rb pada tanggal kembar (mis. 12 Des).', 'Diskon emang jebakan. Tapi tercatat, jadi nggak sepenuhnya kalah.', 'silver', 'ON_TX_SUBMIT', c => c.transactions.some(t => isRealTx(t) && t.type === 'expense' && t.amount > 300_000 && t.date.getDate() === t.date.getMonth() + 1)),
  Bb('e-checkout-malam', G_LORE, 'Racun Checkout Malam', 'Catat belanja antara jam 00.00-03.00.', 'Jempol gatel tengah malam. Besok pagi baru nyesel.', 'silver', 'ON_TX_SUBMIT', c => c.transactions.some(t => isRealTx(t) && t.type === 'expense' && t.date.getHours() < 3 && (t.category === 'belanja' || t.category === 'hiburan'))),
  Bb('e-sultan', G_LORE, 'Sultan Sehari', 'Catat satu transaksi di atas Rp10 juta.', 'Sekali transaksi, gaji orang sebulan. Hormat, bos.', 'special', 'ON_TX_SUBMIT', c => c.transactions.some(t => isRealTx(t) && t.amount >= 10_000_000)),
  Bb('e-receh', G_LORE, 'Receh Hunter', 'Catat transaksi di bawah Rp1.000.', 'Recehan pun nggak luput. Detail banget kamu.', 'bronze', 'ON_TX_SUBMIT', c => c.transactions.some(t => isRealTx(t) && t.amount > 0 && t.amount < 1000)),
  B('e-kopi', G_LORE, 'Caffeine Dependent', "Catat 'kopi' sebanyak 7 kali.", 'Tujuh kali ngopi. Dompet & jantung sama-sama deg-degan.', 'silver', 'ON_TX_SUBMIT', c => countWhere(c, t => descHas(t, 'kopi')), 7),
  Bb('e-boba', G_LORE, 'Korban Boba', "Catat transaksi mengandung 'boba' atau 'milk tea'.", 'Boba lagi, boba lagi. Manisnya nempel di pengeluaran.', 'bronze', 'ON_TX_SUBMIT', c => c.transactions.some(t => descHas(t, 'boba') || descHas(t, 'milk tea') || descHas(t, 'milktea'))),
  B('e-ojol', G_LORE, 'Ojol Setia', "Catat 10 transaksi ojek online (gojek/grab/ojol).", 'Mitra setia ojol. Abang driver berterima kasih.', 'silver', 'ON_TX_SUBMIT', c => countWhere(c, t => descHas(t, 'gojek') || descHas(t, 'grab') || descHas(t, 'ojol') || descHas(t, 'ojek')), 10),
  B('e-minimarket', G_LORE, 'Anak Minimarket', "Catat 10 transaksi di minimarket (indomaret/alfamart).", "Mampir 'cuma beli air', keluar bawa kresek. Klasik.", 'silver', 'ON_TX_SUBMIT', c => countWhere(c, t => descHas(t, 'indomaret') || descHas(t, 'alfamart') || descHas(t, 'minimarket')), 10),
  B('e-ongkir', G_LORE, 'Korban Ongkir', "Catat 5 transaksi mengandung 'ongkir'.", 'Barang Rp10rb, ongkir Rp20rb. Logika belanja online.', 'bronze', 'ON_TX_SUBMIT', c => countWhere(c, t => descHas(t, 'ongkir')), 5),
  Bb('e-tipis', G_LORE, 'Dompet Tipis', 'Total saldo semua saku di bawah Rp50.000.', 'Tinggal segini? Tarik napas, akhir bulan ujian sesungguhnya.', 'bronze', 'ON_TX_SUBMIT', c => c.transactions.length >= 5 && totalWalletBalance(c) < 50_000),
  Bb('e-tajir', G_LORE, 'Tajir Mendadak', 'Catat pemasukan di atas Rp5 juta sekaligus.', 'Dari mana nih durian runtuh? Selamat menikmati (sebentar).', 'gold', 'ON_TX_SUBMIT', c => c.transactions.some(t => isRealTx(t) && t.type === 'income' && t.amount >= 5_000_000)),
  Bb('e-thr', G_LORE, 'THR Cair!', 'Catat pemasukan kategori bonus/THR/hadiah.', 'THR turun! Tahan, jangan langsung ludes ya.', 'silver', 'ON_TX_SUBMIT', c => c.transactions.some(t => isRealTx(t) && t.type === 'income' && (t.category === 'hadiah' || descHas(t, 'thr') || descHas(t, 'bonus')))),
  Bb('e-gajian', G_LORE, 'Gajian!', 'Catat pemasukan kategori gaji.', 'Saldo hijau lagi! Tarik napas, ini cuma titipan tagihan.', 'bronze', 'ON_TX_SUBMIT', c => c.transactions.some(t => isRealTx(t) && t.type === 'income' && t.category === 'gaji')),
  Bb('e-tekor-awal', G_LORE, 'Tekor Awal Bulan', 'Pengeluaran besar di tanggal 1-5.', 'Baru awal bulan udah ngebut. Hati-hati, finish line jauh.', 'silver', 'ON_TX_SUBMIT', c => c.transactions.some(t => isRealTx(t) && t.type === 'expense' && t.date.getDate() <= 5 && t.amount >= 500_000)),
  B('e-padang', G_LORE, 'Anak Padang', "Catat 'padang' sebanyak 5 kali.", 'Rendang lover sejati. Lauknya boleh, dompetnya dijaga.', 'bronze', 'ON_TX_SUBMIT', c => countWhere(c, t => descHas(t, 'padang')), 5),
  Bb('e-patungan', G_LORE, 'Patungan Pro', 'Pakai fitur bagi (split bill) — deskripsi berisi [1/n].', 'Bayar bareng, hemat bareng. Temen-temen sayang kamu.', 'silver', 'ON_TX_SUBMIT', c => c.transactions.some(t => /\[1\/\d+\]/.test(t.description))),
  B('e-geser', G_LORE, 'Tukang Geser', 'Lakukan 10 kali pindah uang antar saku.', 'Geser sana geser sini. Bendahara grup ya?', 'silver', 'ON_TX_SUBMIT', c => countWhere(c, t => t.kind === 'transfer'), 10),
  Bb('e-nabung-malam', G_LORE, 'Nabung Tengah Malam', 'Simpan uang antara jam 00.00-04.00.', 'Insaf tengah malam, langsung nabung. Hidayah finansial.', 'silver', 'ON_TX_SUBMIT', c => c.transactions.some(t => t.kind === 'saving' && t.date.getHours() < 4)),
  Bb('e-begadang', G_LORE, 'Begadang Finansial', 'Catat transaksi antara jam 00.00-04.00.', 'Mata panda, tapi dompet tetap tercatat. Respect.', 'bronze', 'ON_TX_SUBMIT', c => hasHour(c, 0, 4)),
  B('e-subrapi', G_LORE, 'Rapi Sampai Detail', 'Catat 10 transaksi dengan sub kategori.', 'Sampai level sub kategori pun kamu rapikan. Niat dan bagus.', 'silver', 'ON_TX_SUBMIT', c => countWhere(c, t => isRealTx(t) && Boolean(t.subcategory)), 10),
  Bb('e-kilat', G_LORE, 'Ketik Kilat', "Pakai singkatan (jt/k/rb) saat mencatat.", 'Ngetik 5jt bukan 5000000. Time is money, literally.', 'bronze', 'ON_TX_SUBMIT', c => c.transactions.some(t => /\d+(k|rb|jt|ribu|juta)\b/i.test(t.description) || t.amount >= 1000)),
  Bb('e-telat', G_LORE, 'Si Telat Catat', 'Catat transaksi untuk tanggal yang sudah lewat (3+ hari lalu).', 'Telat tapi tetap dicatat. Mending telat daripada lupa.', 'bronze', 'ON_TX_SUBMIT', c => {
    const now = Date.now()
    return c.transactions.some(t => isRealTx(t) && (now - t.date.getTime()) > 3 * 86_400_000 && (now - t.date.getTime()) < 30 * 86_400_000)
  }),
  B('e-edit', G_LORE, 'Tukang Edit', 'Edit 10 transaksi.', 'Perfeksionis dompet. Harus pas sampai koma terakhir.', 'silver', 'ON_TX_SUBMIT', c => c.editCount, 10),
  Bb('e-panduan', G_LORE, 'Pembaca Setia', 'Buka Buku Panduan.', 'Baca dulu sebelum nanya. Kamu user idaman.', 'bronze', 'ON_ROUTE_CHANGE', c => c.guideOpened),
  Bb('e-kepo', G_LORE, 'Kepo Fitur', 'Buka semua tab (Beranda, Rekapan, Saku, Profil).', 'Diubek-ubek semua fiturnya. Rasa penasaran tingkat dewa.', 'bronze', 'ON_ROUTE_CHANGE', c => c.tabsSeen >= 4),
  Bb('e-photo', G_LORE, 'Ganti Wajah', 'Ubah foto profil.', 'Tampil beda. Dompet rapi, profil juga harus kece.', 'bronze', 'ON_ROUTE_CHANGE', c => c.photoChanged),
  B('e-kolektor-saku', G_LORE, 'Kolektor Saku', 'Punya 8 saku berbeda.', 'Dompet bercabang ke mana-mana. Sultan multi-rekening.', 'gold', 'ON_ROUTE_CHANGE', c => c.walletsCount, 8),
  Bb('e-kreatif', G_LORE, 'Si Kreatif', 'Buat kategori kustom sendiri.', 'Kategori bawaan kurang? Bikin sendiri, bos. Merdeka!', 'bronze', 'ON_ROUTE_CHANGE', c => c.customCategoriesCount >= 1),
  Bb('e-combo', G_LORE, 'Komplit Sehari', 'Catat pemasukan, pengeluaran, dan pindah uang dalam satu hari.', 'Triple combo dalam sehari. Aktivitas dompet padat merayap.', 'gold', 'ON_CRON_MIDNIGHT', comboDay),
  Bb('e-khatam', G_LORE, 'Khatam SakuKilat', 'Buka semua tab, buka panduan, dan raih 50 lencana lain.', 'Tamat sudah! Kamu menguasai SakuKilat luar dalam.', 'special', 'ON_ROUTE_CHANGE', c => c.tabsSeen >= 4 && c.guideOpened && unlockedCountCache >= 50),
]

// ── Helper bulanan untuk badge yang dievaluasi langsung dari transaksi ────────
function monthBounds() {
  const n = new Date()
  return { start: new Date(n.getFullYear(), n.getMonth(), 1), end: new Date(n.getFullYear(), n.getMonth() + 1, 1) }
}
function monthIncome(c: AchievementContext): number {
  const { start, end } = monthBounds()
  return c.transactions.filter(t => isRealTx(t) && t.type === 'income' && t.date >= start && t.date < end).reduce((s, t) => s + t.amount, 0)
}
function monthExpense(c: AchievementContext): number {
  const { start, end } = monthBounds()
  return c.transactions.filter(t => isRealTx(t) && t.type === 'expense' && t.date >= start && t.date < end).reduce((s, t) => s + t.amount, 0)
}
function savingsRateThisMonth(c: AchievementContext): number {
  const inc = monthIncome(c)
  if (inc <= 0) return 0
  return (inc - monthExpense(c)) / inc
}
function walletBalances(c: AchievementContext): Map<string, number> {
  const bal = new Map<string, number>()
  for (const t of c.transactions) {
    if (isMove(t) && t.fromWalletId && t.toWalletId) {
      bal.set(t.fromWalletId, (bal.get(t.fromWalletId) ?? 0) - t.amount)
      bal.set(t.toWalletId, (bal.get(t.toWalletId) ?? 0) + t.amount)
    } else if (t.type === 'expense') {
      bal.set(t.paymentMethod, (bal.get(t.paymentMethod) ?? 0) - t.amount)
    } else if (t.type === 'income') {
      bal.set(t.paymentMethod, (bal.get(t.paymentMethod) ?? 0) + t.amount)
    }
  }
  return bal
}
function totalWalletBalance(c: AchievementContext): number {
  let sum = 0
  for (const v of walletBalances(c).values()) sum += v
  return sum
}
function savingsWalletBalance(c: AchievementContext): number {
  return walletBalances(c).get('tabungan') ?? 0
}
function noNegativeWallet(c: AchievementContext): boolean {
  return [...walletBalances(c).values()].every(v => v >= 0)
}
function gajiNumpangLewat(c: AchievementContext): boolean {
  // Heuristik: ada income >=3jt, lalu di 5 hari setelahnya pengeluaran menggerus
  // lebih dari 90% nilai income tersebut.
  const incomes = c.transactions.filter(t => isRealTx(t) && t.type === 'income' && t.amount >= 3_000_000)
  for (const inc of incomes) {
    const windowEnd = inc.date.getTime() + 5 * 86_400_000
    const spentAfter = c.transactions
      .filter(t => isRealTx(t) && t.type === 'expense' && t.date.getTime() >= inc.date.getTime() && t.date.getTime() <= windowEnd)
      .reduce((s, t) => s + t.amount, 0)
    if (spentAfter >= inc.amount * 0.9) return true
  }
  return false
}

// cache jumlah unlocked untuk badge "khatam"
let unlockedCountCache = 0

// ── Evaluasi ──────────────────────────────────────────────────────────────────
export function evaluateBadges(ctx: AchievementContext): UnlockedBadge[] {
  const unlockMap = readUnlockMap()
  const result = BADGES.map(badge => {
    const { progress, current, target } = badge.evaluate(ctx)
    const unlocked = progress >= 1
    return { ...badge, unlocked, progress, current, target, unlockedAt: unlockMap[badge.id] }
  })
  unlockedCountCache = result.filter(b => b.unlocked).length
  // Re-evaluasi badge "khatam" yang bergantung pada cache.
  const khatam = result.find(b => b.id === 'e-khatam')
  if (khatam && !khatam.unlocked) {
    const ev = BADGES.find(b => b.id === 'e-khatam')!.evaluate(ctx)
    khatam.progress = ev.progress
    khatam.unlocked = ev.progress >= 1
  }
  return result
}

export function buildContext(input: ContextInput): AchievementContext {
  return {
    ...input,
    backupCount: readCount(BACKUP_COUNT_KEY),
    importCount: readCount(IMPORT_COUNT_KEY),
    zenUsed: readFlag(ZEN_USED_KEY),
    editCount: readCount(EDIT_COUNT_KEY),
    undoCount: readCount(UNDO_COUNT_KEY),
    guideOpened: readFlag(GUIDE_OPENED_KEY),
    photoChanged: readFlag(PHOTO_CHANGED_KEY),
    tabsSeen: readSetSize(TABS_SEEN_KEY),
    rekapDaysSeen: readSetSize(REKAP_DAYS_KEY),
  }
}
type ContextInput = Pick<AchievementContext, 'transactions' | 'walletsCount' | 'customPaymentsCount' | 'customCategoriesCount' | 'goalsTotal' | 'goalsCompleted'>

// ── Peta unlock (id → tanggal ISO pertama terbuka) ────────────────────────────
type UnlockMap = Record<string, string>
function readUnlockMap(): UnlockMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(UNLOCK_MAP_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch { return {} }
}
function writeUnlockMap(map: UnlockMap) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(UNLOCK_MAP_KEY, JSON.stringify(map)) } catch { /* quota */ }
}

export function queueUnlockCelebrations(badges: Pick<UnlockedBadge, 'id'>[]) {
  if (typeof window === 'undefined' || badges.length === 0) return
  try {
    const prev = JSON.parse(window.localStorage.getItem(PENDING_UNLOCK_QUEUE_KEY) ?? '[]')
    const merged = Array.from(new Set([...(Array.isArray(prev) ? prev : []), ...badges.map(b => b.id)]))
    window.localStorage.setItem(PENDING_UNLOCK_QUEUE_KEY, JSON.stringify(merged))
  } catch {
    // ignore quota/private mode issues
  }
}

export function consumeUnlockCelebrations(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PENDING_UNLOCK_QUEUE_KEY)
    window.localStorage.removeItem(PENDING_UNLOCK_QUEUE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/**
 * Sinkronkan unlock: untuk badge yang baru terbuka & belum tercatat tanggalnya,
 * simpan timestamp. Kembalikan daftar badge yang BARU terbuka (untuk pop-up).
 * `silent` = jangan munculkan pop-up (mis. saat mount pertama).
 */
export function syncUnlocks(badges: UnlockedBadge[], opts?: { silent?: boolean }): UnlockedBadge[] {
  const map = readUnlockMap()
  const fresh: UnlockedBadge[] = []
  let changed = false
  for (const b of badges) {
    if (b.unlocked && !map[b.id]) {
      map[b.id] = new Date().toISOString()
      b.unlockedAt = map[b.id]
      changed = true
      if (!opts?.silent) fresh.push(b)
    }
  }
  if (changed) writeUnlockMap(map)
  return fresh
}

export function formatUnlockDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}
