# Phase 2: Core Metrics Query - Discovery

**Researched:** 2026-01-31
**Scope:** Meta Marketing API v24.0 Insights endpoints
**Confidence:** HIGH

## Key Findings

### Meta Insights API Structure

The Meta Marketing API provides insights through a hierarchical query system with four aggregation levels:

**Endpoint Pattern:** `GET /{object_id}/insights`

**Available Levels:**
- **Ad Account** (`act_<ACCOUNT_ID>`) - Highest aggregation across all campaigns
- **Campaign** (`<CAMPAIGN_ID>`) - Campaign-level performance
- **Ad Set** (`<ADSET_ID>`) - Targeting and budget group level
- **Ad** (`<AD_ID>`) - Individual creative unit performance

**SDK Implementation:**
```javascript
const { AdAccount, Campaign, AdSet, Ad, AdsInsights } = require('facebook-nodejs-business-sdk');

// Query at account level
const account = new AdAccount('act_<ACCOUNT_ID>');
account.getInsights(fields, params);

// Query at campaign level
const campaign = new Campaign('<CAMPAIGN_ID>');
campaign.getInsights(fields, params);
```

The `getInsights()` method accepts two parameters:
1. **fields** (Array): List of metric field names to retrieve
2. **params** (Object): Query parameters (date ranges, breakdowns, filters)

### Essential Metrics

Based on the AdsInsights API field definitions, here are the exact field names for Phase 2 metrics:

#### Core Performance Metrics
- `impressions` - Total ad impressions
- `clicks` - Total clicks on ads
- `spend` - Total amount spent (in account currency)
- `reach` - Unique users who saw the ad
- `frequency` - Average impressions per user

#### Cost Efficiency Metrics
- `cpc` - Cost per click (spend / clicks)
- `cpm` - Cost per thousand impressions (spend / impressions * 1000)
- `cpp` - Cost per impression (thousands)
- `ctr` - Click-through rate (clicks / impressions)
- `inline_link_click_ctr` - Click rate for inline links
- `unique_ctr` - Unique click-through rate

#### Conversion Metrics
- `conversions` - Total conversion events
- `conversion_values` - Monetary value of conversions
- `cost_per_conversion` - Cost divided by conversions
- `cost_per_action_type` - Cost segmented by action types

#### ROAS (Return on Ad Spend)
- `purchase_roas` - Overall purchase ROAS (conversion value / spend)
- `mobile_app_purchase_roas` - Mobile app purchase ROAS
- `website_purchase_roas` - Website purchase ROAS

#### Video Completion Metrics
- `video_15_sec_watched_actions` - 15-second video views
- `video_30_sec_watched_actions` - 30-second video views
- `video_continuous_2_sec_watched_actions` - 2-second continuous views
- `video_p25_watched_actions` - 25% completion (returns `list<AdsActionStats>`)
- `video_p50_watched_actions` - 50% completion
- `video_p75_watched_actions` - 75% completion
- `video_p95_watched_actions` - 95% completion
- `video_p100_watched_actions` - 100% completion
- `video_play_actions` - Total video plays
- `video_thruplay_watched_actions` - ThruPlay metric (15s or complete view)

**Note:** Video percentile fields track "the number of times your video was played at X% of its length, including plays that skipped to this point."

#### Complex Action Fields
- `actions` - Conversion events (returns array of `{action_type, value}` objects)
- `action_values` - Monetary value of actions
- `cost_per_action_type` - Cost by action type

### Query Parameters

#### Date Range Options

**Option 1: Date Presets**
```javascript
params = {
  date_preset: 'last_7d'  // Predefined period
}
```

Common presets:
- `'last_7d'` - Last 7 days
- `'last_30d'` - Last 30 days
- `'last_90d'` - Last 90 days
- `'this_month'` - Current calendar month
- `'last_month'` - Previous calendar month
- `'lifetime'` - All-time data (use cautiously)
- `'maximum'` - Maximum available historical data

**Recommendation:** Use 28 days or less for unique metrics like Reach to ensure accuracy.

**Option 2: Custom Date Ranges**
```javascript
params = {
  time_range: {
    since: '2026-01-01',  // YYYY-MM-DD format
    until: '2026-01-31'
  }
}
```

**Date Format:** Always use `YYYY-MM-DD` format for consistency.

#### Time Incrementation

Control how results are grouped by time:

```javascript
params = {
  time_increment: 1  // Options: 1 (daily), 'monthly', 'all_days', or integer 1-90
}
```

- `1` (default) - Each day separately
- `'monthly'` - Aggregate by month
- `'all_days'` - Single aggregated result for entire period
- `7` - Weekly aggregation (7-day buckets)

#### Aggregation Level

```javascript
params = {
  level: 'campaign'  // Options: 'account', 'campaign', 'adset', 'ad'
}
```

#### Pagination

**Default Behavior:** Meta returns up to 25 records by default.

**Custom Limit:**
```javascript
params = {
  limit: 100  // Request 100 records per page (max: 5000)
}
```

**Handling Pagination:**
```javascript
account.getInsights(fields, params)
  .then((insights) => {
    // insights contains data array
    // Check for insights.paging.next for more pages
    if (insights.paging && insights.paging.next) {
      // Fetch next page using the next URL
    }
  });
```

Response includes a `paging` object with `next` URL for additional pages.

#### Breakdowns (Advanced)

Add dimensional breakdowns to segment results:

```javascript
params = {
  breakdowns: ['age', 'gender']  // Segment by age and gender
}
```

Common breakdowns: `'age'`, `'gender'`, `'country'`, `'region'`, `'device_platform'`, `'publisher_platform'`

**Warning:** Breakdowns multiply result rows (age × gender = multiple rows per ad).

### Response Format

#### Standard Insights Response Structure

```json
{
  "data": [
    {
      "account_name": "Your Account Name",
      "impressions": "12345",
      "clicks": "678",
      "spend": "123.45",
      "ctr": "5.49593",
      "cpc": "0.181859",
      "cpm": "10.00",
      "date_start": "2026-01-24",
      "date_stop": "2026-01-30"
    }
  ],
  "paging": {
    "cursors": {
      "before": "...",
      "after": "..."
    },
    "next": "https://graph.facebook.com/v24.0/..."
  }
}
```

#### Actions Field Structure (Conversions)

The `actions` field returns an array of action objects:

```json
{
  "actions": [
    {
      "action_type": "link_click",
      "value": "456"
    },
    {
      "action_type": "mobile_app_install",
      "value": "23"
    },
    {
      "action_type": "app_custom_event.fb_mobile_add_to_cart",
      "value": "15"
    },
    {
      "action_type": "purchase",
      "value": "8"
    }
  ]
}
```

**Parsing Pattern:** Filter the actions array by `action_type` to extract specific conversion metrics.

#### Video Metrics Structure

Video completion fields also return arrays:

```json
{
  "video_p25_watched_actions": [
    {
      "action_type": "video_view",
      "value": "234"
    }
  ],
  "video_p100_watched_actions": [
    {
      "action_type": "video_view",
      "value": "89"
    }
  ]
}
```

### SDK Usage Examples

#### Basic Insights Query

```javascript
const { FacebookAdsApi, AdAccount, AdsInsights } = require('facebook-nodejs-business-sdk');

// Initialize API (already done in src/meta/client.ts)
const api = FacebookAdsApi.init(accessToken);

const account = new AdAccount('act_<ACCOUNT_ID>');

// Define fields to retrieve
const fields = [
  'impressions',
  'clicks',
  'spend',
  'ctr',
  'cpc',
  'cpm',
  'conversions',
  'purchase_roas'
];

// Set query parameters
const params = {
  date_preset: 'last_7d',
  level: 'campaign',
  time_increment: 1  // Daily breakdown
};

// Execute query
account.getInsights(fields, params)
  .then((insights) => {
    console.log('Insights data:', insights);
    // insights is an array of insight objects
    insights.forEach((insight) => {
      console.log(`Campaign: ${insight.campaign_name}`);
      console.log(`Impressions: ${insight.impressions}`);
      console.log(`CTR: ${insight.ctr}%`);
    });
  })
  .catch((error) => {
    console.error('Error fetching insights:', error);
  });
```

#### Advanced Query with Custom Date Range

```javascript
const fields = [
  'campaign_name',
  'impressions',
  'clicks',
  'spend',
  'ctr',
  'cpc',
  'actions',  // Include conversion actions
  'video_p25_watched_actions',
  'video_p100_watched_actions'
];

const params = {
  time_range: {
    since: '2026-01-01',
    until: '2026-01-31'
  },
  level: 'campaign',
  time_increment: 'all_days',  // Single aggregated result
  limit: 100  // Increase page size
};

account.getInsights(fields, params)
  .then((insights) => {
    // Process results
  });
```

#### Async Reporting for Large Datasets

For extremely large jobs (e.g., pulling a year of daily data for hundreds of ads):

```javascript
const params = {
  time_range: {
    since: '2025-01-01',
    until: '2025-12-31'
  },
  level: 'ad',
  time_increment: 1,  // Daily data
  async: true  // Enable asynchronous processing
};

account.getInsights(fields, params)
  .then((job) => {
    // Returns a job ID instead of immediate results
    const jobId = job.id;

    // Poll job status
    // Check job.async_status until 'Job Completed'
    // Then fetch results using job ID
  });
```

## Recommended Approach

### Standard Pattern for Implementing Metrics Queries

The optimal implementation strategy for Phase 2 involves creating a metrics query service that wraps the Facebook Business SDK's `getInsights()` method with proper abstraction and error handling. This service should expose methods for different aggregation levels (account, campaign, ad set, ad) while accepting flexible date range parameters and metric field selections.

**Key Implementation Steps:**
1. Create a `MetricsService` class that initializes with the existing `api` instance from `src/meta/client.ts`
2. Implement methods for each aggregation level: `getAccountMetrics()`, `getCampaignMetrics()`, `getAdSetMetrics()`, `getAdMetrics()`
3. Accept date range as either preset strings (`'last_7d'`) or custom objects with `since`/`until` dates
4. Default to commonly requested fields but allow custom field selection for flexibility
5. Handle pagination automatically by recursively fetching additional pages when `paging.next` exists
6. Parse complex fields like `actions` and video metrics to extract specific action types
7. Transform responses into clean, MCP-friendly JSON structures

For rate limiting and performance optimization, implement exponential backoff for retries, request only needed fields (not all 70+ available fields), and consider splitting large date ranges into smaller chunks (month-by-month) to avoid timeouts. For production use, store daily insights in a local database rather than relying solely on the API for historical data, as Meta imposes 37-month retention limits.

### MCP Tool Design Pattern

Each MCP tool should map to a specific use case:
- `get_campaign_performance` - High-level campaign metrics (CTR, CPC, ROAS)
- `get_video_analytics` - Video-specific completion and engagement metrics
- `get_conversion_metrics` - Detailed conversion tracking with action types
- `get_ad_performance` - Individual ad-level analysis

Tools should accept standardized input schemas with optional date ranges (defaulting to `last_7d`), optional aggregation levels, and optional metric selections. This provides flexibility while maintaining sensible defaults for common queries.

## Gotchas

### Critical Warnings

- **Attribution Window Changes (January 12, 2026):** Meta eliminated 7-day view-through (`7d_view`) and 28-day view-through (`28d_view`) attribution windows. Applications requesting deprecated windows receive empty datasets instead of errors, creating silent failures. **Action Required:** Never use `action_attribution_windows` parameters with these values.

- **37-Month Historical Limit:** Insights data is only available for the last 37 months. Queries beyond this range return empty results. Default queries without `time_range` or `date_preset` pull last 37 months of data, which can cause timeouts.

- **Actions Array Parsing:** The `actions` field returns an array of objects, not a single value. You must filter by `action_type` to extract specific conversions (e.g., `purchase`, `link_click`, `app_install`). Failing to parse this correctly results in unusable data.

- **Video Metrics Are Arrays:** Video completion fields (`video_p25_watched_actions`, etc.) return arrays similar to `actions`. Always check for array structure and extract by `action_type: 'video_view'`.

- **ROAS Requires Conversion Tracking:** `purchase_roas` only returns values if the Facebook Pixel or Conversions API is properly configured with purchase events. Missing setup results in null or zero ROAS values.

- **Pagination Default (25 records):** By default, the API returns only 25 records. For accounts with many campaigns/ads, you must implement pagination logic to retrieve all data. Use `limit: 100` or higher (max 5000) and check `paging.next`.

- **Rate Limiting on Rolling Window:** Meta enforces rate limits on a rolling 1-hour window considering both call frequency and data volume. Large insights queries with breakdowns count more significantly than simple reads. Implement exponential backoff and retry logic.

- **Field Data Types:** Many fields return strings, not numbers. Always parse `impressions`, `clicks`, `spend`, etc. as numbers before performing calculations. Example: `parseInt(insights.impressions, 10)` or `parseFloat(insights.spend)`.

- **Date Range Recommendations:** Use 28 days or less for unique metrics like `reach` and `frequency` to ensure accuracy. Longer periods may aggregate data incorrectly.

- **Async Jobs for Large Datasets:** For queries exceeding 1 year of daily data or thousands of ads, use `async: true` parameter. Synchronous requests will timeout. Async jobs return a job ID requiring status polling.

- **SDK Version vs API Version:** The `facebook-nodejs-business-sdk` version determines the API version. Version 24.0.1 uses v24.0 API. Meta deprecates API versions every 90 days (quarterly). Monitor deprecation schedules.

- **Time Zone Considerations:** All dates are in the ad account's time zone. Ensure consistency when querying multi-account setups with different time zones.

- **Empty Results vs Errors:** Meta often returns successful responses with empty `data` arrays instead of error codes when queries fail (e.g., invalid object IDs, deprecated fields). Always validate result array length.

## References

### Official Documentation
- [Meta Marketing API Documentation](https://developers.facebook.com/docs/marketing-api)
- [Meta Business SDK (Node.js) GitHub](https://github.com/facebook/facebook-nodejs-business-sdk)
- [Meta Business SDK Getting Started](https://developers.facebook.com/docs/business-sdk/getting-started)
- [Facebook Ads API Guide from A to Z | Coupler.io Blog](https://blog.coupler.io/facebook-ads-api/)

### Insights API Resources
- [Guide to Facebook Insights API - Damien Gonot](https://www.damiengonot.com/blog/guide-facebook-insights-api)
- [Meta Ads API: Complete Guide for Advertisers and Developers (2025) | AdManage Blog](https://admanage.ai/blog/meta-ads-api)
- [Comprehensive Guide to the Facebook Ads Reporting API](https://magicbrief.com/post/comprehensive-guide-to-the-facebook-ads-reporting-api)
- [Facebook Marketing API (MAPI) | Postman Documentation](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi)

### SDK Examples and Field References
- [facebook-nodejs-business-sdk NPM Package](https://www.npmjs.com/package/facebook-nodejs-business-sdk)
- [AdsInsights.py Field Definitions (Python SDK)](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py)
- [Top 5 facebook-nodejs-business-sdk Code Examples | Snyk](https://snyk.io/advisor/npm-package/facebook-nodejs-business-sdk/example)
- [Insights API GitHub Issue #63](https://github.com/facebook/facebook-nodejs-business-sdk/issues/63)

### API Changes and Updates
- [Meta restricts attribution windows and data retention in Ads Insights API](https://ppc.land/meta-restricts-attribution-windows-and-data-retention-in-ads-insights-api/)
- [Meta Ads to Limit Metrics in Ads Insights API Starting January 2026](https://www.marketing-now.co.uk/article/257428/meta-ads-to-limit-metrics-in-ads-insights-api-starting-january-2026)
- [Facebook launches Graph API v24.0 and Marketing API v24.0](https://web.swipeinsight.app/posts/facebook-launches-graph-api-v24-0-and-marketing-api-v24-0-for-developers-19984)

### Video Metrics
- [Key Meta Ads Video Metrics Explained | Affect Group](https://affectgroup.com/blog/understanding-meta-ads-video-metrics-how-to-measure-analyze-and-improve-performance/)
- [Facebook Ads metrics and dimensions | Supermetrics](https://docs.supermetrics.com/docs/facebook-ads-fields)

### Best Practices
- [Meta API Integration: Best Practices - AdAmigo.ai Blog](https://www.adamigo.ai/blog/meta-api-integration-best-practices)
- [How to Build a Meta Ads Insight Pipeline | Rabbit Metrics](https://www.rabbitmetrics.com/how-to-build-a-meta-ads-insight-pipeline/)
