'use client'

import { useState } from 'react'
import {
  ArrowRightLeft, BarChart2, Bell, BookOpen, ChevronDown, Database,
  PiggyBank, SlidersHorizontal, Sparkles, Tag, Trophy, Wallet, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface GuideExample {
  text: string
  note: string
}

interface GuideSection {
  id: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  iconBg: string
  title: string
  summary: string
  body: React.ReactNode
}

function Example({ text, note }: GuideExample) {
  return (
    <div className="rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-3 py-2">
      <code className="text-xs font-semibold text-[var(--sk-cyan)] break-words">{text}</code>
      <p className="text-[11px] text-[var(--sk-text-dim)] mt-1 leading-relaxed">{note}</p>
    </div>
  )
}

const SECTIONS: GuideSection[] = [
  {
    id: 'keunggulan',
    icon: Sparkles,
    iconColor: 'text-[var(--sk-cyan)]',
    iconBg: 'bg-[var(--sk-cyan-dim)]',
    title: 'Kenapa SakuKilat?',
    summary: 'Keunggulan utama dan cara memanfaatkannya.',
    body: (
      <div className="space-y-3">
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          SakuKilat dibuat supaya mencatat keuangan terasa <b>cepat, privat, dan menyenangkan</b>.
          Ini keunggulan utamanya:
        </p>
        <ul className="space-y-2 text-[11px] text-[var(--sk-text-muted)] leading-relaxed">
          <li>Catat secepat ngetik chat. Tulis "kopi 18k gopay" - nominal, kategori, dan saku ketebak otomatis.</li>
          <li>100% lokal dan offline. Semua data di perangkatmu, tanpa login, tanpa server.</li>
          <li>Saran cepat. Saat mulai mengetik mirip transaksi lama, rekomendasi catatan langsung muncul.</li>
          <li>Rekap kaya. Kartu masuk/keluar, rincian kategori, dan tren periode ada dalam satu tab Rekapan.</li>
          <li>Budget pintar. Tahu batas aman jajan harian yang menyesuaikan otomatis.</li>
          <li>Gamifikasi. Streak, nyawa, dan 100 lencana bikin nyatat jadi kebiasaan.</li>
          <li>Backup dan migrasi. Ekspor/impor JSON dan CSV untuk pindah perangkat kapan saja.</li>
        </ul>
        <p className="text-[11px] text-[var(--sk-text-dim)] leading-relaxed">
          Urutan paling enak: isi saku dan saldo awal {'->'} set budget {'->'} catat harian {'->'} cek Rekapan tiap minggu {'->'} backup rutin.
        </p>
      </div>
    ),
  },
  {
    id: 'smart-tracker',
    icon: Sparkles,
    iconColor: 'text-[var(--sk-cyan)]',
    iconBg: 'bg-[var(--sk-cyan-dim)]',
    title: 'Smart Tracker',
    summary: 'Cara tercepat: ketik seperti ngobrol, biar aplikasi yang menebak.',
    body: (
      <div className="space-y-3">
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Kolom input di bawah layar membaca kalimatmu dan otomatis menebak <b>nominal</b>, <b>kategori</b>, dan <b>saku/metode bayar</b>.
        </p>
        <div className="rounded-lg bg-[var(--sk-cyan-dim)] border border-[rgba(56,189,248,0.25)] px-3 py-2 text-center">
          <span className="text-xs font-bold text-[var(--sk-cyan)]">apa + berapa + pakai apa</span>
        </div>
        <div className="space-y-2">
          <Example text="kopi 18k gopay" note="Pengeluaran Rp18.000, kategori Makanan, dari GoPay." />
          <Example text="bensin 50rb tunai" note="rb / k = ribu. Jadi Rp50.000 dari Tunai." />
          <Example text="gaji 5jt bca" note="jt = juta. Pemasukan Rp5.000.000 masuk ke BCA." />
          <Example text="belanja 299.000 shopeepay" note="Boleh pakai titik/koma ribuan: 299.000 = Rp299.000." />
          <Example text="makan padang 200k bagi 4 gopay" note="Patungan: nominal otomatis dibagi 4 jadi Rp50.000." />
          <Example text="kopi 25k kemarin ovo" note="Tambah 'kemarin' atau 'tgl 5' untuk mengatur tanggal." />
        </div>
        <div className="rounded-lg bg-[var(--sk-surface-2)] border border-[var(--sk-border)] px-3 py-2.5">
          <p className="text-[11px] font-semibold text-[var(--sk-text-muted)] mb-1.5">Singkatan nominal yang dimengerti:</p>
          <p className="text-[11px] text-[var(--sk-text-dim)] leading-relaxed">
            <b>k</b> / <b>rb</b> / <b>ribu</b> = ribuan • <b>jt</b> / <b>juta</b> = jutaan • boleh tulis <b>Rp</b> di depan.
          </p>
        </div>
        <div className="rounded-lg bg-[var(--sk-amber-dim)] border border-[rgba(251,191,36,0.25)] px-3 py-2.5">
          <p className="text-[11px] font-semibold text-[var(--sk-amber)] mb-1.5">Yang belum bisa ditangkap otomatis:</p>
          <ul className="text-[11px] text-[var(--sk-text-muted)] leading-relaxed space-y-1 list-disc pl-4">
            <li>Dua transaksi sekaligus. Catat satu per satu.</li>
            <li>Nominal berupa kata seperti "setengah juta". Tulis angka: 500k.</li>
            <li>Kirim uang ke nama orang. Pakai Catat Manual.</li>
          </ul>
          <p className="text-[11px] text-[var(--sk-text-dim)] mt-2 leading-relaxed">
            Tanda persen di sebelah input menunjukkan tingkat keyakinan. Kalau rendah, cek lagi sebelum kirim.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 'manual',
    icon: SlidersHorizontal,
    iconColor: 'text-[var(--sk-green)]',
    iconBg: 'bg-[var(--sk-green-dim)]',
    title: 'Catat Manual',
    summary: 'Kalau butuh presisi penuh, isi manual tanpa menebak-nebak.',
    body: (
      <div className="space-y-3">
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Tombol slider membuka <b>Catat Manual</b> - kamu pilih sendiri tipe, dompet, kategori masuk/keluar, tanggal, sub kategori, dan deskripsi.
        </p>
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Cocok untuk transaksi rumit, transaksi lampau, atau saat tebakan otomatis belum pas. Kolom catatan juga bisa menampilkan rekomendasi kalimat yang pernah kamu pakai.
        </p>
      </div>
    ),
  },
  {
    id: 'saku',
    icon: Wallet,
    iconColor: 'text-[var(--sk-cyan)]',
    iconBg: 'bg-[var(--sk-cyan-dim)]',
    title: 'Saku & Budget',
    summary: 'Atur dompet dan batas belanja bulanan.',
    body: (
      <div className="space-y-3">
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Di tab <b>Saku</b> kamu mengelola semua dompet beserta saldonya. Isi saldo awal tiap saku dulu supaya setiap transaksi mengurangi dompet yang benar.
        </p>
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Atur <b>Budget Bulanan</b> agar tab Beranda bisa mengingatkan sisa jatah harian dan mingguan. Saku bawaan tidak bisa dihapus; saku buatanmu bisa dihapus kalau saldonya nol.
        </p>
      </div>
    ),
  },
  {
    id: 'pindah-goal',
    icon: ArrowRightLeft,
    iconColor: 'text-[var(--sk-green)]',
    iconBg: 'bg-[var(--sk-green-dim)]',
    title: 'Pindah, Simpan & Goal',
    summary: 'Geser uang antar saku dan kumpulkan target tabungan.',
    body: (
      <div className="space-y-3">
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          <b>Pindah & Simpan</b>: geser uang antar saku tanpa dihitung sebagai pengeluaran. Bisa juga lewat input: <code className="text-[var(--sk-cyan)]">pindah 100k bca ke gopay</code>.
        </p>
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          <b>Goal Tabungan</b>: buat target, lalu tambah kontribusi sedikit demi sedikit. Bisa sekadar dicatat, atau benar-benar memindahkan uang dari saku ke Tabungan.
        </p>
      </div>
    ),
  },
  {
    id: 'rekapan',
    icon: BarChart2,
    iconColor: 'text-[var(--sk-cyan)]',
    iconBg: 'bg-[var(--sk-cyan-dim)]',
    title: 'Rekapan',
    summary: 'Lihat tren periode dan buka rincian kategori masuk/keluar.',
    body: (
      <div className="space-y-3">
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Pilih mode <b>Mingguan</b> atau <b>Bulanan</b>, lalu gunakan kartu <b>Masuk</b> dan <b>Keluar</b> sebagai jalan pintas ke rincian kategori.
        </p>
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Setelah memilih kategori, kamu bisa masuk lagi ke sub kategori dan daftar transaksi detailnya.
        </p>
      </div>
    ),
  },
  {
    id: 'personalisasi',
    icon: Tag,
    iconColor: 'text-[var(--sk-amber)]',
    iconBg: 'bg-[var(--sk-amber-dim)]',
    title: 'Metode Bayar & Kategori',
    summary: 'Ajari aplikasi memahami istilahmu sendiri.',
    body: (
      <div className="space-y-3">
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Di tab Saku, buka panel <b>Metode Bayar</b> dan <b>Kategori</b>. Tambahkan metode atau kategori baru lengkap dengan <b>keyword</b> supaya parser mengenali istilah khasmu.
        </p>
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Kategori juga bisa punya sub-kategori, dan chart akan tetap menjaga warna supaya tidak bentrok satu sama lain.
        </p>
      </div>
    ),
  },
  {
    id: 'streak-trofi',
    icon: Trophy,
    iconColor: 'text-[var(--sk-amber)]',
    iconBg: 'bg-[var(--sk-amber-dim)]',
    title: 'Streak, Nyawa & Trofi',
    summary: 'Catat tiap hari, jaga nyawa, kumpulkan lencana.',
    body: (
      <div className="space-y-3">
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Setiap hari kamu mencatat, <b>streak</b> bertambah. Kamu punya <b>5 nyawa</b> - satu pecah tiap hari absen.
        </p>
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          <b>Etalase Trofi</b> di tab Profil mengumpulkan lencana atas kebiasaan baik. Lencana terbuka otomatis saat syaratnya tercapai, termasuk setelah impor data lama.
        </p>
      </div>
    ),
  },
  {
    id: 'notifikasi',
    icon: Bell,
    iconColor: 'text-[var(--sk-cyan)]',
    iconBg: 'bg-[var(--sk-cyan-dim)]',
    title: 'Notifikasi',
    summary: 'Pengingat lembut biar tidak kebablasan.',
    body: (
      <div className="space-y-3">
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Tap <b>lonceng</b> di pojok kanan atas Beranda. Di sana muncul pengingat saat streak hampir putus, budget mulai menipis, atau goal tabungan hampir tercapai.
        </p>
      </div>
    ),
  },
  {
    id: 'data',
    icon: Database,
    iconColor: 'text-[var(--sk-green)]',
    iconBg: 'bg-[var(--sk-green-dim)]',
    title: 'Data, Backup & Privasi',
    summary: 'Semua tersimpan di perangkatmu. Rajin backup.',
    body: (
      <div className="space-y-3">
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          SakuKilat menyimpan semua data <b>di perangkat ini saja</b>. Cepat dan privat - tapi artinya data tidak otomatis pindah ke HP lain.
        </p>
        <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed">
          Di tab Profil ada <b>Laporan PDF</b>, <b>Backup JSON</b>, <b>Ekspor CSV</b>, dan <b>Impor</b>. Lakukan backup rutin sebelum ganti HP atau bersih-bersih browser.
        </p>
      </div>
    ),
  },
]

export function UserGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [openId, setOpenId] = useState<string>('keunggulan')

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sk-guide-title"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/80 animate-fade-in"
    >
      <div className="w-full sm:max-w-lg max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[var(--sk-surface)] border border-[var(--sk-border-2)] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--sk-border)] flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--sk-cyan-dim)] flex items-center justify-center">
            <BookOpen className="w-4.5 h-4.5 text-[var(--sk-cyan)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="sk-guide-title" className="text-sm font-bold text-[var(--sk-text)] leading-tight">Buku Panduan</h2>
            <p className="text-[11px] text-[var(--sk-text-dim)]">Kenali semua fitur SakuKilat</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panduan"
            className="w-9 h-9 rounded-lg bg-[var(--sk-surface-2)] flex items-center justify-center text-[var(--sk-text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2.5">
          {SECTIONS.map(section => {
            const Icon = section.icon
            const expanded = openId === section.id
            return (
              <div
                key={section.id}
                className={cn(
                  'rounded-xl border bg-[var(--sk-surface)] transition-colors',
                  expanded ? 'border-[var(--sk-cyan)]' : 'border-[var(--sk-border)]'
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? '' : section.id)}
                  aria-expanded={expanded}
                  className="w-full flex items-center gap-3 px-3 py-3 text-left"
                >
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', section.iconBg)}>
                    <Icon className={cn('w-4 h-4', section.iconColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--sk-text)] leading-tight">{section.title}</p>
                    <p className="text-[11px] text-[var(--sk-text-dim)] mt-0.5 leading-relaxed">{section.summary}</p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 text-[var(--sk-text-dim)] flex-shrink-0 transition-transform duration-200',
                      expanded && 'rotate-180'
                    )}
                  />
                </button>
                {expanded && (
                  <div className="border-t border-[var(--sk-border)] px-3 py-3">
                    {section.body}
                  </div>
                )}
              </div>
            )
          })}

          <p className="text-center text-[11px] text-[var(--sk-text-dim)] leading-relaxed mt-1 px-2">
            Tips: mulai dengan mengisi saku dan saldo awal, tentukan budget, lalu catat transaksi harianmu.
          </p>
        </div>
      </div>
    </div>
  )
}
