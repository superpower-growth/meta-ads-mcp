/**
 * Get Account Activity Tool
 *
 * MCP tool for querying account activity history from Meta Marketing API.
 * Returns budget changes, status changes, bid changes, and all other actions
 * taken on the ad account.
 *
 * @see https://developers.facebook.com/docs/marketing-api/reference/ad-activity
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { env } from '../config/env.js';

/**
 * Activity event categories from Meta's API
 */
const EVENT_TYPES = [
  'ad_account_update_spend_limit',
  'ad_account_set_business_information',
  'ad_account_billing_charge',
  'campaign_budget',
  'campaign_duration',
  'campaign_create',
  'campaign_delete',
  'campaign_pause',
  'campaign_unpause',
  'adset_budget',
  'adset_duration',
  'adset_create',
  'adset_delete',
  'adset_pause',
  'adset_unpause',
  'adset_bid',
  'adset_targeting',
  'adset_schedule',
  'ad_creative_update',
  'ad_create',
  'ad_delete',
  'ad_pause',
  'ad_unpause',
  'funding_event_initiate',
  'funding_event_complete',
] as const;

/**
 * Input schema for get-activity-log tool
 */
const GetAccountActivitySchema = z.object({
  dateRange: z
    .enum(['last_7d', 'last_14d', 'last_30d', 'last_90d'])
    .default('last_7d')
    .describe('Date range for activity history'),
  category: z
    .enum(['ALL', 'BUDGET', 'STATUS', 'BID', 'TARGETING', 'CREATIVE', 'ACCOUNT', 'BILLING'])
    .default('ALL')
    .describe('Filter by activity category'),
  campaignId: z
    .string()
    .optional()
    .describe('Filter activities for a specific campaign ID'),
  adsetId: z
    .string()
    .optional()
    .describe('Filter activities for a specific ad set ID'),
  limit: z
    .number()
    .default(100)
    .describe('Max activities to return'),
});

type GetAccountActivityInput = z.infer<typeof GetAccountActivitySchema>;

/**
 * Map category filter to Meta API event_type values
 */
function getCategoryEventTypes(category: string): string[] | undefined {
  switch (category) {
    case 'BUDGET':
      return [
        'campaign_budget',
        'adset_budget',
        'ad_account_update_spend_limit',
      ];
    case 'STATUS':
      return [
        'campaign_create', 'campaign_delete', 'campaign_pause', 'campaign_unpause',
        'adset_create', 'adset_delete', 'adset_pause', 'adset_unpause',
        'ad_create', 'ad_delete', 'ad_pause', 'ad_unpause',
      ];
    case 'BID':
      return ['adset_bid'];
    case 'TARGETING':
      return ['adset_targeting', 'adset_schedule', 'adset_duration', 'campaign_duration'];
    case 'CREATIVE':
      return ['ad_creative_update'];
    case 'ACCOUNT':
      return ['ad_account_update_spend_limit', 'ad_account_set_business_information'];
    case 'BILLING':
      return ['funding_event_initiate', 'funding_event_complete', 'ad_account_billing_charge'];
    case 'ALL':
    default:
      return undefined; // No filter = return all
  }
}

/**
 * Convert date range preset to since/until timestamps
 */
function getDateRange(preset: string): { since: number; until: number } {
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  switch (preset) {
    case 'last_7d':
      return { since: now - 7 * day, until: now };
    case 'last_14d':
      return { since: now - 14 * day, until: now };
    case 'last_30d':
      return { since: now - 30 * day, until: now };
    case 'last_90d':
      return { since: now - 90 * day, until: now };
    default:
      return { since: now - 7 * day, until: now };
  }
}

/**
 * Format a single activity entry for display
 */
function formatActivity(activity: any): any {
  const formatted: any = {
    eventType: activity.event_type,
    eventTime: activity.event_time,
    dateTime: new Date(activity.event_time * 1000).toISOString(),
    actor: activity.actor_name || activity.actor_id || 'Unknown',
  };

  if (activity.object_name) formatted.objectName = activity.object_name;
  if (activity.object_id) formatted.objectId = activity.object_id;
  if (activity.object_type) formatted.objectType = activity.object_type;

  // Include old/new values for change tracking
  if (activity.old_value !== undefined && activity.old_value !== null) {
    formatted.oldValue = activity.old_value;
  }
  if (activity.new_value !== undefined && activity.new_value !== null) {
    formatted.newValue = activity.new_value;
  }
  if (activity.extra_data) {
    formatted.extraData = activity.extra_data;
  }

  return formatted;
}

/**
 * Query account activity history from Meta Marketing API
 */
export async function getAccountActivity(args: unknown): Promise<string> {
  const input = GetAccountActivitySchema.parse(args);

  const accountId = env.META_AD_ACCOUNT_ID.startsWith('act_')
    ? env.META_AD_ACCOUNT_ID
    : `act_${env.META_AD_ACCOUNT_ID}`;

  try {
    const { since, until } = getDateRange(input.dateRange);
    const categoryTypes = getCategoryEventTypes(input.category);

    // Build API params
    const params: Record<string, any> = {
      since,
      until,
      limit: input.limit,
    };

    // Add category filter
    if (categoryTypes) {
      params.category = categoryTypes;
    }

    // Add object filters
    if (input.campaignId) {
      params.oid = input.campaignId;
    } else if (input.adsetId) {
      params.oid = input.adsetId;
    }

    // Call Meta API activities endpoint
    const { FacebookAdsApi } = await import('facebook-nodejs-business-sdk');
    const api = FacebookAdsApi.getDefaultApi();
    const response: any = await api.call(
      'GET',
      [`${accountId}/activities`],
      params,
    );

    const activities = response?.data || [];
    const formatted = activities.map(formatActivity);

    // Group by event type for summary
    const summary: Record<string, number> = {};
    for (const act of formatted) {
      summary[act.eventType] = (summary[act.eventType] || 0) + 1;
    }

    const result = {
      dateRange: input.dateRange,
      category: input.category,
      totalActivities: formatted.length,
      summary,
      activities: formatted,
    };

    return JSON.stringify(result, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Meta API error: ${error.message}`);
    }
    throw new Error('Unknown error querying account activity');
  }
}

/**
 * MCP Tool definition for get-activity-log
 */
export const getAccountActivityTool: Tool = {
  name: 'get-activity-log',
  description:
    'Query account activity history showing budget changes, status changes (pause/unpause), bid changes, targeting updates, creative changes, and billing events. Use this to audit what actions were taken on the account.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_14d', 'last_30d', 'last_90d'],
        default: 'last_7d',
        description: 'Date range for activity history',
      },
      category: {
        type: 'string' as const,
        enum: ['ALL', 'BUDGET', 'STATUS', 'BID', 'TARGETING', 'CREATIVE', 'ACCOUNT', 'BILLING'],
        default: 'ALL',
        description: 'Filter by activity category',
      },
      campaignId: {
        type: 'string' as const,
        description: 'Filter activities for a specific campaign ID',
      },
      adsetId: {
        type: 'string' as const,
        description: 'Filter activities for a specific ad set ID',
      },
      limit: {
        type: 'number' as const,
        default: 100,
        description: 'Max activities to return',
      },
    },
  },
};
