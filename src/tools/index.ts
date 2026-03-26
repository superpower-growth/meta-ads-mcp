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
import { isForeplayEnabled } from '../lib/foreplay-client.js';
import { foreplaySearchAdsTool } from './foreplay-search-ads.js';
import { foreplayGetAdTool } from './foreplay-get-ad.js';
import { foreplayFindDuplicatesTool } from './foreplay-find-duplicates.js';
import { foreplayGetSwipefileTool } from './foreplay-get-swipefile.js';
import { foreplayGetBoardsTool } from './foreplay-get-boards.js';
import { foreplayGetTrackedBrandsTool } from './foreplay-get-tracked-brands.js';
import { foreplayGetTrackedBrandAdsTool } from './foreplay-get-tracked-brand-ads.js';

/**
 * Foreplay competitor research tools (conditionally included when FOREPLAY_API_KEY is set)
 */
const foreplayTools: Tool[] = isForeplayEnabled() ? [
  foreplaySearchAdsTool,
  foreplayGetAdTool,
  foreplayFindDuplicatesTool,
  foreplayGetSwipefileTool,
  foreplayGetBoardsTool,
  foreplayGetTrackedBrandsTool,
  foreplayGetTrackedBrandAdsTool,
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
 * Foreplay tools (7, optional):
 * - foreplay-search-ads: search competitor ads by domain, brand ID, or page ID
 * - foreplay-get-ad: get full details for a specific ad
 * - foreplay-find-duplicates: find duplicate/variant creatives
 * - foreplay-get-swipefile: get saved/bookmarked ads
 * - foreplay-get-boards: manage boards and board ads
 * - foreplay-get-tracked-brands: list/get Spyder tracked brands
 * - foreplay-get-tracked-brand-ads: get ads from tracked brands
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
  ...foreplayTools,
];
