/** Marketing More — entry points to auth + the anonymous demo flow. */
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { LightScreenScaffold } from '@/components/light/light-screen-scaffold';
import { LightCard } from '@/components/light/light-card';
import { LightMenuRow } from '@/components/light/light-menu-row';

export default function MarketingMoreScreen() {
  return (
    <LightScreenScaffold title="More">
      <LightCard style={styles.card}>
        <LightMenuRow label="Log In" icon="log-in-outline" onPress={() => router.push('/login')} />
        <LightMenuRow label="Sign Up" icon="person-add-outline" onPress={() => router.push('/signup')} />
        <LightMenuRow label="Book a Free Demo" icon="calendar-outline" onPress={() => router.push('/book-free-demo')} />
        <LightMenuRow label="Help & Support" icon="help-circle-outline" last onPress={() => {}} />
      </LightCard>
    </LightScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 4 },
});
