/**
 * Profile (coach) — LEANR_PT_MOBILE_PRD.md §5 "Coach Profile
 * (self-service subset)/Password Change". See src/lib/data/profile.ts
 * header for the confirmed RLS and the deliberate field-scope cut.
 */
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { Card, ErrorState, LoadingState, ScreenScaffold, styles as shared } from '@/components/screen-scaffold';
import { CtaButton } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import { changeMyPassword, getMyCoachDetails, getMyProfile, updateMyCoachDetails, updateMyProfile } from '@/lib/data/profile';
import { useAsync } from '@/lib/data/use-async';

export default function CoachProfileScreen() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [profile, details] = await Promise.all([getMyProfile(), getMyCoachDetails()]);
    return { profile, details };
  }, []);

  const [fullName, setFullName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [emergencyContact, setEmergencyContact] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [bio, setBio] = useState<string | null>(null);
  const [specialization, setSpecialization] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const displayName = fullName ?? data?.profile?.full_name ?? '';
  const displayPhone = phone ?? data?.profile?.phone ?? '';
  const displayEmergency = emergencyContact ?? data?.profile?.emergency_contact ?? '';
  const displayBio = bio ?? data?.details?.bio ?? '';
  const displaySpecialization = specialization ?? data?.details?.specialization ?? '';

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
      await updateMyCoachDetails({ bio: displayBio || null, specialization: displaySpecialization || null });
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
      <Card>
        <Text style={shared.cardLabel}>NAME</Text>
        <TextInput style={styles.input} value={displayName} onChangeText={setFullName} accessibilityLabel="Full name" />
        <Text style={shared.cardLabel}>PHONE</Text>
        <TextInput
          style={styles.input}
          value={displayPhone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          accessibilityLabel="Phone number"
        />
        <Text style={shared.cardLabel}>EMERGENCY CONTACT</Text>
        <TextInput
          style={styles.input}
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
        <CtaButton onPress={onSaveProfile} loading={savingProfile} style={styles.saveButton}>
          Save
        </CtaButton>
      </Card>

      <Card>
        <Text style={shared.cardLabel}>SPECIALIZATION</Text>
        <TextInput style={styles.input} value={displaySpecialization} onChangeText={setSpecialization} accessibilityLabel="Specialization" />
        <Text style={shared.cardLabel}>BIO</Text>
        <TextInput style={[styles.input, styles.multiline]} value={displayBio} onChangeText={setBio} multiline accessibilityLabel="Bio" />
        {detailsError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {detailsError}
          </Text>
        )}
        {detailsSaved && <Text style={styles.savedText}>Saved.</Text>}
        <CtaButton onPress={onSaveDetails} loading={savingDetails} style={styles.saveButton}>
          Save
        </CtaButton>
      </Card>

      <Card>
        <Text style={shared.cardLabel}>CHANGE PASSWORD</Text>
        <TextInput
          style={styles.input}
          placeholder="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          accessibilityLabel="New password"
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          accessibilityLabel="Confirm new password"
        />
        {passwordError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {passwordError}
          </Text>
        )}
        {passwordChanged && <Text style={styles.savedText}>Password changed.</Text>}
        <CtaButton onPress={onChangePassword} loading={changingPassword} style={styles.saveButton}>
          Change password
        </CtaButton>
      </Card>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  input: { fontFamily: 'Manrope_500Medium', fontSize: 15, paddingVertical: 8, color: Brand.charcoal2 },
  multiline: { minHeight: 80 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed, marginTop: 4 },
  savedText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: Brand.successEmerald, marginTop: 4 },
  saveButton: { marginTop: 12 },
});
