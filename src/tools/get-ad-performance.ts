/**
 * Get Ad Performance Tool
 *
 * MCP tool for querying individual ad creative performance metrics including
 * CTR, CPC, ROAS, and basic video completion rates for a specified date range.
 *
 * Ads are the most granular level, representing individual creative units.
 * Exposes Meta Insights API capabilities through conversational interface.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { parseRoas } from '../lib/parsers.js';
import { env } from '../config/env.js';

/**
 * Input schema for get-ad-performance tool
 *
 * Validates date range, optional ad ID filter, and metric selection.
 */
const GetAdPerformanceSchema = z.object({
  dateRange: z
    .enum(['last_7d', 'last_30d', 'last_90d', 'this_month'])
    .default('last_7d')
    .describe('Date range preset for metrics query'),
  adId: z
    .string()
    .optional()
    .describe('Optional ad ID to filter results (queries all ads if omitted)'),
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

type GetAdPerformanceInput = z.infer<typeof GetAdPerformanceSchema>;

/**
 * Ad performance response format
 */
interface AdPerformance {
  dateRange: string;
  ads: Array<{
    id: string;
    name: string;
    period: string;
    metrics: Record<string, number>;
  }>;
}

/**
 * Query ad performance metrics from Meta Insights API
 *
 * @param args - Tool arguments (dateRange, adId, metrics)
 * @returns Pretty-printed JSON with ad metrics
 */
export async function getAdPerformance(args: unknown): Promise<string> {
  // Validate input
  const input = GetAdPerformanceSchema.parse(args);

  try {
    // Initialize MetricsService with account ID from environment
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Prepare query parameters
    const params = {
      date_preset: input.dateRange,
      level: 'ad' as const,
      time_increment: 'all_days' as const, // Single aggregated result per ad
    };

    // Query insights from Meta API
    const insights = await metricsService.getAccountInsights(input.metrics, params);

    // Filter to specific ad if requested
    let filteredInsights = insights;
    if (input.adId) {
      filteredInsights = insights.filter(
        (insight) => insight.ad_id === input.adId
      );

      // Return error if ad not found
      if (filteredInsights.length === 0) {
        return `Ad ${input.adId} not found in date range ${input.dateRange}`;
      }
    }

    // Return message if no ads found
    if (filteredInsights.length === 0) {
      return `No ads found for date range ${input.dateRange}`;
    }

    // Format response
    const response: AdPerformance = {
      dateRange: input.dateRange,
      ads: filteredInsights.map((insight) => {
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
          id: insight.ad_id || '',
          // Handle missing ad_name gracefully (some ads may not have names)
          name: insight.ad_name || `Ad ${insight.ad_id || 'Unknown'}`,
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
      return `Error querying ad performance: ${error.message}`;
    }
    return 'Unknown error occurred while querying ad performance';
  }
}

/**
 * MCP Tool definition for get-ad-performance
 */
export const getAdPerformanceTool: Tool = {
  name: 'get-ad-performance',
  description:
    'Query individual ad creative performance metrics including CTR, CPC, ROAS, and basic video completion rates for a specified date range',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_30d', 'last_90d', 'this_month'],
        description: 'Date range preset for metrics query',
        default: 'last_7d',
      },
      adId: {
        type: 'string' as const,
        description: 'Optional ad ID to filter results (queries all ads if omitted)',
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
