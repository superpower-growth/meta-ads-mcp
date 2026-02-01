/**
 * MetricsService - Meta Insights API Query Abstraction
 *
 * Wraps Meta SDK's getInsights() method with proper error handling and response parsing.
 * Provides clean interfaces for querying insights at different aggregation levels.
 *
 * Critical patterns from DISCOVERY.md:
 * - Use getInsights(fields, params) where fields is string[] and params is object
 * - Common params: {date_preset, level, time_increment, limit}
 * - Response is array of insight objects with date_start, date_stop, and requested metrics
 * - DO NOT use deprecated attribution windows (action_attribution_windows) - will return empty data silently
 *
 * @see https://developers.facebook.com/docs/marketing-api/insights
 */

import { AdAccount, Campaign, AdSet, Ad } from 'facebook-nodejs-business-sdk';
import { api } from './client.js';

/**
 * Insight query parameters
 */
export interface InsightParams {
  date_preset?: string;
  time_range?: {
    since: string;
    until: string;
  };
  level?: 'account' | 'campaign' | 'adset' | 'ad';
  time_increment?: number | 'monthly' | 'all_days';
  limit?: number;
  breakdowns?: string[];
  [key: string]: any;
}

/**
 * Insight object returned by Meta API
 */
export interface InsightObject {
  account_id?: string;
  account_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start: string;
  date_stop: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  reach?: string;
  frequency?: string;
  cpc?: string;
  cpm?: string;
  cpp?: string;
  ctr?: string;
  inline_link_click_ctr?: string;
  unique_ctr?: string;
  conversions?: string;
  conversion_values?: string;
  cost_per_conversion?: string;
  purchase_roas?: any;
  mobile_app_purchase_roas?: any;
  website_purchase_roas?: any;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  video_15_sec_watched_actions?: Array<{ action_type: string; value: string }>;
  video_30_sec_watched_actions?: Array<{ action_type: string; value: string }>;
  video_continuous_2_sec_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p25_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p50_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p75_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p95_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p100_watched_actions?: Array<{ action_type: string; value: string }>;
  video_play_actions?: Array<{ action_type: string; value: string }>;
  video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
  [key: string]: any;
}

/**
 * MetricsService - Query Meta Insights API
 *
 * Provides methods for querying insights at different aggregation levels.
 * Handles Meta API errors with readable messages.
 *
 * @example
 * ```typescript
 * const service = new MetricsService('act_123456789');
 * const insights = await service.getAccountInsights(
 *   ['impressions', 'clicks', 'spend'],
 *   { date_preset: 'last_7d', level: 'campaign' }
 * );
 * ```
 */
export class MetricsService {
  private accountId: string;

  /**
   * Initialize MetricsService
   *
   * @param accountId - Meta ad account ID in format 'act_XXXXXXXX'
   */
  constructor(accountId: string) {
    this.accountId = accountId;
  }

  /**
   * Get insights at account level
   *
   * Queries Meta Insights API using AdAccount.getInsights() method.
   * Returns array of insight objects with requested metrics.
   *
   * @param fields - Array of metric field names to retrieve (e.g., ['impressions', 'clicks', 'spend'])
   * @param params - Query parameters (date_preset, level, time_increment, limit)
   * @returns Promise resolving to array of insight objects
   * @throws Error if Meta API call fails with formatted error message
   *
   * @example
   * ```typescript
   * const insights = await service.getAccountInsights(
   *   ['impressions', 'clicks', 'ctr', 'cpc'],
   *   {
   *     date_preset: 'last_7d',
   *     level: 'campaign',
   *     time_increment: 1
   *   }
   * );
   * ```
   *
   * IMPORTANT: Do not use deprecated attribution windows (action_attribution_windows).
   * As of January 12, 2026, deprecated windows return empty data silently.
   */
  async getAccountInsights(
    fields: string[],
    params: InsightParams
  ): Promise<InsightObject[]> {
    try {
      const account = new AdAccount(this.accountId);
      const response = await account.getInsights(fields, params);

      // Response is a Cursor object (array-like), convert to plain array
      const insights: InsightObject[] = [];
      for (const insight of response) {
        insights.push(insight as InsightObject);
      }
      return insights;
    } catch (error: any) {
      // Transform Meta API errors into readable messages
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Meta Insights API error: ${errorMessage}`);
    }
  }

  /**
   * Format Meta API error into readable message
   *
   * @param error - Error object from Meta SDK
   * @returns Formatted error message string
   * @private
   */
  private formatMetaError(error: any): string {
    // Log raw error for debugging
    console.error('[MetricsService] Raw Meta API error:', {
      message: error.message,
      code: error.code,
      type: error.type,
      error_subcode: error.error_subcode,
    });

    // Extract meaningful error information
    if (error.message) {
      return error.message;
    }

    if (error.error?.message) {
      return error.error.message;
    }

    return 'Unknown Meta API error occurred';
  }
}
