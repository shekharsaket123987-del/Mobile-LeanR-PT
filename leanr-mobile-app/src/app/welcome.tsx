/**
 * Welcome / Splash — mockup "App Splash Screen" frame. New PRD.md's own
 * mobile-app-reference mockup shows this as a full-bleed hero + "Get
 * Started" CTA, no bottom nav. Top-level route (not inside `(marketing)`'s
 * Tabs group) so it renders without any tab bar chrome, matching the
 * mockup exactly — pushes into `(marketing)`'s Home/Landing on tap.
 *
 * Every role's own `_layout.tsx` redirects here (not `/login`) when no
 * session exists — this is now the actual entry point for a logged-out
 * visitor, replacing the old "straight to the login form" behavior.
 *
 * Hero uses the real transparent LEANR wordmark asset floating over a dark
 * ambient-glow panel — never boxed/cropped, resizeMode `contain` with its
 * intrinsic aspect ratio (LEANR_PT_MOBILE_PRD.md §23 logo rules).
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui/button';
import { Brand, DisplayFont } from '@/constants/theme';

const LOGO_ASSET = require('../../assets/images/leanr-logo-transparent.png');

const FEATURES = ['Personalized plans', 'Certified coaches', 'Real transformations', 'Flexible online coaching'];

export default function WelcomeScreen() {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={['rgba(245,217,10,0.16)', 'rgba(6,6,6,0)']}
            style={styles.hero}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}>
            <Image source={LOGO_ASSET} style={styles.logo} contentFit="contain" />
          </LinearGradient>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Transform Your Life{'\n'}With Expert Guidance</Text>

          <View style={styles.featureList}>
            {FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={18} color={Brand.yellow} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>

          <PrimaryButton size="lg" onPress={() => router.replace('/(marketing)')} style={styles.cta}>
            Get Started
          </PrimaryButton>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Brand.bg },
  flex: { flex: 1 },
  heroWrap: { flex: 1, padding: 20 },
  hero: { flex: 1, borderRadius: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: { width: '100%', height: 120 },
  content: { padding: 24, gap: 16 },
  title: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 30, color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 36, textAlign: 'center' },
  featureList: { gap: 10, marginTop: 4, alignItems: 'center' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontFamily: 'Manrope_500Medium', fontSize: 14.5, color: 'rgba(255,255,255,0.65)' },
  cta: { marginTop: 8 },
});
