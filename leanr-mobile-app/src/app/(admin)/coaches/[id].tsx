/**
 * Coach Detail (admin) — New PRD.md §4.C "Screen: Coach Detail
 * (second-richest)". Profile edit, skills editor (admin has full edit/
 * remove, unlike the coach's own append-only view), Weekly Working
 * Hours (the only admin write-surface for a coach's recurring
 * template), Admin Controls (Override/Block Slot, Reassign Clients,
 * Disable Coach), Assigned Clients, upcoming schedule.
 */
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightAvatar } from '@/components/light/light-avatar';
import { LightBadge } from '@/components/light/light-badge';
import { LightDestructiveButton, LightPrimaryButton, LightSecondaryButton } from '@/components/light/light-button';
import { LightCard } from '@/components/light/light-card';
import { LightChip, LightChipGrid } from '@/components/light/light-chip';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightSegmentedControl } from '@/components/light/light-segmented-control';
import { LightTextField } from '@/components/light/light-text-field';
import { LightEmptyState, LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightBrand } from '@/constants/light-theme';
import {
  blockCoachSlot,
  disableCoach,
  getAdminCoachDetail,
  listAdminCoaches,
  reassignCoachClients,
  setCoachAvailability,
  updateCoach,
  updateCoachSkills,
  type WorkingHoursRow,
} from '@/lib/data/admin-coaches';
import { getErrorMessage } from '@/lib/data/errors';
import { useAsync } from '@/lib/data/use-async';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_TONE: Record<string, 'teal' | 'green' | 'red' | 'gray'> = { active: 'green', inactive: 'gray', 'on-leave': 'teal' };

type Tab = 'overview' | 'hours' | 'clients';
type Panel = null | 'edit' | 'block' | 'reassign';

export default function AdminCoachDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: coach, loading, error, reload } = useAsync(() => getAdminCoachDetail(id), [id]);
  const { data: allCoaches } = useAsync(listAdminCoaches, []);
  const [tab, setTab] = useState<Tab>('overview');
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reassignResult, setReassignResult] = useState<{ reassignedCount: number; failed: { clientName: string; error: string }[] } | null>(null);

  const [skillsDraft, setSkillsDraft] = useState<string[] | null>(null);
  const [newSkill, setNewSkill] = useState('');
  const [hoursDraft, setHoursDraft] = useState<WorkingHoursRow[] | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
      setPanel(null);
      reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <LightScreenScaffold title="Coach Details">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }
  if (error || !coach) {
    return (
      <LightScreenScaffold title="Coach Details">
        <LightErrorState message={error ?? 'Coach not found.'} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  const skills = skillsDraft ?? coach.skills;
  const hours =
    hoursDraft ??
    Array.from({ length: 7 }, (_, dow) => {
      const existing = coach.workingHours.find((h) => h.day_of_week === dow);
      return existing ?? { day_of_week: dow, start_time: '06:00:00', end_time: '20:00:00', is_active: false };
    });

  return (
    <LightScreenScaffold title="Coach Details">
      <LightCard style={styles.headerCard}>
        <View style={styles.headerRow}>
          <LightAvatar photoUrl={coach.photo_url} name={coach.full_name} size={56} ring />
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{coach.full_name}</Text>
            <Text style={styles.code}>#{coach.employeeCode}</Text>
          </View>
          <LightBadge label={coach.status} tone={STATUS_TONE[coach.status] ?? 'gray'} />
        </View>
      </LightCard>

      <LightSegmentedControl
        options={[
          { key: 'overview', label: 'Overview' },
          { key: 'hours', label: 'Working Hours' },
          { key: 'clients', label: 'Clients' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <>
          <LightCard style={styles.card}>
            <LightSectionHeader
              title="Profile"
              actionLabel={panel === 'edit' ? undefined : 'Edit'}
              onAction={panel === 'edit' ? undefined : () => setPanel('edit')}
            />
            {panel !== 'edit' && (
              <>
                <Row label="Specialization" value={coach.specialization ?? '—'} />
                <Row label="Experience" value={coach.yearsExperience != null ? `${coach.yearsExperience} yrs` : '—'} />
                <Row label="Phone" value={coach.phone ?? '—'} />
                <Row label="Languages" value={coach.languages.join(', ') || '—'} />
                {coach.bio && <Text style={styles.bio}>{coach.bio}</Text>}
              </>
            )}
            {panel === 'edit' && <EditCoachPanel coach={coach} busy={busy} error={actionError} onCancel={() => setPanel(null)} onSubmit={(updates) => run(() => updateCoach(coach.id, coach.profileId, updates))} />}
          </LightCard>

          <LightCard style={styles.card}>
            <LightSectionHeader title="Performance" />
            <View style={styles.statsRow}>
              <Stat value={String(coach.completedSessions)} label="Completed" />
              <Stat value={String(coach.upcomingSessions)} label="Upcoming" />
              <Stat value={String(coach.missedSessions)} label="Missed" />
            </View>
            <View style={styles.statsRow}>
              <Stat value={coach.rating != null ? coach.rating.toFixed(1) : '—'} label="Rating" />
              <Stat value={coach.utilizationPct != null ? `${coach.utilizationPct.toFixed(0)}%` : '—'} label="Utilization" />
              <Stat value={String(coach.activeClients)} label="Active Clients" />
            </View>
          </LightCard>

          <LightCard style={styles.card}>
            <LightSectionHeader title="Skills" />
            <LightChipGrid>
              {skills.map((s) => (
                <LightChip key={s} label={`${s} ✕`} selected onPress={() => setSkillsDraft(skills.filter((x) => x !== s))} />
              ))}
            </LightChipGrid>
            <View style={styles.addSkillRow}>
              <View style={styles.addSkillField}>
                <LightTextField placeholder="Add a skill" value={newSkill} onChangeText={setNewSkill} accessibilityLabel="Add a skill" />
              </View>
              <LightSecondaryButton
                size="sm"
                disabled={!newSkill.trim()}
                onPress={() => {
                  setSkillsDraft([...skills, newSkill.trim()]);
                  setNewSkill('');
                }}>
                Add
              </LightSecondaryButton>
            </View>
            {skillsDraft && (
              <LightPrimaryButton loading={busy} onPress={() => run(async () => { await updateCoachSkills(coach.id, skillsDraft); setSkillsDraft(null); })}>
                Save Skills
              </LightPrimaryButton>
            )}
          </LightCard>

          <LightSectionHeader title="Admin Controls" />
          <LightCard style={styles.card}>
            <LightSecondaryButton onPress={() => setPanel(panel === 'block' ? null : 'block')} style={styles.controlButton}>
              Override / Block Slot
            </LightSecondaryButton>
            {panel === 'block' && <BlockSlotPanel busy={busy} error={actionError} onSubmit={(date, reason) => run(() => blockCoachSlot(coach.id, date, reason))} />}

            <LightSecondaryButton onPress={() => setPanel(panel === 'reassign' ? null : 'reassign')} style={styles.controlButton}>
              Reassign Clients
            </LightSecondaryButton>
            {panel === 'reassign' && (
              <ReassignPanel
                options={(allCoaches ?? []).filter((c) => c.id !== coach.id)}
                busy={busy}
                error={actionError}
                onSubmit={(newCoachId) =>
                  run(async () => {
                    const result = await reassignCoachClients(coach.id, newCoachId);
                    setReassignResult(result);
                  })
                }
              />
            )}
            {reassignResult && (
              <LightCard variant="teal" style={styles.timelineCard}>
                <Text style={styles.timelineDesc}>Reassigned {reassignResult.reassignedCount} client(s).</Text>
                {reassignResult.failed.map((f) => (
                  <Text key={f.clientName} style={styles.errorText}>
                    {f.clientName}: {f.error}
                  </Text>
                ))}
              </LightCard>
            )}

            <LightDestructiveButton
              onPress={() => run(() => disableCoach(coach.id))}
              disabled={coach.status === 'inactive' || busy}
              style={styles.controlButton}>
              Disable Coach
            </LightDestructiveButton>
          </LightCard>
        </>
      )}

      {tab === 'hours' && (
        <LightCard style={styles.card}>
          <LightSectionHeader title="Weekly Working Hours" />
          {hours.map((h, i) => (
            <View key={h.day_of_week} style={styles.hoursRow}>
              <Pressable
                onPress={() => {
                  const next = [...hours];
                  next[i] = { ...h, is_active: !h.is_active };
                  setHoursDraft(next);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: h.is_active }}>
                <LightBadge label={DAY_NAMES[h.day_of_week]} tone={h.is_active ? 'green' : 'gray'} />
              </Pressable>
              {h.is_active && (
                <>
                  <View style={styles.timeField}>
                    <LightTextField
                      placeholder="Start (HH:MM)"
                      value={h.start_time.slice(0, 5)}
                      onChangeText={(t) => {
                        const next = [...hours];
                        next[i] = { ...h, start_time: `${t}:00` };
                        setHoursDraft(next);
                      }}
                      accessibilityLabel={`${DAY_NAMES[h.day_of_week]} start time`}
                    />
                  </View>
                  <View style={styles.timeField}>
                    <LightTextField
                      placeholder="End (HH:MM)"
                      value={h.end_time.slice(0, 5)}
                      onChangeText={(t) => {
                        const next = [...hours];
                        next[i] = { ...h, end_time: `${t}:00` };
                        setHoursDraft(next);
                      }}
                      accessibilityLabel={`${DAY_NAMES[h.day_of_week]} end time`}
                    />
                  </View>
                </>
              )}
            </View>
          ))}
          {actionError && <Text style={styles.errorText}>{actionError}</Text>}
          <LightPrimaryButton loading={busy} onPress={() => run(async () => { await setCoachAvailability(coach.id, hours); setHoursDraft(null); })}>
            Save Working Hours
          </LightPrimaryButton>
        </LightCard>
      )}

      {tab === 'clients' && (
        <>
          {coach.assignedClients.length === 0 && <LightEmptyState message="No assigned clients." icon="people-outline" />}
          {coach.assignedClients.map((c) => (
            <Pressable key={c.id} onPress={() => router.push({ pathname: '/admin-clients/[id]', params: { id: c.id } })} accessibilityRole="button" accessibilityLabel={c.full_name}>
              <LightCard style={styles.timelineCard}>
                <Text style={styles.timelineTitle}>{c.full_name}</Text>
              </LightCard>
            </Pressable>
          ))}
        </>
      )}
    </LightScreenScaffold>
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
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EditCoachPanel({
  coach,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  coach: { full_name: string; specialization: string | null; yearsExperience: number | null; bio: string | null };
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (updates: { full_name: string; specialization: string; years_experience: number; bio: string }) => void;
}) {
  const [fullName, setFullName] = useState(coach.full_name);
  const [specialization, setSpecialization] = useState(coach.specialization ?? '');
  const [years, setYears] = useState(String(coach.yearsExperience ?? ''));
  const [bio, setBio] = useState(coach.bio ?? '');
  return (
    <View style={styles.panel}>
      <LightTextField placeholder="Full Name" value={fullName} onChangeText={setFullName} accessibilityLabel="Full name" />
      <LightTextField placeholder="Specialization" value={specialization} onChangeText={setSpecialization} accessibilityLabel="Specialization" />
      <LightTextField keyboardType="number-pad" placeholder="Years of Experience" value={years} onChangeText={setYears} accessibilityLabel="Years of experience" />
      <LightTextField placeholder="Bio" value={bio} onChangeText={setBio} multiline style={styles.multiline} accessibilityLabel="Bio" />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <View style={styles.editActions}>
        <LightSecondaryButton onPress={onCancel}>Cancel</LightSecondaryButton>
        <LightPrimaryButton loading={busy} onPress={() => onSubmit({ full_name: fullName.trim(), specialization: specialization.trim(), years_experience: Number(years) || 0, bio: bio.trim() })}>
          Save
        </LightPrimaryButton>
      </View>
    </View>
  );
}

function BlockSlotPanel({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (date: string, reason: string | null) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  return (
    <View style={styles.panel}>
      <LightTextField placeholder="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} accessibilityLabel="Date to block" />
      <LightTextField placeholder="Reason (optional)" value={reason} onChangeText={setReason} accessibilityLabel="Reason" />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <LightPrimaryButton loading={busy} onPress={() => onSubmit(date, reason.trim() || null)}>
        Block Slot
      </LightPrimaryButton>
    </View>
  );
}

function ReassignPanel({
  options,
  busy,
  error,
  onSubmit,
}: {
  options: { id: string; full_name: string }[];
  busy: boolean;
  error: string | null;
  onSubmit: (newCoachId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <View style={styles.panel}>
      <LightChipGrid>
        {options.map((c) => (
          <LightChip key={c.id} label={c.full_name} selected={selected === c.id} onPress={() => setSelected(c.id)} />
        ))}
      </LightChipGrid>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <LightPrimaryButton loading={busy} disabled={!selected} onPress={() => selected && onSubmit(selected)}>
        Reassign All Clients
      </LightPrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerInfo: { flex: 1, gap: 2 },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: LightBrand.navy },
  code: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: LightBrand.textMuted },
  card: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowLabel: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textMuted },
  rowValue: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: LightBrand.navy, maxWidth: '60%' },
  bio: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: LightBrand.textSecondary, marginTop: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: LightBrand.navy },
  statLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: LightBrand.textMuted },
  addSkillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  addSkillField: { flex: 1 },
  controlButton: { marginTop: 8 },
  panel: { gap: 8, marginTop: 8, marginBottom: 4 },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.alertRed },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  timeField: { flex: 1 },
  timelineCard: { gap: 2 },
  timelineTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: LightBrand.navy },
  timelineDesc: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: LightBrand.textSecondary },
});
