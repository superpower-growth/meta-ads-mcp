/**
 * Comparison Utility Functions
 *
 * Utilities for comparing metrics between two time periods.
 * Supports delta calculation, change classification, and formatting.
 *
 * Use cases:
 * - Week-over-week performance analysis
 * - Campaign comparison
 * - Anomaly detection
 * - Trend identification
 */

/**
 * Direction of metric change
 */
export type ChangeDirection = 'up' | 'down' | 'unchanged';

/**
 * Classification of change significance
 */
export type ChangeClassification =
  | 'significant improvement'
  | 'minor improvement'
  | 'unchanged'
  | 'minor decline'
  | 'significant decline';

/**
 * Metric type for classification logic
 */
export type MetricType = 'higher-is-better' | 'lower-is-better' | 'neutral';

/**
 * Delta calculation result
 */
export interface Delta {
  absolute: number;
  percent: number;
  direction: ChangeDirection;
}

/**
 * Comparison result for a single metric
 */
export interface MetricComparison {
  metricName: string;
  current: number;
  previous: number;
  delta: Delta;
  classification: ChangeClassification;
}

/**
 * Calculate delta between current and previous values
 *
 * Computes absolute delta and percent change, handling edge cases
 * like zero values and infinity scenarios.
 *
 * @param current - Current period value
 * @param previous - Previous period value
 * @param metricName - Name of metric being compared (for context)
 * @returns Delta object with absolute, percent, and direction
 *
 * @example
 * ```typescript
 * const delta = calculateDelta(150, 100, 'impressions');
 * // Returns: { absolute: 50, percent: 50, direction: 'up' }
 * ```
 *
 * @example Edge case - previous is zero:
 * ```typescript
 * const delta = calculateDelta(100, 0, 'clicks');
 * // Returns: { absolute: 100, percent: Infinity, direction: 'up' }
 * ```
 *
 * @example Edge case - both zero:
 * ```typescript
 * const delta = calculateDelta(0, 0, 'conversions');
 * // Returns: { absolute: 0, percent: 0, direction: 'unchanged' }
 * ```
 */
export function calculateDelta(
  current: number,
  previous: number,
  metricName: string
): Delta {
  const absolute = current - previous;

  // Handle edge cases for percent calculation
  let percent: number;
  if (previous === 0 && current === 0) {
    // Both zero - no change
    percent = 0;
  } else if (previous === 0 && current > 0) {
    // Previous zero, current positive - infinite growth
    percent = Infinity;
  } else if (previous === 0 && current < 0) {
    // Previous zero, current negative - infinite decline
    percent = -Infinity;
  } else {
    // Normal calculation
    percent = ((current - previous) / previous) * 100;
  }

  // Determine direction
  let direction: ChangeDirection;
  if (absolute > 0) {
    direction = 'up';
  } else if (absolute < 0) {
    direction = 'down';
  } else {
    direction = 'unchanged';
  }

  return { absolute, percent, direction };
}

/**
 * Classify change significance based on metric type
 *
 * Different metrics have different "better" directions:
 * - Higher is better: CTR, ROAS, completions, engagement
 * - Lower is better: CPC, CPM
 * - Neutral: impressions, spend (just report direction)
 *
 * Thresholds:
 * - Significant: >10% change
 * - Minor: 5-10% change
 * - Unchanged: -5% to 5% change
 *
 * @param percentChange - Percent change value (can be Infinity)
 * @param metricType - Type of metric for classification logic
 * @returns Classification string
 *
 * @example
 * ```typescript
 * const classification = classifyChange(15, 'higher-is-better');
 * // Returns: 'significant improvement'
 * ```
 *
 * @example Lower is better metric:
 * ```typescript
 * const classification = classifyChange(-12, 'lower-is-better');
 * // Returns: 'significant improvement' (cost decreased)
 * ```
 */
export function classifyChange(
  percentChange: number,
  metricType: MetricType
): ChangeClassification {
  // Handle infinity cases
  if (percentChange === Infinity) {
    return metricType === 'lower-is-better'
      ? 'significant decline'
      : 'significant improvement';
  }
  if (percentChange === -Infinity) {
    return metricType === 'lower-is-better'
      ? 'significant improvement'
      : 'significant decline';
  }

  // For neutral metrics, just report magnitude without judgment
  if (metricType === 'neutral') {
    const absChange = Math.abs(percentChange);
    if (absChange >= 10) {
      return percentChange > 0 ? 'significant improvement' : 'significant decline';
    } else if (absChange >= 5) {
      return percentChange > 0 ? 'minor improvement' : 'minor decline';
    } else {
      return 'unchanged';
    }
  }

  // For "higher is better" metrics
  if (metricType === 'higher-is-better') {
    if (percentChange >= 10) return 'significant improvement';
    if (percentChange >= 5) return 'minor improvement';
    if (percentChange <= -10) return 'significant decline';
    if (percentChange <= -5) return 'minor decline';
    return 'unchanged';
  }

  // For "lower is better" metrics (invert logic)
  if (metricType === 'lower-is-better') {
    if (percentChange <= -10) return 'significant improvement';
    if (percentChange <= -5) return 'minor improvement';
    if (percentChange >= 10) return 'significant decline';
    if (percentChange >= 5) return 'minor decline';
    return 'unchanged';
  }

  return 'unchanged';
}

/**
 * Get metric type for classification
 *
 * Maps metric names to their type for proper classification logic.
 *
 * @param metricName - Name of the metric
 * @returns Metric type
 */
export function getMetricType(metricName: string): MetricType {
  const lowerName = metricName.toLowerCase();

  // Higher is better
  const higherIsBetter = [
    'ctr',
    'roas',
    'purchase_roas',
    'completion_rate',
    'engagement_rate',
    'retention_score',
    'clicks',
  ];
  if (higherIsBetter.some((m) => lowerName.includes(m))) {
    return 'higher-is-better';
  }

  // Lower is better
  const lowerIsBetter = ['cpc', 'cpm', 'cpp', 'cost_per'];
  if (lowerIsBetter.some((m) => lowerName.includes(m))) {
    return 'lower-is-better';
  }

  // Neutral (impressions, spend, reach, frequency)
  return 'neutral';
}

/**
 * Compare two metric sets
 *
 * Accepts two metric objects and calculates deltas for all common metrics.
 * Returns array of comparisons sorted by absolute percent change (largest first).
 *
 * @param currentMetrics - Metrics from current period
 * @param previousMetrics - Metrics from previous period
 * @returns Array of metric comparisons sorted by magnitude of change
 *
 * @example
 * ```typescript
 * const current = { impressions: 12500, clicks: 342, ctr: 2.74, spend: 145.67 };
 * const previous = { impressions: 10800, clicks: 298, ctr: 2.76, spend: 132.40 };
 * const comparisons = compareMetricSets(current, previous);
 * // Returns array with 4 comparisons, sorted by percent change magnitude
 * ```
 */
export function compareMetricSets(
  currentMetrics: Record<string, number>,
  previousMetrics: Record<string, number>
): MetricComparison[] {
  const comparisons: MetricComparison[] = [];

  // Get all common metric names
  const currentKeys = Object.keys(currentMetrics);
  const previousKeys = Object.keys(previousMetrics);
  const commonKeys = currentKeys.filter((key) => previousKeys.includes(key));

  // Calculate deltas for all common metrics
  for (const metricName of commonKeys) {
    const current = currentMetrics[metricName];
    const previous = previousMetrics[metricName];

    const delta = calculateDelta(current, previous, metricName);
    const metricType = getMetricType(metricName);
    const classification = classifyChange(delta.percent, metricType);

    comparisons.push({
      metricName,
      current,
      previous,
      delta,
      classification,
    });
  }

  // Sort by absolute percent change (largest changes first)
  comparisons.sort((a, b) => {
    const absA = Math.abs(a.delta.percent === Infinity ? 999999 : a.delta.percent);
    const absB = Math.abs(b.delta.percent === Infinity ? 999999 : b.delta.percent);
    return absB - absA;
  });

  return comparisons;
}

/**
 * Format percent change with sign
 *
 * Formats percent change as string with sign prefix and proper handling
 * of edge cases like infinity and very small changes.
 *
 * @param percentChange - Percent change value
 * @returns Formatted string with sign
 *
 * @example
 * ```typescript
 * formatPercentChange(15.3);  // "+15.3%"
 * formatPercentChange(-8.7);  // "-8.7%"
 * formatPercentChange(0.0);   // "0.0%"
 * formatPercentChange(Infinity); // "+∞%"
 * ```
 */
export function formatPercentChange(percentChange: number): string {
  // Handle infinity
  if (percentChange === Infinity) {
    return '+∞%';
  }
  if (percentChange === -Infinity) {
    return '-∞%';
  }

  // Handle NaN
  if (isNaN(percentChange)) {
    return '0.0%';
  }

  // Format with sign
  const sign = percentChange >= 0 ? '+' : '';
  return `${sign}${percentChange.toFixed(1)}%`;
}
