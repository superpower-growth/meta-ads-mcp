/**
 * Compare Entities Tool
 *
 * MCP tool for cross-entity performance comparison and ranking.
 * Compares multiple campaigns/adsets/ads on selected metrics and identifies
 * top and bottom performers.
 *
 * Enables Claude to answer questions like:
 * - "Which campaign performed best?"
 * - "How does Campaign A compare to Campaign B on video engagement?"
 * - "What are my worst performing ad sets?"
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { parseRoas, parseVideoMetrics } from '../lib/parsers.js';
import {
  rankByMetric,
  calculatePercentiles,
  identifyBestPerformers,
  identifyWorstPerformers,
  calculateMetricStats,
  type RankableEntity,
} from '../lib/ranking.js';
import { env } from '../config/env.js';

/**
 * Input schema for compare-entities tool
 */
const CompareEntitiesSchema = z.object({
  dateRange: z
    .enum(['last_7d', 'last_30d', 'last_90d', 'this_month'])
    .default('last_7d')
    .describe('Time range for data'),
  level: z
    .enum(['campaign', 'adset', 'ad'])
    .default('campaign')
    .describe('Entity level to compare'),
  entityIds: z
    .array(z.string())
    .optional()
    .describe('Optional: Compare specific entities, or all if not provided'),
  metrics: z
    .array(
      z.enum([
        'impressions',
        'clicks',
        'spend',
        'ctr',
        'cpc',
        'cpm',
        'purchase_roas',
      ])
    )
    .default(['ctr', 'cpc', 'purchase_roas'])
    .describe('Metrics to compare'),
  rankBy: z
    .enum(['ctr', 'cpc', 'purchase_roas', 'spend', 'impressions'])
    .default('ctr')
    .describe('Primary metric to rank by'),
  includeVideoMetrics: z
    .boolean()
    .default(false)
    .describe('Include video engagement metrics'),
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe('Top N entities to return'),
});

type CompareEntitiesInput = z.infer<typeof CompareEntitiesSchema>;

/**
 * Entity ranking in response
 */
interface EntityRanking {
  rank: number;
  id: string;
  name: string;
  metrics: Record<string, number>;
  percentiles: Record<string, number>;
}

/**
 * Compare entities response
 */
interface CompareEntitiesResponse {
  dateRange: string;
  level: string;
  rankBy: string;
  totalEntities: number;
  showing: number;
  rankings: EntityRanking[];
  stats: Record<string, any>;
  topPerformers: Record<string, string[]>;
  bottomPerformers: Record<string, string[]>;
}

/**
 * Query and compare multiple entities by performance metrics
 *
 * @param args - Tool arguments (level, metrics, ranking criteria)
 * @returns Pretty-printed JSON with rankings and performance comparisons
 */
export async function compareEntities(args: unknown): Promise<string> {
  // Validate input
  const input = CompareEntitiesSchema.parse(args);

  try {
    // Initialize MetricsService
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Build metric fields
    let fields: string[] = [...input.metrics];

    // Add video metrics if requested
    if (input.includeVideoMetrics) {
      fields = [
        ...fields,
        'video_continuous_2_sec_watched_actions',
        'video_15_sec_watched_actions',
        'video_30_sec_watched_actions',
        'video_thruplay_watched_actions',
        'video_p25_watched_actions',
        'video_p50_watched_actions',
        'video_p75_watched_actions',
        'video_p95_watched_actions',
        'video_p100_watched_actions',
        'video_play_actions',
      ];
    }

    // Query insights
    const params = {
      date_preset: input.dateRange,
      level: input.level,
      time_increment: 'all_days' as const,
    };

    // Query with automatic pagination to get all entities
    const data = await metricsService.getAllInsights(fields, params);

    // Filter to specific entityIds if provided
    let filteredData = data;
    if (input.entityIds && input.entityIds.length > 0) {
      const idField = `${input.level}_id`;
      filteredData = data.filter((item) => input.entityIds!.includes(item[idField]));

      if (filteredData.length === 0) {
        return `No matching ${input.level}s found for provided IDs`;
      }
    }

    if (filteredData.length === 0) {
      return `No ${input.level}s found for criteria`;
    }

    // Build rankable entities
    const entities: RankableEntity[] = filteredData.map((item) => {
      const id = item[`${input.level}_id`] || '';
      const name = item[`${input.level}_name`] || id || 'Unknown';

      // Parse metrics
      const metrics: Record<string, number> = {};

      // Standard metrics
      for (const metric of input.metrics) {
        if (item[metric] !== undefined && item[metric] !== null) {
          const value =
            typeof item[metric] === 'string' ? parseFloat(item[metric]) : item[metric];
          if (!isNaN(value)) {
            metrics[metric] = value;
          }
        }

        // Special handling for ROAS
        if (metric === 'purchase_roas') {
          const roas = parseRoas(item);
          if (roas.purchase > 0) {
            metrics.purchase_roas = roas.purchase;
          }
        }
      }

      // Video metrics if requested
      if (input.includeVideoMetrics) {
        const videoMetrics = parseVideoMetrics(item);
        const extractVideoValue = (field: any): number => {
          if (!field || !Array.isArray(field) || field.length === 0) {
            return 0;
          }
          const value = field[0]?.value;
          if (value === undefined || value === null) {
            return 0;
          }
          const numValue = typeof value === 'string' ? parseFloat(value) : value;
          return isNaN(numValue) ? 0 : numValue;
        };

        const videoPlays = extractVideoValue(item.video_play_actions);
        if (videoPlays > 0) {
          metrics.video_plays = videoPlays;
          metrics.video_p25 = videoMetrics.p25;
          metrics.video_p50 = videoMetrics.p50;
          metrics.video_p75 = videoMetrics.p75;
          metrics.video_p95 = videoMetrics.p95;
          metrics.video_p100 = videoMetrics.p100;

          // Calculate completion rates
          if (videoPlays > 0) {
            metrics.completion_rate_25 = (videoMetrics.p25 / videoPlays) * 100;
            metrics.completion_rate_50 = (videoMetrics.p50 / videoPlays) * 100;
            metrics.completion_rate_75 = (videoMetrics.p75 / videoPlays) * 100;
            metrics.completion_rate_100 = (videoMetrics.p100 / videoPlays) * 100;
          }
        }
      }

      return { id, name, metrics };
    });

    // Rank by primary metric
    const direction = isLowerBetter(input.rankBy) ? 'asc' : 'desc';
    const rankedEntities = rankByMetric(entities, input.rankBy, direction);

    // Check if rankBy metric exists on any entity
    if (rankedEntities.length === 0) {
      return `No entities have the metric '${input.rankBy}'. Try a different ranking metric.`;
    }

    // Limit to top N
    const limitedEntities = rankedEntities.slice(0, Math.min(input.limit, rankedEntities.length));

    // Calculate percentiles for all metrics
    const allMetrics = new Set<string>();
    for (const entity of entities) {
      for (const metric of Object.keys(entity.metrics)) {
        allMetrics.add(metric);
      }
    }

    const percentilesByMetric = new Map<string, Map<string, number>>();
    for (const metric of allMetrics) {
      percentilesByMetric.set(metric, calculatePercentiles(entities, metric));
    }

    // Build rankings
    const rankings: EntityRanking[] = limitedEntities.map((entity) => {
      const percentiles: Record<string, number> = {};
      for (const metric of Object.keys(entity.metrics)) {
        const percentileMap = percentilesByMetric.get(metric);
        if (percentileMap) {
          percentiles[metric] = percentileMap.get(entity.id) || 0;
        }
      }

      return {
        rank: entity.rank,
        id: entity.id,
        name: entity.name,
        metrics: entity.metrics,
        percentiles,
      };
    });

    // Calculate stats for each metric
    const stats: Record<string, any> = {};
    for (const metric of allMetrics) {
      stats[metric] = calculateMetricStats(entities, metric);
    }

    // Identify top and bottom performers for each metric
    const metricsToAnalyze = Array.from(allMetrics);
    const topPerformers = identifyBestPerformers(entities, metricsToAnalyze);
    const bottomPerformers = identifyWorstPerformers(entities, metricsToAnalyze);

    // Format response
    const response: CompareEntitiesResponse = {
      dateRange: input.dateRange,
      level: input.level,
      rankBy: input.rankBy,
      totalEntities: entities.length,
      showing: rankings.length,
      rankings,
      stats,
      topPerformers,
      bottomPerformers,
    };

    return JSON.stringify(response, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      return `Error comparing entities: ${error.message}`;
    }
    return 'Unknown error occurred while comparing entities';
  }
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

/**
 * MCP Tool definition for compare-entities
 */
export const compareEntitiesTool: Tool = {
  name: 'compare-entities',
  description:
    'Compare and rank multiple campaigns, ad sets, or ads on performance metrics to identify top and bottom performers. Returns rankings, percentiles, statistical benchmarks, and highlights best/worst performers for each metric.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_30d', 'last_90d', 'this_month'],
        description: 'Time range for data',
        default: 'last_7d',
      },
      level: {
        type: 'string' as const,
        enum: ['campaign', 'adset', 'ad'],
        description: 'Entity level to compare',
        default: 'campaign',
      },
      entityIds: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
        },
        description: 'Optional: Compare specific entities, or all if not provided',
      },
      metrics: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: [
            'impressions',
            'clicks',
            'spend',
            'ctr',
            'cpc',
            'cpm',
            'purchase_roas',
          ],
        },
        description: 'Metrics to compare',
        default: ['ctr', 'cpc', 'purchase_roas'],
      },
      rankBy: {
        type: 'string' as const,
        enum: ['ctr', 'cpc', 'purchase_roas', 'spend', 'impressions'],
        description: 'Primary metric to rank by',
        default: 'ctr',
      },
      includeVideoMetrics: {
        type: 'boolean' as const,
        description: 'Include video engagement metrics',
        default: false,
      },
      limit: {
        type: 'number' as const,
        description: 'Top N entities to return',
        minimum: 1,
        maximum: 50,
        default: 10,
      },
    },
    required: [],
  },
};
