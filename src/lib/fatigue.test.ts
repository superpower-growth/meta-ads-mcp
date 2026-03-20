/**
 * Tests for Creative Fatigue Scoring Algorithm
 */

import { describe, it, expect } from 'vitest';
import { calculateFatigueScore, type DailyMetrics } from './fatigue.js';

function makeDailyMetrics(overrides: Partial<DailyMetrics>[] = []): DailyMetrics[] {
  return overrides.map((o, i) => ({
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    impressions: 1000,
    reach: 500,
    frequency: 2.0,
    clicks: 50,
    spend: 10,
    ctr: 5.0,
    cpc: 0.2,
    ...o,
  }));
}

describe('calculateFatigueScore', () => {
  it('returns zero for empty metrics', () => {
    const result = calculateFatigueScore([]);
    expect(result.fatigueScore).toBe(0);
    expect(result.recommendation).toBe('healthy');
  });

  it('returns zero for single day (not enough data)', () => {
    const result = calculateFatigueScore(makeDailyMetrics([{}]));
    expect(result.fatigueScore).toBe(0);
    expect(result.recommendation).toBe('healthy');
  });

  it('returns healthy for stable low-frequency, stable CTR', () => {
    // 14 days of stable frequency=2, CTR=5%
    const metrics = makeDailyMetrics(
      Array.from({ length: 14 }, () => ({ frequency: 2.0, ctr: 5.0 }))
    );
    const result = calculateFatigueScore(metrics);
    expect(result.fatigueScore).toBeLessThan(25);
    expect(result.recommendation).toBe('healthy');
    expect(result.frequencyTrend.change).toBeCloseTo(0, 1);
    expect(result.ctrTrend.changePercent).toBeCloseTo(0, 1);
  });

  it('detects fatigue when frequency rises and CTR drops', () => {
    // First 10 days: frequency=2, CTR=5%
    // Last 4 days: frequency=7, CTR=2%
    const metrics = makeDailyMetrics([
      ...Array.from({ length: 10 }, () => ({ frequency: 2.0, ctr: 5.0 })),
      { frequency: 6.0, ctr: 2.5 },
      { frequency: 7.0, ctr: 2.0 },
      { frequency: 7.0, ctr: 2.0 },
      { frequency: 7.5, ctr: 1.8 },
    ]);
    const result = calculateFatigueScore(metrics);
    expect(result.fatigueScore).toBeGreaterThan(40);
    expect(result.frequencyTrend.current).toBeGreaterThan(result.frequencyTrend.sevenDaysAgo);
    expect(result.ctrTrend.changePercent).toBeLessThan(0);
    expect(['rotate', 'critical']).toContain(result.recommendation);
  });

  it('flags critical when frequency is very high and CTR has crashed', () => {
    const metrics = makeDailyMetrics([
      ...Array.from({ length: 10 }, () => ({ frequency: 3.0, ctr: 4.0 })),
      { frequency: 9.0, ctr: 1.0 },
      { frequency: 10.0, ctr: 0.8 },
      { frequency: 10.5, ctr: 0.7 },
      { frequency: 11.0, ctr: 0.5 },
    ]);
    const result = calculateFatigueScore(metrics);
    expect(result.fatigueScore).toBeGreaterThan(60);
    expect(['rotate', 'critical']).toContain(result.recommendation);
  });

  it('reports monitor when frequency rising but CTR stable', () => {
    const metrics = makeDailyMetrics([
      ...Array.from({ length: 10 }, () => ({ frequency: 2.0, ctr: 4.0 })),
      { frequency: 4.0, ctr: 3.8 },
      { frequency: 4.5, ctr: 3.9 },
      { frequency: 5.0, ctr: 4.0 },
    ]);
    const result = calculateFatigueScore(metrics);
    expect(result.fatigueScore).toBeGreaterThanOrEqual(15);
    expect(result.fatigueScore).toBeLessThan(60);
  });

  it('handles frequencyTrend correctly with short data', () => {
    const metrics = makeDailyMetrics([
      { frequency: 2.0, ctr: 5.0 },
      { frequency: 3.0, ctr: 4.0 },
      { frequency: 4.0, ctr: 3.0 },
    ]);
    const result = calculateFatigueScore(metrics);
    // Should not crash and should return valid result
    expect(result.fatigueScore).toBeGreaterThanOrEqual(0);
    expect(result.fatigueScore).toBeLessThanOrEqual(100);
    expect(result.frequencyTrend.current).toBeGreaterThan(0);
  });

  it('score never exceeds 100', () => {
    // Extreme values
    const metrics = makeDailyMetrics([
      ...Array.from({ length: 10 }, () => ({ frequency: 1.0, ctr: 10.0 })),
      { frequency: 20.0, ctr: 0.1 },
      { frequency: 25.0, ctr: 0.05 },
      { frequency: 30.0, ctr: 0.01 },
    ]);
    const result = calculateFatigueScore(metrics);
    expect(result.fatigueScore).toBeLessThanOrEqual(100);
  });
});
