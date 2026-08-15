import { Manrope_500Medium, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { Oswald_600SemiBold, Oswald_700Bold } from '@expo-google-fonts/oswald';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { BrandLaunchAnimation } from '@/components/brand-launch-animation';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [showLaunch, setShowLaunch] = useState(true);
  const [fontsLoaded] = useFonts({
    Oswald_700Bold,
    Oswald_600SemiBold,
    Manrope_500Medium,
    Manrope_700Bold,
  });

  // Native splash (app.json) stays up until fonts resolve — nothing renders
  // before this, so there is nothing to flash or jump.
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppTabs />
      {showLaunch && <BrandLaunchAnimation onFinish={() => setShowLaunch(false)} />}
    </ThemeProvider>
  );
}
