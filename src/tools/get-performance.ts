/**
 * Get Performance Tool (Consolidated)
 *
 * Replaces: get-campaign-performance, get-adset-performance, get-ad-performance
 *
 * Unified tool for querying performance metrics at any level (campaign, adset, ad)
 * with support for custom date ranges, custom conversions, video analysis enrichment,
 * and ad relevance quality scores.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { parseRoas, parseActions } from '../lib/parsers.js';
import { resolveActionType } from '../lib/custom-conversions.js';
import { env } from '../config/env.js';
import { getVideoMetadata } from '../lib/video-downloader.js';
import { getCached } from '../lib/firestore-cache.js';
import { type VideoAnalysis } from '../lib/gemini-analyzer.js';
import { isGeminiEnabled } from '../lib/gemini-client.js';

/**
 * Custom date range schema
 */
const CustomDateRangeSchema = z.object({
  since: z.string().describe('Start date in YYYY-MM-DD format'),
  until: z.string().describe('End date in YYYY-MM-DD format'),
});

/**
 * Input schema for get-performance tool
 */
const GetPerformanceSchema = z.object({
  dateRange: z
    .union([
      z.enum(['last_7d', 'last_30d', 'last_90d', 'this_month']),
      CustomDateRangeSchema,
    ])
    .default('last_7d')
    .describe('Date range preset or custom date range {since: "YYYY-MM-DD", until: "YYYY-MM-DD"}'),
  level: z
    .enum(['campaign', 'adset', 'ad'])
    .default('campaign')
    .describe('Aggregation level: campaign, adset, or ad'),
  entityId: z
    .string()
    .optional()
    .describe('Optional campaign/adset/ad ID to filter results'),
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
    .describe('Custom conversion action types to retrieve (e.g., ["subscription_created", "registration_started"])'),
  includeActionValues: z
    .boolean()
    .default(false)
    .describe('Include action value amounts (purchase value, etc.)'),
  attributionWindows: z
    .array(z.enum(['1d_click', '7d_click', '28d_click', '1d_view']))
    .default(['7d_click', '1d_view'])
    .describe('Attribution windows for conversion tracking. Options: 1d_click, 7d_click (default), 28d_click, 1d_view'),
  includeVideoAnalysis: z
    .boolean()
    .default(false)
    .describe('Ad-level only. Include AI-powered video creative analysis (cached results only)'),
  includeQualityScores: z
    .boolean()
    .default(false)
    .describe('Ad-level only. Include ad relevance diagnostics (quality_ranking, engagement_rate_ranking, conversion_rate_ranking)'),
});

type GetPerformanceInput = z.infer<typeof GetPerformanceSchema>;

/** Level config for field names */
const LEVEL_CONFIG = {
  campaign: { idField: 'campaign_id', nameField: 'campaign_name', label: 'Campaign' },
  adset: { idField: 'adset_id', nameField: 'adset_name', label: 'Ad Set' },
  ad: { idField: 'ad_id', nameField: 'ad_name', label: 'Ad' },
} as const;

/**
 * Parse standard metrics from an insight object
 */
function parseStandardMetrics(
  insight: any,
  requestedMetrics: string[]
): Record<string, number> {
  const metrics: Record<string, number> = {};

  const intFields = ['impressions', 'clicks', 'reach'];
  const floatFields = ['spend', 'ctr', 'cpc', 'cpm'];

  for (const field of intFields) {
    if (requestedMetrics.includes(field) && insight[field]) {
      metrics[field] = parseInt(insight[field], 10);
    }
  }

  for (const field of floatFields) {
    if (requestedMetrics.includes(field) && insight[field]) {
      metrics[field] = parseFloat(insight[field]);
    }
  }

  if (requestedMetrics.includes('purchase_roas')) {
    const roas = parseRoas(insight);
    if (roas.purchase > 0) {
      metrics.purchase_roas = roas.purchase;
    }
  }

  return metrics;
}

/**
 * Parse custom action metrics from an insight object
 */
function parseCustomActions(
  insight: any,
  customActions: string[],
  attributionWindows: string[],
  includeValues: boolean
): Record<string, number> {
  const metrics: Record<string, number> = {};
  const actions = parseActions(insight.actions || [], attributionWindows);
  const costPerActions = parseActions(insight.cost_per_action_type || [], attributionWindows);
  const actionValues = includeValues
    ? parseActions(insight.action_values || [], attributionWindows)
    : {};

  for (const actionName of customActions) {
    const actionType = resolveActionType(actionName);

    if (actions[actionType] !== undefined) {
      metrics[actionName] = actions[actionType];
    }
    if (costPerActions[actionType] !== undefined) {
      metrics[`cost_per_${actionName}`] = costPerActions[actionType];
    }
    if (includeValues && actionValues[actionType] !== undefined) {
      metrics[`${actionName}_value`] = actionValues[actionType];
    }
  }

  return metrics;
}

/**
 * Query performance metrics from Meta Insights API
 */
export async function getPerformance(args: unknown): Promise<string> {
  const input = GetPerformanceSchema.parse(args);
  const config = LEVEL_CONFIG[input.level];

  try {
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Build fields list
    const fields: string[] = [...input.metrics, config.idField, config.nameField];

    // Ad-level extras
    if (input.level === 'ad') {
      if (!fields.includes('created_time')) fields.push('created_time');
    }

    // Custom actions fields
    if (input.customActions && input.customActions.length > 0) {
      if (!fields.includes('actions')) fields.push('actions');
      if (!fields.includes('cost_per_action_type')) fields.push('cost_per_action_type');
      if (input.includeActionValues && !fields.includes('action_values')) {
        fields.push('action_values');
      }
    }

    // Quality scores (ad-level only)
    if (input.includeQualityScores && input.level === 'ad') {
      fields.push('quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking');
    }

    // Build query params
    const params: any = {
      level: input.level,
      time_increment: 'all_days',
      action_attribution_windows: input.attributionWindows,
    };

    if (typeof input.dateRange === 'string') {
      params.date_preset = input.dateRange;
    } else {
      params.time_range = { since: input.dateRange.since, until: input.dateRange.until };
    }

    // Server-side filtering: push filter to Meta API to avoid fetching all entities
    if (input.entityId) {
      params.filtering = [{
        field: `${input.level}.id`,
        operator: 'EQUAL',
        value: input.entityId,
      }];
    }

    // Query Meta API
    const insights = await metricsService.getAllInsights(fields, params);

    // Filter to specific entity (belt-and-suspenders with server-side filter above)
    let filtered = insights;
    if (input.entityId) {
      filtered = insights.filter((i) => i[config.idField] === input.entityId);
      if (filtered.length === 0) {
        return `${config.label} ${input.entityId} not found in date range ${typeof input.dateRange === 'string' ? input.dateRange : `${input.dateRange.since} to ${input.dateRange.until}`}`;
      }
    }

    if (filtered.length === 0) {
      const dateLabel = typeof input.dateRange === 'string' ? input.dateRange : `${input.dateRange.since} to ${input.dateRange.until}`;
      return `No ${config.label.toLowerCase()}s found for date range ${dateLabel}`;
    }

    // Format response
    const dateLabel = typeof input.dateRange === 'string'
      ? input.dateRange
      : `${input.dateRange.since} to ${input.dateRange.until}`;

    const entities = filtered.map((insight) => {
      const metrics = parseStandardMetrics(insight, input.metrics);

      // Custom actions
      if (input.customActions && input.customActions.length > 0) {
        Object.assign(
          metrics,
          parseCustomActions(insight, input.customActions, input.attributionWindows, input.includeActionValues)
        );
      }

      const entity: any = {
        id: insight[config.idField] || '',
        name: insight[config.nameField] || `${config.label} ${insight[config.idField] || 'Unknown'}`,
        period: `${insight.date_start} to ${insight.date_stop}`,
        metrics,
      };

      // Ad-level extras
      if (input.level === 'ad') {
        entity.createdTime = insight.created_time || 'unknown';
      }

      // Quality scores (ad-level only)
      if (input.includeQualityScores && input.level === 'ad') {
        entity.qualityScores = {
          quality: insight.quality_ranking || 'UNKNOWN',
          engagement: insight.engagement_rate_ranking || 'UNKNOWN',
          conversion: insight.conversion_rate_ranking || 'UNKNOWN',
        };
      }

      return entity;
    });

    const response: any = {
      dateRange: dateLabel,
      level: input.level,
      entities,
    };

    // Video analysis enrichment (ad-level only)
    if (input.includeVideoAnalysis && input.level === 'ad') {
      if (!isGeminiEnabled()) {
        if (entities.length > 0) {
          entities[0].videoCreative = {
            videoId: null,
            analysis: null,
            message: 'Gemini AI not configured. Set GEMINI_API_KEY or configure Vertex AI.',
          };
        }
      } else {
        for (const entity of entities) {
          try {
            const metadata = await getVideoMetadata(entity.id);
            if (!metadata) {
              entity.videoCreative = { videoId: null, analysis: null, message: 'Not a video ad' };
              continue;
            }

            const cachedEntry = await getCached(metadata.videoId);
            if (cachedEntry) {
              entity.videoCreative = {
                videoId: metadata.videoId,
                analysis: cachedEntry.analysisResults,
                cacheStatus: 'hit',
              };
            } else {
              entity.videoCreative = {
                videoId: metadata.videoId,
                analysis: null,
                cacheStatus: 'miss',
                message: 'Video not analyzed yet. Use analyze-video-creative tool to analyze first.',
              };
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            entity.videoCreative = { videoId: null, analysis: null, message: `Video analysis failed: ${msg}` };
          }
        }
      }
    }

    return JSON.stringify(response, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      return `Error querying ${config.label.toLowerCase()} performance: ${error.message}`;
    }
    return `Unknown error occurred while querying ${config.label.toLowerCase()} performance`;
  }
}

/**
 * MCP Tool definition for get-performance
 */
export const getPerformanceTool: Tool = {
  name: 'get-performance',
  description:
    'Query performance metrics at any level (campaign, adset, or ad). Includes CTR, CPC, CPM, ROAS, reach, custom conversions (subscription_created, etc.), ad relevance diagnostics (quality/engagement/conversion rankings), and optional AI video analysis. Supports preset and custom date ranges. Replaces get-campaign-performance, get-adset-performance, and get-ad-performance.',
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
              since: { type: 'string' as const, description: 'Start date in YYYY-MM-DD format' },
              until: { type: 'string' as const, description: 'End date in YYYY-MM-DD format' },
            },
            required: ['since', 'until'],
            description: 'Custom date range for all-time or specific period analysis',
          },
        ],
        description: 'Date range preset or custom date range {since: "YYYY-MM-DD", until: "YYYY-MM-DD"}',
        default: 'last_7d',
      },
      level: {
        type: 'string' as const,
        enum: ['campaign', 'adset', 'ad'],
        description: 'Aggregation level: campaign, adset, or ad',
        default: 'campaign',
      },
      entityId: {
        type: 'string' as const,
        description: 'Optional campaign/adset/ad ID to filter results',
      },
      metrics: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm', 'purchase_roas', 'reach'],
        },
        description: 'Metrics to include in response',
        default: ['impressions', 'clicks', 'spend', 'ctr', 'cpc'],
      },
      customActions: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Custom conversion action types to retrieve. Use friendly names like "subscription_created" or full action type IDs.',
      },
      includeActionValues: {
        type: 'boolean' as const,
        description: 'Include action value amounts (purchase value, etc.) for custom actions',
        default: false,
      },
      attributionWindows: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['1d_click', '7d_click', '28d_click', '1d_view'],
        },
        description: 'Attribution windows for conversion tracking. Options: 1d_click, 7d_click (default), 28d_click, 1d_view',
        default: ['7d_click', '1d_view'],
      },
      includeVideoAnalysis: {
        type: 'boolean' as const,
        description: 'Ad-level only. Include AI-powered video creative analysis (cached results only)',
        default: false,
      },
      includeQualityScores: {
        type: 'boolean' as const,
        description: 'Ad-level only. Include ad relevance diagnostics: quality_ranking, engagement_rate_ranking, conversion_rate_ranking (ABOVE_AVERAGE, AVERAGE, BELOW_AVERAGE_10/20/35)',
        default: false,
      },
    },
  },
};
