/**
 * List Custom Conversions Tool
 *
 * Fetches all custom conversion events from the Meta ad account
 * so users can discover available conversion names for use in
 * get-performance, get-creative-performance, and get-demographics.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { fetchCustomConversions } from '../lib/custom-conversions.js';

/**
 * List all custom conversions available in the ad account
 */
export async function listCustomConversions(): Promise<string> {
  try {
    const conversions = await fetchCustomConversions();

    if (conversions.length === 0) {
      return 'No custom conversions found in this ad account.';
    }

    const response = {
      totalCount: conversions.length,
      conversions: conversions.map((cc) => ({
        friendlyName: cc.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, ''),
        displayName: cc.name,
        id: cc.id,
        actionType: cc.actionType,
        customEventType: cc.customEventType || null,
        description: cc.description || null,
        lastFiredTime: cc.lastFiredTime || null,
      })),
      usage: 'Use the friendlyName in customActions parameter of get-performance, get-creative-performance, or get-demographics tools.',
    };

    return JSON.stringify(response, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      return `Error fetching custom conversions: ${error.message}`;
    }
    return 'Unknown error fetching custom conversions';
  }
}

/**
 * MCP Tool definition
 */
export const listCustomConversionsTool: Tool = {
  name: 'list-custom-conversions',
  description:
    'List all custom conversion events available in the ad account. Returns friendly names that can be used in the customActions parameter of get-performance, get-creative-performance, and get-demographics tools.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};
