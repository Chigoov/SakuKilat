'use client';

// SakuKilat - Main Page (SPA with tab switching)

import { useState, useEffect, useCallback } from 'react';
import { StoreProvider, useAuthStore, useFeedbackStore, useTransactionActions, useTransactionStatus, useCustomizationStore } from '@/store/StoreProvider';
import { InputBar } from '@/components/InputBar';
import { BottomNav } from '@/components/BottomNav';
import { Toast } from '@/components/Toast';
import { TabBeranda } from '@/components/tabs/TabBeranda';
import { TabRekapan } from '@/components/tabs/TabRekapan';
import { TabSaku } from '@/components/tabs/TabSaku';
import { TabProfil } from '@/components/tabs/TabProfil';
import { Onboarding, shouldShowOnboarding } from '@/components/Onboarding';
import { addToSet, TABS_SEEN_KEY } from '@/lib/badges';
import { checkDemoUrlParam, isDemoActive } from '@/lib/demo';
import { initNotifications } from '@/lib/notifications';
import { checkRecurringTransactions } from '@/lib/recurring';
import type { Transaction } from '@/types';

const TABS = [
  { id: 'beranda', label: 'Beranda' },
  { id: 'rekapan', label: 'Rekapan' },
  { id: 'saku', label: 'Saku' },
  { id: 'profil', label: 'Profil' },
] as const;

type TabId = typeof TABS[number]['id'];

function AppContent() {
  const { authReady } = useAuthStore();
  const { toast, dismissToast } = useFeedbackStore();
  const { addTransaction, addManualTransaction } = useTransactionActions();
  const { isSubmitting } = useTransactionStatus();
  const { parserExtras } = useCustomizationStore();
  const [activeTab, setActiveTab] = useState<TabId>('beranda');
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Check demo URL param
    const demoActivated = checkDemoUrlParam();
    if (demoActivated) {
      // Reload to apply demo state
      window.location.reload();
      return;
    }

    // Check onboarding
    if (shouldShowOnboarding()) {
      setShowOnboarding(true);
    }

    // Init notifications (no-op on web)
    initNotifications();

    // Check recurring transactions — feed triggered txns into the store
    const triggered = checkRecurringTransactions();
    if (triggered.length > 0) {
      Promise.all(triggered.map((tx) =>
        addManualTransaction({
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          category: tx.category,
          paymentMethod: tx.paymentMethod,
          date: tx.date,
        })
      )).then(() => {
        if (triggered.length > 1) {
          // Show a summary toast if multiple recurring transactions were added
        }
      });
    }

    setReady(true);
    addToSet(TABS_SEEN_KEY, 'beranda');
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && TABS.some((t) => t.id === tab)) setActiveTab(tab as TabId);
  }, []);

  const switchTab = useCallback((tab: TabId) => {
    if (tab !== activeTab && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(18);
    setActiveTab(tab);
    addToSet(TABS_SEEN_KEY, tab);
  }, [activeTab]);

  if (showOnboarding) {
    return (
      <StoreProvider>
        <Onboarding onDone={() => { setShowOnboarding(false); setReady(true); }} />
      </StoreProvider>
    );
  }

  if (!ready || !authReady) {
    return (
      <div className="min-h-[100dvh] bg-[var(--sk-bg)] flex items-center justify-center">
        <div className="text-sm text-[var(--sk-text-muted)]">Memuat SakuKilat...
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--sk-bg)] flex flex-col">
      <main className="flex-1 overflow-y-auto pb-[160px] md:pb-[130px]">
        {activeTab === 'beranda' && <TabBeranda />}
        {activeTab === 'rekapan' && <TabRekapan />}
        {activeTab === 'saku' && <TabSaku />}
        {activeTab === 'profil' && <TabProfil />}
      </main>

      {/* Input bar — sits above bottom nav with safe-area offset */}
      <div className="fixed bottom-nav-offset left-0 right-0 z-30 sk-glass border-t border-[var(--sk-border-2)] safe-bottom md:bottom-5 md:left-[96px] md:right-6 md:max-w-2xl md:border md:rounded-2xl">
        <div className="px-3 py-2">
          <InputBar onSubmit={addTransaction} isSubmitting={isSubmitting} parserExtras={parserExtras} />
        </div>
      </div>

      {/* Bottom navigation */}
      <BottomNav tabs={TABS} activeTab={activeTab} onSwitch={(t) => switchTab(t as TabId)} />

      {/* Toast — positioned above input bar */}
      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
    </div>
  );
}

export default function Page() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}
