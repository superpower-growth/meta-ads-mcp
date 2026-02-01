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
   * @param params - Query parameters (date_preset, level, time_increment, limit, breakdowns)
   * @param params.breakdowns - Optional array of breakdown dimensions (e.g., ['age', 'gender'])
   *                            WARNING: Breakdowns multiply result rows. age × gender = many rows per entity.
   *                            Common breakdowns: 'age', 'gender', 'country', 'region', 'device_platform', 'publisher_platform'
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
   * @example With breakdowns:
   * ```typescript
   * const insights = await service.getAccountInsights(
   *   ['impressions', 'video_p100_watched_actions'],
   *   {
   *     date_preset: 'last_7d',
   *     level: 'ad',
   *     breakdowns: ['age', 'gender']
   *   }
   * );
   * // Returns multiple rows per ad (one per age-gender combination)
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
   * Get all insights with automatic pagination
   *
   * Fetches all pages of insights data by recursively following paging.next cursor.
   * Aggregates results from all pages into a single array.
   *
   * @param fields - Array of metric field names to retrieve
   * @param params - Query parameters (date_preset, level, time_increment, limit, breakdowns)
   * @param params.breakdowns - Optional array of breakdown dimensions (e.g., ['age', 'gender'])
   *                            WARNING: Breakdowns multiply result rows. age × gender = many rows per entity.
   *                            Common breakdowns: 'age', 'gender', 'country', 'region', 'device_platform', 'publisher_platform'
   * @returns Promise resolving to complete array of all insight objects across all pages
   * @throws Error if any page fails with page number context
   *
   * @example
   * ```typescript
   * // Fetch all campaign insights for last 30 days (may span multiple pages)
   * const allInsights = await service.getAllInsights(
   *   ['impressions', 'clicks', 'spend'],
   *   {
   *     date_preset: 'last_30d',
   *     level: 'campaign',
   *     limit: 100  // Increase page size to reduce pagination rounds
   *   }
   * );
   * ```
   *
   * @example With breakdowns:
   * ```typescript
   * const allInsights = await service.getAllInsights(
   *   ['video_p100_watched_actions'],
   *   {
   *     date_preset: 'last_7d',
   *     level: 'ad',
   *     breakdowns: ['age', 'gender'],
   *     limit: 500  // Higher limit recommended for breakdown queries
   *   }
   * );
   * // May return thousands of rows due to breakdown combinations
   * ```
   *
   * Implementation notes:
   * - Default limit is 25 records per page
   * - Can set params.limit up to 5000 to reduce pagination rounds
   * - Checks response.paging.next for additional pages
   * - Recursively fetches all pages until paging.next is undefined
   *
   * WARNING: For queries spanning >1 year with daily data, use async jobs instead (not yet implemented).
   * Large synchronous queries may timeout. Consider splitting date ranges or using higher limit values.
   */
  async getAllInsights(
    fields: string[],
    params: InsightParams
  ): Promise<InsightObject[]> {
    const allInsights: InsightObject[] = [];
    let pageNumber = 1;

    try {
      const account = new AdAccount(this.accountId);
      let response = await account.getInsights(fields, params);

      // Process first page
      for (const insight of response) {
        allInsights.push(insight as InsightObject);
      }

      // Fetch additional pages if they exist
      while (response.paging && response.paging.next) {
        pageNumber++;

        try {
          // Fetch next page using cursor
          response = await response.next();

          for (const insight of response) {
            allInsights.push(insight as InsightObject);
          }

          // Log warning if dataset is very large
          if (allInsights.length > 1000 && allInsights.length % 1000 === 0) {
            console.warn(
              `[MetricsService] Large dataset detected: ${allInsights.length} records fetched so far`
            );
          }
        } catch (error: any) {
          // If any page fails, throw error with page number context
          const errorMessage = this.formatMetaError(error);
          throw new Error(`Meta Insights API error on page ${pageNumber}: ${errorMessage}`);
        }
      }

      return allInsights;
    } catch (error: any) {
      // Handle first page error
      if (pageNumber === 1) {
        const errorMessage = this.formatMetaError(error);
        throw new Error(`Meta Insights API error: ${errorMessage}`);
      }
      // Re-throw pagination errors with context
      throw error;
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
