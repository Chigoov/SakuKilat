'use client';

import { useState, useEffect } from 'react';
import { X, Zap, Wallet, BarChart3, Target, Bell, Moon, Download, Award, BookOpen } from 'lucide-react';
import { setFlag, GUIDE_OPENED_KEY } from '@/lib/badges';

interface GuideBookProps {
  onClose: () => void;
}

const SECTIONS = [
  {
    id: 'catat-cepat',
    icon: Zap,
    title: 'Catat Cepat (Bahasa Natural)',
    color: 'text-[var(--sk-cyan)]',
    bg: 'bg-[var(--sk-cyan-dim)]',
    body: 'Tulis aktivitas + nominal + saku di kolom bawah Beranda, lalu Enter. Contoh: "kopi 18k gopay" atau "bensin 50k tunai". SakuKilat menebak nominal, kategori, dan saku secara otomatis.',
    tips: [
      'Singkatan: k/rb (ribu), jt (juta). Contoh: "5jt" = Rp5.000.000',
      'Pindah uang: "pindah 100k ovo ke gopay"',
      'Menabung: "simpan 500k dari bca"',
      'Patungan: "makan 90k bagi 3" → otomatis dibagi 3',
      'Kelipatan: "kopi 25k x 2" → nominal dikali 2',
    ],
  },
  {
    id: 'saku',
    icon: Wallet,
    title: 'Saku & Saldo',
    color: 'text-[var(--sk-green)]',
    bg: 'bg-[var(--sk-green-dim)]',
    body: 'Di tab Saku kamu mengelola semua dompet beserta saldonya. Isi saldo awal tiap saku dulu supaya setiap transaksi mengurangi dompet yang benar. Saku bawaan tidak bisa dihapus; saku buatanmu bisa dihapus kalau saldonya nol.',
    tips: [
      'Set budget bulanan agar tab Beranda bisa mengingatkan sisa jatah harian dan mingguan',
      'Pindah uang antar saku tidak dihitung sebagai pengeluaran',
      'Buat saku baru untuk metode bayar kustom',
    ],
  },
  {
    id: 'rekapan',
    icon: BarChart3,
    title: 'Rekapan & Tren',
    color: 'text-[var(--sk-amber)]',
    bg: 'bg-[var(--sk-amber-dim)]',
    body: 'History, kalender harian, dan tren grafik dalam satu tab Rekapan. Cek pengeluaran per kategori, insight period, dan perbandingan dengan periode lalu.',
    tips: [
      'Buka Rekapan tiap minggu untuk evaluasi pengeluaran',
      'Lihat tren 7 hari, 30 hari, atau 1 tahun',
      'Insight otomatis memberi tahu apakah kamu lebih hemat atau boros',
    ],
  },
  {
    id: 'goals',
    icon: Target,
    title: 'Target Tabungan',
    color: 'text-[#F472B6]',
    bg: 'bg-[rgba(244,114,182,0.12)]',
    body: 'Buat target (cth. "Laptop 8jt"), lalu tambah kontribusi sedikit demi sedikit. Bisa sekadar dicatat, atau benar-benar memindahkan uang dari saku ke tabungan.',
    tips: [
      'Bisa set deadline untuk goal',
      'Kontribusi bisa pindah uang dari saku atau sekadar dicatat',
      'Confetti muncul saat goal tercapai!',
    ],
  },
  {
    id: 'notifikasi',
    icon: Bell,
    title: 'Notifikasi & Pengingat',
    color: 'text-[var(--sk-cyan)]',
    bg: 'bg-[var(--sk-cyan-dim)]',
    body: 'Tap lonceng di pojok kanan atas Beranda. Di sana muncul pengingat saat streak hampir putus, budget mulai menipis, atau goal tabungan hampir tercapai.',
    tips: [
      'Streak putus = nyawa berkurang (max 5 nyawa)',
      'Budget mendekati 100% = warning roast message',
      'Notifikasi lokal via Capacitor di APK',
    ],
  },
  {
    id: 'zen',
    icon: Moon,
    title: 'Zen Mode & Tema',
    color: 'text-[#A78BFA]',
    bg: 'bg-[rgba(167,139,250,0.12)]',
    body: 'Aktifkan Zen Mode untuk menyembunyikan angka — membantu mindful spending tanpa stress lihat nominal. Pilih tema gelap, terang, atau ikuti sistem.',
    tips: [
      'Zen Mode menyembunyikan semua nominal',
      'Tema otomatis mengikuti pengaturan HP (system mode)',
      'Data tersimpan otomatis di perangkat',
    ],
  },
  {
    id: 'backup',
    icon: Download,
    title: 'Backup & Export',
    color: 'text-[var(--sk-green)]',
    bg: 'bg-[var(--sk-green-dim)]',
    body: 'Semua data — transaksi, saku, budget, profil, dan tema — tersimpan otomatis di browser/HP. Backup rutin ke file JSON atau export CSV untuk jaga-jaga.',
    tips: [
      'Backup JSON: simpan semua data untuk restore nanti',
      'Export CSV: untuk analisis di Excel/Google Sheets',
      'Data tidak pernah dikirim ke server — 100% lokal',
    ],
  },
  {
    id: 'badges',
    icon: Award,
    title: 'Lencana & Achievement',
    color: 'text-[var(--sk-amber)]',
    bg: 'bg-[var(--sk-amber-dim)]',
    body: 'Raih 85+ lencana dengan berbagai kategori: streak harian, volume transaksi, disiplin anggaran, psikologi & zen, dan lore/easter egg. Beberapa lencana tersembunyi — eksplorasi fitur untuk menemukannya!',
    tips: [
      'Tier: bronze, silver, gold, special',
      'Beberapa badge easter egg: "Korban Boba", "Sultan Sehari", "Budak Paylater"',
      'Buka semua tab + panduan + 50 lencana = "Khatam SakuKilat"',
    ],
  },
];

export function GuideBook({ onClose }: GuideBookProps) {
  const [openSection, setOpenSection] = useState<string | null>('catat-cepat');

  // Mark guide as opened (side effect in useEffect, not during render)
  useEffect(() => {
    setFlag(GUIDE_OPENED_KEY);
  }, []);

  return (
    <div className="fixed inset-0 z-[90] bg-[var(--sk-bg)] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 sk-glass border-b border-[var(--sk-border)] px-5 py-3 flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-[var(--sk-cyan)]" />
        <h2 className="text-base font-bold text-[var(--sk-text)]">Buku Panduan</h2>
        <button onClick={onClose} className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-[var(--sk-text-dim)] hover:bg-[var(--sk-surface-2)]" aria-label="Tutup">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Intro */}
      <div className="px-5 py-4 pb-[180px]">
        <p className="text-sm text-[var(--sk-text-muted)] leading-relaxed mb-4">
          Selamat datang di SakuKilat! Pelajari cara catat cepat, atur saku, rekapan, dan semua fitur — pakai bahasa yang mudah.
        </p>

        {/* Sections */}
        <div className="space-y-2">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isOpen = openSection === section.id;
            return (
              <div key={section.id} className="rounded-xl bg-[var(--sk-surface)] border border-[var(--sk-border)] overflow-hidden">
                <button
                  onClick={() => setOpenSection(isOpen ? null : section.id)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${section.bg}`}>
                    <Icon className={`w-4 h-4 ${section.color}`} />
                  </div>
                  <span className="flex-1 text-sm font-semibold text-[var(--sk-text)]">{section.title}</span>
                  <span className={`text-[var(--sk-text-dim)] transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pt-0 space-y-2 animate-fade-in">
                    <p className="text-xs text-[var(--sk-text-muted)] leading-relaxed pl-12">{section.body}</p>
                    {section.tips.length > 0 && (
                      <ul className="pl-12 space-y-1">
                        {section.tips.map((tip, i) => (
                          <li key={i} className="text-[11px] text-[var(--sk-text-dim)] flex items-start gap-1.5">
                            <span className="text-[var(--sk-cyan)] mt-0.5">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 p-3 rounded-xl bg-[var(--sk-surface-2)] text-center">
          <p className="text-[11px] text-[var(--sk-text-dim)] leading-relaxed">
            Tips: mulai dengan mengisi saku & saldo awal, tentukan budget, lalu catat transaksi harianmu.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-2.5 rounded-xl bg-[var(--sk-cyan)] text-[#090D16] text-sm font-bold shadow-[0_0_15px_var(--sk-cyan-glow)] active:scale-95 transition-all"
        >
          Mulai catat
        </button>
      </div>
    </div>
  );
}
