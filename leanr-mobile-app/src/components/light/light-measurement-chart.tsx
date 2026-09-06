/**
 * LightMeasurementChart — simple SVG line/area chart for the Progress
 * screen's weight trend (mockup frame 13). No charting library exists in
 * this project (recharts is web-only, per New PRD.md §1) — built directly
 * on `react-native-svg`, already a dependency, matching the mockup's plain
 * line + dot-marker + month-label style rather than pulling in a new lib.
 */
import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { LightBrand } from '@/constants/light-theme';

export type ChartPoint = { label: string; value: number };

type Props = {
  points: ChartPoint[];
  height?: number;
};

const PADDING_X = 8;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 22;

export function LightMeasurementChart({ points, height = 140 }: Props) {
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length < 2 || width === 0) {
    return <View style={[styles.wrap, { height }]} onLayout={onLayout} />;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const plotWidth = width - PADDING_X * 2;
  const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;

  const coords = points.map((p, i) => ({
    x: PADDING_X + (plotWidth * i) / (points.length - 1),
    y: PADDING_TOP + plotHeight * (1 - (p.value - min) / span),
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');

  return (
    <View style={[styles.wrap, { height }]} onLayout={onLayout}>
      <Svg width={width} height={height}>
        <Line
          x1={PADDING_X}
          y1={PADDING_TOP + plotHeight}
          x2={width - PADDING_X}
          y2={PADDING_TOP + plotHeight}
          stroke={LightBrand.border}
          strokeWidth={1}
        />
        <Path d={linePath} stroke={LightBrand.teal} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={4} fill={LightBrand.teal} stroke="#FFFFFF" strokeWidth={1.5} />
        ))}
      </Svg>
      <View style={styles.labelRow}>
        {points.map((p, i) => (
          <Text key={i} style={styles.label} numberOfLines={1}>
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -18, paddingHorizontal: 4 },
  label: { fontFamily: 'Manrope_500Medium', fontSize: 10.5, color: LightBrand.textMuted },
});
