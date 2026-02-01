/**
 * Tool Registry
 *
 * Central registry of all MCP tools available in this server.
 * Tools are registered here to be discovered by clients via tools/list.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getAccountTool } from './get-account.js';
import { getCampaignPerformanceTool } from './get-campaign-performance.js';

/**
 * All available MCP tools
 */
export const tools: Tool[] = [getAccountTool, getCampaignPerformanceTool];
