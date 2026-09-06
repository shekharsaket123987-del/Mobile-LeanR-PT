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
 * No hero photography exists in this repo yet (see the redesign plan's
 * stated limitation) — the hero uses a teal gradient panel + the LEANR
 * leaf mark instead of a lifestyle photo, pending real assets.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LightPrimaryButton } from '@/components/light/light-button';
import { LightBrand } from '@/constants/light-theme';
import { DisplayFont } from '@/constants/theme';

const FEATURES = ['Personalized plans', 'Certified coaches', 'Real transformations', 'Flexible online coaching'];

export default function WelcomeScreen() {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.heroWrap}>
          <LinearGradient colors={[LightBrand.teal, LightBrand.tealDark]} style={styles.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Ionicons name="leaf" size={64} color="#FFFFFF" />
          </LinearGradient>
        </View>

        <View style={styles.content}>
          <Text style={styles.wordmark}>LEANR</Text>
          <Text style={styles.title}>Transform Your Life{'\n'}With Expert Guidance</Text>

          <View style={styles.featureList}>
            {FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={18} color={LightBrand.teal} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>

          <LightPrimaryButton size="lg" onPress={() => router.replace('/(marketing)')} style={styles.cta}>
            Get Started
          </LightPrimaryButton>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LightBrand.bg },
  flex: { flex: 1 },
  heroWrap: { flex: 1, padding: 20 },
  hero: { flex: 1, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, gap: 16 },
  wordmark: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 22, color: LightBrand.teal, letterSpacing: -0.3 },
  title: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 30, color: LightBrand.navy, letterSpacing: -0.5, lineHeight: 36 },
  featureList: { gap: 10, marginTop: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontFamily: 'Manrope_500Medium', fontSize: 14.5, color: LightBrand.textSecondary },
  cta: { marginTop: 8 },
});
