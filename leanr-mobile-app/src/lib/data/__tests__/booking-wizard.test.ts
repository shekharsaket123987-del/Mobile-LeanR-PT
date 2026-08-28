/**
 * Regression suite for booking-wizard.ts's pure IST/timezone and
 * reschedule-cutoff helpers — LEANR_PT_MOBILE_PRD.md §29 explicitly
 * calls for "timezone correctness tests... from devices set to non-IST
 * timezones" and a "business rule regression suite" for cutoff rules.
 * These functions are deliberately pure (no Supabase calls) so they can
 * be tested without a live backend or device.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { addIstDays, formatIstDateLabel, formatIstTimeLabel, isAfterRescheduleCutoff, istDateKey, todayIst } from '../booking-wizard';

describe('todayIst', () => {
  it('derives the IST calendar date from a UTC instant, not device-local time', () => {
    // 2026-01-01T20:00:00Z is already 2026-01-02 01:30 IST (UTC+5:30) —
    // the classic "past midnight in India, still yesterday in UTC" case
    // this whole module exists to get right.
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-01-01T20:00:00.000Z').getTime());
    expect(todayIst()).toEqual({ year: 2026, month: 1, day: 2 });
  });

  it('stays on the same IST day for a UTC instant just before the IST midnight rollover', () => {
    // 2026-01-01T18:29:00Z = 2026-01-01T23:59 IST — one minute before rollover.
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-01-01T18:29:00.000Z').getTime());
    expect(todayIst()).toEqual({ year: 2026, month: 1, day: 1 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});

describe('addIstDays', () => {
  it('rolls forward across a month boundary', () => {
    expect(addIstDays({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 1 });
  });

  it('rolls forward across a year boundary', () => {
    expect(addIstDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it('supports negative offsets (going backward)', () => {
    expect(addIstDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('is a no-op for +0 days', () => {
    const date = { year: 2026, month: 6, day: 15 };
    expect(addIstDays(date, 0)).toEqual(date);
  });
});

describe('istDateKey', () => {
  it('zero-pads month and day for single-digit values', () => {
    expect(istDateKey({ year: 2026, month: 3, day: 5 })).toBe('2026-03-05');
  });

  it('does not pad double-digit values', () => {
    expect(istDateKey({ year: 2026, month: 11, day: 23 })).toBe('2026-11-23');
  });
});

describe('formatIstDateLabel', () => {
  it('renders a short weekday, month, and day — deliberately in the runtime\'s default locale order (undefined locale), not a hardcoded one', () => {
    // 2026-08-18 is a Tuesday. Word order (e.g. "Tue, Aug 18" vs "Tue, 18
    // Aug") legitimately varies by environment locale since the function
    // intentionally passes `undefined` to respect device locale — assert
    // the pieces are present, not a specific order.
    const label = formatIstDateLabel({ year: 2026, month: 8, day: 18 });
    expect(label).toMatch(/Tue/);
    expect(label).toMatch(/Aug/);
    expect(label).toMatch(/18/);
  });
});

describe('formatIstTimeLabel', () => {
  it('renders a whole IST hour as 12-hour clock + AM/PM, independent of device timezone', () => {
    // 00:30 UTC = 06:00 IST.
    expect(formatIstTimeLabel('2026-08-18T00:30:00.000Z')).toBe('6:00 AM IST');
  });

  it('handles the IST noon/midnight 12-hour boundary correctly', () => {
    // 18:30 UTC = 00:00 IST (midnight, not "0 AM").
    expect(formatIstTimeLabel('2026-08-18T18:30:00.000Z')).toBe('12:00 AM IST');
    // 06:30 UTC = 12:00 IST (noon, not "0 PM").
    expect(formatIstTimeLabel('2026-08-18T06:30:00.000Z')).toBe('12:00 PM IST');
  });

  it('is unaffected by the test runner/device TZ environment variable', () => {
    const original = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(formatIstTimeLabel('2026-08-18T00:30:00.000Z')).toBe('6:00 AM IST');
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('isAfterRescheduleCutoff', () => {
  // §13 rule 6: reschedule requires >= cutoffHours before scheduled_start.
  // This mirrors exactly what the live reschedule_booking RPC checks
  // (see the function's own doc comment) — no forward-window/weekly-cap
  // logic is layered on client-side, by design.
  const cutoffHours = 1;

  it('rejects a slot inside the cutoff window', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const slotIn30Min = new Date(now + 30 * 60 * 1000).toISOString();
    expect(isAfterRescheduleCutoff(slotIn30Min, cutoffHours)).toBe(false);
  });

  it('allows a slot exactly at the cutoff boundary', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const slotAtCutoff = new Date(now + cutoffHours * 60 * 60 * 1000).toISOString();
    expect(isAfterRescheduleCutoff(slotAtCutoff, cutoffHours)).toBe(true);
  });

  it('allows a slot well beyond the cutoff window', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const slotTomorrow = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    expect(isAfterRescheduleCutoff(slotTomorrow, cutoffHours)).toBe(true);
  });

  it('rejects a slot already in the past', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const slotYesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    expect(isAfterRescheduleCutoff(slotYesterday, cutoffHours)).toBe(false);
  });

  it('respects a different configured cutoff (e.g. admin-editable system_settings value)', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const slotIn2Hours = new Date(now + 2 * 60 * 60 * 1000).toISOString();
    expect(isAfterRescheduleCutoff(slotIn2Hours, 1)).toBe(true);
    expect(isAfterRescheduleCutoff(slotIn2Hours, 3)).toBe(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
