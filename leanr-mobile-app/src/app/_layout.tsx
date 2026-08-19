import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { Oswald_600SemiBold, Oswald_700Bold } from '@expo-google-fonts/oswald';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { useColorScheme } from 'react-native';

import { BrandLaunchAnimation } from '@/components/brand-launch-animation';
import { AuthProvider } from '@/lib/auth/auth-context';
import { useNotificationTapRouting } from '@/lib/notifications/use-notification-tap';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [showLaunch, setShowLaunch] = useState(true);
  const [fontsLoaded] = useFonts({
    Oswald_700Bold,
    Oswald_600SemiBold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  useNotificationTapRouting();

  // Native splash (app.json) stays up until fonts resolve — nothing renders
  // before this, so there is nothing to flash or jump.
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        {/* Real auth bootstrap (session restore + role lookup) runs inside
            AuthProvider in parallel with the launch animation below, per
            LEANR_PT_NEXTGEN_APP_PRD.md §18.4 — the animation is a ceiling
            on load time, never a gate in front of it. The (auth) and
            (client) group layouts each render `null` while auth is still
            loading, so there's nothing to see under the overlay anyway. */}
        <Slot />
        {showLaunch && <BrandLaunchAnimation onFinish={() => setShowLaunch(false)} />}
      </AuthProvider>
    </ThemeProvider>
  );
}
