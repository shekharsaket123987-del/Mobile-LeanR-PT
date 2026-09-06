/**
 * Profile (client) — LEANR_PT_MOBILE_PRD.md §5 "Profile". See
 * src/lib/data/profile.ts header for the confirmed RLS and the
 * deliberate field-scope cut (name/phone/emergency contact + goals/
 * equipment + password; not every column, no photo upload).
 *
 * Reached from More ("Profile") — not a tab itself, hidden via
 * `href: null` in the (client) layout.
 */
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { AvatarEditor } from '@/components/avatar-editor';
import { ErrorState, LoadingState, ScreenScaffold } from '@/components/screen-scaffold';
import { PrimaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { Brand, Radius } from '@/constants/theme';
import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightCard } from '@/components/light/light-card';
import { LightErrorState, LightLoadingState } from '@/components/light/light-states';
import { LightPrimaryButton } from '@/components/light/light-button';
import { LightSectionHeader } from '@/components/light/light-section-header';
import { LightTextField } from '@/components/light/light-text-field';
import { LightBrand } from '@/constants/light-theme';
import {
  changeMyPassword,
  getMyClientDetails,
  getMyProfile,
  updateMyClientDetails,
  updateMyProfile,
} from '@/lib/data/profile';
import { getLatestSubscription } from '@/lib/data/subscription';
import { useAsync } from '@/lib/data/use-async';

function joinList(values: string[]) {
  return values.join(', ');
}
function splitList(text: string) {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Pre-purchase Profile (mockup #6) — same edit fields/save logic as the
 * enrolled screen, light-styled, minus the "Training profile" (goals/
 * equipment/medical notes) card — that's onboarding data a demo-only
 * client hasn't submitted yet (Onboarding only runs post-purchase) and
 * isn't shown in this mockup frame either.
 */
function PrePurchaseProfileScreen() {
  const { data, loading, error, reload } = useAsync(getMyProfile, []);

  const [fullName, setFullName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [emergencyContact, setEmergencyContact] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const displayPhotoUrl = photoUrl ?? data?.photo_url ?? null;
  const displayName = fullName ?? data?.full_name ?? '';
  const displayPhone = phone ?? data?.phone ?? '';
  const displayEmergency = emergencyContact ?? data?.emergency_contact ?? '';

  const onAvatarUploaded = async (url: string) => {
    setPhotoUrl(url);
    setAvatarError(null);
    try {
      await updateMyProfile({ photo_url: url });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : String(err));
    }
  };

  const onSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      await updateMyProfile({ full_name: displayName, phone: displayPhone || null, emergency_contact: displayEmergency || null });
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const onChangePassword = async () => {
    setPasswordError(null);
    setPasswordChanged(false);
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      await changeMyPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordChanged(true);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : String(err));
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <LightScreenScaffold title="My Profile">
        <LightLoadingState />
      </LightScreenScaffold>
    );
  }
  if (error) {
    return (
      <LightScreenScaffold title="My Profile">
        <LightErrorState message={error} onRetry={reload} />
      </LightScreenScaffold>
    );
  }

  return (
    <LightScreenScaffold title="My Profile">
      <AvatarEditor photoUrl={displayPhotoUrl} onUploaded={onAvatarUploaded} />
      {avatarError && (
        <Text style={lightStyles.errorText} accessibilityRole="alert">
          {avatarError}
        </Text>
      )}

      <LightCard style={lightStyles.card}>
        <LightSectionHeader title="Your details" />
        <LightTextField placeholder="Full name" value={displayName} onChangeText={setFullName} accessibilityLabel="Full name" />
        <LightTextField placeholder="Phone number" value={displayPhone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel="Phone number" />
        <LightTextField placeholder="Emergency contact" value={displayEmergency} onChangeText={setEmergencyContact} accessibilityLabel="Emergency contact" />
        {profileError && (
          <Text style={lightStyles.errorText} accessibilityRole="alert">
            {profileError}
          </Text>
        )}
        {profileSaved && <Text style={lightStyles.savedText}>Saved.</Text>}
        <LightPrimaryButton onPress={onSaveProfile} loading={savingProfile} style={lightStyles.saveButton}>
          Save
        </LightPrimaryButton>
      </LightCard>

      <LightCard style={lightStyles.card}>
        <LightSectionHeader title="Change password" />
        <LightTextField placeholder="New password" isPassword value={newPassword} onChangeText={setNewPassword} accessibilityLabel="New password" />
        <LightTextField
          placeholder="Confirm new password"
          isPassword
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          accessibilityLabel="Confirm new password"
        />
        {passwordError && (
          <Text style={lightStyles.errorText} accessibilityRole="alert">
            {passwordError}
          </Text>
        )}
        {passwordChanged && <Text style={lightStyles.savedText}>Password changed.</Text>}
        <LightPrimaryButton onPress={onChangePassword} loading={changingPassword} style={lightStyles.saveButton}>
          Change password
        </LightPrimaryButton>
      </LightCard>
    </LightScreenScaffold>
  );
}

function EnrolledProfileScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [profile, details] = await Promise.all([getMyProfile(), getMyClientDetails()]);
    return { profile, details };
  }, []);

  const [fullName, setFullName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [emergencyContact, setEmergencyContact] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [goals, setGoals] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [medicalNotes, setMedicalNotes] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const displayPhotoUrl = photoUrl ?? data?.profile?.photo_url ?? null;
  const displayName = fullName ?? data?.profile?.full_name ?? '';
  const displayPhone = phone ?? data?.profile?.phone ?? '';
  const displayEmergency = emergencyContact ?? data?.profile?.emergency_contact ?? '';
  const displayGoals = goals ?? (data?.details ? joinList(data.details.goals) : '');
  const displayEquipment = equipment ?? (data?.details ? joinList(data.details.equipment) : '');
  const displayMedicalNotes = medicalNotes ?? data?.details?.medical_notes ?? '';

  const onAvatarUploaded = async (url: string) => {
    setPhotoUrl(url);
    setAvatarError(null);
    try {
      await updateMyProfile({ photo_url: url });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : String(err));
    }
  };

  const onSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      await updateMyProfile({ full_name: displayName, phone: displayPhone || null, emergency_contact: displayEmergency || null });
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const onSaveDetails = async () => {
    setSavingDetails(true);
    setDetailsError(null);
    setDetailsSaved(false);
    try {
      await updateMyClientDetails({
        goals: splitList(displayGoals),
        equipment: splitList(displayEquipment),
        medical_notes: displayMedicalNotes || null,
      });
      setDetailsSaved(true);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDetails(false);
    }
  };

  const onChangePassword = async () => {
    setPasswordError(null);
    setPasswordChanged(false);
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      await changeMyPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordChanged(true);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : String(err));
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <ScreenScaffold title="Profile">
        <LoadingState />
      </ScreenScaffold>
    );
  }

  if (error) {
    return (
      <ScreenScaffold title="Profile">
        <ErrorState message={error} onRetry={reload} />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Profile">
      <AvatarEditor photoUrl={displayPhotoUrl} onUploaded={onAvatarUploaded} />
      {avatarError && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {avatarError}
        </Text>
      )}

      <GlassCard style={styles.card}>
        <SectionHeader title="Your details" />
        <TextField placeholder="Full name" value={displayName} onChangeText={setFullName} accessibilityLabel="Full name" />
        <TextField
          placeholder="Phone number"
          value={displayPhone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          accessibilityLabel="Phone number"
        />
        <TextField
          placeholder="Emergency contact"
          value={displayEmergency}
          onChangeText={setEmergencyContact}
          accessibilityLabel="Emergency contact"
        />
        {profileError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {profileError}
          </Text>
        )}
        {profileSaved && <Text style={styles.savedText}>Saved.</Text>}
        <PrimaryButton onPress={onSaveProfile} loading={savingProfile} style={styles.saveButton}>
          Save
        </PrimaryButton>
      </GlassCard>

      <GlassCard style={styles.card}>
        <SectionHeader title="Training profile" />
        <TextField placeholder="Goals (comma-separated)" value={displayGoals} onChangeText={setGoals} accessibilityLabel="Goals" />
        <TextField
          placeholder="Equipment (comma-separated)"
          value={displayEquipment}
          onChangeText={setEquipment}
          accessibilityLabel="Equipment"
        />
        <TextInput
          style={styles.multilineInput}
          placeholder="Medical notes"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={displayMedicalNotes}
          onChangeText={setMedicalNotes}
          multiline
          accessibilityLabel="Medical notes"
        />
        {detailsError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {detailsError}
          </Text>
        )}
        {detailsSaved && <Text style={styles.savedText}>Saved.</Text>}
        <PrimaryButton onPress={onSaveDetails} loading={savingDetails} style={styles.saveButton}>
          Save
        </PrimaryButton>
      </GlassCard>

      <GlassCard style={styles.card}>
        <SectionHeader title="Change password" />
        <TextField
          placeholder="New password"
          isPassword
          value={newPassword}
          onChangeText={setNewPassword}
          accessibilityLabel="New password"
        />
        <TextField
          placeholder="Confirm new password"
          isPassword
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          accessibilityLabel="Confirm new password"
        />
        {passwordError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {passwordError}
          </Text>
        )}
        {passwordChanged && <Text style={styles.savedText}>Password changed.</Text>}
        <PrimaryButton onPress={onChangePassword} loading={changingPassword} style={styles.saveButton}>
          Change password
        </PrimaryButton>
      </GlassCard>
    </ScreenScaffold>
  );
}

export default function ClientProfileScreen() {
  const { data: subscription, loading } = useAsync(getLatestSubscription, []);
  if (loading) return null;
  return subscription ? <EnrolledProfileScreen /> : <PrePurchaseProfileScreen />;
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  multilineInput: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    padding: 14,
    color: '#FFFFFF',
    minHeight: 80,
    backgroundColor: Brand.charcoal2,
    borderRadius: Radius.md,
    textAlignVertical: 'top',
  },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed, marginTop: 4 },
  savedText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: Brand.successEmerald, marginTop: 4 },
  saveButton: { marginTop: 4 },
});

const lightStyles = StyleSheet.create({
  card: { gap: 12 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.alertRed, marginTop: 4 },
  savedText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: LightBrand.successEmerald, marginTop: 4 },
  saveButton: { marginTop: 4 },
});
