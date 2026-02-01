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
];
