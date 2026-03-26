/**
 * Foreplay Search Ads Tool
 *
 * Search competitor ads by domain, brand ID, or Facebook page ID.
 * Primary entry point for competitor research.
 */

import { z } from 'zod';
import { createToolSchema } from '../lib/validation.js';
import { getForeplayClient } from '../lib/foreplay-client.js';
import type { ForeplayAd, ForeplayBrand } from '../lib/foreplay-client.js';

const InputSchema = z.object({
  query: z.string().describe('Domain name (e.g. "nike.com"), Foreplay brand ID, or Facebook page ID'),
  query_type: z.enum(['domain', 'brand_id', 'page_id']).describe('Type of query: domain (website URL), brand_id (Foreplay ID), or page_id (Facebook page ID)'),
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  live: z.boolean().optional().describe('Filter for currently active ads only'),
  display_format: z.array(z.enum(['video', 'image', 'carousel', 'dco', 'story', 'reels'])).optional().describe('Filter by ad format'),
  publisher_platform: z.array(z.enum(['facebook', 'instagram', 'audience_network', 'messenger'])).optional().describe('Filter by platform'),
  niches: z.array(z.string()).optional().describe('Filter by industry/niche'),
  market_target: z.array(z.enum(['b2b', 'b2c'])).optional().describe('Filter by market target'),
  languages: z.array(z.string()).optional().describe('Filter by language code (e.g. "en", "es")'),
  video_duration_min: z.number().optional().describe('Minimum video duration in seconds'),
  video_duration_max: z.number().optional().describe('Maximum video duration in seconds'),
  running_duration_min_days: z.number().int().optional().describe('Minimum days the ad has been running'),
  running_duration_max_days: z.number().int().optional().describe('Maximum days the ad has been running'),
  limit: z.number().int().min(1).max(250).optional().default(25).describe('Number of ads to return (max 250)'),
  cursor: z.number().int().optional().describe('Pagination cursor from previous response'),
  order: z.enum(['newest', 'oldest', 'longest_running', 'most_relevant']).optional().describe('Sort order'),
});

type Input = z.infer<typeof InputSchema>;

function formatAd(ad: ForeplayAd): string {
  const lines: string[] = [];
  lines.push(`**${ad.title || ad.name || 'Untitled'}** (ID: ${ad.id})`);
  if (ad.brand_name) lines.push(`  Brand: ${ad.brand_name}`);
  if (ad.display_format) lines.push(`  Format: ${ad.display_format}`);
  if (ad.live !== undefined) lines.push(`  Status: ${ad.live ? '🟢 Live' : '⚪ Inactive'}`);
  if (ad.publisher_platform?.length) lines.push(`  Platforms: ${ad.publisher_platform.join(', ')}`);
  if (ad.started_running) lines.push(`  Running since: ${ad.started_running}`);
  if (ad.running_duration) lines.push(`  Running duration: ${ad.running_duration} days`);
  if (ad.description) lines.push(`  Copy: ${ad.description.substring(0, 200)}${ad.description.length > 200 ? '...' : ''}`);
  if (ad.cta_type) lines.push(`  CTA: ${ad.cta_type}${ad.cta_title ? ` - ${ad.cta_title}` : ''}`);
  if (ad.link_url) lines.push(`  Link: ${ad.link_url}`);
  if (ad.video) lines.push(`  Video: ${ad.video}`);
  if (ad.image) lines.push(`  Image: ${ad.image}`);
  if (ad.thumbnail) lines.push(`  Thumbnail: ${ad.thumbnail}`);
  return lines.join('\n');
}

function formatBrand(brand: ForeplayBrand): string {
  const lines: string[] = [];
  lines.push(`**${brand.name}** (ID: ${brand.id})`);
  if (brand.category) lines.push(`  Category: ${brand.category}`);
  if (brand.url) lines.push(`  URL: ${brand.url}`);
  if (brand.niches?.length) lines.push(`  Niches: ${brand.niches.join(', ')}`);
  if (brand.verification_status) lines.push(`  Verified: ${brand.verification_status}`);
  return lines.join('\n');
}

export async function foreplaySearchAds(input: Input): Promise<string> {
  const validate = createToolSchema(InputSchema);
  const params = validate(input);
  const client = getForeplayClient();

  const { query, query_type, ...filterParams } = params;

  const lines: string[] = [];

  if (query_type === 'domain') {
    // Step 1: Resolve domain to brands
    const brandResult = await client.getBrandsByDomain(query);
    if (!brandResult.data?.length) {
      return `No brands found for domain "${query}". Try a different domain or use a brand_id/page_id directly.`;
    }

    lines.push(`## Brands found for "${query}"\n`);
    brandResult.data.forEach(b => lines.push(formatBrand(b)));
    lines.push('');

    // Step 2: Fetch ads for all found brands
    const brandIds = brandResult.data.map(b => b.id);
    const adResult = await client.getAdsByBrandId(brandIds, filterParams);

    lines.push(`## Ads (${adResult.metadata?.count ?? adResult.data?.length ?? 0} total)\n`);
    if (adResult.data?.length) {
      adResult.data.forEach(ad => lines.push(formatAd(ad) + '\n'));
    } else {
      lines.push('No ads found matching the filters.');
    }
    if (adResult.metadata?.cursor) {
      lines.push(`\n*More results available. Use cursor: ${adResult.metadata.cursor} to load the next page.*`);
    }
  } else if (query_type === 'brand_id') {
    const brandIds = query.split(',').map(id => id.trim());
    const adResult = await client.getAdsByBrandId(brandIds, filterParams);

    lines.push(`## Ads for brand ${query} (${adResult.metadata?.count ?? adResult.data?.length ?? 0} total)\n`);
    if (adResult.data?.length) {
      adResult.data.forEach(ad => lines.push(formatAd(ad) + '\n'));
    } else {
      lines.push('No ads found matching the filters.');
    }
    if (adResult.metadata?.cursor) {
      lines.push(`\n*More results available. Use cursor: ${adResult.metadata.cursor} to load the next page.*`);
    }
  } else {
    // page_id
    const adResult = await client.getAdsByPageId(query, filterParams);

    lines.push(`## Ads for Facebook page ${query} (${adResult.metadata?.count ?? adResult.data?.length ?? 0} total)\n`);
    if (adResult.data?.length) {
      adResult.data.forEach(ad => lines.push(formatAd(ad) + '\n'));
    } else {
      lines.push('No ads found matching the filters.');
    }
    if (adResult.metadata?.cursor) {
      lines.push(`\n*More results available. Use cursor: ${adResult.metadata.cursor} to load the next page.*`);
    }
  }

  return lines.join('\n');
}

export const foreplaySearchAdsTool = {
  name: 'foreplay-search-ads',
  description: 'Search competitor ads by domain name, Foreplay brand ID, or Facebook page ID. Supports filtering by format, platform, date range, running duration, and more. This is the primary tool for competitor ad research.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string' as const, description: 'Domain name (e.g. "nike.com"), Foreplay brand ID, or Facebook page ID' },
      query_type: { type: 'string' as const, enum: ['domain', 'brand_id', 'page_id'], description: 'Type of query' },
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
      running_duration_min_days: { type: 'integer' as const, description: 'Minimum days the ad has been running' },
      running_duration_max_days: { type: 'integer' as const, description: 'Maximum days the ad has been running' },
      limit: { type: 'integer' as const, description: 'Number of ads to return (max 250, default 25)' },
      cursor: { type: 'integer' as const, description: 'Pagination cursor from previous response' },
      order: { type: 'string' as const, enum: ['newest', 'oldest', 'longest_running', 'most_relevant'], description: 'Sort order' },
    },
    required: ['query', 'query_type'],
  },
};
