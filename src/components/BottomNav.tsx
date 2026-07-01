'use client';

import { Home, BarChart3, Wallet, User } from 'lucide-react';
import type { ComponentType } from 'react';

const TAB_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  beranda: Home,
  rekapan: BarChart3,
  saku: Wallet,
  profil: User,
};

interface BottomNavProps {
  tabs: readonly { id: string; label: string }[];
  activeTab: string;
  onSwitch: (tab: string) => void;
}

export function BottomNav({ tabs, activeTab, onSwitch }: BottomNavProps) {
  return (
    <nav aria-label="Navigasi utama" className="fixed bottom-0 left-0 right-0 z-40 sk-glass border-t border-[var(--sk-border-2)] safe-bottom md:hidden">
      <div className="flex items-stretch h-nav">
        {tabs.map((tab) => {
          const Icon = TAB_ICONS[tab.id] ?? Home;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSwitch(tab.id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-[var(--sk-cyan)]' : 'text-[var(--sk-text-dim)]'}`} />
              <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-[var(--sk-cyan)]' : 'text-[var(--sk-text-dim)]'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
