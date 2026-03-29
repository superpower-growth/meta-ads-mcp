/**
 * Foreplay Get Boards Tool
 *
 * List boards, get brands on a board, or get ads from a board.
 */

import { z } from 'zod';
import { createToolSchema } from '../lib/validation.js';
import { getForeplayClient } from '../lib/foreplay-client.js';

const InputSchema = z.object({
  action: z.enum(['list_boards', 'get_brands', 'get_ads']).describe('Action: list_boards (list all boards), get_brands (get brands on a board), get_ads (get ads from a board)'),
  board_id: z.string().optional().describe('Board ID (required for get_brands and get_ads)'),
  start_date: z.string().optional().describe('Start date for ad filtering (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date for ad filtering (YYYY-MM-DD)'),
  live: z.boolean().optional().describe('Filter for currently active ads only'),
  display_format: z.array(z.enum(['video', 'image', 'carousel', 'dco', 'story', 'reels'])).optional().describe('Filter by ad format'),
  publisher_platform: z.array(z.enum(['facebook', 'instagram', 'audience_network', 'messenger'])).optional().describe('Filter by platform'),
  limit: z.number().int().min(1).max(250).optional().default(10).describe('Number of results to return'),
  offset: z.number().int().optional().default(0).describe('Pagination offset'),
  cursor: z.string().optional().describe('Pagination cursor (for get_ads)'),
  order: z.enum(['newest', 'oldest', 'longest_running', 'most_relevant']).optional().describe('Sort order (for get_ads)'),
  fetch_all: z.boolean().optional().default(false).describe('Auto-paginate to fetch ALL ads from board (ignores limit/cursor)'),
});

type Input = z.infer<typeof InputSchema>;

export async function foreplayGetBoards(input: Input): Promise<string> {
  const validate = createToolSchema(InputSchema);
  const params = validate(input);
  const client = getForeplayClient();

  if (params.action === 'list_boards') {
    const result = await client.getBoards({ offset: params.offset, limit: params.limit });

    if (!result.data?.length) {
      return 'No boards found in your Foreplay account.';
    }

    const lines: string[] = [];
    lines.push(`## Your Boards (${result.data.length})\n`);
    result.data.forEach(board => {
      lines.push(`- **${board.name || 'Unnamed Board'}** (ID: ${board.id})`);
    });
    return lines.join('\n');
  }

  if (!params.board_id) {
    return 'Error: board_id is required for get_brands and get_ads actions.';
  }

  if (params.action === 'get_brands') {
    const result = await client.getBoardBrands(params.board_id, { offset: params.offset, limit: params.limit });

    if (!result.data?.length) {
      return `No brands found on board "${params.board_id}".`;
    }

    const lines: string[] = [];
    lines.push(`## Brands on Board ${params.board_id} (${result.data.length})\n`);
    result.data.forEach(brand => {
      lines.push(`- **${brand.name}** (ID: ${brand.id})`);
      if (brand.category) lines.push(`  Category: ${brand.category}`);
      if (brand.url) lines.push(`  URL: ${brand.url}`);
    });
    return lines.join('\n');
  }

  // get_ads
  const { action, board_id, offset, fetch_all, ...filterParams } = params;

  const formatAdEntry = (ad: any) => {
    const adLines: string[] = [];
    adLines.push(`**${ad.title || ad.name || 'Untitled'}** (ID: ${ad.id})`);
    if (ad.brand_name || ad.brand_id) adLines.push(`  Brand: ${ad.brand_name || ad.brand_id}`);
    if (ad.display_format) adLines.push(`  Format: ${ad.display_format}`);
    if (ad.live !== undefined) adLines.push(`  Status: ${ad.live ? 'Live' : 'Inactive'}`);
    if (ad.description) adLines.push(`  Copy: ${ad.description.substring(0, 150)}${ad.description.length > 150 ? '...' : ''}`);
    adLines.push('');
    return adLines.join('\n');
  };

  if (fetch_all) {
    const allAds = await client.fetchAllCursor(
      (p) => client.getBoardAds(board_id, p),
      filterParams,
    );
    if (!allAds.length) {
      return `No ads found on board "${board_id}" matching the filters.`;
    }
    const lines: string[] = [];
    lines.push(`## Ads on Board ${board_id} (${allAds.length} total — all pages fetched)\n`);
    allAds.forEach(ad => lines.push(formatAdEntry(ad)));
    return lines.join('\n');
  }

  const result = await client.getBoardAds(board_id, filterParams);

  if (!result.data?.length) {
    return `No ads found on board "${board_id}" matching the filters.`;
  }

  const lines: string[] = [];
  lines.push(`## Ads on Board ${board_id} (${result.metadata?.count ?? result.data.length} total)\n`);
  result.data.forEach(ad => lines.push(formatAdEntry(ad)));

  if (result.metadata?.cursor) {
    lines.push(`*More results available. Use cursor: ${result.metadata.cursor} to load the next page, or set fetch_all: true to get everything.*`);
  }

  return lines.join('\n');
}

export const foreplayGetBoardsTool = {
  name: 'foreplay-get-boards',
  description: 'Manage Foreplay boards: list all boards, get brands on a specific board, or get ads from a board with filtering.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string' as const, enum: ['list_boards', 'get_brands', 'get_ads'], description: 'Action to perform' },
      board_id: { type: 'string' as const, description: 'Board ID (required for get_brands and get_ads)' },
      start_date: { type: 'string' as const, description: 'Start date (YYYY-MM-DD)' },
      end_date: { type: 'string' as const, description: 'End date (YYYY-MM-DD)' },
      live: { type: 'boolean' as const, description: 'Filter for active ads only' },
      display_format: { type: 'array' as const, items: { type: 'string' as const, enum: ['video', 'image', 'carousel', 'dco', 'story', 'reels'] }, description: 'Filter by format' },
      publisher_platform: { type: 'array' as const, items: { type: 'string' as const, enum: ['facebook', 'instagram', 'audience_network', 'messenger'] }, description: 'Filter by platform' },
      limit: { type: 'integer' as const, description: 'Number of results (max 250)' },
      offset: { type: 'integer' as const, description: 'Pagination offset' },
      cursor: { type: 'string' as const, description: 'Pagination cursor (for get_ads)' },
      order: { type: 'string' as const, enum: ['newest', 'oldest', 'longest_running', 'most_relevant'], description: 'Sort order' },
      fetch_all: { type: 'boolean' as const, description: 'Auto-paginate to fetch ALL ads from board (ignores limit/cursor)' },
    },
    required: ['action'],
  },
};
