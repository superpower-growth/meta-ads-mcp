/**
 * Foreplay Get Tracked Brands Tool
 *
 * List brands being tracked in Foreplay Spyder, or get details for a specific tracked brand.
 */

import { z } from 'zod';
import { createToolSchema } from '../lib/validation.js';
import { getForeplayClient } from '../lib/foreplay-client.js';
import type { ForeplayBrand } from '../lib/foreplay-client.js';

const InputSchema = z.object({
  brand_id: z.string().optional().describe('Specific brand ID to get details for. If omitted, lists all tracked brands.'),
  limit: z.number().int().min(1).max(10).optional().default(10).describe('Number of brands to return (max 10)'),
  offset: z.number().int().optional().default(0).describe('Pagination offset'),
});

type Input = z.infer<typeof InputSchema>;

function formatBrand(brand: ForeplayBrand): string {
  const lines: string[] = [];
  lines.push(`**${brand.name}** (ID: ${brand.id})`);
  if (brand.category) lines.push(`  Category: ${brand.category}`);
  if (brand.description) lines.push(`  Description: ${brand.description.substring(0, 200)}${brand.description.length > 200 ? '...' : ''}`);
  if (brand.url) lines.push(`  URL: ${brand.url}`);
  if (brand.websites?.length) lines.push(`  Websites: ${brand.websites.join(', ')}`);
  if (brand.niches?.length) lines.push(`  Niches: ${brand.niches.join(', ')}`);
  if (brand.verification_status) lines.push(`  Verification: ${brand.verification_status}`);
  if (brand.ad_library_id) lines.push(`  Ad Library ID: ${brand.ad_library_id}`);
  return lines.join('\n');
}

export async function foreplayGetTrackedBrands(input: Input): Promise<string> {
  const validate = createToolSchema(InputSchema);
  const params = validate(input);
  const client = getForeplayClient();

  if (params.brand_id) {
    const result = await client.getSpyderBrand(params.brand_id);
    if (!result.data) {
      return `No tracked brand found with ID "${params.brand_id}".`;
    }
    return `## Tracked Brand Details\n\n${formatBrand(result.data)}`;
  }

  const result = await client.getSpyderBrands({ offset: params.offset, limit: params.limit });

  if (!result.data?.length) {
    return 'No brands are being tracked in Foreplay Spyder. Add brands to track in the Foreplay app.';
  }

  const lines: string[] = [];
  lines.push(`## Tracked Brands (${result.metadata?.count ?? result.data.length})\n`);
  result.data.forEach(brand => {
    lines.push(formatBrand(brand));
    lines.push('');
  });

  return lines.join('\n');
}

export const foreplayGetTrackedBrandsTool = {
  name: 'foreplay-get-tracked-brands',
  description: 'List brands being tracked in Foreplay Spyder (competitor monitoring), or get details for a specific tracked brand. Use foreplay-get-tracked-brand-ads to see their ads.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      brand_id: { type: 'string' as const, description: 'Specific brand ID for details. Omit to list all tracked brands.' },
      limit: { type: 'integer' as const, description: 'Number of brands to return (max 10)' },
      offset: { type: 'integer' as const, description: 'Pagination offset' },
    },
    required: [],
  },
};
