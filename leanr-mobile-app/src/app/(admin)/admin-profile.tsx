/**
 * Profile (admin) — New PRD.md §4.C "Screen: Admin Profile" — profile
 * info, edit (name/phone/photo — same `profiles`-table scope every role
 * shares), notifications, logout. Reuses `profile.ts` verbatim (role-
 * agnostic, `auth.uid()`-scoped, same as the coach profile screen).
 *
 * NOTE (Gap Verification Report, Area 7): the web app has NO admin-profile
 * route or edit UI at all — only a read-only sidebar identity block (name +
 * avatar + a hardcoded "Operations Team" subtitle) + logout. This screen's
 * edit/password-change capability is therefore new functionality beyond
 * web parity, not a ported feature — flagged per the report's explicit
 * instruction, not rolled back, since nothing on the web side requires
 * removing it.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AvatarEditor } from '@/components/avatar-editor';
import { DestructiveButton, PrimaryButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { MenuRow } from '@/components/ui/menu-row';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { changeMyPassword, getMyProfile, updateMyProfile } from '@/lib/data/profile';
import { getErrorMessage } from '@/lib/data/errors';
import { useAsync } from '@/lib/data/use-async';

export default function AdminProfileScreen() {
  const { session, signOut } = useAuth();
  const { data: profile, loading, error, reload } = useAsync(getMyProfile, []);

  const [fullName, setFullName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
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

  const displayPhotoUrl = photoUrl ?? profile?.photo_url ?? null;
  const displayName = fullName ?? profile?.full_name ?? '';
  const displayPhone = phone ?? profile?.phone ?? '';

  const onAvatarUploaded = async (url: string) => {
    setPhotoUrl(url);
    setAvatarError(null);
    try {
      await updateMyProfile({ photo_url: url });
    } catch (err) {
      setAvatarError(getErrorMessage(err));
    }
  };

  const onSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      await updateMyProfile({ full_name: displayName, phone: displayPhone || null });
      setProfileSaved(true);
    } catch (err) {
      setProfileError(getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const onChangePassword = async () => {
    setPasswordError(null);
    setPasswordChanged(false);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
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
      setPasswordError(getErrorMessage(err));
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
    <ScreenScaffold title="Profile" subtitle={session?.user.email ?? undefined}>
      <AvatarEditor photoUrl={displayPhotoUrl} onUploaded={onAvatarUploaded} />
      {avatarError && <Text style={styles.errorText}>{avatarError}</Text>}

      <GlassCard style={styles.card}>
        <SectionHeader title="Your details" />
        <TextField placeholder="Full name" value={displayName} onChangeText={setFullName} maxLength={100} accessibilityLabel="Full name" />
        <TextField placeholder="Phone number" value={displayPhone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel="Phone number" />
        {profileError && <Text style={styles.errorText}>{profileError}</Text>}
        {profileSaved && <Text style={styles.savedText}>Saved.</Text>}
        <PrimaryButton onPress={onSaveProfile} loading={savingProfile} style={styles.saveButton}>
          Save
        </PrimaryButton>
      </GlassCard>

      <GlassCard style={styles.card}>
        <SectionHeader title="Change password" />
        <TextField placeholder="New password" isPassword value={newPassword} onChangeText={setNewPassword} accessibilityLabel="New password" />
        <TextField placeholder="Confirm new password" isPassword value={confirmPassword} onChangeText={setConfirmPassword} accessibilityLabel="Confirm new password" />
        {passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
        {passwordChanged && <Text style={styles.savedText}>Password changed.</Text>}
        <PrimaryButton onPress={onChangePassword} loading={changingPassword} style={styles.saveButton}>
          Change password
        </PrimaryButton>
      </GlassCard>

      <GlassCard style={styles.menuCard}>
        <MenuRow label="Notifications" icon="notifications-outline" onPress={() => router.push('/admin-notifications')} last />
      </GlassCard>

      <DestructiveButton size="lg" onPress={signOut}>
        Sign out
      </DestructiveButton>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  menuCard: { paddingVertical: 4 },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: Brand.alertRed, marginTop: 4 },
  savedText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: Brand.successEmerald, marginTop: 4 },
  saveButton: { marginTop: 4 },
});
