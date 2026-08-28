/**
 * Regression suite for the streak/milestone pure arithmetic —
 * LEANR_PT_NEXTGEN_APP_PRD.md §8. `computeWeekStreak` reads `new Date()`
 * internally (not injectable), so these tests use Jest fake timers to
 * pin "now" rather than mocking `Date.now` (which `new Date()` doesn't
 * go through).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { computeWeekStreak, milestoneHitAt, MILESTONES } from '../milestones';
import type { Booking } from '../types';

function completedAt(iso: string): Booking {
  return { scheduled_start: iso, status: 'completed' } as Booking;
}

function setNow(iso: string) {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(iso));
}

describe('computeWeekStreak', () => {
  beforeEach(() => setNow('2026-08-27T12:00:00.000Z')); // a Thursday
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns 0 when there are no completed bookings', () => {
    expect(computeWeekStreak([])).toBe(0);
  });

  it('counts 1 for a single session in the current week', () => {
    expect(computeWeekStreak([completedAt('2026-08-25T10:00:00.000Z')])).toBe(1);
  });

  it('counts consecutive weeks with at least one session each', () => {
    const bookings = [
      completedAt('2026-08-25T10:00:00.000Z'), // this week (Mon Aug 24 - Sun Aug 30)
      completedAt('2026-08-18T10:00:00.000Z'), // last week
      completedAt('2026-08-11T10:00:00.000Z'), // two weeks ago
    ];
    expect(computeWeekStreak(bookings)).toBe(3);
  });

  it('breaks the streak at the first gap week, counting back from now', () => {
    const bookings = [
      completedAt('2026-08-25T10:00:00.000Z'), // this week
      // gap: no session the week of Aug 17
      completedAt('2026-08-11T10:00:00.000Z'), // two weeks ago — should not count
    ];
    expect(computeWeekStreak(bookings)).toBe(1);
  });

  it('does not count multiple sessions in the same week as multiple streak weeks', () => {
    const bookings = [completedAt('2026-08-24T10:00:00.000Z'), completedAt('2026-08-26T10:00:00.000Z')];
    expect(computeWeekStreak(bookings)).toBe(1);
  });

  it('is 0 when the most recent session was not this week', () => {
    expect(computeWeekStreak([completedAt('2026-08-11T10:00:00.000Z')])).toBe(0);
  });
});

describe('milestoneHitAt', () => {
  it('returns the milestone when the count matches exactly', () => {
    for (const m of MILESTONES) {
      expect(milestoneHitAt(m)).toBe(m);
    }
  });

  it('returns null for a count between milestones', () => {
    expect(milestoneHitAt(11)).toBeNull();
    expect(milestoneHitAt(49)).toBeNull();
  });

  it('returns null for 0 and for counts past the highest milestone', () => {
    expect(milestoneHitAt(0)).toBeNull();
    expect(milestoneHitAt(101)).toBeNull();
  });
});
