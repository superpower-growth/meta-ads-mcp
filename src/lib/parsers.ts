/**
 * Meta API Response Parsers
 *
 * Utilities for parsing complex response structures from Meta Insights API.
 * Handles arrays, action types, and inconsistent field formats.
 *
 * Critical patterns from DISCOVERY.md:
 * - Actions array: [{action_type: 'purchase', value: '42'}, ...]
 * - Video metrics: Each field returns array, extract first element's value
 * - ROAS fields: May be array or single value (Meta API inconsistency)
 * - Always handle missing/null values gracefully
 *
 * @see https://developers.facebook.com/docs/marketing-api/insights
 */

/**
 * Video completion metrics
 */
export interface VideoMetrics {
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p100: number;
}

/**
 * Return on Ad Spend (ROAS) metrics
 */
export interface RoasMetrics {
  purchase: number;
  website: number;
  mobileApp: number;
}

/**
 * Parse actions array from Meta Insights API
 *
 * Converts array of action objects into a simple key-value map.
 * Handles missing/null arrays and converts string values to numbers.
 *
 * @param actions - Actions array from Meta API (e.g., [{action_type: 'purchase', value: '42'}])
 * @returns Object mapping action types to numeric values
 *
 * @example
 * ```typescript
 * const actions = [
 *   {action_type: 'purchase', value: '42'},
 *   {action_type: 'link_click', value: '18'}
 * ];
 * const parsed = parseActions(actions);
 * // Returns: {purchase: 42, link_click: 18}
 * ```
 */
export function parseActions(actions: any[]): Record<string, number> {
  // Handle missing/null arrays
  if (!actions || !Array.isArray(actions)) {
    return {};
  }

  const result: Record<string, number> = {};

  for (const action of actions) {
    if (action && action.action_type && action.value !== undefined) {
      // Convert string values to numbers
      const value = typeof action.value === 'string' ? parseFloat(action.value) : action.value;
      result[action.action_type] = isNaN(value) ? 0 : value;
    }
  }

  return result;
}

/**
 * Parse video completion metrics from Meta Insights API
 *
 * Extracts video percentile watched actions (p25, p50, p75, p95, p100).
 * Each metric is an array, extracts first element's value.
 * Handles missing metrics gracefully (returns 0).
 *
 * @param insight - Insight object from Meta API
 * @returns VideoMetrics object with percentile completion counts
 *
 * @example
 * ```typescript
 * const insight = {
 *   video_p25_watched_actions: [{action_type: 'video_view', value: '234'}],
 *   video_p100_watched_actions: [{action_type: 'video_view', value: '89'}]
 * };
 * const metrics = parseVideoMetrics(insight);
 * // Returns: {p25: 234, p50: 0, p75: 0, p95: 0, p100: 89}
 * ```
 *
 * Note: Video metrics only exist for video ads. Non-video ads return all zeros.
 */
export function parseVideoMetrics(insight: any): VideoMetrics {
  const extractVideoValue = (field: any): number => {
    if (!field || !Array.isArray(field) || field.length === 0) {
      return 0;
    }

    const value = field[0]?.value;
    if (value === undefined || value === null) {
      return 0;
    }

    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(numValue) ? 0 : numValue;
  };

  return {
    p25: extractVideoValue(insight.video_p25_watched_actions),
    p50: extractVideoValue(insight.video_p50_watched_actions),
    p75: extractVideoValue(insight.video_p75_watched_actions),
    p95: extractVideoValue(insight.video_p95_watched_actions),
    p100: extractVideoValue(insight.video_p100_watched_actions),
  };
}

/**
 * Parse ROAS (Return on Ad Spend) metrics from Meta Insights API
 *
 * Extracts purchase, website, and mobile app ROAS values.
 * Handles inconsistent Meta API response format (may be array or single value).
 * Defaults to 0 for missing values.
 *
 * @param insight - Insight object from Meta API
 * @returns RoasMetrics object with purchase, website, and mobileApp ROAS
 *
 * @example
 * ```typescript
 * const insight = {
 *   purchase_roas: [{action_type: 'omni_purchase', value: '3.42'}],
 *   website_purchase_roas: [{action_type: 'offsite_conversion.fb_pixel_purchase', value: '2.85'}]
 * };
 * const metrics = parseRoas(insight);
 * // Returns: {purchase: 3.42, website: 2.85, mobileApp: 0}
 * ```
 *
 * Note: ROAS only returns values if conversion tracking is properly configured.
 */
export function parseRoas(insight: any): RoasMetrics {
  const extractRoasValue = (field: any): number => {
    // Handle null/undefined
    if (field === undefined || field === null) {
      return 0;
    }

    // Handle array format (most common)
    if (Array.isArray(field)) {
      if (field.length === 0) {
        return 0;
      }
      const value = field[0]?.value;
      if (value === undefined || value === null) {
        return 0;
      }
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      return isNaN(numValue) ? 0 : numValue;
    }

    // Handle single value format (Meta API inconsistency)
    const numValue = typeof field === 'string' ? parseFloat(field) : field;
    return isNaN(numValue) ? 0 : numValue;
  };

  return {
    purchase: extractRoasValue(insight.purchase_roas),
    website: extractRoasValue(insight.website_purchase_roas),
    mobileApp: extractRoasValue(insight.mobile_app_purchase_roas),
  };
}
