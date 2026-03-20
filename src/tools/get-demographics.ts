/**
 * Get Demographics Tool (Consolidated)
 *
 * Replaces: get-video-demographics, get-ad-demographics, get-placement-conversions
 *
 * Unified tool for querying performance metrics segmented by demographic and placement
 * breakdowns. Supports three metrics types: standard (all ads), video (completion funnel),
 * and conversions (conversion tracking by placement).
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService, type InsightObject } from '../meta/metrics.js';
import { parseActions, parseVideoMetrics } from '../lib/parsers.js';
import { resolveActionType } from '../lib/custom-conversions.js';
import { env } from '../config/env.js';

/**
 * Input schema for get-demographics tool
 */
const GetDemographicsSchema = z.object({
  dateRange: z
    .enum(['last_7d', 'last_30d', 'last_90d', 'this_month'])
    .default('last_7d')
    .describe('Date range preset for demographics query'),
  level: z
    .enum(['campaign', 'adset', 'ad'])
    .default('campaign')
    .describe('Aggregation level for metrics'),
  entityId: z
    .string()
    .optional()
    .describe('Optional campaign/adset/ad ID to filter results'),
  breakdowns: z
    .array(
      z.enum([
        'age',
        'gender',
        'country',
        'device_platform',
        'publisher_platform',
        'platform_position',
      ])
    )
    .min(1)
    .default(['age', 'gender'])
    .describe('Breakdown dimensions (WARNING: combinations multiply rows)'),
  metricsType: z
    .enum(['standard', 'video', 'conversions'])
    .default('standard')
    .describe('Type of metrics: standard (impressions/clicks/spend for all ads), video (completion funnel for video ads), conversions (conversion counts by placement)'),
  customActions: z
    .array(z.string())
    .optional()
    .describe('Custom conversion actions for standard/conversions mode (e.g., ["subscription_created"])'),
  conversionMetrics: z
    .array(
      z.enum([
        'purchase',
        'lead',
        'complete_registration',
        'add_to_cart',
        'initiate_checkout',
        'add_payment_info',
        'subscribe',
        'start_trial',
      ])
    )
    .default(['purchase'])
    .describe('Standard conversion events for conversions mode (default: purchase)'),
  includeConversionValue: z
    .boolean()
    .default(false)
    .describe('Include conversion values and ROAS calculations (conversions mode)'),
  attributionWindows: z
    .array(z.enum(['1d_click', '7d_click', '28d_click', '1d_view']))
    .default(['7d_click', '1d_view'])
    .describe('Attribution windows for conversion tracking'),
});

type GetDemographicsInput = z.infer<typeof GetDemographicsSchema>;

/** Level config */
const LEVEL_CONFIG = {
  campaign: { idField: 'campaign_id', nameField: 'campaign_name', label: 'Campaign' },
  adset: { idField: 'adset_id', nameField: 'adset_name', label: 'Ad Set' },
  ad: { idField: 'ad_id', nameField: 'ad_name', label: 'Ad' },
} as const;

/** Map standard conversion names to Meta action types */
const CONVERSION_MAP: Record<string, string> = {
  purchase: 'omni_purchase',
  lead: 'lead',
  complete_registration: 'complete_registration',
  add_to_cart: 'add_to_cart',
  initiate_checkout: 'initiate_checkout',
  add_payment_info: 'add_payment_info',
  subscribe: 'subscribe',
  start_trial: 'start_trial',
};

/**
 * Build action type list from conversion metrics + custom conversions
 */
function buildActionTypes(input: GetDemographicsInput): string[] {
  const actionTypes: string[] = [];

  if (input.conversionMetrics) {
    for (const metric of input.conversionMetrics) {
      if (CONVERSION_MAP[metric]) actionTypes.push(CONVERSION_MAP[metric]);
    }
  }

  if (input.customActions) {
    for (const name of input.customActions) {
      actionTypes.push(resolveActionType(name));
    }
  }

  return actionTypes;
}

/**
 * Format standard metrics segment
 */
function formatStandardSegment(
  insight: any,
  input: GetDemographicsInput,
  config: typeof LEVEL_CONFIG[keyof typeof LEVEL_CONFIG]
): any {
  const segment: any = {};

  // Breakdown dimensions
  for (const breakdown of input.breakdowns) {
    segment[breakdown] = insight[breakdown] || 'unknown';
  }

  // Entity identifiers
  segment[config.idField] = insight[config.idField];
  segment[config.nameField] = insight[config.nameField];

  // Standard metrics
  segment.metrics = {
    impressions: parseInt(insight.impressions || '0', 10),
    clicks: parseInt(insight.clicks || '0', 10),
    spend: parseFloat(insight.spend || '0'),
    ctr: parseFloat(insight.ctr || '0'),
    cpc: parseFloat(insight.cpc || '0'),
    cpm: parseFloat(insight.cpm || '0'),
  };

  // Custom actions
  if (input.customActions && input.customActions.length > 0) {
    const actions = parseActions(insight.actions || [], input.attributionWindows);
    const costPerActions = parseActions(insight.cost_per_action_type || [], input.attributionWindows);

    const conversions: Record<string, number> = {};
    for (const actionName of input.customActions) {
      const actionType = resolveActionType(actionName);
      if (actions[actionType] !== undefined) conversions[actionName] = actions[actionType];
      if (costPerActions[actionType] !== undefined) conversions[`cost_per_${actionName}`] = costPerActions[actionType];
    }
    segment.conversions = conversions;
  }

  return segment;
}

/**
 * Format video metrics segment
 */
function formatVideoSegment(insight: any, input: GetDemographicsInput, config: typeof LEVEL_CONFIG[keyof typeof LEVEL_CONFIG]): any {
  const segment: any = {};

  // Entity identifiers
  segment[config.idField] = insight[config.idField];
  segment[config.nameField] = insight[config.nameField];

  for (const breakdown of input.breakdowns) {
    segment[breakdown] = insight[breakdown] || 'unknown';
  }

  const videoMetrics = parseVideoMetrics(insight);
  const playActions = parseActions(insight.video_play_actions || [], input.attributionWindows);
  const plays = playActions.video_view || 0;
  const thruplayActions = parseActions(insight.video_thruplay_watched_actions || [], input.attributionWindows);
  const thruplay = thruplayActions.video_view || 0;

  segment.completionFunnel = {
    plays,
    '25percent': videoMetrics.p25,
    '50percent': videoMetrics.p50,
    '75percent': videoMetrics.p75,
    '95percent': videoMetrics.p95,
    '100percent': videoMetrics.p100,
    thruplay,
  };

  const calcRate = (count: number): string =>
    plays === 0 ? '0.00%' : ((count / plays) * 100).toFixed(2) + '%';

  segment.completionRates = {
    '25percent': calcRate(videoMetrics.p25),
    '50percent': calcRate(videoMetrics.p50),
    '75percent': calcRate(videoMetrics.p75),
    '95percent': calcRate(videoMetrics.p95),
    '100percent': calcRate(videoMetrics.p100),
  };

  return segment;
}

/**
 * Format conversions segment
 */
function formatConversionsSegment(
  insight: any,
  input: GetDemographicsInput,
  actionTypes: string[],
  config: typeof LEVEL_CONFIG[keyof typeof LEVEL_CONFIG]
): any {
  const segment: any = {
    period: `${insight.date_start} to ${insight.date_stop}`,
  };

  // Entity identifiers
  segment[config.idField] = insight[config.idField] || '';
  segment[config.nameField] = insight[config.nameField] || `${config.label} ${insight[config.idField] || 'Unknown'}`;

  // Breakdown dimensions
  for (const breakdown of input.breakdowns) {
    segment[breakdown] = insight[breakdown] || 'unknown';
  }

  // Parse conversions by action type with per-window values
  const actions = parseActions(insight.actions || [], input.attributionWindows);
  const costPerActions = parseActions(insight.cost_per_action_type || [], input.attributionWindows);
  const actionValues = input.includeConversionValue
    ? parseActions(insight.action_values || [], input.attributionWindows)
    : {};

  const conversions: Record<string, Record<string, number>> = {};
  const costPerConversion: Record<string, number> = {};
  const conversionValues: Record<string, number> = {};
  const roas: Record<string, number> = {};

  for (const actionType of actionTypes) {
    // Per-window values
    const windowData: Record<string, number> = {};
    if (insight.actions) {
      for (const action of insight.actions) {
        if (action.action_type === actionType) {
          for (const window of input.attributionWindows) {
            const val = (action as any)[window];
            if (val !== undefined) {
              const num = typeof val === 'string' ? parseFloat(val) : val;
              if (!isNaN(num) && num > 0) windowData[window] = num;
            }
          }
        }
      }
    }
    if (Object.keys(windowData).length > 0) conversions[actionType] = windowData;
    if (costPerActions[actionType] !== undefined) costPerConversion[actionType] = costPerActions[actionType];

    if (input.includeConversionValue && actionValues[actionType] !== undefined) {
      conversionValues[actionType] = actionValues[actionType];
      const spend = parseFloat(insight.spend || '0');
      if (spend > 0) roas[actionType] = actionValues[actionType] / spend;
    }
  }

  segment.conversions = conversions;
  segment.performance = {
    spend: parseFloat(insight.spend || '0'),
    impressions: parseInt(insight.impressions || '0', 10),
    clicks: parseInt(insight.clicks || '0', 10),
    ctr: parseFloat(insight.ctr || '0'),
    cpc: parseFloat(insight.cpc || '0'),
    cpm: parseFloat(insight.cpm || '0'),
  };
  segment.costPerConversion = costPerConversion;

  if (input.includeConversionValue) {
    segment.conversionValues = conversionValues;
    segment.roas = roas;
  }

  return segment;
}

/**
 * Query demographics from Meta Insights API
 */
export async function getDemographics(args: unknown): Promise<string> {
  const input = GetDemographicsSchema.parse(args);
  const config = LEVEL_CONFIG[input.level];

  try {
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Build fields based on metricsType
    let fields: string[];
    let actionTypes: string[] = [];

    switch (input.metricsType) {
      case 'video':
        fields = [
          'video_p25_watched_actions',
          'video_p50_watched_actions',
          'video_p75_watched_actions',
          'video_p95_watched_actions',
          'video_p100_watched_actions',
          'video_thruplay_watched_actions',
          'video_play_actions',
          config.idField, config.nameField,
        ];
        break;

      case 'conversions':
        actionTypes = buildActionTypes(input);
        if (actionTypes.length === 0) {
          return 'No conversion metrics specified. Provide conversionMetrics or customActions.';
        }
        fields = [
          'impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm',
          'actions', 'cost_per_action_type',
          config.idField, config.nameField,
        ];
        if (input.includeConversionValue) fields.push('action_values');
        break;

      default: // standard
        fields = [
          'impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm',
          config.idField, config.nameField,
        ];
        if (input.customActions && input.customActions.length > 0) {
          fields.push('actions', 'cost_per_action_type');
        }
        break;
    }

    const params: any = {
      date_preset: input.dateRange,
      level: input.level,
      time_increment: 'all_days' as const,
      breakdowns: input.breakdowns,
      action_attribution_windows: input.attributionWindows,
    };

    // Server-side filtering when entityId is provided
    if (input.entityId) {
      params.filtering = [{
        field: `${input.level}.id`,
        operator: 'EQUAL',
        value: input.entityId,
      }];
    }

    const insights = await metricsService.getAllInsights(fields, params);

    // Filter by entity (belt-and-suspenders)
    let filtered = insights;
    if (input.entityId) {
      filtered = insights.filter((i) => i[config.idField] === input.entityId);
      if (filtered.length === 0) {
        return `${config.label} ${input.entityId} not found in date range ${input.dateRange}`;
      }
    }

    // Video mode: filter to video ads only
    if (input.metricsType === 'video') {
      filtered = filtered.filter((insight) => {
        const playActions = parseActions(insight.video_play_actions || []);
        return (playActions.video_view || 0) > 0;
      });
    }

    // Conversions mode: filter to insights with conversions
    if (input.metricsType === 'conversions') {
      filtered = filtered.filter((insight) => {
        if (!insight.actions || !Array.isArray(insight.actions)) return false;
        const actions = parseActions(insight.actions, input.attributionWindows);
        return actionTypes.some((at) => actions[at] && actions[at] > 0);
      });
    }

    if (filtered.length === 0) {
      return `No demographic breakdown data for date range ${input.dateRange}`;
    }

    if (filtered.length > 200) {
      console.warn(`[get-demographics] Large result set: ${filtered.length} segments. Consider filtering by entityId or fewer breakdowns.`);
    }

    // Format segments based on metricsType
    const segments = filtered.map((insight) => {
      switch (input.metricsType) {
        case 'video':
          return formatVideoSegment(insight, input, config);
        case 'conversions':
          return formatConversionsSegment(insight, input, actionTypes, config);
        default:
          return formatStandardSegment(insight, input, config);
      }
    });

    const response: any = {
      dateRange: input.dateRange,
      level: input.level,
      metricsType: input.metricsType,
      breakdowns: input.breakdowns,
      totalSegments: segments.length,
      segments,
    };

    // Summary for conversions mode
    if (input.metricsType === 'conversions') {
      const totalConversions: Record<string, number> = {};
      let totalSpend = 0;

      for (const at of actionTypes) totalConversions[at] = 0;

      for (const seg of segments) {
        totalSpend += seg.performance.spend;
        for (const at of actionTypes) {
          if (seg.conversions[at]) {
            for (const w in seg.conversions[at]) {
              totalConversions[at] += seg.conversions[at][w];
            }
          }
        }
      }

      const avgCostPerConversion: Record<string, number> = {};
      for (const at of actionTypes) {
        if (totalConversions[at] > 0) {
          avgCostPerConversion[at] = totalSpend / totalConversions[at];
        }
      }

      response.summary = { totalConversions, totalSpend, avgCostPerConversion };
    }

    return JSON.stringify(response, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      return `Error querying demographics: ${error.message}`;
    }
    return 'Unknown error occurred while querying demographics';
  }
}

/**
 * MCP Tool definition for get-demographics
 */
export const getDemographicsTool: Tool = {
  name: 'get-demographics',
  description:
    'Query performance metrics segmented by demographic/placement breakdowns (age, gender, country, device, publisher platform, platform position). Three modes: "standard" for impressions/clicks/spend on all ads, "video" for completion funnel on video ads, "conversions" for conversion tracking by placement with ROAS. Replaces get-video-demographics, get-ad-demographics, and get-placement-conversions.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_30d', 'last_90d', 'this_month'],
        description: 'Date range preset',
        default: 'last_7d',
      },
      level: {
        type: 'string' as const,
        enum: ['campaign', 'adset', 'ad'],
        description: 'Aggregation level',
        default: 'campaign',
      },
      entityId: {
        type: 'string' as const,
        description: 'Optional campaign/adset/ad ID to filter results',
      },
      breakdowns: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['age', 'gender', 'country', 'device_platform', 'publisher_platform', 'platform_position'],
        },
        description: 'Breakdown dimensions (WARNING: combinations multiply rows)',
        default: ['age', 'gender'],
      },
      metricsType: {
        type: 'string' as const,
        enum: ['standard', 'video', 'conversions'],
        description: 'Type of metrics: "standard" (impressions/clicks/spend for all ads), "video" (completion funnel for video ads), "conversions" (conversion counts by placement with ROAS)',
        default: 'standard',
      },
      customActions: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Custom conversion actions (e.g., ["subscription_created"])',
      },
      conversionMetrics: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['purchase', 'lead', 'complete_registration', 'add_to_cart', 'initiate_checkout', 'add_payment_info', 'subscribe', 'start_trial'],
        },
        description: 'Standard conversion events for conversions mode (default: purchase)',
        default: ['purchase'],
      },
      includeConversionValue: {
        type: 'boolean' as const,
        description: 'Include conversion values and ROAS (conversions mode)',
        default: false,
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
  },
};
