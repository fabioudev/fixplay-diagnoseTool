import { describe, it, expect } from 'vitest';
import { calculateCircularityError, CIRCULARITY_DATA_SIZE } from './stick-renderer';

describe('calculateCircularityError', () => {
  it('is 0 for a perfect unit circle (all radii = 1.0)', () => {
    const data = new Array(CIRCULARITY_DATA_SIZE).fill(1.0);
    expect(calculateCircularityError(data)).toBe(0);
  });

  it('is 0 when no samples exceed the 0.2 validity threshold', () => {
    // Below-threshold samples are treated as "no reading" and skipped, so an
    // all-zero sweep (stick never moved) reports 0 rather than a misleading 100.
    expect(calculateCircularityError(new Array(48).fill(0))).toBe(0);
    expect(calculateCircularityError(new Array(48).fill(0.19))).toBe(0);
    expect(calculateCircularityError([])).toBe(0);
  });

  it('reports the RMS deviation from the unit circle as a percentage', () => {
    // Every sample at radius 0.3 (above the 0.2 threshold) deviates from the
    // ideal 1.0 by 0.7 → RMS deviation 0.7 → *100 = 70.
    const data = new Array(48).fill(0.3);
    expect(calculateCircularityError(data)).toBeCloseTo(70, 5);
  });

  it('reaches 100 when every sample deviates from 1.0 by exactly 1.0', () => {
    // radius 2.0 → |2.0 - 1.0| = 1.0 → RMS 1.0 → 100 (the worst case the
    // formula can produce without going higher).
    const data = new Array(48).fill(2.0);
    expect(calculateCircularityError(data)).toBeCloseTo(100, 5);
  });

  it('grows as the sweep deviates further from the unit circle', () => {
    const perfect = new Array(48).fill(1.0);
    const slight = new Array(48).fill(0.9);
    const heavy = new Array(48).fill(0.5);
    expect(calculateCircularityError(perfect)).toBeLessThan(calculateCircularityError(slight));
    expect(calculateCircularityError(slight)).toBeLessThan(calculateCircularityError(heavy));
  });

  it('ignores sub-threshold samples in the average but counts valid ones', () => {
    // 24 samples at 1.0 (perfect) + 24 at 0.0 (skipped) → only the perfect half
    // counts → error still 0.
    const half = [...new Array(24).fill(1.0), ...new Array(24).fill(0.0)];
    expect(calculateCircularityError(half)).toBe(0);
  });
});

describe('CIRCULARITY_DATA_SIZE', () => {
  it('is 48 (one radius sample per 7.5° around the gate)', () => {
    expect(CIRCULARITY_DATA_SIZE).toBe(48);
  });
});
