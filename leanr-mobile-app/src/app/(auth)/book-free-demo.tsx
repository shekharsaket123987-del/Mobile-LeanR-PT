/**
 * Book a Free Demo — no account required. Light-themed (New PRD.md
 * pre-purchase redesign) — same functional shape as before this pass, see
 * `anonymous-demo-booking.ts` for why this needs its own privileged Edge
 * Function rather than a direct Supabase call.
 *
 * No hold->confirm two-step here (unlike the authenticated flow) —
 * `assessment_sessions` has no temporary-hold mechanism; the Edge
 * Function re-validates the slot is still free at confirm time instead
 * (see its own header comment for why best-effort is the right bar for
 * a pure lead-capture record).
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { LightPrimaryButton } from '@/components/light/light-button';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightStatCard } from '@/components/light/light-stat-card';
import { LightTextLink } from '@/components/light/light-tappable';
import { LightTextField } from '@/components/light/light-text-field';
import { LightEmptyState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { addIstDays, formatIstDateLabel, formatIstTimeLabel, todayIst, type IstDate } from '@/lib/data/booking-wizard';
import { confirmAnonymousDemoBooking, findAnonymousDemoSlots, type AnonymousDemoMatch } from '@/lib/data/anonymous-demo-booking';

const DATE_CHOICES = 14; // tomorrow onward — §13 rule 1: no same-day booking, any type

type Phase = 'pick' | 'details' | 'confirming' | 'success';

export default function BookFreeDemoScreen() {
  const [selectedDate, setSelectedDate] = useState<IstDate>(() => addIstDays(todayIst(), 1));
  const [match, setMatch] = useState<AnonymousDemoMatch | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<{ coachName: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setMatch(null);
      setSelectedSlot(null);
      setMatchLoading(true);
    });
    findAnonymousDemoSlots(selectedDate)
      .then((res) => {
        if (!cancelled) setMatch(res);
      })
      .catch((err) => {
        if (!cancelled) setActionError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setMatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const onPickSlot = (slotIso: string) => {
    setSelectedSlot(slotIso);
    setActionError(null);
    setPhase('details');
  };

  const onSubmit = async () => {
    if (!match?.coachId || !selectedSlot) return;
    setActionError(null);
    if (!name.trim()) {
      setActionError('Your name is required.');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setActionError('An email or phone number is required so we can reach you.');
      return;
    }
    setPhase('confirming');
    try {
      const res = await confirmAnonymousDemoBooking({
        prospectName: name.trim(),
        prospectEmail: email.trim() || undefined,
        prospectPhone: phone.trim() || undefined,
        coachId: match.coachId,
        slotStart: selectedSlot,
      });
      setResult({ coachName: res.coachName });
      setPhase('success');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setPhase('details');
    }
  };

  if (phase === 'success') {
    return (
      <LightScreenScaffold title="Demo booked!">
        <LightStatCard emphasize value={formatIstDateLabel(selectedDate)} label="ASSESSMENT CONFIRMED" />
        <LightCard>
          {selectedSlot && <Text style={styles.cardLabel}>{formatIstTimeLabel(selectedSlot)}</Text>}
          {result && <Text style={styles.withCoach}>with {result.coachName}</Text>}
          <Text style={styles.successNote}>We&apos;ve noted your details — your coach will be in touch to confirm.</Text>
        </LightCard>
        <LightPrimaryButton size="lg" onPress={() => router.replace('/login')}>
          Back to login
        </LightPrimaryButton>
      </LightScreenScaffold>
    );
  }

  if (phase === 'details' || phase === 'confirming') {
    return (
      <LightScreenScaffold title="Almost done" subtitle="Tell us how to reach you and we'll lock in your slot.">
        <LightCard variant="teal">
          <Text style={styles.cardLabel}>{formatIstDateLabel(selectedDate)}</Text>
          <Text style={styles.bigStat}>{selectedSlot ? formatIstTimeLabel(selectedSlot) : ''}</Text>
          {match?.coachName && <Text style={styles.withCoach}>with {match.coachName}</Text>}
        </LightCard>

        <LightTextField icon="person-outline" placeholder="Your name" value={name} onChangeText={setName} />
        <LightTextField icon="mail-outline" placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <LightTextField icon="call-outline" placeholder="Phone (optional if email given)" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        {actionError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {actionError}
          </Text>
        )}

        <LightPrimaryButton size="lg" onPress={onSubmit} loading={phase === 'confirming'}>
          Confirm free demo
        </LightPrimaryButton>
        <LightTextLink onPress={() => setPhase('pick')}>Pick a different slot</LightTextLink>
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Book a Free Demo" subtitle="No account needed — we'll match you with an available coach.">
      <LightCard>
        <LightSectionHeader eyebrow="Step 1" title="Pick a date" />
        <LightChipGrid>
          {Array.from({ length: DATE_CHOICES }, (_, i) => addIstDays(todayIst(), i + 1)).map((d) => {
            const key = `${d.year}-${d.month}-${d.day}`;
            const isSelected = d.year === selectedDate.year && d.month === selectedDate.month && d.day === selectedDate.day;
            return <LightChip key={key} label={formatIstDateLabel(d)} selected={isSelected} onPress={() => setSelectedDate(d)} />;
          })}
        </LightChipGrid>
      </LightCard>

      <LightCard>
        <LightSectionHeader eyebrow="Step 2" title="Available times" />
        {matchLoading && <LightLoadingState rows={1} />}
        {!matchLoading && !match?.coachId && <LightEmptyState message="No coaches have an opening this day — try another date." />}
        {!matchLoading && match?.coachId && (
          <>
            <Text style={styles.withCoach}>Matched with {match.coachName}</Text>
            <LightChipGrid>
              {match.slots.map((s) => (
                <LightChip key={s} label={formatIstTimeLabel(s)} selected={s === selectedSlot} onPress={() => onPickSlot(s)} />
              ))}
            </LightChipGrid>
          </>
        )}
      </LightCard>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}

      <LightTextLink onPress={() => router.replace('/login')} style={styles.link}>
        Already have an account? Log in instead
      </LightTextLink>
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  cardLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: LightBrand.textSecondary, textTransform: 'uppercase' },
  bigStat: { fontFamily: 'Manrope_800ExtraBold', fontSize: 30, color: LightBrand.navy },
  withCoach: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: LightBrand.textSecondary },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
  link: { alignSelf: 'center', marginTop: 4 },
  successNote: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textSecondary, marginTop: 4 },
});
