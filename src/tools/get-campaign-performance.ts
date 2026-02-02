/**
 * Get Campaign Performance Tool
 *
 * MCP tool for querying campaign performance metrics including CTR, CPC, ROAS,
 * and basic video completion rates for a specified date range.
 *
 * Exposes Meta Insights API capabilities through conversational interface.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { parseRoas } from '../lib/parsers.js';
import { env } from '../config/env.js';

/**
 * Input schema for get-campaign-performance tool
 *
 * Validates date range, optional campaign ID filter, metric selection, and attribution windows.
 */
const GetCampaignPerformanceSchema = z.object({
  dateRange: z
    .enum(['last_7d', 'last_30d', 'last_90d', 'this_month'])
    .default('last_7d')
    .describe('Date range preset for metrics query'),
  campaignId: z
    .string()
    .optional()
    .describe('Optional campaign ID to filter results (queries all campaigns if omitted)'),
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
  attributionWindows: z
    .array(z.enum(['1d_click', '7d_click', '28d_click', '1d_view']))
    .default(['7d_click', '1d_view'])
    .describe('Attribution windows for conversion tracking. Options: 1d_click (1-day click), 7d_click (7-day click, default), 28d_click (28-day click), 1d_view (1-day view). Note: 7d_view and 28d_view were removed by Meta on Jan 12, 2026.'),
});

type GetCampaignPerformanceInput = z.infer<typeof GetCampaignPerformanceSchema>;

/**
 * Campaign performance response format
 */
interface CampaignPerformance {
  dateRange: string;
  campaigns: Array<{
    id: string;
    name: string;
    period: string;
    metrics: Record<string, number>;
  }>;
}

/**
 * Query campaign performance metrics from Meta Insights API
 *
 * @param args - Tool arguments (dateRange, campaignId, metrics)
 * @returns Pretty-printed JSON with campaign metrics
 */
export async function getCampaignPerformance(args: unknown): Promise<string> {
  // Validate input
  const input = GetCampaignPerformanceSchema.parse(args);

  try {
    // Initialize MetricsService with account ID from environment
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Prepare query parameters
    const params = {
      date_preset: input.dateRange,
      level: 'campaign' as const,
      time_increment: 'all_days' as const, // Single aggregated result per campaign
      action_attribution_windows: input.attributionWindows,
    };

    // Query insights from Meta API with automatic pagination
    const insights = await metricsService.getAllInsights(input.metrics, params);

    // Filter to specific campaign if requested
    let filteredInsights = insights;
    if (input.campaignId) {
      filteredInsights = insights.filter(
        (insight) => insight.campaign_id === input.campaignId
      );

      // Return error if campaign not found
      if (filteredInsights.length === 0) {
        return `Campaign ${input.campaignId} not found in date range ${input.dateRange}`;
      }
    }

    // Return message if no campaigns found
    if (filteredInsights.length === 0) {
      return `No campaigns found for date range ${input.dateRange}`;
    }

    // Format response
    const response: CampaignPerformance = {
      dateRange: input.dateRange,
      campaigns: filteredInsights.map((insight) => {
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
          id: insight.campaign_id || '',
          name: insight.campaign_name || 'Unknown Campaign',
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
      return `Error querying campaign performance: ${error.message}`;
    }
    return 'Unknown error occurred while querying campaign performance';
  }
}

/**
 * MCP Tool definition for get-campaign-performance
 */
export const getCampaignPerformanceTool: Tool = {
  name: 'get-campaign-performance',
  description:
    'Query campaign performance metrics including CTR, CPC, ROAS, and basic video completion rates for a specified date range',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_30d', 'last_90d', 'this_month'],
        description: 'Date range preset for metrics query',
        default: 'last_7d',
      },
      campaignId: {
        type: 'string' as const,
        description: 'Optional campaign ID to filter results (queries all campaigns if omitted)',
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
      attributionWindows: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['1d_click', '7d_click', '28d_click', '1d_view'],
        },
        description: 'Attribution windows for conversion tracking. Options: 1d_click (1-day click), 7d_click (7-day click, default), 28d_click (28-day click), 1d_view (1-day view). Note: 7d_view and 28d_view were removed by Meta on Jan 12, 2026.',
        default: ['7d_click', '1d_view'],
      },
    },
  },
};
