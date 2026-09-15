/**
 * Book a Free Demo (authenticated) — ported line-for-line from
 * mobile-app-reference/audit/demo-booking-workflow.md §2.2-§2.5: a 3-field
 * form (date, optional preferred time, optional coach-gender preference),
 * ONE submit button, no coach/slot picker and no confirmation step — the
 * server auto-matches the best available coach (src/lib/data/demo-booking.ts
 * ::bookDemoSession) and books it immediately. This replaces the earlier
 * version of this screen, which exposed a manual slot-chip picker with its
 * own hold->review->confirm steps — that shape doesn't exist in the web
 * spec for demos (only for the ad-hoc "Book a Session" wizard).
 *
 * §2.1 measurement-staleness gate: enforced here client-side (disables the
 * submit button + shows the same copy the web app uses) AND server-side via
 * `bookDemoSession`'s `assertMeasurementsFresh()` call — "both layers", per
 * spec.
 *
 * The staleness check is re-fetched on every screen FOCUS (not just once on
 * mount) via `useFocusEffect` — same convention as sessions.tsx. Without
 * this, a client who taps "Log them now", logs measurements on /progress,
 * and navigates back here would still see the stale banner and a disabled
 * button: `router.back()` pops to this screen's existing instance rather
 * than remounting it, so a mount-only fetch would never see the fresh log.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { LightAvatar } from '@/components/light/light-avatar';
import { LightPrimaryButton, LightSecondaryButton } from '@/components/light/light-button';
import { LightCalendarGrid } from '@/components/light/light-calendar-grid';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightStatCard } from '@/components/light/light-stat-card';
import { LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import { addToDeviceCalendar } from '@/lib/media/add-to-calendar';
import { addIstDays, formatIstDateLabel, formatIstTimeLabel, getBookingSettings, todayIst, type IstDate } from '@/lib/data/booking-wizard';
import { bookDemoSession, getLatestDemoBooking, hasExistingAssessment, type DemoBookingResult, type GenderPreference } from '@/lib/data/demo-booking';
import { getMeasurementStatus } from '@/lib/data/measurement-status';
import { useAsync } from '@/lib/data/use-async';
import { getErrorMessage } from '@/lib/data/errors';

type Phase = 'form' | 'booking' | 'success';

/**
 * web spec §2.2/§9.1: whole hours only, matching the platform's actual booking
 * grid -- derived from the LIVE `booking_window_start_hour/end_hour` setting
 * (via getBookingSettings, read fresh on every screen load), not a hardcoded
 * 5 AM-9 PM range. A hardcoded range could silently offer times the server-side
 * grid no longer contains once an admin changes the window.
 */
function preferredTimeHours(window: { startHour: number; endHour: number }): number[] {
  const hours: number[] = [];
  for (let h = window.startHour; h < window.endHour; h++) hours.push(h);
  return hours;
}

function formatHourChipLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
}

const GENDER_OPTIONS: { key: GenderPreference | 'none'; label: string }[] = [
  { key: 'none', label: 'No preference' },
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
];

export default function DemoBookingScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [settings, alreadyDone, latestDemo, measurement] = await Promise.all([
      getBookingSettings(),
      hasExistingAssessment(),
      getLatestDemoBooking(),
      getMeasurementStatus(),
    ]);
    return { settings, alreadyDone, latestDemo, measurement };
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const settings = data?.settings ?? null;
  const measurementStale = data?.measurement.stale ?? false;
  // web spec §2.6/§6.5 (`demo_booked` stage): block re-booking while a demo is already
  // `upcoming` — cancelled demos are excluded upstream by getLatestDemoBooking.
  const upcomingDemo = data?.latestDemo?.status === 'upcoming' ? data.latestDemo : null;

  const [selectedDate, setSelectedDate] = useState<IstDate>(() => addIstDays(todayIst(), 1));
  const [preferredTime, setPreferredTime] = useState<string | null>(null);
  const [genderPreference, setGenderPreference] = useState<GenderPreference | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [result, setResult] = useState<DemoBookingResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addingToCalendar, setAddingToCalendar] = useState(false);

  const onBookDemo = async () => {
    if (!settings) return;
    setActionError(null);
    setPhase('booking');
    try {
      const booked = await bookDemoSession(
        selectedDate,
        settings.assessmentSessionDurationMinutes,
        { startHour: settings.bookingWindowStartHour, endHour: settings.bookingWindowEndHour },
        preferredTime ?? undefined,
        genderPreference ?? undefined
      );
      setResult(booked);
      setPhase('success');
    } catch (err) {
      setActionError(getErrorMessage(err));
      setPhase('form');
    }
  };

  const onAddToCalendar = async () => {
    if (!result || !settings) return;
    setAddingToCalendar(true);
    try {
      await addToDeviceCalendar({
        title: 'LEANR Demo Session',
        startDate: new Date(result.slotStart),
        durationMinutes: settings.assessmentSessionDurationMinutes,
      });
      Alert.alert('Added', 'This session was added to your calendar.');
    } catch (err) {
      Alert.alert('Could not add to calendar', getErrorMessage(err));
    } finally {
      setAddingToCalendar(false);
    }
  };

  if (loading) {
    return (
      <LightScreenScaffold title="Book a Free Demo">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }

  if (error) {
    return (
      <LightScreenScaffold title="Book a Free Demo">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  if (upcomingDemo && phase === 'form') {
    return (
      <LightScreenScaffold title="Demo Already Booked">
        <LightCard>
          <Text style={styles.metaText}>
            You already have a demo session scheduled for {new Date(upcomingDemo.scheduledStart).toLocaleString()}.
          </Text>
        </LightCard>
        <LightPrimaryButton size="lg" onPress={() => router.replace('/sessions')}>
          View my schedule
        </LightPrimaryButton>
      </LightScreenScaffold>
    );
  }

  if (phase === 'success' && result) {
    return (
      <LightScreenScaffold title="Your Demo is Booked!">
        <LightStatCard emphasize value={formatIstDateLabel(selectedDate)} label="ASSESSMENT CONFIRMED" />
        <LightCard style={styles.confirmCard}>
          <Text style={styles.metaText}>{formatIstTimeLabel(result.slotStart)}</Text>
          <View style={styles.modeRow}>
            <Text style={styles.modeText}>Online (Zoom)</Text>
          </View>
          <View style={styles.coachRow}>
            <LightAvatar photoUrl={result.coachPhoto} name={result.coachName} size={48} />
            <Text style={styles.coachName}>{result.coachName}</Text>
          </View>
          <Text style={styles.autoMatchNote}>Your coach was automatically assigned based on availability.</Text>
        </LightCard>
        <LightSecondaryButton size="lg" onPress={onAddToCalendar} loading={addingToCalendar}>
          Add to Calendar
        </LightSecondaryButton>
        <LightPrimaryButton size="lg" onPress={() => router.replace('/sessions')}>
          View My Schedule
        </LightPrimaryButton>
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="Book a Free Demo" subtitle="A free assessment session — we'll match you with an available coach">
      {data?.alreadyDone && (
        <LightCard>
          <Text style={styles.metaText}>You already have an assessment session on record — booking another is fine too.</Text>
        </LightCard>
      )}

      {measurementStale && (
        <LightCard style={styles.staleBanner}>
          <Text style={styles.staleTitle}>Update your measurements to book a demo</Text>
          <Text style={styles.staleBody}>
            We need your current measurements before matching you with a coach.{' '}
            <Text style={styles.staleLink} onPress={() => router.push('/progress')}>
              Log them now
            </Text>
            .
          </Text>
        </LightCard>
      )}

      <LightCard>
        <LightSectionHeader title="Preferred Date" />
        <Text style={styles.selectedDateText}>{formatIstDateLabel(selectedDate)}</Text>
        <LightCalendarGrid selected={selectedDate} onSelect={setSelectedDate} minDate={addIstDays(todayIst(), 1)} initialMonth={selectedDate} />
      </LightCard>

      <LightCard>
        <LightSectionHeader title="Preferred Time (optional)" />
        <LightChipGrid>
          <LightChip label="No preference" selected={preferredTime === null} onPress={() => setPreferredTime(null)} />
          {settings &&
            preferredTimeHours({ startHour: settings.bookingWindowStartHour, endHour: settings.bookingWindowEndHour }).map((h) => {
              const key = `${String(h).padStart(2, '0')}:00`;
              return <LightChip key={key} label={formatHourChipLabel(h)} selected={preferredTime === key} onPress={() => setPreferredTime(key)} />;
            })}
        </LightChipGrid>
      </LightCard>

      <LightCard>
        <LightSectionHeader title="Coach Gender (optional)" />
        <LightChipGrid>
          {GENDER_OPTIONS.map((opt) => (
            <LightChip
              key={opt.key}
              label={opt.label}
              selected={opt.key === 'none' ? genderPreference === null : genderPreference === opt.key}
              onPress={() => setGenderPreference(opt.key === 'none' ? null : opt.key)}
            />
          ))}
        </LightChipGrid>
      </LightCard>

      <Text style={styles.helperText}>
        We&apos;ll automatically match you with the best available coach for your chosen time — no need to pick one yourself.
      </Text>

      {actionError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      )}

      <LightPrimaryButton size="lg" onPress={onBookDemo} loading={phase === 'booking'} disabled={measurementStale}>
        Book Free Demo Session
      </LightPrimaryButton>
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  selectedDateText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: LightBrand.teal, marginBottom: 4 },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: LightBrand.textSecondary },
  helperText: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted, paddingHorizontal: 4 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
  confirmCard: { gap: 8 },
  modeRow: { flexDirection: 'row', alignItems: 'center' },
  modeText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textMuted },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  coachName: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.textPrimary },
  autoMatchNote: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted, marginTop: 4 },
  staleBanner: { borderWidth: 1, borderColor: LightBrand.alertRed + '4D', backgroundColor: LightBrand.alertRed + '0D', gap: 4 },
  staleTitle: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: LightBrand.alertRed },
  staleBody: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.alertRed },
  staleLink: { fontFamily: 'Manrope_700Bold', textDecorationLine: 'underline' },
});
