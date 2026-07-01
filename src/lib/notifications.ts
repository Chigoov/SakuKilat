// SakuKilat - Local Notifications Helper
// Uses Capacitor LocalNotifications when running in APK,
// falls back to no-op on web.

let LocalNotifications: any = null;

export async function initNotifications() {
  if (typeof window === 'undefined') return;
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const mod = await import('@capacitor/local-notifications');
      LocalNotifications = mod.LocalNotifications;
      await LocalNotifications.requestPermissions();
    }
  } catch {
    // Not in native environment — silently skip
  }
}

export async function scheduleStreakReminder(hour: number = 20): Promise<void> {
  if (!LocalNotifications) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
    await LocalNotifications.schedule({
      notifications: [{
        id: 1,
        title: 'SakuKilat — Jangan putus streak!',
        body: 'Catat transaksi hari ini sebelum nyawa berkurang.',
        schedule: {
          on: { hour },
          repeats: true,
        },
        smallIcon: 'ic_stat_icon',
        iconColor: '#22D3EE',
      }],
    });
  } catch {}
}

export async function scheduleBudgetReminder(dayOfMonth: number = 25): Promise<void> {
  if (!LocalNotifications) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: 2 }] });
    await LocalNotifications.schedule({
      notifications: [{
        id: 2,
        title: 'SakuKilat — Cek budget',
        body: 'Budget bulan ini mulai menipis. Cek Rekapan untuk evaluasi.',
        schedule: {
          on: { day: dayOfMonth, hour: 10 },
          repeats: true,
          every: 'month',
        },
        smallIcon: 'ic_stat_icon',
        iconColor: '#22D3EE',
      }],
    });
  } catch {}
}

export async function cancelAllNotifications(): Promise<void> {
  if (!LocalNotifications) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: 1 }, { id: 2 }] });
  } catch {}
}

// Notification preferences storage
const NOTIF_PREFS_KEY = 'sakukilat:v2:notif-prefs';

export interface NotifPrefs {
  streakReminder: boolean;
  budgetReminder: boolean;
  streakHour: number;
  budgetDay: number;
}

export function getNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { streakReminder: true, budgetReminder: false, streakHour: 20, budgetDay: 25 };
}

export async function saveNotifPrefs(prefs: NotifPrefs): Promise<void> {
  try { localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs)); } catch {}
  if (prefs.streakReminder) {
    await scheduleStreakReminder(prefs.streakHour);
  } else {
    if (LocalNotifications) await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
  }
  if (prefs.budgetReminder) {
    await scheduleBudgetReminder(prefs.budgetDay);
  } else {
    if (LocalNotifications) await LocalNotifications.cancel({ notifications: [{ id: 2 }] });
  }
}
