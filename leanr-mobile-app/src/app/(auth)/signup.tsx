/**
 * Signup — client-only self-serve registration. New PRD.md §3.1/§16.A:
 * 3-step flow (form → email verification if this project requires it →
 * phone OTP), Full Name/Email/Mobile Number/Password all required at step
 * 1. Coach/admin accounts are ops-provisioned only and have no mobile
 * signup surface.
 *
 * Step 3 (phone OTP) runs AFTER `signUpWithPassword` already has a real
 * session — `signupPhoneStepInProgress` (auth-context.tsx) suppresses
 * `(auth)/_layout.tsx`'s normal session-redirect for exactly this window,
 * same mechanism `recoveryInProgress` uses for password reset.
 *
 * The "Skip for now" bypass matches the web app's own (New PRD.md §19.3
 * item 16: phone verification isn't actually enforced there either) —
 * reproduced deliberately, not a shortcut.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AuthShell } from '@/components/ui/auth-shell';
import { GhostButton, PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { TextLink } from '@/components/tappable';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { isValidMobile, sendPhoneOtp, verifyPhoneOtp } from '@/lib/data/phone-otp';
import { updateMyProfile } from '@/lib/data/profile';
import { getErrorMessage } from '@/lib/data/errors';

type Stage = 'form' | 'email-pending' | 'phone-otp';

export default function SignupScreen() {
  const { signUpWithPassword, signInWithGoogle, setSignupPhoneStepInProgress } = useAuth();
  const [stage, setStage] = useState<Stage>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const finishSignup = () => {
    setSignupPhoneStepInProgress(false);
    // No manual navigation — (auth)/_layout.tsx redirects reactively now
    // that the phone step's redirect-suppression is lifted.
  };

  const onSubmit = async () => {
    setError(null);
    if (!fullName.trim()) return setError('Enter your name.');
    if (fullName.trim().length > 100) return setError('Name must be 100 characters or fewer.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (!isValidMobile(mobile)) return setError('Enter a valid mobile number.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setSubmitting(true);
    // Set BEFORE calling signUp — the session-state update from a
    // successful signup can otherwise land before this does, letting
    // _layout.tsx's redirect fire first (see auth-context.tsx).
    setSignupPhoneStepInProgress(true);
    const { error: signUpError, needsEmailConfirmation } = await signUpWithPassword(
      email.trim(),
      password,
      fullName.trim(),
      mobile.trim()
    );
    setSubmitting(false);

    if (signUpError) {
      setSignupPhoneStepInProgress(false);
      setError(signUpError);
      return;
    }
    if (needsEmailConfirmation) {
      setSignupPhoneStepInProgress(false); // no session was created — nothing to suppress
      setStage('email-pending');
      return;
    }

    setStage('phone-otp');
    try {
      await sendPhoneOtp(mobile.trim());
    } catch (err) {
      setError(getErrorMessage(err)); // stay on phone-otp stage — Resend/Skip are still available
    }
  };

  const onGoogleSignUp = async () => {
    setError(null);
    setGoogleSubmitting(true);
    const { error: googleError } = await signInWithGoogle();
    setGoogleSubmitting(false);
    if (googleError) setError(googleError);
  };

  const onResend = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await sendPhoneOtp(mobile.trim());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyOtp = async () => {
    setError(null);
    if (!otp.trim()) return setError('Enter the code sent to your phone.');
    setSubmitting(true);
    try {
      await verifyPhoneOtp(mobile.trim(), otp.trim());
      await updateMyProfile({ phone: mobile.trim() });
      finishSignup();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (stage === 'email-pending') {
    return (
      <AuthShell title="Check your email" subtitle={`We sent a confirmation link to ${email.trim()}. Verify it, then log in.`}>
        <PrimaryButton size="lg" onPress={() => router.replace('/login')}>
          Go to login
        </PrimaryButton>
      </AuthShell>
    );
  }

  if (stage === 'phone-otp') {
    return (
      <AuthShell title="Verify your phone" subtitle={`Enter the code we sent to ${mobile.trim()}.`}>
        <TextField
          icon="keypad-outline"
          placeholder="6-digit code"
          keyboardType="number-pad"
          maxLength={6}
          value={otp}
          onChangeText={setOtp}
        />

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}

        <PrimaryButton onPress={onVerifyOtp} loading={submitting} size="lg">
          Verify & continue
        </PrimaryButton>
        <GhostButton size="sm" onPress={onResend} disabled={submitting} style={styles.centerBtn}>
          Resend code
        </GhostButton>
        <TextLink onPress={finishSignup} style={styles.skipLink}>
          Skip for now (demo — phone unverified)
        </TextLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Get matched with your coach in minutes.">
      <TextField icon="person-outline" placeholder="Full name" autoComplete="name" maxLength={100} value={fullName} onChangeText={setFullName} />
      <TextField
        icon="mail-outline"
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        icon="call-outline"
        placeholder="Mobile number"
        keyboardType="phone-pad"
        autoComplete="tel"
        value={mobile}
        onChangeText={setMobile}
      />
      <TextField
        icon="lock-closed-outline"
        placeholder="Password (min. 8 characters)"
        isPassword
        autoComplete="password-new"
        value={password}
        onChangeText={setPassword}
      />

      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <PrimaryButton onPress={onSubmit} loading={submitting} size="lg">
        Create account
      </PrimaryButton>

      <Text style={styles.orDivider}>OR</Text>

      <SecondaryButton onPress={onGoogleSignUp} loading={googleSubmitting} size="lg">
        Continue with Google
      </SecondaryButton>

      <TextLink onPress={() => router.replace('/login')} style={styles.link}>
        Already have an account? Log in
      </TextLink>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { color: Brand.alertRed, fontFamily: 'Manrope_500Medium', fontSize: 13 },
  orDivider: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  centerBtn: { alignSelf: 'center' },
  link: { alignSelf: 'center', marginTop: 8 },
  skipLink: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: 12,
  },
});
