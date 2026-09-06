/**
 * LightCalendarGrid — month-view date picker matching the mockup's
 * calendar (Book a Demo, Activate Plan, Book a Session, Reschedule all
 * show a real month grid, not a chip row). Operates on the app's existing
 * IST-safe `IstDate` (src/lib/data/booking-wizard.ts) rather than device
 * `Date`, so it drops into the same call sites without a timezone
 * regression. Sunday-first columns (matches Postgres `extract(dow ...)`,
 * which `istDayOfWeek` mirrors).
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LightBrand, LightRadius } from '@/constants/light-theme';
import { istDateKey, istDayOfWeek, type IstDate } from '@/lib/data/booking-wizard';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(year: number, month: number): number {
  // Date.UTC(year, month, 0) is the last day of `month` (1-indexed) — a
  // standard JS-Date trick, still IST-agnostic since only day-count matters.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function compareIstDate(a: IstDate, b: IstDate): number {
  return istDateKey(a).localeCompare(istDateKey(b));
}

type Props = {
  selected: IstDate | null;
  onSelect: (date: IstDate) => void;
  minDate?: IstDate;
  maxDate?: IstDate;
  initialMonth?: IstDate;
};

export function LightCalendarGrid({ selected, onSelect, minDate, maxDate, initialMonth }: Props) {
  const anchor = selected ?? initialMonth ?? minDate;
  const [viewYear, setViewYear] = useState<number>(anchor?.year ?? new Date().getUTCFullYear());
  const [viewMonth, setViewMonth] = useState<number>(anchor?.month ?? new Date().getUTCMonth() + 1);

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear(viewYear - 1);
      setViewMonth(12);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };
  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear(viewYear + 1);
      setViewMonth(1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const firstOfMonth: IstDate = { year: viewYear, month: viewMonth, day: 1 };
  const leadingBlanks = istDayOfWeek(firstOfMonth);
  const totalDays = daysInMonth(viewYear, viewMonth);

  const cells: (IstDate | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => ({ year: viewYear, month: viewMonth, day: i + 1 })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const canGoPrev = !minDate || viewYear > minDate.year || (viewYear === minDate.year && viewMonth > minDate.month);
  const canGoNext = !maxDate || viewYear < maxDate.year || (viewYear === maxDate.year && viewMonth < maxDate.month);

  return (
    <View>
      <View style={styles.header}>
        <Pressable
          onPress={goPrevMonth}
          disabled={!canGoPrev}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={[styles.navButton, !canGoPrev && styles.navButtonDisabled]}>
          <Ionicons name="chevron-back" size={18} color={LightBrand.navy} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTH_LABELS[viewMonth - 1]} {viewYear}
        </Text>
        <Pressable
          onPress={goNextMonth}
          disabled={!canGoNext}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={[styles.navButton, !canGoNext && styles.navButtonDisabled]}>
          <Ionicons name="chevron-forward" size={18} color={LightBrand.navy} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w) => (
          <Text key={w} style={styles.weekdayLabel}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((date, i) => {
          if (!date) return <View key={i} style={styles.cell} />;
          const disabled = (!!minDate && compareIstDate(date, minDate) < 0) || (!!maxDate && compareIstDate(date, maxDate) > 0);
          const isSelected = !!selected && istDateKey(date) === istDateKey(selected);
          return (
            <View key={i} style={styles.cell}>
              <Pressable
                onPress={disabled ? undefined : () => onSelect(date)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={istDateKey(date)}
                accessibilityState={{ selected: isSelected, disabled }}
                style={[styles.dayButton, isSelected && styles.dayButtonSelected]}>
                <Text style={[styles.dayText, isSelected && styles.dayTextSelected, disabled && styles.dayTextDisabled]}>
                  {date.day}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const CELL_SIZE = 40;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: LightRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LightBrand.bg,
  },
  navButtonDisabled: { opacity: 0.3 },
  monthLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: LightBrand.navy },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11.5,
    color: LightBrand.textMuted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center' },
  dayButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayButtonSelected: { backgroundColor: LightBrand.teal },
  dayText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: LightBrand.textPrimary },
  dayTextSelected: { color: '#FFFFFF' },
  dayTextDisabled: { color: LightBrand.textMuted, opacity: 0.5 },
});
