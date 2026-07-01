import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sakukilat.app',
  appName: 'SakuKilat',
  webDir: 'out',
  android: {
    backgroundColor: '#090D16',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#090D16',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    LocalNotifications: {
      iconColor: '#22D3EE',
    },
  },
};

export default config;