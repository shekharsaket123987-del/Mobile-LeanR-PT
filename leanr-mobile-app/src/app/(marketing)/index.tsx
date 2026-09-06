/**
 * Marketing Home/Landing — merges the mockup's "Public Landing Page" and
 * "Home (Not Logged In)" frames (near-identical content in both — hero +
 * "Why Choose LEANR" cards + primary CTAs), a deliberate simplification
 * noted in the redesign plan rather than building two near-duplicate
 * screens.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightCard } from '@/components/light/light-card';
import { LightPrimaryButton, LightSecondaryButton } from '@/components/light/light-button';
import { LightBrand } from '@/constants/light-theme';
import { DisplayFont } from '@/constants/theme';

const WHY_CHOOSE: { icon: keyof typeof Ionicons.glyphMap; title: string }[] = [
  { icon: 'people-outline', title: 'Expert Coaches' },
  { icon: 'clipboard-outline', title: 'Personalized Plans' },
  { icon: 'trending-up-outline', title: 'Real Results' },
];

export default function MarketingHomeScreen() {
  return (
    <LightScreenScaffold title="Get Expert Guidance" subtitle="Tailored to your goals — book a free demo with our certified coaches.">
      <LinearGradient colors={[LightBrand.teal, LightBrand.tealDark]} style={styles.heroCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Ionicons name="fitness-outline" size={40} color="#FFFFFF" />
      </LinearGradient>

      <LightPrimaryButton size="lg" onPress={() => router.push('/book-free-demo')}>
        Book a Free Demo
      </LightPrimaryButton>

      <Text style={styles.sectionTitle}>Why Choose LEANR?</Text>
      <View style={styles.grid}>
        {WHY_CHOOSE.map((item) => (
          <LightCard key={item.title} style={styles.gridCard}>
            <Ionicons name={item.icon} size={24} color={LightBrand.teal} />
            <Text style={styles.gridLabel}>{item.title}</Text>
          </LightCard>
        ))}
      </View>

      <LightSecondaryButton size="lg" onPress={() => router.push('/(marketing)/plans')}>
        Explore Plans
      </LightSecondaryButton>

      <View style={styles.authRow}>
        <LightPrimaryButton size="md" onPress={() => router.push('/signup')} style={styles.authButton}>
          Sign Up
        </LightPrimaryButton>
        <LightSecondaryButton size="md" onPress={() => router.push('/login')} style={styles.authButton}>
          Login
        </LightSecondaryButton>
      </View>
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  heroCard: { height: 140, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontFamily: DisplayFont, fontWeight: '700', fontStyle: 'italic', fontSize: 20, color: LightBrand.navy, marginTop: 4 },
  grid: { flexDirection: 'row', gap: 10 },
  gridCard: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 18 },
  gridLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: LightBrand.textPrimary, textAlign: 'center' },
  authRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  authButton: { flex: 1 },
});
