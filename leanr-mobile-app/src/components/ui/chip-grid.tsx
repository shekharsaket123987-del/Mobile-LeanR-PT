/** ChipGrid — the wrap-row layout every Chip picker (date/time/day) reuses. */
import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

export function ChipGrid({ children }: PropsWithChildren) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
