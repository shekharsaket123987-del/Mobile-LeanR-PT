/**
 * Landing spot for an admin account signing into the mobile app (coach
 * now has its own app as of Phase 4 — see getHomeRouteForRole). Per
 * LEANR_PT_NEXTGEN_APP_PRD.md §16 roadmap, admin stays web/tablet —
 * this screen is the honest interim state rather than silently showing
 * the wrong role's tab bar.
 */
import { Text, View } from 'react-native';
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
        The {profile?.role ?? 'admin'} app isn&apos;t built yet — please continue on the LEANR web portal for now.
      </Text>
      <View
        style={{ backgroundColor: Brand.charcoal2, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
        <Text
          onPress={signOut}
          style={{ fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#FFFFFF' }}>
          Sign out
        </Text>
      </View>
    </SafeAreaView>
  );
}
