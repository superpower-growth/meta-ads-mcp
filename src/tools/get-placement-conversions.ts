/**
 * Get Placement Conversions Tool
 *
 * MCP tool for querying conversion metrics broken down by ad placement
 * (Feed, Stories, Reels, etc.) with customizable attribution windows.
 * Enables analysis of which placements drive the most conversions.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService, type InsightObject } from '../meta/metrics.js';
import { parseActions } from '../lib/parsers.js';
import { resolveActionType } from '../lib/custom-conversions.js';
import { env } from '../config/env.js';

/**
 * Input schema for get-placement-conversions tool
 */
const GetPlacementConversionsSchema = z.object({
  dateRange: z
    .enum(['last_7d', 'last_30d', 'last_90d', 'this_month'])
    .default('last_7d')
    .describe('Date range preset for metrics query'),
  level: z
    .enum(['campaign', 'adset', 'ad'])
    .default('campaign')
    .describe('Aggregation level for conversion metrics'),
  entityId: z
    .string()
    .optional()
    .describe('Optional campaign/adset/ad ID to filter results'),
  breakdowns: z
    .array(z.enum(['platform_position', 'publisher_platform']))
    .min(1)
    .default(['platform_position'])
    .describe('Placement breakdown dimensions (WARNING: combinations multiply rows)'),
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
    .describe('Standard conversion event types to track'),
  customConversions: z
    .array(z.string())
    .optional()
    .describe('Custom conversion names or IDs (e.g., ["subscription_created"])'),
  attributionWindows: z
    .array(z.enum(['1d_click', '7d_click', '28d_click', '1d_view']))
    .default(['7d_click', '1d_view'])
    .describe('Attribution windows for conversion tracking'),
  includeConversionValue: z
    .boolean()
    .default(false)
    .describe('Include conversion values and ROAS calculations'),
});

type GetPlacementConversionsInput = z.infer<typeof GetPlacementConversionsSchema>;

/**
 * Placement conversions response format
 */
interface PlacementConversions {
  dateRange: string;
  level: string;
  breakdowns: string[];
  attributionWindows: string[];
  segments: Array<{
    campaign_id?: string;
    campaign_name?: string;
    adset_id?: string;
    adset_name?: string;
    ad_id?: string;
    ad_name?: string;
    platform_position?: string;
    publisher_platform?: string;
    period: string;
    conversions: Record<string, Record<string, number>>;
    performance: {
      spend: number;
      impressions: number;
      clicks: number;
      ctr: number;
      cpc: number;
      cpm: number;
    };
    costPerConversion: Record<string, number>;
    roas?: Record<string, number>;
    conversionValues?: Record<string, number>;
  }>;
  summary: {
    totalConversions: Record<string, number>;
    totalSpend: number;
    avgCostPerConversion: Record<string, number>;
  };
}

/**
 * Build list of action types to query
 */
function buildActionTypeList(input: GetPlacementConversionsInput): string[] {
  const actionTypes: string[] = [];

  // Add standard conversion metrics
  for (const metric of input.conversionMetrics) {
    if (metric === 'purchase') {
      actionTypes.push('omni_purchase');
    } else if (metric === 'lead') {
      actionTypes.push('lead');
    } else if (metric === 'complete_registration') {
      actionTypes.push('complete_registration');
    } else if (metric === 'add_to_cart') {
      actionTypes.push('add_to_cart');
    } else if (metric === 'initiate_checkout') {
      actionTypes.push('initiate_checkout');
    } else if (metric === 'add_payment_info') {
      actionTypes.push('add_payment_info');
    } else if (metric === 'subscribe') {
      actionTypes.push('subscribe');
    } else if (metric === 'start_trial') {
      actionTypes.push('start_trial');
    }
  }

  // Add custom conversions
  if (input.customConversions) {
    for (const customName of input.customConversions) {
      actionTypes.push(resolveActionType(customName));
    }
  }

  return actionTypes;
}

/**
 * Filter insights by entity ID if specified
 */
function filterByEntity(
  insights: InsightObject[],
  input: GetPlacementConversionsInput
): InsightObject[] {
  if (!input.entityId) {
    return insights;
  }

  const idField =
    input.level === 'campaign' ? 'campaign_id' : input.level === 'adset' ? 'adset_id' : 'ad_id';

  return insights.filter((insight) => insight[idField] === input.entityId);
}

/**
 * Filter insights to only those with conversions
 */
function filterConversions(
  insights: InsightObject[],
  actionTypes: string[],
  attributionWindows: string[]
): InsightObject[] {
  return insights.filter((insight) => {
    if (!insight.actions || !Array.isArray(insight.actions)) {
      return false;
    }

    const actions = parseActions(insight.actions, attributionWindows);

    // Check if any requested action type has conversions
    for (const actionType of actionTypes) {
      if (actions[actionType] && actions[actionType] > 0) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Calculate summary statistics
 */
function calculateSummary(
  segments: PlacementConversions['segments'],
  actionTypes: string[]
): PlacementConversions['summary'] {
  const totalConversions: Record<string, number> = {};
  let totalSpend = 0;

  // Initialize conversion totals
  for (const actionType of actionTypes) {
    totalConversions[actionType] = 0;
  }

  // Sum across all segments
  for (const segment of segments) {
    totalSpend += segment.performance.spend;

    for (const actionType of actionTypes) {
      if (segment.conversions[actionType]) {
        for (const window in segment.conversions[actionType]) {
          totalConversions[actionType] += segment.conversions[actionType][window];
        }
      }
    }
  }

  // Calculate average cost per conversion
  const avgCostPerConversion: Record<string, number> = {};
  for (const actionType of actionTypes) {
    if (totalConversions[actionType] > 0) {
      avgCostPerConversion[actionType] = totalSpend / totalConversions[actionType];
    }
  }

  return {
    totalConversions,
    totalSpend,
    avgCostPerConversion,
  };
}

/**
 * Format empty result message
 */
function formatEmptyResult(input: GetPlacementConversionsInput): string {
  if (input.entityId) {
    const levelName = input.level.charAt(0).toUpperCase() + input.level.slice(1);
    return `No conversion data found for ${levelName} ${input.entityId} in date range ${input.dateRange}`;
  }
  return `No conversion data found for date range ${input.dateRange}`;
}

/**
 * Format response with placement conversion data
 */
function formatPlacementConversionsResponse(
  insights: InsightObject[],
  input: GetPlacementConversionsInput,
  actionTypes: string[]
): PlacementConversions {
  const segments = insights.map((insight) => {
    // Parse conversion actions with attribution windows
    const actions = parseActions(insight.actions || [], input.attributionWindows);
    const costPerActions = parseActions(
      insight.cost_per_action_type || [],
      input.attributionWindows
    );
    const actionValues = input.includeConversionValue
      ? parseActions(insight.action_values || [], input.attributionWindows)
      : {};

    // Build conversions object grouped by action type and attribution window
    const conversions: Record<string, Record<string, number>> = {};
    const costPerConversion: Record<string, number> = {};
    const conversionValues: Record<string, number> = {};
    const roas: Record<string, number> = {};

    for (const actionType of actionTypes) {
      // Get conversions for each attribution window
      const windowData: Record<string, number> = {};

      // Parse actions with windows to get individual window values
      if (insight.actions) {
        for (const action of insight.actions) {
          if (action.action_type === actionType) {
            for (const window of input.attributionWindows) {
              const actionAny = action as any;
              if (actionAny[window] !== undefined) {
                const value = typeof actionAny[window] === 'string'
                  ? parseFloat(actionAny[window])
                  : actionAny[window];
                if (!isNaN(value) && value > 0) {
                  windowData[window] = value;
                }
              }
            }
          }
        }
      }

      if (Object.keys(windowData).length > 0) {
        conversions[actionType] = windowData;
      }

      // Add cost per conversion
      if (costPerActions[actionType] !== undefined) {
        costPerConversion[actionType] = costPerActions[actionType];
      }

      // Add conversion values if requested
      if (input.includeConversionValue && actionValues[actionType] !== undefined) {
        conversionValues[actionType] = actionValues[actionType];

        // Calculate ROAS
        const spend = parseFloat(insight.spend || '0');
        if (spend > 0) {
          roas[actionType] = actionValues[actionType] / spend;
        }
      }
    }

    // Build segment object
    const segment: any = {
      period: `${insight.date_start} to ${insight.date_stop}`,
    };

    // Add entity identifiers based on level
    if (input.level === 'campaign') {
      segment.campaign_id = insight.campaign_id || '';
      segment.campaign_name = insight.campaign_name || 'Unknown Campaign';
    } else if (input.level === 'adset') {
      segment.adset_id = insight.adset_id || '';
      segment.adset_name = insight.adset_name || 'Unknown Ad Set';
    } else if (input.level === 'ad') {
      segment.ad_id = insight.ad_id || '';
      segment.ad_name = insight.ad_name || `Ad ${insight.ad_id || 'Unknown'}`;
    }

    // Add breakdown dimensions
    for (const breakdown of input.breakdowns) {
      segment[breakdown] = insight[breakdown] || 'unknown';
    }

    // Add conversion data
    segment.conversions = conversions;

    // Add performance metrics
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
  });

  // Calculate summary
  const summary = calculateSummary(segments, actionTypes);

  return {
    dateRange: input.dateRange,
    level: input.level,
    breakdowns: input.breakdowns,
    attributionWindows: input.attributionWindows,
    segments,
    summary,
  };
}

/**
 * Query placement conversion metrics from Meta Insights API
 *
 * @param args - Tool arguments
 * @returns Pretty-printed JSON with placement conversion data
 */
export async function getPlacementConversions(args: unknown): Promise<string> {
  // Validate input
  const input = GetPlacementConversionsSchema.parse(args);

  try {
    // Initialize MetricsService with account ID from environment
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Build list of action types to query
    const actionTypes = buildActionTypeList(input);

    if (actionTypes.length === 0) {
      return 'No conversion metrics specified. Please provide at least one conversion metric or custom conversion.';
    }

    // Define fields to request
    const fields: string[] = [
      'impressions',
      'clicks',
      'spend',
      'ctr',
      'cpc',
      'cpm',
      'actions',
      'cost_per_action_type',
    ];

    if (input.includeConversionValue) {
      fields.push('action_values');
    }

    // Add entity ID and name fields based on level
    if (input.level === 'campaign') {
      if (!fields.includes('campaign_id')) {
        fields.push('campaign_id');
      }
      if (!fields.includes('campaign_name')) {
        fields.push('campaign_name');
      }
    } else if (input.level === 'adset') {
      if (!fields.includes('adset_id')) {
        fields.push('adset_id');
      }
      if (!fields.includes('adset_name')) {
        fields.push('adset_name');
      }
    } else if (input.level === 'ad') {
      if (!fields.includes('ad_id')) {
        fields.push('ad_id');
      }
      if (!fields.includes('ad_name')) {
        fields.push('ad_name');
      }
    }

    // Prepare query parameters
    const params = {
      date_preset: input.dateRange,
      level: input.level,
      time_increment: 'all_days' as const,
      breakdowns: input.breakdowns,
      action_attribution_windows: input.attributionWindows,
    };

    // Query insights from Meta API with automatic pagination
    const insights = await metricsService.getAllInsights(fields as any, params);

    // Filter to specific entity if requested
    let filteredInsights = filterByEntity(insights, input);

    // Return error if entity not found
    if (input.entityId && filteredInsights.length === 0) {
      const levelName = input.level.charAt(0).toUpperCase() + input.level.slice(1);
      return `${levelName} ${input.entityId} not found in date range ${input.dateRange}`;
    }

    // Filter to only insights with conversions
    const conversionInsights = filterConversions(
      filteredInsights,
      actionTypes,
      input.attributionWindows
    );

    // Return message if no conversions found
    if (conversionInsights.length === 0) {
      return formatEmptyResult(input);
    }

    // Warn if result set is very large
    if (conversionInsights.length > 100) {
      console.warn(
        `[get-placement-conversions] Large result set: ${conversionInsights.length} segments. Consider fewer breakdowns.`
      );
    }

    // Format response
    const response = formatPlacementConversionsResponse(
      conversionInsights,
      input,
      actionTypes
    );

    // Return pretty-printed JSON for Claude consumption
    return JSON.stringify(response, null, 2);
  } catch (error) {
    // Format error messages for user clarity
    if (error instanceof Error) {
      return `Error querying placement conversions: ${error.message}`;
    }
    return 'Unknown error occurred while querying placement conversions';
  }
}

/**
 * MCP Tool definition for get-placement-conversions
 */
export const getPlacementConversionsTool: Tool = {
  name: 'get-placement-conversions',
  description:
    'Query conversion metrics broken down by ad placement (Feed, Stories, Reels, etc.) with customizable attribution windows. Enables analysis of which placements drive the most conversions with cost efficiency and ROAS metrics.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_30d', 'last_90d', 'this_month'],
        description: 'Date range preset for metrics query',
        default: 'last_7d',
      },
      level: {
        type: 'string' as const,
        enum: ['campaign', 'adset', 'ad'],
        description: 'Aggregation level for conversion metrics',
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
          enum: ['platform_position', 'publisher_platform'],
        },
        description:
          'Placement breakdown dimensions (WARNING: combinations multiply rows)',
        default: ['platform_position'],
      },
      conversionMetrics: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: [
            'purchase',
            'lead',
            'complete_registration',
            'add_to_cart',
            'initiate_checkout',
            'add_payment_info',
            'subscribe',
            'start_trial',
          ],
        },
        description: 'Standard conversion event types to track',
        default: ['purchase'],
      },
      customConversions: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
        },
        description:
          'Custom conversion names or IDs (e.g., ["subscription_created"])',
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
      includeConversionValue: {
        type: 'boolean' as const,
        description: 'Include conversion values and ROAS calculations',
        default: false,
      },
    },
  },
};
