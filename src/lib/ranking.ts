/**
 * Ranking Utility Functions
 *
 * Utilities for ranking and comparing multiple entities (campaigns, adsets, ads).
 * Supports sorting, percentile calculation, top/bottom identification, and stats.
 *
 * Use cases:
 * - Campaign performance comparison
 * - Identifying best and worst performers
 * - Competitive analysis within account
 * - Multi-metric leaderboards
 */

/**
 * Entity with metrics for ranking
 */
export interface RankableEntity {
  id: string;
  name: string;
  metrics: Record<string, number>;
}

/**
 * Ranked entity result
 */
export interface RankedEntity extends RankableEntity {
  rank: number;
  percentile: number;
}

/**
 * Statistical summary for a metric
 */
export interface MetricStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
}

/**
 * Rank entities by a specific metric
 *
 * Sorts entities by the specified metric value and assigns rank numbers.
 * Handles ties by assigning the same rank to entities with identical values.
 *
 * @param entities - Array of entities to rank
 * @param metricName - Metric to rank by
 * @param direction - 'desc' for higher is better, 'asc' for lower is better
 * @returns Sorted array of entities with rank numbers
 *
 * @example
 * ```typescript
 * const entities = [
 *   { id: '1', name: 'Campaign A', metrics: { ctr: 2.5 } },
 *   { id: '2', name: 'Campaign B', metrics: { ctr: 3.2 } },
 *   { id: '3', name: 'Campaign C', metrics: { ctr: 3.2 } }
 * ];
 * const ranked = rankByMetric(entities, 'ctr', 'desc');
 * // Returns: [
 * //   { ...Campaign B, rank: 1 },
 * //   { ...Campaign C, rank: 1 },  // Tie for first
 * //   { ...Campaign A, rank: 3 }
 * // ]
 * ```
 */
export function rankByMetric(
  entities: RankableEntity[],
  metricName: string,
  direction: 'asc' | 'desc' = 'desc'
): RankedEntity[] {
  // Filter entities that have the metric
  const entitiesWithMetric = entities.filter(
    (e) => e.metrics[metricName] !== undefined && e.metrics[metricName] !== null
  );

  // Sort by metric value
  const sorted = [...entitiesWithMetric].sort((a, b) => {
    const aValue = a.metrics[metricName];
    const bValue = b.metrics[metricName];

    if (direction === 'desc') {
      return bValue - aValue;
    } else {
      return aValue - bValue;
    }
  });

  // Assign ranks (handle ties)
  const ranked: RankedEntity[] = [];
  let currentRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    const entity = sorted[i];

    // Check if this is a tie with previous entity
    if (i > 0 && entity.metrics[metricName] === sorted[i - 1].metrics[metricName]) {
      // Same value = same rank as previous
      ranked.push({
        ...entity,
        rank: ranked[i - 1].rank,
        percentile: 0, // Will be calculated by calculatePercentiles if needed
      });
    } else {
      // New rank
      ranked.push({
        ...entity,
        rank: currentRank,
        percentile: 0, // Will be calculated by calculatePercentiles if needed
      });
    }

    currentRank++;
  }

  return ranked;
}

/**
 * Calculate percentiles for entities based on a metric
 *
 * For each entity, calculates what percentile it falls into relative to all entities.
 * Percentile represents the percentage of entities that this entity outperforms.
 *
 * @param entities - Array of entities
 * @param metricName - Metric to calculate percentiles for
 * @returns Map of entity ID to percentile (0-100)
 *
 * @example
 * ```typescript
 * const entities = [
 *   { id: '1', name: 'A', metrics: { ctr: 1.0 } },
 *   { id: '2', name: 'B', metrics: { ctr: 2.0 } },
 *   { id: '3', name: 'C', metrics: { ctr: 3.0 } },
 *   { id: '4', name: 'D', metrics: { ctr: 4.0 } }
 * ];
 * const percentiles = calculatePercentiles(entities, 'ctr');
 * // Returns: Map {
 * //   '1' => 0,    // Lowest value, 0th percentile
 * //   '2' => 33,   // Better than 33% of entities
 * //   '3' => 66,   // Better than 66% of entities
 * //   '4' => 100   // Highest value, 100th percentile
 * // }
 * ```
 */
export function calculatePercentiles(
  entities: RankableEntity[],
  metricName: string
): Map<string, number> {
  const percentiles = new Map<string, number>();

  // Filter entities that have the metric
  const entitiesWithMetric = entities.filter(
    (e) => e.metrics[metricName] !== undefined && e.metrics[metricName] !== null
  );

  if (entitiesWithMetric.length === 0) {
    return percentiles;
  }

  // If only one entity, it's at 100th percentile
  if (entitiesWithMetric.length === 1) {
    percentiles.set(entitiesWithMetric[0].id, 100);
    return percentiles;
  }

  // Sort by metric value (ascending)
  const sorted = [...entitiesWithMetric].sort(
    (a, b) => a.metrics[metricName] - b.metrics[metricName]
  );

  // Calculate percentile for each entity
  for (let i = 0; i < sorted.length; i++) {
    const entity = sorted[i];
    // Percentile = (rank / total) * 100
    // Using rank as position in sorted array (0-indexed)
    const percentile = Math.round((i / (sorted.length - 1)) * 100);
    percentiles.set(entity.id, percentile);
  }

  return percentiles;
}

/**
 * Identify best performers for each metric
 *
 * Returns the top 3 entities for each specified metric.
 * Useful for multi-metric comparison where different entities excel at different metrics.
 *
 * @param entities - Array of entities
 * @param metrics - Array of metric names to analyze
 * @returns Object mapping metric names to arrays of top 3 entity names
 *
 * @example
 * ```typescript
 * const entities = [
 *   { id: '1', name: 'A', metrics: { ctr: 3.0, cpc: 0.50 } },
 *   { id: '2', name: 'B', metrics: { ctr: 2.0, cpc: 0.30 } },
 *   { id: '3', name: 'C', metrics: { ctr: 4.0, cpc: 0.70 } }
 * ];
 * const best = identifyBestPerformers(entities, ['ctr', 'cpc']);
 * // Returns: {
 * //   ctr: ['C', 'A', 'B'],  // Ordered by CTR (highest first)
 * //   cpc: ['B', 'A', 'C']   // Ordered by CPC (lowest first, lower is better)
 * // }
 * ```
 */
export function identifyBestPerformers(
  entities: RankableEntity[],
  metrics: string[]
): Record<string, string[]> {
  const best: Record<string, string[]> = {};

  for (const metric of metrics) {
    // Determine direction based on metric type
    const direction = isLowerBetter(metric) ? 'asc' : 'desc';

    // Rank by this metric
    const ranked = rankByMetric(entities, metric, direction);

    // Take top 3
    const top3 = ranked.slice(0, 3).map((e) => e.name);

    best[metric] = top3;
  }

  return best;
}

/**
 * Identify worst performers for each metric
 *
 * Returns the bottom 3 entities for each specified metric.
 * Helps identify underperformers needing optimization.
 *
 * @param entities - Array of entities
 * @param metrics - Array of metric names to analyze
 * @returns Object mapping metric names to arrays of bottom 3 entity names
 *
 * @example
 * ```typescript
 * const entities = [
 *   { id: '1', name: 'A', metrics: { ctr: 3.0, cpc: 0.50 } },
 *   { id: '2', name: 'B', metrics: { ctr: 2.0, cpc: 0.30 } },
 *   { id: '3', name: 'C', metrics: { ctr: 4.0, cpc: 0.70 } }
 * ];
 * const worst = identifyWorstPerformers(entities, ['ctr', 'cpc']);
 * // Returns: {
 * //   ctr: ['B', 'A', 'C'],  // Ordered by CTR (lowest first)
 * //   cpc: ['C', 'A', 'B']   // Ordered by CPC (highest first, higher is worse)
 * // }
 * ```
 */
export function identifyWorstPerformers(
  entities: RankableEntity[],
  metrics: string[]
): Record<string, string[]> {
  const worst: Record<string, string[]> = {};

  for (const metric of metrics) {
    // Determine direction - invert for worst performers
    const direction = isLowerBetter(metric) ? 'desc' : 'asc';

    // Rank by this metric (worst first)
    const ranked = rankByMetric(entities, metric, direction);

    // Take bottom 3
    const bottom3 = ranked.slice(0, 3).map((e) => e.name);

    worst[metric] = bottom3;
  }

  return worst;
}

/**
 * Calculate statistical summary for a metric
 *
 * Computes min, max, mean, median, and standard deviation for a metric
 * across all entities. Provides context for individual entity performance.
 *
 * @param entities - Array of entities
 * @param metricName - Metric to calculate stats for
 * @returns Statistical summary object
 *
 * @example
 * ```typescript
 * const entities = [
 *   { id: '1', name: 'A', metrics: { ctr: 2.0 } },
 *   { id: '2', name: 'B', metrics: { ctr: 3.0 } },
 *   { id: '3', name: 'C', metrics: { ctr: 4.0 } },
 *   { id: '4', name: 'D', metrics: { ctr: 5.0 } }
 * ];
 * const stats = calculateMetricStats(entities, 'ctr');
 * // Returns: {
 * //   min: 2.0,
 * //   max: 5.0,
 * //   mean: 3.5,
 * //   median: 3.5,
 * //   stdDev: 1.29
 * // }
 * ```
 */
export function calculateMetricStats(
  entities: RankableEntity[],
  metricName: string
): MetricStats {
  // Filter entities that have the metric
  const values = entities
    .filter((e) => e.metrics[metricName] !== undefined && e.metrics[metricName] !== null)
    .map((e) => e.metrics[metricName]);

  if (values.length === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
    };
  }

  // Min and max
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Mean
  const sum = values.reduce((acc, val) => acc + val, 0);
  const mean = sum / values.length;

  // Median
  const sorted = [...values].sort((a, b) => a - b);
  let median: number;
  if (sorted.length % 2 === 0) {
    // Even number of values - average middle two
    const mid1 = sorted[sorted.length / 2 - 1];
    const mid2 = sorted[sorted.length / 2];
    median = (mid1 + mid2) / 2;
  } else {
    // Odd number of values - take middle value
    median = sorted[Math.floor(sorted.length / 2)];
  }

  // Standard deviation
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    min: parseFloat(min.toFixed(2)),
    max: parseFloat(max.toFixed(2)),
    mean: parseFloat(mean.toFixed(2)),
    median: parseFloat(median.toFixed(2)),
    stdDev: parseFloat(stdDev.toFixed(2)),
  };
}

/**
 * Determine if lower values are better for a metric
 *
 * Helper function to identify cost metrics where lower is better.
 *
 * @param metricName - Metric name
 * @returns True if lower is better, false otherwise
 * @private
 */
function isLowerBetter(metricName: string): boolean {
  const lowerName = metricName.toLowerCase();
  const lowerIsBetter = ['cpc', 'cpm', 'cpp', 'cost_per'];
  return lowerIsBetter.some((m) => lowerName.includes(m));
}
