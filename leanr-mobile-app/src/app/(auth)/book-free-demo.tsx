/**
 * Book a Free Demo — no account required. The anonymous counterpart to
 * `(client)/demo-booking.tsx` (see that file + `anonymous-demo-booking.ts`
 * for why this needs its own privileged Edge Function rather than a
 * direct Supabase call). Reached from the login screen, same spot the
 * web app's marketing pages would send a prospect straight into this
 * flow instead of a signup form.
 *
 * No hold->confirm two-step here (unlike the authenticated flow) —
 * `assessment_sessions` has no temporary-hold mechanism; the Edge
 * Function re-validates the slot is still free at confirm time instead
 * (see its own header comment for why best-effort is the right bar for
 * a pure lead-capture record).
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { TextLink } from '@/components/tappable';
import { PrimaryButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { TextField } from '@/components/ui/text-field';
import { Brand } from '@/constants/theme';
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
      <ScreenScaffold title="Demo booked!">
        <StatCard emphasize value={formatIstDateLabel(selectedDate)} label="ASSESSMENT CONFIRMED" />
        <GlassCard>
          {selectedSlot && <Text style={shared.cardLabel}>{formatIstTimeLabel(selectedSlot)}</Text>}
          {result && <Text style={styles.withCoach}>with {result.coachName}</Text>}
          <Text style={styles.successNote}>We&apos;ve noted your details — your coach will be in touch to confirm.</Text>
        </GlassCard>
        <PrimaryButton size="lg" onPress={() => router.replace('/login')}>
          Back to login
        </PrimaryButton>
      </ScreenScaffold>
    );
  }

  if (phase === 'details' || phase === 'confirming') {
    return (
      <ScreenScaffold title="Almost done" subtitle="Tell us how to reach you and we'll lock in your slot.">
        <GlassCard variant="yellow">
          <Text style={shared.cardLabel}>{formatIstDateLabel(selectedDate)}</Text>
          <Text style={shared.bigStat}>{selectedSlot ? formatIstTimeLabel(selectedSlot) : ''}</Text>
          {match?.coachName && <Text style={styles.withCoach}>with {match.coachName}</Text>}
        </GlassCard>

        <TextField icon="person-outline" placeholder="Your name" value={name} onChangeText={setName} />
        <TextField
          icon="mail-outline"
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextField
          icon="call-outline"
          placeholder="Phone (optional if email given)"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        {actionError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {actionError}
          </Text>
        )}

        <PrimaryButton size="lg" onPress={onSubmit} loading={phase === 'confirming'}>
          Confirm free demo
        </PrimaryButton>
        <TextLink onPress={() => setPhase('pick')}>Pick a different slot</TextLink>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Book a Free Demo" subtitle="No account needed — we'll match you with an available coach.">
      <GlassCard>
        <SectionHeader eyebrow="Step 1" title="Pick a date" />
        <View style={styles.chipRow}>
          {Array.from({ length: DATE_CHOICES }, (_, i) => addIstDays(todayIst(), i + 1)).map((d) => {
            const key = `${d.year}-${d.month}-${d.day}`;
            const isSelected = d.year === selectedDate.year && d.month === selectedDate.month && d.day === selectedDate.day;
            return <Chip key={key} label={formatIstDateLabel(d)} selected={isSelected} onPress={() => setSelectedDate(d)} />;
          })}
        </View>
      </GlassCard>

      <GlassCard>
        <SectionHeader eyebrow="Step 2" title="Available times" />
        {matchLoading && <LoadingState rows={1} />}
        {!matchLoading && !match?.coachId && <EmptyState message="No coaches have an opening this day — try another date." />}
        {!matchLoading && match?.coachId && (
          <>
            <Text style={styles.withCoach}>Matched with {match.coachName}</Text>
            <View style={styles.chipRow}>
              {match.slots.map((s) => (
                <Chip key={s} label={formatIstTimeLabel(s)} selected={s === selectedSlot} onPress={() => onPickSlot(s)} />
              ))}
            </View>
          </>
        )}
      </GlassCard>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}

      <TextLink onPress={() => router.replace('/login')} style={styles.link}>
        Already have an account? Log in instead
      </TextLink>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  withCoach: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed },
  link: { alignSelf: 'center', marginTop: 4 },
  successNote: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
});
