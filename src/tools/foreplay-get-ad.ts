/**
 * Foreplay Get Ad Tool
 *
 * Get full details for a specific ad by its Foreplay ID.
 */

import { z } from 'zod';
import { createToolSchema } from '../lib/validation.js';
import { getForeplayClient } from '../lib/foreplay-client.js';
import type { ForeplayAd } from '../lib/foreplay-client.js';

const InputSchema = z.object({
  ad_id: z.string().describe('Foreplay ad ID'),
});

type Input = z.infer<typeof InputSchema>;

function formatAdDetail(ad: ForeplayAd): string {
  const lines: string[] = [];

  lines.push(`# ${ad.title || ad.name || 'Untitled Ad'}`);
  lines.push(`**ID:** ${ad.id}`);
  if (ad.brand_id) lines.push(`**Brand ID:** ${ad.brand_id}`);
  lines.push('');

  // Status & metadata
  lines.push('## Overview');
  if (ad.live !== undefined) lines.push(`- **Status:** ${ad.live ? 'Live' : 'Inactive'}`);
  if (ad.display_format) lines.push(`- **Format:** ${ad.display_format}`);
  if (ad.publisher_platform?.length) lines.push(`- **Platforms:** ${ad.publisher_platform.join(', ')}`);
  if (ad.started_running) lines.push(`- **Running since:** ${ad.started_running}`);
  if (ad.running_duration) lines.push(`- **Running duration:** ${ad.running_duration} days`);
  if (ad.categories?.length) lines.push(`- **Categories:** ${ad.categories.join(', ')}`);
  if (ad.niches?.length) lines.push(`- **Niches:** ${ad.niches.join(', ')}`);
  if (ad.market_target?.length) lines.push(`- **Market target:** ${ad.market_target.join(', ')}`);
  if (ad.languages?.length) lines.push(`- **Languages:** ${ad.languages.join(', ')}`);
  lines.push('');

  // Creative content
  lines.push('## Creative');
  if (ad.description) lines.push(`**Ad copy:**\n${ad.description}\n`);
  if (ad.cta_type) lines.push(`- **CTA:** ${ad.cta_type}${ad.cta_title ? ` — "${ad.cta_title}"` : ''}`);
  if (ad.link_url) lines.push(`- **Landing page:** ${ad.link_url}`);
  lines.push('');

  // Media
  lines.push('## Media');
  if (ad.video) lines.push(`- **Video:** ${ad.video}`);
  if (ad.image) lines.push(`- **Image:** ${ad.image}`);
  if (ad.thumbnail) lines.push(`- **Thumbnail:** ${ad.thumbnail}`);
  if (ad.cards?.length) lines.push(`- **Carousel cards:** ${ad.cards.length} cards`);
  lines.push('');

  // Transcription
  if (ad.full_transcription) {
    lines.push('## Transcription');
    lines.push(ad.full_transcription);
    lines.push('');
  }
  if (ad.timestamped_transcription) {
    lines.push('## Timestamped Transcription');
    lines.push(ad.timestamped_transcription);
    lines.push('');
  }

  // Analysis
  if (ad.emotional_drivers?.length || ad.persona) {
    lines.push('## Analysis');
    if (ad.emotional_drivers?.length) lines.push(`- **Emotional drivers:** ${ad.emotional_drivers.join(', ')}`);
    if (ad.persona) lines.push(`- **Target persona:** ${ad.persona}`);
    if (ad.creative_targeting) lines.push(`- **Creative targeting:** ${ad.creative_targeting}`);
    if (ad.product_category) lines.push(`- **Product category:** ${ad.product_category}`);
    lines.push('');
  }

  // Foreplay references
  if (ad.ad_library_id || ad.ad_library_url) {
    lines.push('## References');
    if (ad.ad_library_id) lines.push(`- **Ad Library ID:** ${ad.ad_library_id}`);
    if (ad.ad_library_url) lines.push(`- **Ad Library URL:** ${ad.ad_library_url}`);
  }

  return lines.join('\n');
}

export async function foreplayGetAd(input: Input): Promise<string> {
  const validate = createToolSchema(InputSchema);
  const { ad_id } = validate(input);
  const client = getForeplayClient();

  const result = await client.getAd(ad_id);
  if (!result.data) {
    return `No ad found with ID "${ad_id}".`;
  }

  return formatAdDetail(result.data);
}

export const foreplayGetAdTool = {
  name: 'foreplay-get-ad',
  description: 'Get full details for a specific competitor ad by its Foreplay ID. Returns creative assets (video/image URLs), ad copy, transcription, emotional drivers, persona, CTA, running duration, and more.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      ad_id: { type: 'string' as const, description: 'Foreplay ad ID' },
    },
    required: ['ad_id'],
  },
};
