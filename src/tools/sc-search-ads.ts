/**
 * ScrapeCreators Search Ads Tool
 *
 * Smart entry point for Meta Ad Library searches.
 * Handles both keyword searches and company lookups with auto-resolution.
 */

import { z } from 'zod';
import { createToolSchema } from '../lib/validation.js';
import { getScrapeCreatorsClient } from '../lib/scrapecreators-client.js';
import type { SCAd } from '../lib/scrapecreators-client.js';

const InputSchema = z.object({
  query: z.string().describe('Search keyword (e.g. "running shoes") or company name (e.g. "hims"). Required unless page_id is provided.').optional(),
  query_type: z.enum(['keyword', 'company']).optional().default('keyword').describe('Search type: keyword (search all ads) or company (resolve company name then fetch their ads)'),
  page_id: z.string().optional().describe('Facebook page ID — skip company resolution and fetch ads directly'),
  sort_by: z.enum(['total_impressions', 'relevancy_monthly_grouped']).optional().describe('Sort method'),
  search_type: z.enum(['keyword_unordered', 'keyword_exact_phrase']).optional().describe('Keyword matching: unordered or exact phrase'),
  ad_type: z.enum(['all', 'political_and_issue_ads']).optional().describe('Ad category filter'),
  country: z.string().optional().describe('2-letter country code (e.g. "US"). Default: ALL'),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).optional().describe('Ad status filter. Default: ACTIVE'),
  media_type: z.enum(['ALL', 'IMAGE', 'VIDEO', 'MEME', 'IMAGE_AND_MEME', 'NONE']).optional().describe('Media format filter'),
  language: z.string().optional().describe('2-letter language code (e.g. "EN"). Only for company search.'),
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  cursor: z.string().optional().describe('Pagination cursor from previous response'),
  trim: z.boolean().optional().describe('Return condensed response'),
  fetch_all: z.boolean().optional().default(false).describe('Auto-paginate to fetch ALL ads. Uses cursor pagination with POST fallback for large datasets.'),
});

type Input = z.infer<typeof InputSchema>;

function formatAd(ad: SCAd): string {
  const lines: string[] = [];
  const title = ad.snapshot?.title || ad.page_name || 'Untitled';
  lines.push(`**${title}** (ID: ${ad.ad_archive_id || ad.adid || 'unknown'})`);
  if (ad.page_name) lines.push(`  Page: ${ad.page_name}`);
  if (ad.is_active !== undefined) lines.push(`  Status: ${ad.is_active ? 'Active' : 'Inactive'}`);
  if (ad.snapshot?.display_format) lines.push(`  Format: ${ad.snapshot.display_format}`);
  if (ad.publisher_platform?.length) lines.push(`  Platforms: ${ad.publisher_platform.join(', ')}`);

  // Ad copy from snapshot body
  const bodyHtml = ad.snapshot?.body?.markup?.__html;
  if (bodyHtml) {
    const text = bodyHtml.replace(/<[^>]+>/g, '').trim();
    if (text) lines.push(`  Copy: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
  }

  if (ad.snapshot?.cta_text) lines.push(`  CTA: ${ad.snapshot.cta_text}`);
  if (ad.snapshot?.link_url) lines.push(`  Link: ${ad.snapshot.link_url}`);

  // Media
  if (ad.snapshot?.videos?.length) {
    const video = ad.snapshot.videos[0];
    lines.push(`  Video: ${video.video_hd_url || video.video_sd_url || ''}`);
  }
  if (ad.snapshot?.images?.length) {
    const img = ad.snapshot.images[0];
    lines.push(`  Image: ${img.original_image_url || img.resized_image_url || ''}`);
  }

  // Impressions
  if (ad.impressions) {
    const lower = ad.impressions.lower_bound || '?';
    const upper = ad.impressions.upper_bound || '?';
    lines.push(`  Impressions: ${lower} - ${upper}`);
  }

  if (ad.start_date) {
    const date = new Date(ad.start_date * 1000).toISOString().split('T')[0];
    lines.push(`  Started: ${date}`);
  }

  return lines.join('\n');
}

export async function scSearchAds(input: Input): Promise<string> {
  const validate = createToolSchema(InputSchema);
  const params = validate(input);
  const client = getScrapeCreatorsClient();

  const lines: string[] = [];

  // ── Company flow: resolve name -> page ID -> fetch ads ──
  if (params.query_type === 'company' || params.page_id) {
    let pageId = params.page_id;
    let companyName = params.query;

    // Resolve company name to page ID if needed
    if (!pageId) {
      if (!params.query) {
        return 'Error: query is required when query_type is "company" and no page_id is provided.';
      }
      const companyResult = await client.searchCompanies({ query: params.query });
      const companies = companyResult.results || [];

      if (companies.length === 0) {
        return `No companies found matching "${params.query}". Try a different name or use query_type: "keyword" to search ad content instead.`;
      }

      // Use the first match
      const match = companies[0];
      pageId = match.pageID || match.page_name;
      companyName = match.name || match.page_name || params.query;

      // Show all matched companies
      lines.push(`## Companies found for "${params.query}"\n`);
      companies.slice(0, 10).forEach((c, i) => {
        const name = c.name || c.page_name || 'Unknown';
        const id = c.pageID || '';
        const cats = c.categories?.length ? ` (${c.categories.join(', ')})` : '';
        lines.push(`${i === 0 ? '**->** ' : '    '}${name} — Page ID: ${id}${cats}`);
      });
      lines.push(`\n*Using first match: ${companyName} (${pageId})*\n`);
    }

    if (!pageId) {
      return 'Error: Could not resolve company to a page ID.';
    }

    // Build company ads params
    const companyParams = {
      pageId,
      country: params.country,
      status: params.status,
      media_type: params.media_type,
      language: params.language,
      sort_by: params.sort_by,
      start_date: params.start_date,
      end_date: params.end_date,
      cursor: params.cursor,
      trim: params.trim,
    };

    if (params.fetch_all) {
      const allAds = await client.fetchAllCompanyAds(companyParams);
      lines.push(`## Ads for ${companyName} (${allAds.length} total — all pages fetched)\n`);
      if (allAds.length) {
        allAds.forEach(ad => lines.push(formatAd(ad) + '\n'));
      } else {
        lines.push('No ads found matching the filters.');
      }
    } else {
      const result = await client.getCompanyAds(companyParams);
      const ads = result.results || [];
      lines.push(`## Ads for ${companyName} (${ads.length} returned)\n`);
      if (ads.length) {
        ads.forEach(ad => lines.push(formatAd(ad) + '\n'));
      } else {
        lines.push('No ads found matching the filters.');
      }
      if (result.cursor) {
        lines.push(`\n*More results available. Use cursor: "${result.cursor.substring(0, 50)}..." to load the next page, or set fetch_all: true to get everything.*`);
      }
    }

    return lines.join('\n');
  }

  // ── Keyword flow: search all ads ──
  if (!params.query) {
    return 'Error: query is required for keyword searches.';
  }

  const searchParams = {
    query: params.query,
    sort_by: params.sort_by,
    search_type: params.search_type,
    ad_type: params.ad_type,
    country: params.country,
    status: params.status,
    media_type: params.media_type,
    start_date: params.start_date,
    end_date: params.end_date,
    cursor: params.cursor,
    trim: params.trim,
  };

  if (params.fetch_all) {
    const allAds = await client.fetchAllSearchAds(searchParams);
    lines.push(`## Search results for "${params.query}" (${allAds.length} total — all pages fetched)\n`);
    if (allAds.length) {
      allAds.forEach(ad => lines.push(formatAd(ad) + '\n'));
    } else {
      lines.push('No ads found matching the search.');
    }
  } else {
    const result = await client.searchAds(searchParams);
    const ads = result.searchResults || [];
    const total = result.searchResultsCount ?? ads.length;
    lines.push(`## Search results for "${params.query}" (${ads.length} returned, ~${total} total)\n`);
    if (ads.length) {
      ads.forEach(ad => lines.push(formatAd(ad) + '\n'));
    } else {
      lines.push('No ads found matching the search.');
    }
    if (result.cursor) {
      lines.push(`\n*More results available. Use cursor to load the next page, or set fetch_all: true to get everything.*`);
    }
  }

  return lines.join('\n');
}

export const scSearchAdsTool = {
  name: 'sc-search-ads',
  description: 'Search the Meta Ad Library by keyword or company name. For company searches, automatically resolves the company name to a Facebook page ID and fetches their ads. Supports filtering by country, status, media type, date range, and more. Use fetch_all: true to auto-paginate all results.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string' as const, description: 'Search keyword or company name' },
      query_type: { type: 'string' as const, enum: ['keyword', 'company'], description: 'Search type: keyword (search all ads) or company (resolve company then fetch ads). Default: keyword' },
      page_id: { type: 'string' as const, description: 'Facebook page ID — skip company resolution and fetch ads directly' },
      sort_by: { type: 'string' as const, enum: ['total_impressions', 'relevancy_monthly_grouped'], description: 'Sort method' },
      search_type: { type: 'string' as const, enum: ['keyword_unordered', 'keyword_exact_phrase'], description: 'Keyword matching mode' },
      ad_type: { type: 'string' as const, enum: ['all', 'political_and_issue_ads'], description: 'Ad category filter' },
      country: { type: 'string' as const, description: '2-letter country code (default: ALL)' },
      status: { type: 'string' as const, enum: ['ALL', 'ACTIVE', 'INACTIVE'], description: 'Ad status filter (default: ACTIVE)' },
      media_type: { type: 'string' as const, enum: ['ALL', 'IMAGE', 'VIDEO', 'MEME', 'IMAGE_AND_MEME', 'NONE'], description: 'Media format filter' },
      language: { type: 'string' as const, description: '2-letter language code (company search only)' },
      start_date: { type: 'string' as const, description: 'Start date (YYYY-MM-DD)' },
      end_date: { type: 'string' as const, description: 'End date (YYYY-MM-DD)' },
      cursor: { type: 'string' as const, description: 'Pagination cursor from previous response' },
      trim: { type: 'boolean' as const, description: 'Return condensed response' },
      fetch_all: { type: 'boolean' as const, description: 'Auto-paginate to fetch ALL ads (uses cursor with POST fallback)' },
    },
    required: [],
  },
};
