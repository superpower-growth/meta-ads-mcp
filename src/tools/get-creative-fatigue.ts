/**
 * Get Creative Fatigue Tool
 *
 * Queries daily time-series metrics for a specific entity to detect
 * creative performance decay through frequency and CTR trend analysis.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { calculateFatigueScore, type DailyMetrics } from '../lib/fatigue.js';
import { env } from '../config/env.js';

/**
 * Input schema for get-creative-fatigue tool
 */
const GetCreativeFatigueSchema = z.object({
  entityId: z
    .string()
    .describe('Required: campaign/adset/ad ID to analyze for fatigue'),
  level: z
    .enum(['campaign', 'adset', 'ad'])
    .default('ad')
    .describe('Level of the entity being analyzed'),
  dateRange: z
    .enum(['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month'])
    .default('last_30d')
    .describe('Date range for time-series analysis (longer ranges give better trend data)'),
  attributionWindows: z
    .array(z.enum(['1d_click', '7d_click', '28d_click', '1d_view']))
    .default(['7d_click', '1d_view'])
    .describe('Attribution windows for conversion tracking'),
});

/** Level config */
const LEVEL_CONFIG = {
  campaign: { idField: 'campaign_id', nameField: 'campaign_name', label: 'Campaign' },
  adset: { idField: 'adset_id', nameField: 'adset_name', label: 'Ad Set' },
  ad: { idField: 'ad_id', nameField: 'ad_name', label: 'Ad' },
} as const;

/**
 * Analyze creative fatigue from daily time-series data
 */
export async function getCreativeFatigue(args: unknown): Promise<string> {
  const input = GetCreativeFatigueSchema.parse(args);
  const config = LEVEL_CONFIG[input.level];

  try {
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    const fields: string[] = [
      'impressions',
      'reach',
      'frequency',
      'clicks',
      'spend',
      'ctr',
      'cpc',
      config.idField,
      config.nameField,
    ];

    const params: any = {
      date_preset: input.dateRange,
      level: input.level,
      time_increment: 1, // Daily granularity
      action_attribution_windows: input.attributionWindows,
      // Server-side filtering — entityId is required for this tool
      filtering: [{
        field: `${input.level}.id`,
        operator: 'EQUAL',
        value: input.entityId,
      }],
    };

    const insights = await metricsService.getAllInsights(fields, params);

    // Filter to the specific entity (belt-and-suspenders)
    const entityInsights = insights.filter((i) => i[config.idField] === input.entityId);

    if (entityInsights.length === 0) {
      return `${config.label} ${input.entityId} not found in date range ${input.dateRange}`;
    }

    // Sort by date ascending
    entityInsights.sort((a, b) => {
      const dateA = a.date_start || '';
      const dateB = b.date_start || '';
      return dateA.localeCompare(dateB);
    });

    // Parse daily metrics
    const dailyMetrics: DailyMetrics[] = entityInsights.map((insight) => ({
      date: insight.date_start || '',
      impressions: parseInt(insight.impressions || '0', 10),
      reach: parseInt(insight.reach || '0', 10),
      frequency: parseFloat(insight.frequency || '0'),
      clicks: parseInt(insight.clicks || '0', 10),
      spend: parseFloat(insight.spend || '0'),
      ctr: parseFloat(insight.ctr || '0'),
      cpc: parseFloat(insight.cpc || '0'),
    }));

    // Calculate fatigue score
    const fatigue = calculateFatigueScore(dailyMetrics);

    // Get entity name
    const entityName = entityInsights[0]?.[config.nameField]
      || `${config.label} ${input.entityId}`;

    const response = {
      entityId: input.entityId,
      entityName,
      level: input.level,
      dateRange: input.dateRange,
      daysAnalyzed: dailyMetrics.length,
      fatigue,
      dailyMetrics,
    };

    return JSON.stringify(response, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      return `Error analyzing creative fatigue: ${error.message}`;
    }
    return 'Unknown error occurred while analyzing creative fatigue';
  }
}

/**
 * MCP Tool definition for get-creative-fatigue
 */
export const getCreativeFatigueTool: Tool = {
  name: 'get-creative-fatigue',
  description:
    'Detect ad creative fatigue by analyzing daily frequency and CTR trends. Returns a fatigue score (0-100), frequency/CTR trends, and recommendation (healthy/monitor/rotate/critical). Use with a specific entityId to analyze a campaign, ad set, or ad over time.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      entityId: {
        type: 'string' as const,
        description: 'Required: campaign/adset/ad ID to analyze for fatigue',
      },
      level: {
        type: 'string' as const,
        enum: ['campaign', 'adset', 'ad'],
        description: 'Level of the entity being analyzed',
        default: 'ad',
      },
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month'],
        description: 'Date range for time-series analysis (longer ranges give better trend data)',
        default: 'last_30d',
      },
      attributionWindows: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['1d_click', '7d_click', '28d_click', '1d_view'],
        },
        description: 'Attribution windows for conversion tracking',
        default: ['7d_click', '1d_view'],
      },
    },
    required: ['entityId'],
  },
};
