/**
 * Foreplay Get Tracked Brand Ads Tool
 *
 * Get ads from a brand being tracked in Foreplay Spyder.
 */

import { z } from 'zod';
import { createToolSchema } from '../lib/validation.js';
import { getForeplayClient } from '../lib/foreplay-client.js';

const InputSchema = z.object({
  brand_id: z.string().describe('Foreplay brand ID of the tracked brand'),
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
  cursor: z.number().int().optional().describe('Pagination cursor from previous response'),
  order: z.enum(['newest', 'oldest', 'longest_running', 'most_relevant']).optional().describe('Sort order'),
  fetch_all: z.boolean().optional().default(false).describe('Auto-paginate to fetch ALL ads (ignores limit/cursor). Use when you need a complete dataset for analysis.'),
});

type Input = z.infer<typeof InputSchema>;

export async function foreplayGetTrackedBrandAds(input: Input): Promise<string> {
  const validate = createToolSchema(InputSchema);
  const { brand_id, fetch_all, ...filterParams } = validate(input);
  const client = getForeplayClient();

  const formatAdEntry = (ad: any) => {
    const adLines: string[] = [];
    adLines.push(`**${ad.title || ad.name || 'Untitled'}** (ID: ${ad.id})`);
    if (ad.display_format) adLines.push(`  Format: ${ad.display_format}`);
    if (ad.live !== undefined) adLines.push(`  Status: ${ad.live ? 'Live' : 'Inactive'}`);
    if (ad.publisher_platform?.length) adLines.push(`  Platforms: ${ad.publisher_platform.join(', ')}`);
    if (ad.started_running) adLines.push(`  Running since: ${ad.started_running}`);
    if (ad.running_duration) adLines.push(`  Running duration: ${ad.running_duration} days`);
    if (ad.description) adLines.push(`  Copy: ${ad.description.substring(0, 200)}${ad.description.length > 200 ? '...' : ''}`);
    if (ad.video) adLines.push(`  Video: ${ad.video}`);
    if (ad.image) adLines.push(`  Image: ${ad.image}`);
    adLines.push('');
    return adLines.join('\n');
  };

  if (fetch_all) {
    const allAds = await client.fetchAllCursor(
      (p) => client.getSpyderBrandAds(brand_id, p),
      filterParams,
    );
    if (!allAds.length) {
      return `No ads found for tracked brand "${brand_id}" matching the filters.`;
    }
    const lines: string[] = [];
    lines.push(`## Tracked Brand Ads (${allAds.length} total — all pages fetched)\n`);
    allAds.forEach(ad => lines.push(formatAdEntry(ad)));
    return lines.join('\n');
  }

  const result = await client.getSpyderBrandAds(brand_id, filterParams);

  if (!result.data?.length) {
    return `No ads found for tracked brand "${brand_id}" matching the filters.`;
  }

  const lines: string[] = [];
  lines.push(`## Tracked Brand Ads (${result.metadata?.count ?? result.data.length} total)\n`);
  result.data.forEach(ad => lines.push(formatAdEntry(ad)));

  if (result.metadata?.cursor) {
    lines.push(`*More results available. Use cursor: ${result.metadata.cursor} to load the next page, or set fetch_all: true to get everything.*`);
  }

  return lines.join('\n');
}

export const foreplayGetTrackedBrandAdsTool = {
  name: 'foreplay-get-tracked-brand-ads',
  description: 'Get ads from a brand you are tracking in Foreplay Spyder. Supports filtering by format, platform, date range, running duration, language, and more.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      brand_id: { type: 'string' as const, description: 'Foreplay brand ID of the tracked brand' },
      start_date: { type: 'string' as const, description: 'Start date (YYYY-MM-DD)' },
      end_date: { type: 'string' as const, description: 'End date (YYYY-MM-DD)' },
      live: { type: 'boolean' as const, description: 'Filter for active ads only' },
      display_format: { type: 'array' as const, items: { type: 'string' as const, enum: ['video', 'image', 'carousel', 'dco', 'story', 'reels'] }, description: 'Filter by format' },
      publisher_platform: { type: 'array' as const, items: { type: 'string' as const, enum: ['facebook', 'instagram', 'audience_network', 'messenger'] }, description: 'Filter by platform' },
      niches: { type: 'array' as const, items: { type: 'string' as const }, description: 'Filter by niche' },
      market_target: { type: 'array' as const, items: { type: 'string' as const, enum: ['b2b', 'b2c'] }, description: 'Filter by market target' },
      languages: { type: 'array' as const, items: { type: 'string' as const }, description: 'Filter by language code' },
      video_duration_min: { type: 'number' as const, description: 'Min video duration (seconds)' },
      video_duration_max: { type: 'number' as const, description: 'Max video duration (seconds)' },
      running_duration_min_days: { type: 'integer' as const, description: 'Min days running' },
      running_duration_max_days: { type: 'integer' as const, description: 'Max days running' },
      limit: { type: 'integer' as const, description: 'Number of ads to return (max 250, default 25)' },
      cursor: { type: 'integer' as const, description: 'Pagination cursor' },
      order: { type: 'string' as const, enum: ['newest', 'oldest', 'longest_running', 'most_relevant'], description: 'Sort order' },
      fetch_all: { type: 'boolean' as const, description: 'Auto-paginate to fetch ALL ads for complete analysis (ignores limit/cursor)' },
    },
    required: ['brand_id'],
  },
};
