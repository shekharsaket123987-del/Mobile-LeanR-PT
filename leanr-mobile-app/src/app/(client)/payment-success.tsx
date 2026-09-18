/**
 * Payment Success — New PRD.md §8.5 (verified purchase → "Congratulations"
 * moment → journey stage "awaiting_activation"). Mockup frame 3: a real
 * screen with Plan Name/Amount/Payment ID/Date, "View Plan Details"/"Go to
 * Next Step" — replacing the previous bare `CelebrationOverlay`-then-
 * auto-redirect (kept for other, non-purchase celebration moments
 * elsewhere in the app; this is the one place with actual Payment Details
 * to show, matching the mockup). "Make Payment" (mockup frame 2) itself is
 * Razorpay Checkout's own native modal, not a screen this app builds.
 *
 * Reached via `router.replace` from `plans.tsx` right after
 * `purchasePackage()` resolves — not a tab, hidden via `href: null`.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';

function formatPrice(amount: string) {
  const n = Number(amount);
  return Number.isNaN(n) ? amount : `₹${n.toLocaleString()}`;
}

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function PaymentSuccessScreen() {
  const { planName, amount, paymentId, paidAt } = useLocalSearchParams<{
    planName?: string;
    amount?: string;
    paymentId?: string;
    paidAt?: string;
  }>();

  return (
    <ScreenScaffold title=" ">
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-circle" size={72} color={Brand.yellow} />
      </View>
      <Text style={styles.headline}>Payment Successful!</Text>
      <Text style={styles.subhead}>Your plan has been purchased successfully.</Text>

      <GlassCard>
        <Text style={styles.cardTitle}>Plan Details</Text>
        <Row label="Plan Name" value={planName || '—'} />
        <Row label="Amount" value={formatPrice(amount ?? '0')} />
        <Row label="Payment ID" value={paymentId || '—'} />
        <Row label="Date" value={formatDate(paidAt ?? '')} />
      </GlassCard>

      <PrimaryButton size="lg" onPress={() => router.replace('/activate')}>
        Go to Next Step
      </PrimaryButton>
      <SecondaryButton size="lg" onPress={() => router.push('/subscription')}>
        View Plan Details
      </SecondaryButton>
    </ScreenScaffold>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center', marginTop: 12, marginBottom: -4 },
  headline: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subhead: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: -8 },
  cardTitle: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.45)' },
  rowValue: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#FFFFFF', maxWidth: '60%' },
});
