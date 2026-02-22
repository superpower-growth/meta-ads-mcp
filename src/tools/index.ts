/**
 * Tool Registry
 *
 * Central registry of all MCP tools available in this server.
 * Tools are registered here to be discovered by clients via tools/list.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getAccountTool } from './get-account.js';
import { getCampaignPerformanceTool } from './get-campaign-performance.js';
import { getAdsetPerformanceTool } from './get-adset-performance.js';
import { getAdPerformanceTool } from './get-ad-performance.js';
import { getVideoPerformanceTool } from './get-video-performance.js';
import { getVideoDemographicsTool } from './get-video-demographics.js';
import { getVideoEngagementTool } from './get-video-engagement.js';
import { compareTimePeriodsTool } from './compare-time-periods.js';
import { compareEntitiesTool } from './compare-entities.js';
import { getAdCreativeTextTool } from './get-ad-creative-text.js';
import { analyzeVideoCreativeTool } from './analyze-video-creative.js';
import { getPlacementConversionsTool } from './get-placement-conversions.js';
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
 * All available MCP tools
 */
export const tools: Tool[] = [
  getAccountTool,
  getCampaignPerformanceTool,
  getAdsetPerformanceTool,
  getAdPerformanceTool,
  getVideoPerformanceTool,
  getVideoDemographicsTool,
  getVideoEngagementTool,
  compareTimePeriodsTool,
  compareEntitiesTool,
  getAdCreativeTextTool,
  analyzeVideoCreativeTool,
  getPlacementConversionsTool,
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
