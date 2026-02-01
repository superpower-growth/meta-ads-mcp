/**
 * Tool Registry
 *
 * Central registry of all MCP tools available in this server.
 * Tools are registered here to be discovered by clients via tools/list.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * All available MCP tools
 * Will be populated with actual tool definitions in Phase 2
 */
export const tools: Tool[] = [];
