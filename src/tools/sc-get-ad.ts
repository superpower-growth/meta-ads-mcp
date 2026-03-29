/**
 * ScrapeCreators Get Ad Tool
 *
 * Get full details for a specific ad from the Meta Ad Library.
 */

import { z } from 'zod';
import { createToolSchema } from '../lib/validation.js';
import { getScrapeCreatorsClient } from '../lib/scrapecreators-client.js';
import type { SCAd } from '../lib/scrapecreators-client.js';

const InputSchema = z.object({
  id: z.string().optional().describe('Facebook Ad Library ID (ad_archive_id)'),
  url: z.string().optional().describe('Facebook Ad Library URL'),
  get_transcript: z.boolean().optional().describe('Transcribe video audio (videos under 2 minutes only)'),
  trim: z.boolean().optional().describe('Return condensed response'),
}).refine(data => data.id || data.url, {
  message: 'Either id or url is required',
});

type Input = z.infer<typeof InputSchema>;

function formatAdDetail(ad: SCAd): string {
  const lines: string[] = [];
  const snapshot = ad.snapshot || {};

  lines.push(`# ${snapshot.title || ad.page_name || 'Untitled Ad'}`);
  lines.push(`**Ad Archive ID:** ${ad.ad_archive_id || 'unknown'}`);
  if (ad.page_name) lines.push(`**Page:** ${ad.page_name} (ID: ${ad.page_id || 'unknown'})`);
  if (ad.collation_id) lines.push(`**Campaign Group:** ${ad.collation_id} (${ad.collation_count || '?'} ads in group)`);
  lines.push('');

  // Overview
  lines.push('## Overview');
  if (ad.is_active !== undefined) lines.push(`- **Status:** ${ad.is_active ? 'Active' : 'Inactive'}`);
  if (snapshot.display_format) lines.push(`- **Format:** ${snapshot.display_format}`);
  if (ad.publisher_platform?.length) lines.push(`- **Platforms:** ${ad.publisher_platform.join(', ')}`);
  if (ad.start_date) lines.push(`- **Started:** ${new Date(ad.start_date * 1000).toISOString().split('T')[0]}`);
  if (ad.end_date) lines.push(`- **Ended:** ${new Date(ad.end_date * 1000).toISOString().split('T')[0]}`);
  if (ad.languages?.length) lines.push(`- **Languages:** ${ad.languages.join(', ')}`);
  if (ad.bylines) lines.push(`- **Bylines:** ${ad.bylines}`);
  lines.push('');

  // Creative
  lines.push('## Creative');
  const bodyHtml = snapshot.body?.markup?.__html;
  if (bodyHtml) {
    const text = bodyHtml.replace(/<[^>]+>/g, '').trim();
    if (text) lines.push(`**Ad copy:**\n${text}\n`);
  }
  if (snapshot.link_title) lines.push(`- **Link title:** ${snapshot.link_title}`);
  if (snapshot.link_description) lines.push(`- **Link description:** ${snapshot.link_description}`);
  if (snapshot.cta_text) lines.push(`- **CTA:** ${snapshot.cta_text}`);
  if (snapshot.link_url) lines.push(`- **Landing page:** ${snapshot.link_url}`);
  lines.push('');

  // Media
  lines.push('## Media');
  if (snapshot.videos?.length) {
    snapshot.videos.forEach((v, i) => {
      lines.push(`- **Video ${i + 1}:** ${v.video_hd_url || v.video_sd_url || 'no URL'}`);
      if (v.video_preview_image_url) lines.push(`  Preview: ${v.video_preview_image_url}`);
    });
  }
  if (snapshot.images?.length) {
    snapshot.images.forEach((img, i) => {
      lines.push(`- **Image ${i + 1}:** ${img.original_image_url || img.resized_image_url || 'no URL'}`);
    });
  }
  if (snapshot.cards?.length) lines.push(`- **Carousel cards:** ${snapshot.cards.length} cards`);
  lines.push('');

  // Performance
  if (ad.impressions || ad.spend) {
    lines.push('## Performance');
    if (ad.impressions) {
      lines.push(`- **Impressions:** ${ad.impressions.lower_bound || '?'} - ${ad.impressions.upper_bound || '?'}`);
    }
    if (ad.spend) {
      lines.push(`- **Spend:** ${ad.currency || ''} ${ad.spend.lower_bound || '?'} - ${ad.spend.upper_bound || '?'}`);
    }
    lines.push('');
  }

  // Targeting
  if (ad.demographic_distribution?.length || ad.delivery_by_region?.length || ad.target_ages || ad.target_gender) {
    lines.push('## Targeting');
    if (ad.target_ages) lines.push(`- **Ages:** ${ad.target_ages}`);
    if (ad.target_gender) lines.push(`- **Gender:** ${ad.target_gender}`);
    if (ad.target_locations?.length) lines.push(`- **Locations:** ${JSON.stringify(ad.target_locations)}`);
    if (ad.demographic_distribution?.length) {
      lines.push('- **Demographics:**');
      ad.demographic_distribution.slice(0, 10).forEach(d => {
        lines.push(`  - ${d.age || '?'} ${d.gender || '?'}: ${(parseFloat(d.percentage || '0') * 100).toFixed(1)}%`);
      });
    }
    if (ad.delivery_by_region?.length) {
      lines.push('- **Regions:**');
      ad.delivery_by_region.slice(0, 10).forEach(r => {
        lines.push(`  - ${r.region || '?'}: ${(parseFloat(r.percentage || '0') * 100).toFixed(1)}%`);
      });
    }
    lines.push('');
  }

  // Transcript (if present in response)
  if ((ad as any).transcript) {
    lines.push('## Transcript');
    lines.push((ad as any).transcript);
    lines.push('');
  }

  return lines.join('\n');
}

export async function scGetAd(input: Input): Promise<string> {
  const validate = createToolSchema(InputSchema);
  const params = validate(input);
  const client = getScrapeCreatorsClient();

  const result = await client.getAd({
    id: params.id,
    url: params.url,
    get_transcript: params.get_transcript,
    trim: params.trim,
  });

  if (!result || (!result.ad_archive_id && !result.adid)) {
    return `No ad found for ${params.id ? `ID "${params.id}"` : `URL "${params.url}"`}.`;
  }

  return formatAdDetail(result);
}

export const scGetAdTool = {
  name: 'sc-get-ad',
  description: 'Get full details for a specific ad from the Meta Ad Library by ID or URL. Returns creative assets (video/image URLs), ad copy, CTA, landing page, impressions, spend, targeting demographics, and optionally a video transcript.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string' as const, description: 'Facebook Ad Library ID (ad_archive_id)' },
      url: { type: 'string' as const, description: 'Facebook Ad Library URL' },
      get_transcript: { type: 'boolean' as const, description: 'Transcribe video audio (videos under 2 min)' },
      trim: { type: 'boolean' as const, description: 'Return condensed response' },
    },
    required: [],
  },
};
