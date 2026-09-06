import { Anton_400Regular } from '@expo-google-fonts/anton';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from '@/lib/auth/auth-context';
import { useNotificationTapRouting } from '@/lib/notifications/use-notification-tap';

SplashScreen.preventAutoHideAsync();

// useNotificationTapRouting() reads the coach/client role from AuthContext,
// so it must run inside <AuthProvider> — not in RootLayout's body, which is
// outside that subtree.
function NotificationTapRouter() {
  useNotificationTapRouting();
  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Anton_400Regular,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Native splash (app.json) stays up until fonts resolve — nothing renders
  // before this, so there is nothing to flash or jump.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <NotificationTapRouter />
          <Slot />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
