/** Shared testimonials content — used by both (marketing)/reviews.tsx and (client)/reviews.tsx (pre-purchase branch). */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { LightAvatar } from '@/components/light/light-avatar';
import { LightCard } from '@/components/light/light-card';
import { LightBrand } from '@/constants/light-theme';

const TESTIMONIALS = [
  { name: 'Ananya P.', quote: 'Lost 8kg in 3 months with a plan that actually fit my schedule. My coach kept me honest every week.', stars: 5 },
  { name: 'Rohan M.', quote: "Live sessions made all the difference — it's not a pre-recorded video, someone's actually watching your form.", stars: 5 },
  { name: 'Priya S.', quote: 'Switched coaches once and the transition was seamless. Support team was on top of it.', stars: 4 },
  { name: 'Karan V.', quote: 'The progress tracking keeps me accountable in a way no app-only program ever did.', stars: 5 },
];

export function LightTestimonialsList() {
  return (
    <>
      {TESTIMONIALS.map((t) => (
        <LightCard key={t.name} style={styles.card}>
          <View style={styles.headerRow}>
            <LightAvatar name={t.name} size={40} />
            <View style={styles.headerText}>
              <Text style={styles.name}>{t.name}</Text>
              <View style={styles.starsRow}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Ionicons key={i} name={i < t.stars ? 'star' : 'star-outline'} size={13} color={LightBrand.amber} />
                ))}
              </View>
            </View>
          </View>
          <Text style={styles.quote}>&ldquo;{t.quote}&rdquo;</Text>
        </LightCard>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { gap: 3 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: LightBrand.textPrimary },
  starsRow: { flexDirection: 'row', gap: 2 },
  quote: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: LightBrand.textSecondary, lineHeight: 20, fontStyle: 'italic' },
});
