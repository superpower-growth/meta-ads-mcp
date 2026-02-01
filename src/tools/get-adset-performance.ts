/**
 * Get Ad Set Performance Tool
 *
 * MCP tool for querying ad set performance metrics including CTR, CPC, ROAS,
 * and basic video completion rates for a specified date range.
 *
 * Ad sets represent targeting and budget groups within campaigns.
 * Exposes Meta Insights API capabilities through conversational interface.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { parseRoas } from '../lib/parsers.js';
import { env } from '../config/env.js';

/**
 * Input schema for get-adset-performance tool
 *
 * Validates date range, optional ad set ID filter, and metric selection.
 */
const GetAdsetPerformanceSchema = z.object({
  dateRange: z
    .enum(['last_7d', 'last_30d', 'last_90d', 'this_month'])
    .default('last_7d')
    .describe('Date range preset for metrics query'),
  adsetId: z
    .string()
    .optional()
    .describe('Optional ad set ID to filter results (queries all ad sets if omitted)'),
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
    .default(['impressions', 'clicks', 'spend', 'ctr', 'cpc'])
    .describe('Metrics to include in response'),
});

type GetAdsetPerformanceInput = z.infer<typeof GetAdsetPerformanceSchema>;

/**
 * Ad set performance response format
 */
interface AdsetPerformance {
  dateRange: string;
  adsets: Array<{
    id: string;
    name: string;
    period: string;
    metrics: Record<string, number>;
  }>;
}

/**
 * Query ad set performance metrics from Meta Insights API
 *
 * @param args - Tool arguments (dateRange, adsetId, metrics)
 * @returns Pretty-printed JSON with ad set metrics
 */
export async function getAdsetPerformance(args: unknown): Promise<string> {
  // Validate input
  const input = GetAdsetPerformanceSchema.parse(args);

  try {
    // Initialize MetricsService with account ID from environment
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Prepare query parameters
    const params = {
      date_preset: input.dateRange,
      level: 'adset' as const,
      time_increment: 'all_days' as const, // Single aggregated result per ad set
    };

    // Query insights from Meta API
    const insights = await metricsService.getAccountInsights(input.metrics, params);

    // Filter to specific ad set if requested
    let filteredInsights = insights;
    if (input.adsetId) {
      filteredInsights = insights.filter(
        (insight) => insight.adset_id === input.adsetId
      );

      // Return error if ad set not found
      if (filteredInsights.length === 0) {
        return `Ad set ${input.adsetId} not found in date range ${input.dateRange}`;
      }
    }

    // Return message if no ad sets found
    if (filteredInsights.length === 0) {
      return `No ad sets found for date range ${input.dateRange}`;
    }

    // Format response
    const response: AdsetPerformance = {
      dateRange: input.dateRange,
      adsets: filteredInsights.map((insight) => {
        // Build metrics object from requested fields
        const metrics: Record<string, number> = {};

        // Parse standard numeric metrics
        if (input.metrics.includes('impressions') && insight.impressions) {
          metrics.impressions = parseInt(insight.impressions, 10);
        }
        if (input.metrics.includes('clicks') && insight.clicks) {
          metrics.clicks = parseInt(insight.clicks, 10);
        }
        if (input.metrics.includes('spend') && insight.spend) {
          metrics.spend = parseFloat(insight.spend);
        }
        if (input.metrics.includes('ctr') && insight.ctr) {
          metrics.ctr = parseFloat(insight.ctr);
        }
        if (input.metrics.includes('cpc') && insight.cpc) {
          metrics.cpc = parseFloat(insight.cpc);
        }
        if (input.metrics.includes('cpm') && insight.cpm) {
          metrics.cpm = parseFloat(insight.cpm);
        }

        // Parse ROAS if requested (using parser utility)
        if (input.metrics.includes('purchase_roas')) {
          const roas = parseRoas(insight);
          if (roas.purchase > 0) {
            metrics.purchase_roas = roas.purchase;
          }
        }

        return {
          id: insight.adset_id || '',
          name: insight.adset_name || 'Unknown Ad Set',
          period: `${insight.date_start} to ${insight.date_stop}`,
          metrics,
        };
      }),
    };

    // Return pretty-printed JSON for Claude consumption
    return JSON.stringify(response, null, 2);
  } catch (error) {
    // Format error messages for user clarity
    if (error instanceof Error) {
      return `Error querying ad set performance: ${error.message}`;
    }
    return 'Unknown error occurred while querying ad set performance';
  }
}

/**
 * MCP Tool definition for get-adset-performance
 */
export const getAdsetPerformanceTool: Tool = {
  name: 'get-adset-performance',
  description:
    'Query ad set (targeting/budget group) performance metrics including CTR, CPC, ROAS, and basic video completion rates for a specified date range',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_30d', 'last_90d', 'this_month'],
        description: 'Date range preset for metrics query',
        default: 'last_7d',
      },
      adsetId: {
        type: 'string' as const,
        description: 'Optional ad set ID to filter results (queries all ad sets if omitted)',
      },
      metrics: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm', 'purchase_roas'],
        },
        description: 'Metrics to include in response',
        default: ['impressions', 'clicks', 'spend', 'ctr', 'cpc'],
      },
    },
  },
};
