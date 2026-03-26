/**
 * Foreplay Get Swipefile Tool
 *
 * Get ads saved to the user's Foreplay swipefile.
 */

import { z } from 'zod';
import { createToolSchema } from '../lib/validation.js';
import { getForeplayClient } from '../lib/foreplay-client.js';
import type { ForeplayAd } from '../lib/foreplay-client.js';

const InputSchema = z.object({
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  live: z.boolean().optional().describe('Filter for currently active ads only'),
  display_format: z.array(z.enum(['video', 'image', 'carousel', 'dco', 'story', 'reels'])).optional().describe('Filter by ad format'),
  publisher_platform: z.array(z.enum(['facebook', 'instagram', 'audience_network', 'messenger'])).optional().describe('Filter by platform'),
  niches: z.array(z.string()).optional().describe('Filter by industry/niche'),
  market_target: z.array(z.enum(['b2b', 'b2c'])).optional().describe('Filter by market target'),
  languages: z.array(z.string()).optional().describe('Filter by language code'),
  video_duration_min: z.number().optional().describe('Minimum video duration in seconds'),
  video_duration_max: z.number().optional().describe('Maximum video duration in seconds'),
  running_duration_min_days: z.number().int().optional().describe('Minimum days running'),
  running_duration_max_days: z.number().int().optional().describe('Maximum days running'),
  limit: z.number().int().min(1).max(250).optional().default(25).describe('Number of ads to return (max 250)'),
  offset: z.number().int().optional().default(0).describe('Pagination offset'),
  order: z.enum(['saved_newest', 'newest', 'oldest', 'longest_running', 'most_relevant']).optional().describe('Sort order'),
});

type Input = z.infer<typeof InputSchema>;

function formatAd(ad: ForeplayAd): string {
  const lines: string[] = [];
  lines.push(`**${ad.title || ad.name || 'Untitled'}** (ID: ${ad.id})`);
  if (ad.brand_name) lines.push(`  Brand: ${ad.brand_name}`);
  if (ad.display_format) lines.push(`  Format: ${ad.display_format}`);
  if (ad.live !== undefined) lines.push(`  Status: ${ad.live ? 'Live' : 'Inactive'}`);
  if (ad.publisher_platform?.length) lines.push(`  Platforms: ${ad.publisher_platform.join(', ')}`);
  if (ad.description) lines.push(`  Copy: ${ad.description.substring(0, 200)}${ad.description.length > 200 ? '...' : ''}`);
  if (ad.video) lines.push(`  Video: ${ad.video}`);
  if (ad.image) lines.push(`  Image: ${ad.image}`);
  return lines.join('\n');
}

export async function foreplayGetSwipefile(input: Input): Promise<string> {
  const validate = createToolSchema(InputSchema);
  const params = validate(input);
  const client = getForeplayClient();

  const result = await client.getSwipefileAds(params);

  if (!result.data?.length) {
    return 'No ads found in your swipefile matching the filters.';
  }

  const lines: string[] = [];
  lines.push(`## Swipefile Ads (${result.metadata?.count ?? result.data.length} total)\n`);

  result.data.forEach(ad => {
    lines.push(formatAd(ad));
    lines.push('');
  });

  if (result.metadata?.cursor) {
    lines.push(`*More results available. Use offset: ${(params.offset || 0) + (params.limit || 25)} to load the next page.*`);
  }

  return lines.join('\n');
}

export const foreplayGetSwipefileTool = {
  name: 'foreplay-get-swipefile',
  description: 'Get ads saved to your Foreplay swipefile (bookmarked ads). Supports filtering by format, platform, date range, running duration, and more.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      start_date: { type: 'string' as const, description: 'Start date (YYYY-MM-DD)' },
      end_date: { type: 'string' as const, description: 'End date (YYYY-MM-DD)' },
      live: { type: 'boolean' as const, description: 'Filter for currently active ads only' },
      display_format: { type: 'array' as const, items: { type: 'string' as const, enum: ['video', 'image', 'carousel', 'dco', 'story', 'reels'] }, description: 'Filter by ad format' },
      publisher_platform: { type: 'array' as const, items: { type: 'string' as const, enum: ['facebook', 'instagram', 'audience_network', 'messenger'] }, description: 'Filter by platform' },
      niches: { type: 'array' as const, items: { type: 'string' as const }, description: 'Filter by industry/niche' },
      market_target: { type: 'array' as const, items: { type: 'string' as const, enum: ['b2b', 'b2c'] }, description: 'Filter by market target' },
      languages: { type: 'array' as const, items: { type: 'string' as const }, description: 'Filter by language code' },
      video_duration_min: { type: 'number' as const, description: 'Minimum video duration in seconds' },
      video_duration_max: { type: 'number' as const, description: 'Maximum video duration in seconds' },
      running_duration_min_days: { type: 'integer' as const, description: 'Minimum days running' },
      running_duration_max_days: { type: 'integer' as const, description: 'Maximum days running' },
      limit: { type: 'integer' as const, description: 'Number of ads to return (max 250, default 25)' },
      offset: { type: 'integer' as const, description: 'Pagination offset' },
      order: { type: 'string' as const, enum: ['saved_newest', 'newest', 'oldest', 'longest_running', 'most_relevant'], description: 'Sort order' },
    },
    required: [],
  },
};
