/**
 * Regression suite for the pure hour-matching core of recurring-schedule
 * setup — LEANR_PT_MOBILE_PRD.md §13 rules 18-19, §29 "business rule
 * regression suite". `computeCommonHours` deliberately only ever looks
 * at `coach_availability` rows (never `coach_leave`) — rule 19's
 * "leave-agnostic collision check" is honored by construction, and this
 * suite locks that in.
 */
import { describe, expect, it } from '@jest/globals';

import { computeCommonHours } from '../recurring-schedule';

const window = { startHour: 5, endHour: 22 };

describe('computeCommonHours', () => {
  it('returns an empty array when no days are selected', () => {
    expect(computeCommonHours([{ day_of_week: 1, start_time: '05:00:00', end_time: '21:00:00' }], [], 60, window)).toEqual([]);
  });

  it('finds an hour that works across every selected day (Mon/Wed/Fri preset)', () => {
    const rows = [
      { day_of_week: 1, start_time: '06:00:00', end_time: '20:00:00' },
      { day_of_week: 3, start_time: '06:00:00', end_time: '20:00:00' },
      { day_of_week: 5, start_time: '06:00:00', end_time: '20:00:00' },
    ];
    const hours = computeCommonHours(rows, [1, 3, 5], 60, window);
    expect(hours).toEqual(expect.arrayContaining([6, 7, 8, 19]));
    expect(hours).not.toContain(5); // window starts at 5 but coach's own template starts at 6
    expect(hours).not.toContain(20); // a 60-min session at 20:00 would end at 21:00, past the 20:00 template end
  });

  it('excludes an hour when even one selected day has no overlapping template row', () => {
    const rows = [
      { day_of_week: 1, start_time: '06:00:00', end_time: '20:00:00' },
      { day_of_week: 3, start_time: '06:00:00', end_time: '20:00:00' },
      // day_of_week 5 (Friday) has no row at all -> no hour can work for all three days.
    ];
    expect(computeCommonHours(rows, [1, 3, 5], 60, window)).toEqual([]);
  });

  it('respects session duration when checking the window end boundary', () => {
    const rows = [{ day_of_week: 1, start_time: '05:00:00', end_time: '10:00:00' }];
    // A 90-minute session starting at 9:00 would need to end by 10:30 — the
    // template only covers until 10:00, so 9:00 must be excluded, but 8:00 (ends 9:30) is fine.
    const hours = computeCommonHours(rows, [1], 90, { startHour: 5, endHour: 10 });
    expect(hours).toContain(8);
    expect(hours).not.toContain(9);
  });

  it('does not merge two disjoint availability windows on the same day into a false positive', () => {
    // Two separate rows for the same day (e.g. a coach with a lunch gap) —
    // an hour must fit entirely inside ONE row, not span the gap between them.
    const rows = [
      { day_of_week: 1, start_time: '05:00:00', end_time: '10:00:00' },
      { day_of_week: 1, start_time: '14:00:00', end_time: '20:00:00' },
    ];
    const hours = computeCommonHours(rows, [1], 60, { startHour: 5, endHour: 20 });
    expect(hours).not.toContain(10); // 10:00-11:00 falls in the gap between the two rows
    expect(hours).not.toContain(11);
    expect(hours).not.toContain(13); // 13:00-14:00 also falls in the gap
    expect(hours).toContain(9); // fully inside the morning row
    expect(hours).toContain(14); // fully inside the afternoon row
  });

  it('is unaffected by rows for coaches/days outside the requested set (no cross-contamination)', () => {
    const rows = [
      { day_of_week: 1, start_time: '06:00:00', end_time: '20:00:00' },
      { day_of_week: 2, start_time: '06:00:00', end_time: '20:00:00' }, // Tuesday not requested — must be ignored
    ];
    const hours = computeCommonHours(rows, [1], 60, window);
    expect(hours).toEqual(expect.arrayContaining([6, 19]));
  });
});
