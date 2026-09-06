/**
 * My Coach — profile card + Request Coach Change (LEANR_PT_MOBILE_PRD.md
 * §7e), split out of what was the enrolled branch of `coach.tsx` so that
 * screen can become pure "Chats" (mockup frame 12, which shows no coach
 * profile/coach-change UI at all for the enrolled state). Reached from
 * More ("My Coach" row) — matches New PRD.md §21's own Profile-menu
 * placement for My Coach, which the mockup doesn't contradict.
 *
 * Same data/business logic as the coach-change section this was split
 * from (see src/lib/data/coach-change.ts header for the RLS/edge-function
 * detail); only the palette changed.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightAvatar } from '@/components/light/light-avatar';
import { LightBadge } from '@/components/light/light-badge';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightTextField } from '@/components/light/light-text-field';
import { LightBrand } from '@/constants/light-theme';
import { getBookingSettings } from '@/lib/data/booking-wizard';
import { getMyCoach } from '@/lib/data/coach';
import {
  completeCoachChange,
  getMyCoachChangeRequests,
  requestCoachChange,
  type CoachChangeRequest,
  type CoachChangeStatus,
} from '@/lib/data/coach-change';
import { findCoachForSchedule, WEEKDAYS, type CoachMatchCandidate } from '@/lib/data/recurring-schedule';
import { useAsync } from '@/lib/data/use-async';

function formatHourLabel(hour: number) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour >= 12 ? 'PM' : 'AM'} IST`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const CHANGE_STATUS_LABEL: Record<CoachChangeStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Not approved',
};
const CHANGE_STATUS_TONE: Record<CoachChangeStatus, 'teal' | 'green' | 'red'> = {
  pending: 'teal',
  approved: 'green',
  rejected: 'red',
};

export default function MyCoachScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [coach, changeRequests] = await Promise.all([getMyCoach(), getMyCoachChangeRequests()]);
    return { coach, changeRequests };
  }, []);

  const coach = data?.coach ?? null;
  const changeRequests = data?.changeRequests ?? [];
  const tags = [coach?.specialization, ...(coach?.secondary_specializations ?? [])].filter((t): t is string => !!t);

  return (
    <LightScreenScaffold title="My Coach">
      {loading && <LightLoadingState />}
      {error && <LightErrorState message={error} onRetry={reload} />}
      {!loading && !error && !coach && <LightEmptyState message="No coach assigned yet." icon="person-outline" />}

      {!loading && !error && coach && (
        <LightCard style={styles.coachCard}>
          <View style={styles.coachRow}>
            <LightAvatar photoUrl={coach.photo_url} name={coach.full_name} size={64} ring />
            <View style={styles.coachInfo}>
              <Text style={styles.coachName} numberOfLines={1}>
                {coach.full_name}
              </Text>
              {coach.rating != null && <Text style={styles.coachRating}>★ {coach.rating.toFixed(1)}</Text>}
            </View>
          </View>
          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map((t) => (
                <LightBadge key={t} label={t} tone="teal" />
              ))}
            </View>
          )}
          {coach.bio && <Text style={styles.coachBio}>{coach.bio}</Text>}
        </LightCard>
      )}

      {!loading && !error && coach && <CoachChangeSection requests={changeRequests} onSubmitted={reload} />}
    </LightScreenScaffold>
  );
}

function CoachChangeSection({ requests, onSubmitted }: { requests: CoachChangeRequest[]; onSubmitted: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [coachRating, setCoachRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const hasOpenRequest = requests.some((r) => r.status === 'pending');

  const onSubmit = async () => {
    if (!reason.trim()) {
      setFormError('Tell us why you want to switch coaches.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await requestCoachChange({ reason: reason.trim(), overallExperience: null, coachRating, additionalComments: null });
      setReason('');
      setCoachRating(null);
      setShowForm(false);
      onSubmitted();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LightCard>
      <View style={styles.changeHeader}>
        <Text style={styles.sectionLabel}>COACH CHANGE</Text>
        {!hasOpenRequest && (
          <Pressable onPress={() => setShowForm((v) => !v)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.changeToggle}>{showForm ? 'Cancel' : 'Request change'}</Text>
          </Pressable>
        )}
      </View>

      {requests.map((r) => (
        <View key={r.id} style={styles.changeRow}>
          <Text style={styles.metaLabel}>{formatDate(r.created_at)}</Text>
          <LightBadge label={CHANGE_STATUS_LABEL[r.status]} tone={CHANGE_STATUS_TONE[r.status]} />
        </View>
      ))}
      {requests.some((r) => r.status === 'approved' && r.new_coach_id) && (
        <Text style={styles.changeNote}>Your coach change is complete.</Text>
      )}

      {requests
        .filter((r) => r.status === 'approved' && !r.new_coach_id)
        .map((r) => (
          <CoachChangeCompletionCard key={r.id} requestId={r.id} onCompleted={onSubmitted} />
        ))}

      {showForm && (
        <View style={styles.changeForm}>
          <LightTextField
            placeholder="Why do you want to switch coaches?"
            value={reason}
            onChangeText={setReason}
            multiline
            style={styles.reasonInput}
          />
          <Text style={styles.metaLabel}>RATE YOUR CURRENT COACH (OPTIONAL)</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setCoachRating(coachRating === n ? null : n)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${n} out of 5`}
                accessibilityState={{ selected: coachRating === n }}
                style={[styles.ratingChip, coachRating === n && styles.ratingChipSelected]}>
                <Text style={[styles.ratingChipText, coachRating === n && styles.ratingChipTextSelected]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          {formError && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {formError}
            </Text>
          )}
          <LightPrimaryButton onPress={onSubmit} loading={submitting}>
            Submit request
          </LightPrimaryButton>
        </View>
      )}
    </LightCard>
  );
}

function CoachChangeCompletionCard({ requestId, onCompleted }: { requestId: string; onCompleted: () => void }) {
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [match, setMatch] = useState<{ coach: CoachMatchCandidate; hours: number[] } | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const toggleDay = (dow: number) => {
    setMatch(null);
    setSelectedHour(null);
    setSelectedDays((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort((a, b) => a - b)));
  };

  const onFindCoach = async () => {
    if (selectedDays.length < 2) {
      setError('Pick at least 2 days.');
      return;
    }
    setError(null);
    setSearching(true);
    try {
      const settings = await getBookingSettings();
      const result = await findCoachForSchedule(
        selectedDays,
        settings.defaultSessionDurationMinutes,
        { startHour: settings.bookingWindowStartHour, endHour: settings.bookingWindowEndHour },
        'new',
        'no_preference'
      );
      if (!result) {
        setError('No available coach found for those days — try different days.');
        return;
      }
      setMatch(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const onConfirm = async () => {
    if (!match || selectedHour === null) return;
    setConfirming(true);
    setError(null);
    try {
      const settings = await getBookingSettings();
      await completeCoachChange({
        requestId,
        newCoachId: match.coach.id,
        days: selectedDays,
        hour: selectedHour,
        durationMinutes: settings.defaultSessionDurationMinutes,
      });
      setDone(true);
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  };

  if (done) return null;

  return (
    <LightCard style={styles.completionCard}>
      <LightSectionHeader eyebrow="Approved" title="Pick your new schedule" />
      <Text style={styles.metaLabel}>DAYS</Text>
      <LightChipGrid>
        {WEEKDAYS.map((d) => (
          <LightChip key={d.dow} label={d.short} selected={selectedDays.includes(d.dow)} onPress={() => toggleDay(d.dow)} />
        ))}
      </LightChipGrid>

      {!match && (
        <LightPrimaryButton onPress={onFindCoach} loading={searching} style={styles.findCoachButton}>
          Find available coach
        </LightPrimaryButton>
      )}

      {match && (
        <>
          <Text style={styles.changeNote}>Matched with {match.coach.full_name}</Text>
          <Text style={styles.metaLabel}>TIME</Text>
          <LightChipGrid>
            {match.hours.map((h) => (
              <LightChip key={h} label={formatHourLabel(h)} selected={h === selectedHour} onPress={() => setSelectedHour(h)} />
            ))}
          </LightChipGrid>
          {selectedHour !== null && (
            <LightPrimaryButton onPress={onConfirm} loading={confirming} style={styles.findCoachButton}>
              Confirm {match.coach.full_name}
            </LightPrimaryButton>
          )}
        </>
      )}

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </LightCard>
  );
}

const styles = StyleSheet.create({
  coachCard: { gap: 10 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  coachInfo: { flexShrink: 1, gap: 2 },
  coachName: { fontFamily: 'Manrope_800ExtraBold', fontSize: 19, color: LightBrand.navy },
  coachRating: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: LightBrand.amber },
  coachBio: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textSecondary, lineHeight: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sectionLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.8, color: LightBrand.textSecondary },
  metaLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: LightBrand.textMuted },
  changeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeToggle: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: LightBrand.teal },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  changeNote: { fontFamily: 'Manrope_500Medium', fontSize: 13, marginTop: 6, color: LightBrand.textSecondary },
  changeForm: { marginTop: 8, gap: 10 },
  reasonInput: { minHeight: 80, textAlignVertical: 'top', paddingTop: 14 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LightBrand.bg,
  },
  ratingChipSelected: { backgroundColor: LightBrand.teal },
  ratingChipText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: LightBrand.textPrimary },
  ratingChipTextSelected: { color: '#FFFFFF' },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed },
  completionCard: { gap: 8 },
  findCoachButton: { marginTop: 8 },
});
