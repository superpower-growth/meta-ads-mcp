/**
 * Foreplay Find Duplicates Tool
 *
 * Find duplicate/variant creatives for a given ad.
 * Useful for identifying creative testing patterns.
 */

import { z } from 'zod';
import { createToolSchema } from '../lib/validation.js';
import { getForeplayClient } from '../lib/foreplay-client.js';
import type { ForeplayAd } from '../lib/foreplay-client.js';

const InputSchema = z.object({
  ad_id: z.string().describe('Foreplay ad ID to find duplicates for'),
});

type Input = z.infer<typeof InputSchema>;

function formatDuplicate(ad: ForeplayAd, index: number): string {
  const lines: string[] = [];
  lines.push(`### ${index + 1}. ${ad.title || ad.name || 'Untitled'} (ID: ${ad.id})`);
  if (ad.brand_id) lines.push(`- Brand ID: ${ad.brand_id}`);
  if (ad.display_format) lines.push(`- Format: ${ad.display_format}`);
  if (ad.live !== undefined) lines.push(`- Status: ${ad.live ? 'Live' : 'Inactive'}`);
  if (ad.publisher_platform?.length) lines.push(`- Platforms: ${ad.publisher_platform.join(', ')}`);
  if (ad.started_running) lines.push(`- Running since: ${ad.started_running}`);
  if (ad.running_duration) lines.push(`- Running duration: ${ad.running_duration} days`);
  if (ad.description) lines.push(`- Copy: ${ad.description.substring(0, 150)}${ad.description.length > 150 ? '...' : ''}`);
  if (ad.link_url) lines.push(`- Link: ${ad.link_url}`);
  return lines.join('\n');
}

export async function foreplayFindDuplicates(input: Input): Promise<string> {
  const validate = createToolSchema(InputSchema);
  const { ad_id } = validate(input);
  const client = getForeplayClient();

  const result = await client.getAdDuplicates(ad_id);

  if (!result.data?.length) {
    return `No duplicate creatives found for ad "${ad_id}". This creative appears to be unique.`;
  }

  const lines: string[] = [];
  lines.push(`## Duplicate Creatives for Ad ${ad_id}`);
  lines.push(`Found **${result.data.length}** ads using the same image or video.\n`);

  result.data.forEach((ad, i) => {
    lines.push(formatDuplicate(ad, i));
    lines.push('');
  });

  return lines.join('\n');
}

export const foreplayFindDuplicatesTool = {
  name: 'foreplay-find-duplicates',
  description: 'Find duplicate or variant creatives for a specific ad. Shows all ads using the same image or video, useful for identifying how competitors test creative variations.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      ad_id: { type: 'string' as const, description: 'Foreplay ad ID to find duplicates for' },
    },
    required: ['ad_id'],
  },
};
