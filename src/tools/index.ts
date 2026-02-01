/**
 * Tool Registry
 *
 * Central registry of all MCP tools available in this server.
 * Tools are registered here to be discovered by clients via tools/list.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getAccountTool } from './get-account.js';

/**
 * All available MCP tools
 * Will be expanded with more tools in Phase 2
 */
export const tools: Tool[] = [getAccountTool];
