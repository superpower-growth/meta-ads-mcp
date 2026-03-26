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
    .enum(['ALL', 'ACCOUNT', 'AD', 'AD_SET', 'AUDIENCE', 'BID', 'BUDGET', 'CAMPAIGN', 'DATE', 'STATUS', 'TARGETING'])
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
function getDateRange(preset: string): { since: string; until: string } {
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  const daysMap: Record<string, number> = {
    last_7d: 7,
    last_14d: 14,
    last_30d: 30,
    last_90d: 90,
  };
  const days = daysMap[preset] ?? 7;
  return { since: String(now - days * day), until: String(now) };
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

    // Build API params
    const params: Record<string, any> = {
      since,
      until,
      limit: input.limit,
    };

    // Add category filter — Meta API expects native category strings
    if (input.category !== 'ALL') {
      params.category = input.category;
    }

    // Add object filters
    if (input.campaignId) {
      params.oid = input.campaignId;
    } else if (input.adsetId) {
      params.oid = input.adsetId;
    }

    // Call Meta API activities endpoint via direct fetch
    const url = new URL(`https://graph.facebook.com/v21.0/${accountId}/activities`);
    url.searchParams.set('access_token', env.META_ACCESS_TOKEN);
    url.searchParams.set('since', since);
    url.searchParams.set('until', until);
    url.searchParams.set('limit', String(input.limit));
    if (params.category) url.searchParams.set('category', params.category);
    if (params.oid) url.searchParams.set('oid', params.oid);

    const response = await fetch(url.toString());
    const json: any = await response.json();

    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }

    const activities = json?.data || [];
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
        enum: ['ALL', 'ACCOUNT', 'AD', 'AD_SET', 'AUDIENCE', 'BID', 'BUDGET', 'CAMPAIGN', 'DATE', 'STATUS', 'TARGETING'],
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
