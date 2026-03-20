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
import { createCampaignTool } from './create-campaign.js';
import { createAdSetTool } from './create-ad-set.js';
import { uploadAdVideoTool } from './upload-ad-video.js';
import { createAdCreativeTool } from './create-ad-creative.js';
import { createAdTool } from './create-ad.js';
import { shipAdsBatchTool } from './ship-ads-batch.js';
import { syncCampaignsToNotionTool } from './sync-campaigns-to-notion.js';

/**
 * All available MCP tools (22 total)
 *
 * Consolidated tools:
 * - get-performance: replaces get-campaign-performance, get-adset-performance, get-ad-performance
 * - get-video-metrics: replaces get-video-performance, get-video-engagement
 * - get-demographics: replaces get-video-demographics, get-ad-demographics, get-placement-conversions
 *
 * New tools:
 * - get-creative-fatigue: daily frequency/CTR trend analysis for fatigue detection
 * - get-creative-performance: aggregate performance by creative ID across ads
 */
export const tools: Tool[] = [
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
  createCampaignTool,
  createAdSetTool,
  uploadAdVideoTool,
  createAdCreativeTool,
  createAdTool,
  shipAdsBatchTool,
  syncCampaignsToNotionTool,
];
