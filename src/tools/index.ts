/**
 * Tool Registry
 *
 * Central registry of all MCP tools available in this server.
 * Tools are registered here to be discovered by clients via tools/list.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getAccountTool } from './get-account.js';
import { getPerformanceTool } from './get-performance.js';
import { getVideoMetricsTool } from './get-video-metrics.js';
import { getDemographicsTool } from './get-demographics.js';
import { getCreativeFatigueTool } from './get-creative-fatigue.js';
import { getCreativePerformanceTool } from './get-creative-performance.js';
import { compareTimePeriodsTool } from './compare-time-periods.js';
import { compareEntitiesTool } from './compare-entities.js';
import { getAdCreativeTextTool } from './get-ad-creative-text.js';
import { analyzeVideoCreativeTool } from './analyze-video-creative.js';
import { batchAnalyzeVideoCreativeTool } from './batch-analyze-video-creative.js';
import { getSavedAudiencesTool } from './get-saved-audiences.js';
import { getFacebookPagesTool } from './get-facebook-pages.js';
import { listAdSetsTool } from './list-ad-sets.js';
import { analyzeVideoUrlTool } from './analyze-video-url.js';
import { analyzeImageUrlTool } from './analyze-image-url.js';
import { analyzeAdThemesTool } from './analyze-ad-themes.js';
import { listCustomConversionsTool } from './list-custom-conversions.js';
import { getAccountActivityTool } from './get-account-activity.js';
import { getCampaignConfigTool } from './get-campaign-config.js';
import { getAudienceOverlapTool } from './get-audience-overlap.js';
import { isScrapeCreatorsEnabled } from '../lib/scrapecreators-client.js';
import { scSearchAdsTool } from './sc-search-ads.js';
import { scGetAdTool } from './sc-get-ad.js';
import { scSearchCompaniesTool } from './sc-search-companies.js';

/**
 * ScrapeCreators Meta Ad Library tools (conditionally included when SCRAPECREATORS_API_KEY is set)
 */
const scrapeCreatorsTools: Tool[] = isScrapeCreatorsEnabled() ? [
  scSearchAdsTool,
  scGetAdTool,
  scSearchCompaniesTool,
] : [];

/**
 * All available MCP tools
 *
 * Meta Ads tools (18):
 * - get-performance: replaces get-campaign-performance, get-adset-performance, get-ad-performance
 * - get-video-metrics: replaces get-video-performance, get-video-engagement
 * - get-demographics: replaces get-video-demographics, get-ad-demographics, get-placement-conversions
 * - get-creative-fatigue: daily frequency/CTR trend analysis for fatigue detection
 * - get-creative-performance: aggregate performance by creative ID across ads
 *
 * ScrapeCreators tools (3, optional):
 * - sc-search-ads: search Meta Ad Library by keyword or company name (smart routing)
 * - sc-get-ad: get full details for a specific ad by ID or URL
 * - sc-search-companies: search for companies/pages in the Ad Library
 */
export const tools: Tool[] = [
  getAccountActivityTool,
  getAccountTool,
  getPerformanceTool,
  getVideoMetricsTool,
  getDemographicsTool,
  getCreativeFatigueTool,
  getCreativePerformanceTool,
  compareTimePeriodsTool,
  compareEntitiesTool,
  getAdCreativeTextTool,
  analyzeVideoCreativeTool,
  batchAnalyzeVideoCreativeTool,
  getSavedAudiencesTool,
  getFacebookPagesTool,
  listAdSetsTool,
  analyzeVideoUrlTool,
  analyzeImageUrlTool,
  analyzeAdThemesTool,
  listCustomConversionsTool,
  getCampaignConfigTool,
  getAudienceOverlapTool,
  ...scrapeCreatorsTools,
];
