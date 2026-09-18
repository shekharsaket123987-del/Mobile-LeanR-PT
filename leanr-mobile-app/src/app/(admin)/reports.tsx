/**
 * Reports (admin) — New PRD.md §4.C "Screen: Reports" — 5 fixed report
 * cards, each independently exportable. No server fetch on page load —
 * each export triggers its own generation on demand, same as web. Uses
 * React Native's built-in Share sheet (CSV text) instead of jsPDF/blob-
 * download, which are browser-only APIs with no mobile equivalent.
 */
import { useState } from 'react';
import { Share, StyleSheet, Text } from 'react-native';

import { GhostButton } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Brand } from '@/constants/theme';
import {
  generateCancellationReportCsv,
  generateClientReportCsv,
  generateCoachReportCsv,
  generateMonthlyPtReportCsv,
  generateRevenueReportCsv,
} from '@/lib/data/admin-reports';
import { getErrorMessage } from '@/lib/data/errors';

const REPORTS: { key: string; title: string; description: string; generate: () => Promise<string> }[] = [
  { key: 'client', title: 'Client Report', description: 'All clients — plan, coach, sessions remaining/total', generate: generateClientReportCsv },
  { key: 'coach', title: 'Coach Report', description: 'All coaches — rating, review count, utilization', generate: generateCoachReportCsv },
  { key: 'monthly_pt', title: 'Monthly PT Report', description: 'Sessions, completion rate & assessments by month', generate: generateMonthlyPtReportCsv },
  { key: 'revenue', title: 'Revenue Report', description: 'Revenue & completed sessions by month', generate: generateRevenueReportCsv },
  { key: 'cancellation', title: 'Cancellation / No-Show Report', description: 'Cancelled and missed sessions', generate: generateCancellationReportCsv },
];

export default function AdminReportsScreen() {
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onExport = async (key: string, title: string, generate: () => Promise<string>) => {
    setError(null);
    setExportingKey(key);
    try {
      const csv = await generate();
      await Share.share({ title, message: csv });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setExportingKey(null);
    }
  };

  return (
    <ScreenScaffold title="Reports">
      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {REPORTS.map((r) => (
        <GlassCard key={r.key} style={styles.card}>
          <Text style={styles.title}>{r.title}</Text>
          <Text style={styles.description}>{r.description}</Text>
          <GhostButton size="sm" loading={exportingKey === r.key} onPress={() => onExport(r.key, r.title, r.generate)} style={styles.exportButton}>
            Export CSV
          </GhostButton>
        </GlassCard>
      ))}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#FFFFFF' },
  description: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  exportButton: { marginTop: 6, alignSelf: 'flex-start' },
  errorText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: Brand.alertRed },
});
