/**
 * Get Creative Performance Tool
 *
 * Groups ad performance by creative_id across all ads using that creative.
 * Enables comparison of creative variants regardless of which ad sets or
 * campaigns they run in.
 *
 * Two-step process:
 * 1. Query ad-level insights from Insights API (metrics)
 * 2. Batch-fetch creative IDs from Ads API (ad → creative mapping)
 * 3. Group and aggregate by creative ID
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { parseRoas, parseActions } from '../lib/parsers.js';
import { resolveActionType } from '../lib/custom-conversions.js';
import { env } from '../config/env.js';
import bizSdk from 'facebook-nodejs-business-sdk';

const Ad = bizSdk.Ad;

/**
 * Custom date range schema
 */
const CustomDateRangeSchema = z.object({
  since: z.string().describe('Start date in YYYY-MM-DD format'),
  until: z.string().describe('End date in YYYY-MM-DD format'),
});

/**
 * Input schema for get-creative-performance tool
 */
const GetCreativePerformanceSchema = z.object({
  dateRange: z
    .union([
      z.enum(['last_7d', 'last_30d', 'last_90d', 'this_month']),
      CustomDateRangeSchema,
    ])
    .default('last_7d')
    .describe('Date range preset or custom date range'),
  creativeId: z
    .string()
    .optional()
    .describe('Optional: filter to a specific creative ID'),
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
      ])
    )
    .default(['impressions', 'clicks', 'spend', 'ctr', 'cpc'])
    .describe('Metrics to include in response'),
  customActions: z
    .array(z.string())
    .optional()
    .describe('Custom conversion actions to track'),
  attributionWindows: z
    .array(z.enum(['1d_click', '7d_click', '28d_click', '1d_view']))
    .default(['7d_click', '1d_view'])
    .describe('Attribution windows for conversion tracking'),
});

type GetCreativePerformanceInput = z.infer<typeof GetCreativePerformanceSchema>;

interface CreativeAggregate {
  creativeId: string;
  adIds: string[];
  adNames: string[];
  metrics: Record<string, number>;
  conversions?: Record<string, number>;
}

/**
 * Batch-fetch creative IDs for a list of ad IDs using the Ads API.
 * Returns a map of ad_id → creative_id.
 */
async function fetchCreativeMapping(adIds: string[]): Promise<Map<string, string>> {
  bizSdk.FacebookAdsApi.init(env.META_ACCESS_TOKEN);

  const mapping = new Map<string, string>();

  // Batch in groups of 50 to avoid rate limits
  const batchSize = 50;
  for (let i = 0; i < adIds.length; i += batchSize) {
    const batch = adIds.slice(i, i + batchSize);
    const promises = batch.map(async (adId) => {
      try {
        const ad = new Ad(adId);
        const adData = await ad.read([Ad.Fields.id, Ad.Fields.creative]);
        const creativeId = adData?.creative?.id;
        if (creativeId) {
          mapping.set(adId, creativeId);
        }
      } catch (error) {
        // Skip ads we can't read (deleted, etc.)
        console.warn(`Failed to fetch creative for ad ${adId}`);
      }
    });
    await Promise.all(promises);
  }

  return mapping;
}

/**
 * Query ad-level insights and aggregate by creative ID
 */
export async function getCreativePerformance(args: unknown): Promise<string> {
  const input = GetCreativePerformanceSchema.parse(args);

  try {
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Step 1: Query ad-level insights (without 'creative' field — not valid in Insights API)
    const fields: string[] = [
      ...input.metrics,
      'ad_id',
      'ad_name',
    ];

    if (input.customActions && input.customActions.length > 0) {
      if (!fields.includes('actions')) fields.push('actions');
      if (!fields.includes('cost_per_action_type')) fields.push('cost_per_action_type');
    }

    const params: any = {
      level: 'ad',
      time_increment: 'all_days',
      action_attribution_windows: input.attributionWindows,
    };

    if (typeof input.dateRange === 'string') {
      params.date_preset = input.dateRange;
    } else {
      params.time_range = { since: input.dateRange.since, until: input.dateRange.until };
    }

    const insights = await metricsService.getAllInsights(fields, params);

    if (insights.length === 0) {
      const dateLabel = typeof input.dateRange === 'string'
        ? input.dateRange
        : `${input.dateRange.since} to ${input.dateRange.until}`;
      return `No ads found for date range ${dateLabel}`;
    }

    // Step 2: Fetch creative ID mapping via Ads API
    const uniqueAdIds = [...new Set(insights.map((i) => i.ad_id).filter((id): id is string => !!id))];
    const creativeMapping = await fetchCreativeMapping(uniqueAdIds);

    // Step 3: Group by creative ID
    const creativeMap = new Map<string, any[]>();

    for (const insight of insights) {
      const adId = insight.ad_id || '';
      const creativeId = creativeMapping.get(adId) || 'unknown';

      // Filter to specific creative if requested
      if (input.creativeId && creativeId !== input.creativeId) continue;

      if (!creativeMap.has(creativeId)) {
        creativeMap.set(creativeId, []);
      }
      creativeMap.get(creativeId)!.push(insight);
    }

    if (creativeMap.size === 0) {
      if (input.creativeId) {
        return `Creative ${input.creativeId} not found in date range`;
      }
      return 'No creative data found';
    }

    // Step 4: Aggregate metrics per creative
    const creatives: CreativeAggregate[] = [];

    for (const [creativeId, adInsights] of creativeMap) {
      const adIds: string[] = [];
      const adNames: string[] = [];

      let totalImpressions = 0;
      let totalClicks = 0;
      let totalSpend = 0;
      let totalReach = 0;
      let roasNumerator = 0;

      const totalActions: Record<string, number> = {};
      const totalCostPerAction: Record<string, { cost: number; count: number }> = {};

      for (const insight of adInsights) {
        adIds.push(insight.ad_id || '');
        adNames.push(insight.ad_name || `Ad ${insight.ad_id}`);

        const impressions = parseInt(insight.impressions || '0', 10);
        const clicks = parseInt(insight.clicks || '0', 10);
        const spend = parseFloat(insight.spend || '0');
        const reach = parseInt(insight.reach || '0', 10);

        totalImpressions += impressions;
        totalClicks += clicks;
        totalSpend += spend;
        totalReach += reach;

        if (input.metrics.includes('purchase_roas')) {
          const roas = parseRoas(insight);
          if (roas.purchase > 0) {
            roasNumerator += roas.purchase * spend;
          }
        }

        if (input.customActions && input.customActions.length > 0) {
          const actions = parseActions(insight.actions || [], input.attributionWindows);
          const costPerActions = parseActions(insight.cost_per_action_type || [], input.attributionWindows);

          for (const actionName of input.customActions) {
            const actionType = resolveActionType(actionName);

            if (actions[actionType] !== undefined) {
              totalActions[actionName] = (totalActions[actionName] || 0) + actions[actionType];
            }
            if (costPerActions[actionType] !== undefined) {
              if (!totalCostPerAction[actionName]) {
                totalCostPerAction[actionName] = { cost: 0, count: 0 };
              }
              totalCostPerAction[actionName].cost += costPerActions[actionType] * (actions[actionType] || 1);
              totalCostPerAction[actionName].count += actions[actionType] || 1;
            }
          }
        }
      }

      const metrics: Record<string, number> = {};

      if (input.metrics.includes('impressions')) metrics.impressions = totalImpressions;
      if (input.metrics.includes('clicks')) metrics.clicks = totalClicks;
      if (input.metrics.includes('spend')) metrics.spend = Math.round(totalSpend * 100) / 100;
      if (input.metrics.includes('reach')) metrics.reach = totalReach;

      if (input.metrics.includes('ctr') && totalImpressions > 0) {
        metrics.ctr = Math.round((totalClicks / totalImpressions) * 10000) / 100;
      }
      if (input.metrics.includes('cpc') && totalClicks > 0) {
        metrics.cpc = Math.round((totalSpend / totalClicks) * 100) / 100;
      }
      if (input.metrics.includes('cpm') && totalImpressions > 0) {
        metrics.cpm = Math.round((totalSpend / totalImpressions) * 1000 * 100) / 100;
      }
      if (input.metrics.includes('purchase_roas') && totalSpend > 0 && roasNumerator > 0) {
        metrics.purchase_roas = Math.round((roasNumerator / totalSpend) * 100) / 100;
      }

      const creative: CreativeAggregate = {
        creativeId,
        adIds,
        adNames,
        metrics,
      };

      if (input.customActions && input.customActions.length > 0) {
        const conversions: Record<string, number> = {};
        for (const actionName of input.customActions) {
          if (totalActions[actionName] !== undefined) {
            conversions[actionName] = totalActions[actionName];
          }
          if (totalCostPerAction[actionName]) {
            const { cost, count } = totalCostPerAction[actionName];
            conversions[`cost_per_${actionName}`] = Math.round((cost / count) * 100) / 100;
          }
        }
        creative.conversions = conversions;
      }

      creatives.push(creative);
    }

    // Sort by spend descending
    creatives.sort((a, b) => (b.metrics.spend || 0) - (a.metrics.spend || 0));

    const dateLabel = typeof input.dateRange === 'string'
      ? input.dateRange
      : `${input.dateRange.since} to ${input.dateRange.until}`;

    const response = {
      dateRange: dateLabel,
      totalCreatives: creatives.length,
      totalAds: creatives.reduce((sum, c) => sum + c.adIds.length, 0),
      creatives,
    };

    return JSON.stringify(response, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      return `Error querying creative performance: ${error.message}`;
    }
    return 'Unknown error occurred while querying creative performance';
  }
}

/**
 * MCP Tool definition for get-creative-performance
 */
export const getCreativePerformanceTool: Tool = {
  name: 'get-creative-performance',
  description:
    'Aggregate ad performance by creative ID across all ads using the same creative. Shows which creative variants perform best regardless of targeting or campaign structure. Returns ranked list with aggregated metrics, ROAS, custom conversions, and list of ad IDs per creative.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        oneOf: [
          {
            type: 'string' as const,
            enum: ['last_7d', 'last_30d', 'last_90d', 'this_month'],
            description: 'Date range preset',
          },
          {
            type: 'object' as const,
            properties: {
              since: { type: 'string' as const, description: 'Start date YYYY-MM-DD' },
              until: { type: 'string' as const, description: 'End date YYYY-MM-DD' },
            },
            required: ['since', 'until'],
          },
        ],
        description: 'Date range preset or custom range',
        default: 'last_7d',
      },
      creativeId: {
        type: 'string' as const,
        description: 'Optional: filter to a specific creative ID',
      },
      metrics: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm', 'purchase_roas', 'reach'],
        },
        description: 'Metrics to include',
        default: ['impressions', 'clicks', 'spend', 'ctr', 'cpc'],
      },
      customActions: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Custom conversion actions to track',
      },
      attributionWindows: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['1d_click', '7d_click', '28d_click', '1d_view'],
        },
        description: 'Attribution windows',
        default: ['7d_click', '1d_view'],
      },
    },
  },
};
