/**
 * Regression suite for computeAverageRating — LEANR_PT_MOBILE_PRD.md
 * §13 rule 21 ("recomputed live... not a stored/incrementally-maintained
 * field"). Extracted from getMyPerformance for unit testing without a
 * Supabase round-trip.
 */
import { describe, expect, it } from '@jest/globals';

import { computeAverageRating } from '../coach-performance';

describe('computeAverageRating', () => {
  it('returns null when there are no ratings (no null/0 average conflated with "no data")', () => {
    expect(computeAverageRating([])).toBeNull();
  });

  it('returns the value itself for a single rating', () => {
    expect(computeAverageRating([4])).toBe(4);
  });

  it('averages multiple ratings', () => {
    expect(computeAverageRating([5, 4, 3])).toBe(4);
  });

  it('is not thrown off by a non-integer average', () => {
    expect(computeAverageRating([5, 4])).toBe(4.5);
  });
});
