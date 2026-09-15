'use client'

import { useState } from 'react'
import {
  Sparkles, CheckCircle2, ShieldCheck, Wrench, Smartphone,
  Zap, ChevronDown, ChevronRight, X, History, Layers
} from 'lucide-react'
import pkg from '@/package.json'
import { cn } from '@/lib/utils'

interface PatchItem {
  tag: 'bug' | 'ux' | 'feature' | 'core'
  tagLabel: string
  title: string
  description: string
}

interface PatchRelease {
  version: string
  date: string
  isLatest?: boolean
  summary: string
  items: PatchItem[]
}

export const CURRENT_APP_VERSION = `v${pkg.version}`

const PATCH_HISTORY: PatchRelease[] = [
  {
    version: 'v1.1.0',
    date: '14 September 2026',
    isLatest: true,
    summary: 'Rilis Akbar Arsitektur & Integritas Data: Single Source of Truth (SSoT) buku besar mutasi, proteksi kebangkitan dompet (anti-resurrection) & penghapusan non-destruktif, sinkronisasi dua arah dompet & metode pembayaran kustom, pengerasan kriptografis PBKDF2 ber-salt & asersi WebAuthn, validasi skema mendalam & mitigasi storage error, sanitasi numerik ketat (integer rupiah), serta penegakan 25 invarian sistem.',
    items: [
      {
        tag: 'core',
        tagLabel: 'Buku Besar & SSoT',
        title: 'Single Source of Truth Integritas Saldo Dompet',
        description: 'Kalkulasi saldo kini ditegakkan secara absolut melalui formula matematis openingBalance + sum(ledger impacts), dilengkapi rekonsiliasi mandiri otomatis yang mendeteksi dan memperbaiki saldo melenceng tanpa modifikasi mutasi masa lalu.',
      },
      {
        tag: 'bug',
        tagLabel: 'Siklus Hidup Dompet',
        title: 'Pencegahan Kebangkitan Dompet & Penghapusan Non-Destruktif',
        description: 'Dompet terhapus atau terarsip diproteksi permanen dari kebangkitan otomatis (anti-resurrection) oleh fungsi lookup. Transaksi historis tetap mempertahankan nama dompet secara non-destruktif dengan indikator terhapus.',
      },
      {
        tag: 'core',
        tagLabel: 'Sinkronisasi Pembayaran',
        title: 'Sinkronisasi Dua Arah Dompet & Metode Pembayaran',
        description: 'Penghapusan atau penambahan dompet dan metode pembayaran kustom tersinkronisasi dua arah tanpa perulangan kreasi mutual (mutual creation loop) dan paritas validasi penuh pada updateWallet.',
      },
      {
        tag: 'core',
        tagLabel: 'Sanitasi & Tipe Data',
        title: 'Sanitasi Numerik Ketat & Input Gating Multi-Transaksi',
        description: 'Proteksi angka terhadap NaN, Infinity, dan pecahan desimal sen di seluruh form dan transfer. Smart Input dilengkapi pembatasan rollover tanggal 31 pada bulan pendek dan konfirmasi pemisahan multi-transaksi.',
      },
      {
        tag: 'core',
        tagLabel: 'Keamanan Kriptografi',
        title: 'Pengerasan Keamanan Passcode PBKDF2 & WebAuthn',
        description: 'Peningkatan hashing PIN App-Lock menggunakan PBKDF2 dengan salt acak dan 100.000 iterasi, verifikasi kriptografis signature WebAuthn, serta mekanisme rate limiting bertingkat terhadap brute-force.',
      },
      {
        tag: 'core',
        tagLabel: 'Ketahanan Penyimpanan',
        title: 'Penyimpanan Atomik & Validasi Skema Mendalam',
        description: 'Pemuatan data lokal kini menerapkan deep schema validation yang memangkas node rusak tanpa crash, mekanisme penulisan atomik write-then-replace, peringatan toast saat kuota penuh, serta persistensi preferensi notifikasi.',
      },
      {
        tag: 'bug',
        tagLabel: 'Kategori & Mutasi',
        title: 'Penghapusan Kategori Aman & Pelindung State Undo',
        description: 'Penghapusan kategori kustom mempertahankan label historis pada transaksi lama. Penekanan Undo terlindungi dari race condition delta dan double-undo, serta transfer antar-dompet identik diblokir.',
      },
      {
        tag: 'feature',
        tagLabel: 'Testing & Invarian',
        title: 'Pengujian Komprehensif 25 Invarian Sistem (PBT)',
        description: 'Verifikasi formal berbasis fast-check terhadap 25 invarian integritas sistem, pengujian angka ekstrem hingga Rp10 Miliar, serta audit kepatuhan keamanan data pribadi SK-001 (100% lulus).',
      },
    ],
  },
  {
    version: 'v1.0.9',
    date: '14 September 2026',
    isLatest: false,
    summary: 'Rilis Akbar Submenu Berlayar & Penyempurnaan Mobile: Navigasi stacking layer Tab Saku terintegrasi back-stack LIFO, relokasi Wawasan & Analisis ke Tab Rencana, kolom catatan eksplisit langsung di Catat Manual untuk semua tipe transaksi, reposisi tanggal pengeluaran di bawah kategori, format rupiah kalender adaptif bebas terpotong elipsis, dan guard rekonsiliasi saku aktif.',
    items: [
      {
        tag: 'ux',
        tagLabel: 'Navigasi Saku',
        title: 'Submenu Berlayar Mandiri Bebas Accordion Sprawl',
        description: 'Membuka submenu Tab Saku (Daftar Saku, Pindah Saldo, Kategori, Inbox) kini menyajikan layer/sheet mandiri berlayar dengan header jelas dan terdaftar penuh pada sistem tombol kembali (back-stack LIFO) tanpa memanjangkan halaman.',
      },
      {
        tag: 'ux',
        tagLabel: 'Catat Manual',
        title: 'Kolom Catatan Eksplisit untuk Semua Tipe Transaksi',
        description: 'Input Catatan (opsional) kini langsung tampil di alur form utama Catat Manual tanpa membuka accordion dan mendukung penuh transaksi pengeluaran, pemasukan, serta transfer antar-saku.',
      },
      {
        tag: 'ux',
        tagLabel: 'Beranda Ramping',
        title: 'Relokasi Wawasan & Analisis ke Tab Rencana',
        description: 'Bagian Wawasan & Analisis Lengkap (Cashflow Pintar, Skor Finansial, Mini Target Tabungan) dipindahkan ke Tab Rencana sebagai pusat evaluasi berkala, menjaga Beranda tetap ringan dan fokus pada pencatatan cepat.',
      },
      {
        tag: 'ux',
        tagLabel: 'Rekapan Transaksi',
        title: 'Reposisi Tanggal Pencatatan Persis di Bawah Kategori',
        description: 'Tanggal dan waktu transaksi pengeluaran kini diposisikan rapi di baris tersendiri tepat di bawah nama kategori, memberikan ruang lega bagi nominal angka tanpa tabrakan badge dompet atau split.',
      },
      {
        tag: 'ux',
        tagLabel: 'Kalender Bulanan',
        title: 'Angka Rupiah Harian Bebas Terpotong (Zero Ellipsis)',
        description: 'Tampilan kalender transaksi mengadopsi format rupiah adaptif ringkas (+1,5jt, -250rb) yang muat rapi dan terbaca jelas tanpa terpotong tanda elipsis (...) pada layar ponsel 390px.',
      },
      {
        tag: 'feature',
        tagLabel: 'Rekonsiliasi Saldo',
        title: 'Guard Rekonsiliasi Dompet dengan Mutasi Bulan Berjalan',
        description: 'Tombol rekonsiliasi saldo otomatis diproteksi nonaktif dengan banner informatif apabila dompet yang dipilih belum memiliki mutasi transaksi pada bulan kalender berjalan.',
      },
      {
        tag: 'feature',
        tagLabel: 'Split Transaksi',
        title: 'Balanced Multi-Category Split Transactions',
        description: 'Dukungan pembagian 1 transaksi belanja ke dalam beberapa kategori sekaligus dengan penjagaan ketat saldo selisih nol pada modal revisi transaksi.',
      },
      {
        tag: 'feature',
        tagLabel: 'Net Worth & Tutup Buku',
        title: 'Pelacakan Kekayaan Bersih & Tutup Buku Bulanan',
        description: 'Kalkulasi kekayaan bersih terpadu, penutupan buku akhir bulan dengan checklist pra-tutup, dan sinkronisasi widget Android.',
      },
    ],
  },
  {
    version: 'v1.0.8',
    date: '14 September 2026',
    isLatest: false,
    summary: 'Remediasi Final UX & Ergonomi: Aksesibilitas tanggal form manual, layout Beranda bebas tumpang tindih Smart Input, touch target Saku 40–44px, dan konfirmasi hapus aman.',
    items: [
      {
        tag: 'ux',
        tagLabel: 'Catat Manual',
        title: 'Pemilih Tanggal Terbuka Langsung & Aksesibel',
        description: 'Kontrol tanggal & waktu kini tampil langsung di area utama form Catat Manual tanpa harus membuka Detail Tambahan, lengkap dengan tombol cepat Hari Ini & Kemarin serta label aksesibel.',
      },
      {
        tag: 'ux',
        tagLabel: 'Beranda Bebas Overlap',
        title: 'Layout Beranda Ramping & Zero Horizontal Scroll',
        description: 'Teks tanggal header kini membungkus fleksibel tanpa terpotong di 390px. Kartu Budget (Jatah/hari & Sisa hari) berjarak aman di atas Smart Input tanpa tumpang tindih.',
      },
      {
        tag: 'ux',
        tagLabel: 'Ergonomi Saku',
        title: 'Touch Target Tombol Saku 40–44px & Konfirmasi Hapus',
        description: 'Tombol Rekonsiliasi, Edit, dan Hapus saku diperbesar menjadi 40×40px untuk kenyamanan ibu jari. Tombol Hapus dilengkapi konfirmasi dua langkah untuk mencegah penghapusan tanpa sengaja.',
      },
      {
        tag: 'core',
        tagLabel: 'Split Transaksi',
        title: 'Verifikasi Ketat Alokasi Split pada Edit Transaksi',
        description: 'Editor pembagian transaksi (split) kini terintegrasi penuh dan terverifikasi secara ketat pada modal edit transaksi.',
      },
    ],
  },
  {
    version: 'v1.0.7',
    date: '24 Agustus 2026',
    isLatest: false,
    summary: 'Sprint Ergonomi & Sub Kategori: Quick Chips nominal, modal revisi transaksi bottom-sheet, horizontal subkategori carousel, smart subcategory NLP, dan drilldown rekapan.',
    items: [
      {
        tag: 'feature',
        tagLabel: 'Revisi Transaksi',
        title: 'Dedicated Edit Bottom Sheet Modal',
        description: 'Edit transaksi riwayat kini membuka bottom-sheet modal tersendiri tanpa memperpanjang list transaksi. Dilengkapi Quick Amount Chips, Quick Date, dan tombol hapus dengan konfirmasi aman.',
      },
      {
        tag: 'ux',
        tagLabel: 'Input Cepat',
        title: 'Quick Amount Chips (+10rb s/d +500rb) & Quick Date',
        description: 'Form manual dan modal revisi kini memiliki tombol nominal cepat (+10rb, +20rb, +50rb, +100rb, +500rb, Hapus) serta pemilih tanggal cepat (Hari Ini, Kemarin).',
      },
      {
        tag: 'feature',
        tagLabel: 'Sub Kategori',
        title: 'Horizontal Pill Carousel & Smart NLP Subkategori',
        description: 'Preset subkategori lengkap untuk semua kategori umum dengan carousel swipeable dan tombol instant + Sub Baru. Smart Input kini otomatis mengenali subkategori (kopi -> Kopi & Nongkrong, bensin -> Bensin).',
      },
      {
        tag: 'ux',
        tagLabel: 'Analisis & Saku',
        title: 'Subcategory Accordion Drilldown & Visual Saku Badges',
        description: 'Rincian kategori di Tab Rekapan kini memiliki accordion interaktif untuk melihat distribusi subkategori. Badge saku visual warna membedakan Bank (Biru), E-Wallet (Toska), dan Tunai (Amber).',
      },
    ],
  },
  {
    version: 'v1.0.6',
    date: '24 Agustus 2026',
    summary: 'Peningkatan besar akurasi kalkulasi nominal, filter NLP bahasa Indonesia, tampilan saldo saku, dan optimalisasi ruang layar mobile.',
    items: [
      {
        tag: 'bug',
        tagLabel: 'Perbaikan Kritis',
        title: 'Akurasi Nominal 1.5k & Singkatan Angka',
        description: 'Input "1.5k" kini terbaca tepat Rp 1.500 (sebelumnya salah menjadi Rp 15.000). Mendukung singkatan k, rb, ribu, jt, juta, m secara konsisten.',
      },
      {
        tag: 'bug',
        tagLabel: 'Perbaikan Kritis',
        title: 'Kalkulasi Desimal & Angka Bertitik',
        description: 'Input "2.50" kini dibulatkan wajar tanpa melonjak ke Rp 25.000. Angka ribuan standar "2.000" tidak lagi memunculkan peringatan palsu.',
      },
      {
        tag: 'core',
        tagLabel: 'Smart NLP',
        title: 'Filter Kata Keterangan Sehari-hari',
        description: 'Smart Input kini cerdas menyaring kata "di", "sama", "barusan", "tadi", "dari" sehingga kalimat natural seperti "beli bensin 50rb di spbu" langsung terklasifikasi akurat.',
      },
      {
        tag: 'ux',
        tagLabel: 'Peningkatan UX',
        title: 'Tampilan Saldo di Pemilih Saku (WalletGrid)',
        description: 'Form Catat Manual kini menampilkan nama saku beserta sisa saldo di bawahnya secara langsung tanpa perlu berpindah ke tab Saku.',
      },
      {
        tag: 'ux',
        tagLabel: 'Layar Lega',
        title: 'Optimalisasi Layar Tab Rekapan & Saku',
        description: 'Smart Input bar otomatis disembunyikan di tab Rekapan dan Saku, memberikan ~130px ruang layar tambahan agar grafik dan tabel tampil penuh di HP.',
      },
      {
        tag: 'ux',
        tagLabel: 'Ergonomi',
        title: 'Touch Target Tombol Kategori 44px',
        description: 'Area sentuh dan ikon tombol kategori diperbesar sesuai standar ergonomis 44px sehingga nyaman ditekan satu ibu jari di smartphone.',
      },
      {
        tag: 'bug',
        tagLabel: 'Perbaikan Sistem',
        title: 'Antrean Notifikasi Trofi Tersimpan',
        description: 'Perbaikan key antrean pencapaian sehingga animasi perayaan lencana/trofi baru muncul dengan andal saat aplikasi dibuka.',
      },
    ],
  },
  {
    version: 'v1.0.5',
    date: '15 Agustus 2026',
    summary: 'Perbaikan kalkulasi ringkasan kategori pemasukan dan penyesuaian parent category.',
    items: [
      {
        tag: 'bug',
        tagLabel: 'Perbaikan Bug',
        title: 'Kalkulasi Summary Kategori Pemasukan',
        description: 'Memperbaiki akumulasi subkategori pemasukan pada ringkasan laporan bulanan.',
      },
      {
        tag: 'core',
        tagLabel: 'Integritas Data',
        title: 'Sinkronisasi Struktur Saku & Transaksi',
        description: 'Pembersihan otomatis referensi saku yang telah dihapus agar tidak meninggalkan transaksi yatim.',
      },
    ],
  },
  {
    version: 'v1.0.4',
    date: '2 Agustus 2026',
    summary: 'Peningkatan pratinjau cetak PDF dan ekspor data CSV multi-kategori.',
    items: [
      {
        tag: 'feature',
        tagLabel: 'Fitur Baru',
        title: 'Preview Laporan PDF Sebelum Cetak',
        description: 'Menambahkan dialog pratinjau dokumen laporan sebelum mengunduh atau mencetak PDF.',
      },
      {
        tag: 'feature',
        tagLabel: 'Fitur Baru',
        title: 'Ekspor Data CSV Terfilter',
        description: 'Kemampuan memilih rentang tanggal dan kategori saat mengekspor laporan ke format CSV / Excel.',
      },
    ],
  },
  {
    version: 'v1.0.0 - v1.0.3',
    date: 'Juli 2026',
    summary: 'Peluncuran perdana SakuKilat: Catat cepat natural language, 100 lencana gamifikasi, budget harian cerdas, dan keamanan PIN lokal.',
    items: [
      {
        tag: 'feature',
        tagLabel: 'Rilis Perdana',
        title: 'Mesin Smart Quick Input 100% Offline',
        description: 'Pencatatan keuangan cerdas berbasis bahasa natural tanpa memerlukan internet atau server cloud.',
      },
      {
        tag: 'feature',
        tagLabel: 'Gamifikasi',
        title: '100 Lencana Pencapaian & Sistem Nyawa Streak',
        description: 'Sistem motivasi kebiasaan mencatat keuangan dengan reward trofi dan proteksi nyawa saat absen.',
      },
    ],
  },
]

const LATEST_DOCUMENTED_VERSION = PATCH_HISTORY[0]?.version ?? CURRENT_APP_VERSION

export function PatchNotesModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [expandedVersion, setExpandedVersion] = useState<string>(LATEST_DOCUMENTED_VERSION)

  if (!open) return null

  const getTagBadgeStyle = (tag: PatchItem['tag']) => {
    switch (tag) {
      case 'bug':
        return 'bg-[rgba(248,113,113,0.12)] text-[var(--sk-red)] border-[rgba(248,113,113,0.25)]'
      case 'ux':
        return 'bg-[rgba(56,189,248,0.12)] text-[var(--sk-cyan)] border-[rgba(56,189,248,0.25)]'
      case 'feature':
        return 'bg-[rgba(74,222,128,0.12)] text-[var(--sk-green)] border-[rgba(74,222,128,0.25)]'
      case 'core':
      default:
        return 'bg-[rgba(251,191,36,0.12)] text-[var(--sk-amber)] border-[rgba(251,191,36,0.25)]'
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="patch-notes-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-[28px] sm:rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sk-border)] bg-[var(--sk-bg)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--sk-cyan-dim)] flex items-center justify-center flex-shrink-0">
              <History className="w-4.5 h-4.5 text-[var(--sk-cyan)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="patch-notes-title" className="text-base font-bold text-[var(--sk-text)] leading-tight">
                  Catatan Rilis & Fitur
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--sk-cyan)] text-[#090D16]">
                  {CURRENT_APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-[var(--sk-text-dim)] mt-0.5">
                Riwayat pembaruan dan perbaikan tiap patch
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] hover:text-[var(--sk-text)] flex items-center justify-center transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Konten Scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {PATCH_HISTORY.map((patch) => {
            const isExpanded = expandedVersion === patch.version
            const isLatest = patch.version === LATEST_DOCUMENTED_VERSION
            return (
              <div
                key={patch.version}
                className={cn(
                  'rounded-2xl border transition-all overflow-hidden',
                  isLatest
                    ? 'bg-[var(--sk-surface-2)] border-[var(--sk-cyan)]/40 shadow-[0_0_20px_rgba(56,189,248,0.06)]'
                    : 'bg-[var(--sk-surface)] border-[var(--sk-border)]'
                )}
              >
                {/* Header Tiap Versi */}
                <button
                  type="button"
                  onClick={() => setExpandedVersion(isExpanded ? '' : patch.version)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--sk-surface-3)]/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-xs',
                        isLatest
                          ? 'bg-[var(--sk-cyan)] text-[#090D16]'
                          : 'bg-[var(--sk-surface-2)] text-[var(--sk-text-muted)] border border-[var(--sk-border)]'
                      )}
                    >
                      {patch.version.replace('v', '')}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--sk-text)]">{patch.version}</span>
                        {isLatest && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--sk-cyan-dim)] text-[var(--sk-cyan)] border border-[rgba(56,189,248,0.3)]">
                            Terbaru
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--sk-text-dim)]">{patch.date}</span>
                    </div>
                  </div>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 text-[var(--sk-text-dim)] transition-transform duration-200',
                      isExpanded && 'rotate-180 text-[var(--sk-cyan)]'
                    )}
                  />
                </button>

                {/* Ringkasan Singkat */}
                <div className="px-4 pb-3">
                  <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">{patch.summary}</p>
                </div>

                {/* Detail Item Perubahan */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-[var(--sk-border)]">
                    {patch.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl bg-[var(--sk-bg)]/80 border border-[var(--sk-border)] p-3 space-y-1"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'text-[9px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider',
                              getTagBadgeStyle(item.tag)
                            )}
                          >
                            {item.tagLabel}
                          </span>
                          <p className="text-xs font-semibold text-[var(--sk-text)] leading-tight">{item.title}</p>
                        </div>
                        <p className="text-[11px] text-[var(--sk-text-dim)] leading-relaxed pl-0.5">
                          {item.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer Modal */}
        <div className="p-4 border-t border-[var(--sk-border)] bg-[var(--sk-bg)] flex items-center justify-between">
          <span className="text-[11px] text-[var(--sk-text-dim)]">
            SakuKilat Edisi Publik • 100% Offline
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-xs font-bold transition-all shadow-[0_0_12px_rgba(56,189,248,0.25)] hover:opacity-95 active:scale-95"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
