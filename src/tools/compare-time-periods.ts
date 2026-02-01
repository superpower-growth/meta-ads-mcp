/**
 * Compare Time Periods Tool
 *
 * MCP tool for week-over-week and custom period comparisons.
 * Queries two time periods and calculates deltas for all metrics.
 *
 * Enables Claude to answer questions like:
 * - "How did my campaigns perform this week vs last week?"
 * - "Which metrics improved/declined?"
 * - "What are the biggest changes in my ad performance?"
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { parseRoas, parseActions } from '../lib/parsers.js';
import {
  compareMetricSets,
  formatPercentChange,
  type MetricComparison,
} from '../lib/comparison.js';
import { env } from '../config/env.js';

/**
 * Input schema for compare-time-periods tool
 */
const CompareTimePeriodsSchema = z.object({
  level: z.enum(['campaign', 'adset', 'ad']).default('campaign'),
  entityId: z
    .string()
    .optional()
    .describe('Optional campaign/adset/ad ID to filter results'),
  currentPeriod: z.object({
    since: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Start date in YYYY-MM-DD format'),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('End date in YYYY-MM-DD format'),
  }),
  previousPeriod: z.object({
    since: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Start date in YYYY-MM-DD format'),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('End date in YYYY-MM-DD format'),
  }),
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
        'reach',
        'frequency',
      ])
    )
    .default(['impressions', 'clicks', 'spend', 'ctr', 'cpc']),
  includeVideoMetrics: z.boolean().default(false),
});

type CompareTimePeriodsInput = z.infer<typeof CompareTimePeriodsSchema>;

/**
 * Entity comparison result
 */
interface EntityComparison {
  id: string;
  name: string;
  current: Record<string, number>;
  previous: Record<string, number>;
  changes: Record<
    string,
    {
      absolute: number;
      percent: string;
      direction: 'up' | 'down' | 'unchanged';
      classification?: string;
    }
  >;
  significantChanges: Array<{
    metric: string;
    change: string;
    classification: string;
  }>;
}

/**
 * Compare time periods response
 */
interface CompareTimePeriodsResponse {
  comparison: {
    current: {
      since: string;
      until: string;
    };
    previous: {
      since: string;
      until: string;
    };
  };
  level: string;
  results: EntityComparison[];
}

/**
 * Query and compare performance between two time periods
 *
 * @param args - Tool arguments (periods, level, metrics)
 * @returns Pretty-printed JSON with side-by-side comparison
 */
export async function compareTimePeriods(args: unknown): Promise<string> {
  // Validate input
  const input = CompareTimePeriodsSchema.parse(args);

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

    // Check for period overlap (warn but don't block)
    const currentStart = new Date(input.currentPeriod.since);
    const currentEnd = new Date(input.currentPeriod.until);
    const previousStart = new Date(input.previousPeriod.since);
    const previousEnd = new Date(input.previousPeriod.until);

    const hasOverlap =
      (currentStart >= previousStart && currentStart <= previousEnd) ||
      (currentEnd >= previousStart && currentEnd <= previousEnd) ||
      (previousStart >= currentStart && previousStart <= currentEnd) ||
      (previousEnd >= currentStart && previousEnd <= currentEnd);

    // Query current period
    const paramsBase = {
      level: input.level,
      time_increment: 'all_days' as const,
    };

    const currentData = await metricsService.getAccountInsights(fields, {
      ...paramsBase,
      time_range: input.currentPeriod,
    });

    // Query previous period
    const previousData = await metricsService.getAccountInsights(fields, {
      ...paramsBase,
      time_range: input.previousPeriod,
    });

    // Filter by entityId if provided
    let currentFiltered = currentData;
    let previousFiltered = previousData;

    if (input.entityId) {
      const idField = `${input.level}_id`;
      currentFiltered = currentData.filter((item) => item[idField] === input.entityId);
      previousFiltered = previousData.filter((item) => item[idField] === input.entityId);

      if (currentFiltered.length === 0 && previousFiltered.length === 0) {
        return `${input.level} ${input.entityId} not found in either period`;
      }
    }

    // Build map of entities
    const entityMap = new Map<string, { current?: any; previous?: any }>();

    // Add current period data
    for (const item of currentFiltered) {
      const id = item[`${input.level}_id`] || '';
      if (!entityMap.has(id)) {
        entityMap.set(id, {});
      }
      entityMap.get(id)!.current = item;
    }

    // Add previous period data
    for (const item of previousFiltered) {
      const id = item[`${input.level}_id`] || '';
      if (!entityMap.has(id)) {
        entityMap.set(id, {});
      }
      entityMap.get(id)!.previous = item;
    }

    // Build comparison results
    const results: EntityComparison[] = [];

    for (const [id, data] of entityMap.entries()) {
      const currentItem = data.current;
      const previousItem = data.previous;

      // Parse metrics for both periods
      const currentMetrics = currentItem
        ? parseMetrics(currentItem, input.metrics, input.includeVideoMetrics)
        : {};
      const previousMetrics = previousItem
        ? parseMetrics(previousItem, input.metrics, input.includeVideoMetrics)
        : {};

      // Handle new/paused entities
      if (!previousItem) {
        results.push({
          id,
          name: currentItem[`${input.level}_name`] || 'Unknown',
          current: currentMetrics,
          previous: {},
          changes: {},
          significantChanges: [
            {
              metric: 'status',
              change: 'New',
              classification: 'New entity in current period',
            },
          ],
        });
        continue;
      }

      if (!currentItem) {
        results.push({
          id,
          name: previousItem[`${input.level}_name`] || 'Unknown',
          current: {},
          previous: previousMetrics,
          changes: {},
          significantChanges: [
            {
              metric: 'status',
              change: 'Paused',
              classification: 'Entity not active in current period',
            },
          ],
        });
        continue;
      }

      // Compare metrics
      const comparisons = compareMetricSets(currentMetrics, previousMetrics);

      // Build changes object
      const changes: EntityComparison['changes'] = {};
      const significantChanges: EntityComparison['significantChanges'] = [];

      for (const comp of comparisons) {
        changes[comp.metricName] = {
          absolute: comp.delta.absolute,
          percent: formatPercentChange(comp.delta.percent),
          direction: comp.delta.direction,
          classification: comp.classification,
        };

        // Flag significant changes (>10% or classified as significant)
        if (
          comp.classification.includes('significant') ||
          Math.abs(comp.delta.percent) >= 10
        ) {
          significantChanges.push({
            metric: comp.metricName,
            change: formatPercentChange(comp.delta.percent),
            classification: comp.classification,
          });
        }
      }

      results.push({
        id,
        name: currentItem[`${input.level}_name`] || 'Unknown',
        current: currentMetrics,
        previous: previousMetrics,
        changes,
        significantChanges,
      });
    }

    // Check if no data
    if (results.length === 0) {
      return `No ${input.level}s found in either period`;
    }

    // Format response
    const response: CompareTimePeriodsResponse = {
      comparison: {
        current: input.currentPeriod,
        previous: input.previousPeriod,
      },
      level: input.level,
      results,
    };

    // Add warning if periods overlap
    let responseText = JSON.stringify(response, null, 2);
    if (hasOverlap) {
      responseText =
        '⚠️  WARNING: Periods overlap - comparison may be misleading\n\n' + responseText;
    }

    return responseText;
  } catch (error) {
    if (error instanceof Error) {
      return `Error comparing time periods: ${error.message}`;
    }
    return 'Unknown error occurred while comparing time periods';
  }
}

/**
 * Parse metrics from insight object
 *
 * @param insight - Insight object from Meta API
 * @param requestedMetrics - Metrics to parse
 * @param includeVideoMetrics - Whether to include video metrics
 * @returns Parsed metrics object
 */
function parseMetrics(
  insight: any,
  requestedMetrics: string[],
  includeVideoMetrics: boolean
): Record<string, number> {
  const metrics: Record<string, number> = {};

  // Parse standard metrics
  for (const metric of requestedMetrics) {
    if (insight[metric]) {
      const value = typeof insight[metric] === 'string' ? parseFloat(insight[metric]) : insight[metric];
      if (!isNaN(value)) {
        metrics[metric] = value;
      }
    }

    // Special handling for ROAS
    if (metric === 'purchase_roas') {
      const roas = parseRoas(insight);
      if (roas.purchase > 0) {
        metrics.purchase_roas = roas.purchase;
      }
    }
  }

  // Parse video metrics if requested
  if (includeVideoMetrics) {
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

    const videoFields = {
      video_2s_views: 'video_continuous_2_sec_watched_actions',
      video_15s_views: 'video_15_sec_watched_actions',
      video_30s_views: 'video_30_sec_watched_actions',
      video_thruplay: 'video_thruplay_watched_actions',
      video_p25: 'video_p25_watched_actions',
      video_p50: 'video_p50_watched_actions',
      video_p75: 'video_p75_watched_actions',
      video_p95: 'video_p95_watched_actions',
      video_p100: 'video_p100_watched_actions',
      video_plays: 'video_play_actions',
    };

    for (const [key, field] of Object.entries(videoFields)) {
      const value = extractVideoValue(insight[field]);
      if (value > 0) {
        metrics[key] = value;
      }
    }
  }

  return metrics;
}

/**
 * MCP Tool definition for compare-time-periods
 */
export const compareTimePeriodsTool: Tool = {
  name: 'compare-time-periods',
  description:
    'Compare campaign/adset/ad performance between two time periods to identify trends, improvements, and declines. Calculates percent changes for all metrics and highlights significant improvements or declines.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      level: {
        type: 'string' as const,
        enum: ['campaign', 'adset', 'ad'],
        description: 'Aggregation level for comparison',
        default: 'campaign',
      },
      entityId: {
        type: 'string' as const,
        description: 'Optional campaign/adset/ad ID to filter results',
      },
      currentPeriod: {
        type: 'object' as const,
        properties: {
          since: {
            type: 'string' as const,
            description: 'Start date in YYYY-MM-DD format',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          until: {
            type: 'string' as const,
            description: 'End date in YYYY-MM-DD format',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
        },
        required: ['since', 'until'],
        description: 'Current time period',
      },
      previousPeriod: {
        type: 'object' as const,
        properties: {
          since: {
            type: 'string' as const,
            description: 'Start date in YYYY-MM-DD format',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          until: {
            type: 'string' as const,
            description: 'End date in YYYY-MM-DD format',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
        },
        required: ['since', 'until'],
        description: 'Previous time period',
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
            'reach',
            'frequency',
          ],
        },
        description: 'Metrics to compare',
        default: ['impressions', 'clicks', 'spend', 'ctr', 'cpc'],
      },
      includeVideoMetrics: {
        type: 'boolean' as const,
        description: 'Include video completion metrics in comparison',
        default: false,
      },
    },
    required: ['currentPeriod', 'previousPeriod'],
  },
};
