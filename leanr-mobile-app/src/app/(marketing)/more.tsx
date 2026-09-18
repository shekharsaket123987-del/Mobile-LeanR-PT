/** Marketing More — entry points to auth + the anonymous demo flow. */
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ScreenScaffold } from '@/components/screen-scaffold';
import { GlassCard } from '@/components/ui/glass-card';
import { MenuRow } from '@/components/ui/menu-row';

export default function MarketingMoreScreen() {
  return (
    <ScreenScaffold title="More">
      <GlassCard style={styles.card}>
        <MenuRow label="Log In" icon="log-in-outline" onPress={() => router.push('/login')} />
        <MenuRow label="Sign Up" icon="person-add-outline" onPress={() => router.push('/signup')} />
        <MenuRow label="Book a Free Demo" icon="calendar-outline" onPress={() => router.push('/book-free-demo')} />
        <MenuRow label="Help & Support" icon="help-circle-outline" last onPress={() => {}} />
      </GlassCard>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 4 },
});
