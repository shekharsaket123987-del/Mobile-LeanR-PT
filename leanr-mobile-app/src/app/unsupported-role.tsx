/**
 * Defensive fallback only — client, coach, and admin all have their own
 * app now (getHomeRouteForRole handles all three `user_role` enum
 * values). This screen only renders if `profile.role` is somehow
 * something else, which shouldn't happen given the DB enum, but this is
 * the honest state rather than silently showing the wrong role's tab
 * bar if it ever does.
 */
import { Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';

export default function UnsupportedRoleScreen() {
  const { profile, signOut } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.black, justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text style={{ fontFamily: 'Oswald_700Bold', fontStyle: 'italic', fontSize: 24, color: Brand.yellow }}>
        Not available yet
      </Text>
      <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 15, color: '#FFFFFF' }}>
        The {profile?.role ?? 'this'} app isn&apos;t built yet — please continue on the LEANR web portal for now.
      </Text>
      <Pressable
        onPress={signOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={{ backgroundColor: Brand.charcoal2, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#FFFFFF' }}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}
