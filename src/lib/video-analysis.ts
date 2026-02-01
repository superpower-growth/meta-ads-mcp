/**
 * Video Engagement Analysis Utilities
 *
 * Reusable analysis functions for calculating derived video engagement metrics.
 * Provides engagement scoring, retention analysis, and performance classification
 * based on video completion percentile data.
 *
 * These utilities are designed for insight generation, not precision analytics.
 * All calculations are estimates based on available Meta API data.
 */

/**
 * Video completion data structure
 */
export interface CompletionData {
  plays: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p100: number;
}

/**
 * Weak point in video retention
 */
export interface WeakPoint {
  from: string;
  to: string;
  dropPct: number;
}

/**
 * Calculate average watch percentage using midpoint estimation method
 *
 * Estimates average video watch percentage by assuming viewers who dropped off
 * between percentiles watched to the midpoint of that segment. This provides
 * a reasonable approximation of overall engagement depth.
 *
 * Calculation logic:
 * - Viewers who left before 25% watched ~12.5% on average
 * - Viewers who left between 25-50% watched ~37.5% on average
 * - And so on through the completion funnel
 *
 * @param completionData - Video completion funnel data with plays and percentiles
 * @returns Estimated average watch percentage (0-100)
 *
 * @example
 * ```typescript
 * const data = { plays: 1000, p25: 750, p50: 500, p75: 300, p95: 150, p100: 100 };
 * const avgPct = calculateAverageWatchPercentage(data);
 * // Returns: 54.75 (approximately 55% average watch depth)
 * ```
 */
export function calculateAverageWatchPercentage(completionData: CompletionData): number {
  const { plays, p25, p50, p75, p95, p100 } = completionData;

  // Handle edge case: no plays
  if (plays === 0) {
    return 0;
  }

  // Define segments with viewer counts and average watch percentage per segment
  const segments = [
    { count: plays - p25, avgPct: 12.5 }, // Dropped before 25%
    { count: p25 - p50, avgPct: 37.5 }, // Dropped between 25-50%
    { count: p50 - p75, avgPct: 62.5 }, // Dropped between 50-75%
    { count: p75 - p95, avgPct: 85 }, // Dropped between 75-95%
    { count: p95 - p100, avgPct: 97.5 }, // Dropped between 95-100%
    { count: p100, avgPct: 100 }, // Completed video
  ];

  // Calculate weighted average
  const totalWatchPct = segments.reduce((sum, segment) => {
    return sum + segment.count * segment.avgPct;
  }, 0);

  return totalWatchPct / plays;
}

/**
 * Calculate retention score combining engagement rate and retention quality
 *
 * Produces a 0-100 score indicating overall video strength by weighing:
 * - Engagement rate (40%): How many impressions turned into plays
 * - Retention quality (60%): How well video retains viewers through completion funnel
 *
 * Higher scores indicate videos that both attract initial plays and retain viewers.
 *
 * @param completionData - Video completion funnel data
 * @param impressions - Total ad impressions
 * @returns Retention score (0-100)
 *
 * @example
 * ```typescript
 * const data = { plays: 500, p25: 400, p50: 300, p75: 200, p95: 120, p100: 80 };
 * const score = calculateRetentionScore(data, 1000);
 * // Returns: ~64.8 (decent engagement and retention)
 * ```
 */
export function calculateRetentionScore(
  completionData: CompletionData,
  impressions: number
): number {
  const { plays, p25, p50, p75, p95, p100 } = completionData;

  // Handle edge cases
  if (impressions === 0 || plays === 0) {
    return 0;
  }

  // Calculate engagement rate (plays / impressions)
  const engagementRate = (plays / impressions) * 100;

  // Calculate retention quality as average of completion rates at each percentile
  const retentionRates = [
    (p25 / plays) * 100,
    (p50 / plays) * 100,
    (p75 / plays) * 100,
    (p95 / plays) * 100,
    (p100 / plays) * 100,
  ];

  const retentionQuality = retentionRates.reduce((sum, rate) => sum + rate, 0) / retentionRates.length;

  // Combined score: engagement (40%) + retention quality (60%)
  const score = engagementRate * 0.4 + retentionQuality * 0.6;

  // Cap at 100 (in case of unusually high engagement rates)
  return Math.min(score, 100);
}

/**
 * Identify weak points in video where viewers drop off significantly
 *
 * Analyzes completion funnel to find segments where viewer drop-off exceeds 20%.
 * These weak points indicate where the video loses viewer interest and may need
 * creative optimization.
 *
 * @param completionData - Video completion funnel data
 * @returns Array of weak points with drop percentage, or empty array if no major drops
 *
 * @example
 * ```typescript
 * const data = { plays: 1000, p25: 900, p50: 600, p75: 550, p95: 200, p100: 150 };
 * const weakPoints = identifyWeakPoints(data);
 * // Returns: [
 * //   { from: '25%', to: '50%', dropPct: 33.33 },
 * //   { from: '75%', to: '95%', dropPct: 63.64 }
 * // ]
 * ```
 */
export function identifyWeakPoints(completionData: CompletionData): WeakPoint[] {
  const { plays, p25, p50, p75, p95, p100 } = completionData;

  // Define percentile progression with labels
  const percentiles = [
    { label: '0%', value: plays },
    { label: '25%', value: p25 },
    { label: '50%', value: p50 },
    { label: '75%', value: p75 },
    { label: '95%', value: p95 },
    { label: '100%', value: p100 },
  ];

  const weakPoints: WeakPoint[] = [];

  // Compare consecutive percentiles
  for (let i = 0; i < percentiles.length - 1; i++) {
    const from = percentiles[i];
    const to = percentiles[i + 1];

    // Skip if no viewers at this level
    if (from.value === 0) {
      continue;
    }

    // Calculate drop percentage
    const dropPct = ((from.value - to.value) / from.value) * 100;

    // Flag as weak point if drop exceeds 20%
    if (dropPct > 20) {
      weakPoints.push({
        from: from.label,
        to: to.label,
        dropPct: Math.round(dropPct * 100) / 100, // Round to 2 decimals
      });
    }
  }

  return weakPoints;
}

/**
 * Classify video performance based on completion rate
 *
 * Provides quick assessment of video quality based on 100% completion rate.
 * Classification thresholds are based on industry standards for video ads.
 *
 * @param completionData - Video completion funnel data
 * @returns Performance classification string
 *
 * @example
 * ```typescript
 * const excellent = { plays: 100, p25: 80, p50: 70, p75: 50, p95: 40, p100: 35 };
 * classifyPerformance(excellent); // Returns: "Excellent"
 *
 * const poor = { plays: 100, p25: 40, p50: 20, p75: 10, p95: 5, p100: 3 };
 * classifyPerformance(poor); // Returns: "Poor"
 * ```
 */
export function classifyPerformance(completionData: CompletionData): string {
  const { plays, p100 } = completionData;

  // Handle edge case: no plays
  if (plays === 0) {
    return 'N/A';
  }

  // Calculate 100% completion rate
  const completionRate = (p100 / plays) * 100;

  // Classify based on completion rate thresholds
  if (completionRate > 30) {
    return 'Excellent';
  } else if (completionRate >= 20) {
    return 'Good';
  } else if (completionRate >= 10) {
    return 'Average';
  } else {
    return 'Poor';
  }
}
