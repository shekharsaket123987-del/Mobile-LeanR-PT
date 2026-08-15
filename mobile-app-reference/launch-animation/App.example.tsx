/**
 * Integration example for BrandLaunchAnimation — how the launch animation
 * sits in the app's root component without ever blocking real bootstrap
 * work (auth/session restore, journey-state fetch, font loading).
 *
 * Adapt the imports/paths to wherever your actual navigation root and
 * bootstrap logic live; this file is illustrative, not meant to be
 * copy-pasted verbatim into a project with a different structure.
 */
import 'react-native-reanimated'; // must be the first import in the app
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import BrandLaunchAnimation from './BrandLaunchAnimation';
// import AppNavigator from '../navigation/AppNavigator';
// import { bootstrapSession } from '../lib/auth/bootstrap';

// Keep the native splash (app.json config) on screen until fonts are ready —
// this is what prevents a white/blank flash before BrandLaunchAnimation can
// render its first real frame.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded] = useFonts({
    // Display font — Oswald bold italic, PRD §4.2
    'Oswald-BoldItalic': require('./assets/fonts/Oswald-BoldItalic.ttf'),
    // Body font — Manrope, PRD §4.2
    Manrope_500Medium: require('./assets/fonts/Manrope-Medium.ttf'),
  });

  const [showLaunchAnimation, setShowLaunchAnimation] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    // Real bootstrap work runs in PARALLEL with the animation, not after
    // it — this is what satisfies "does not delay the app unnecessarily."
    // By the time the ~2s (or ~650ms repeat, or ~450ms reduced-motion)
    // animation finishes, the destination screen is already resolved.
    (async () => {
      // await bootstrapSession(); // restore Supabase session, journey state, etc.
      setAppReady(true);
    })();
  }, []);

  if (!fontsLoaded) {
    // Native splash (app.json) is still visible — no custom UI renders yet,
    // so there is nothing to flash or jump.
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {/* Real navigation root mounts immediately underneath the overlay,
          so when the animation fades out there is no blank gap or
          layout shift — the destination screen is already there. */}
      {/* <AppNavigator isReady={appReady} /> */}

      {showLaunchAnimation && (
        <BrandLaunchAnimation
          reduceMotion={reduceMotion}
          onFinish={() => setShowLaunchAnimation(false)}
        />
      )}
    </View>
  );
}
