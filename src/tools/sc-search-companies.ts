/**
 * ScrapeCreators Search Companies Tool
 *
 * Search for companies/pages in the Meta Ad Library.
 * Returns page IDs that can be used with sc-search-ads (page_id param).
 */

import { z } from 'zod';
import { createToolSchema } from '../lib/validation.js';
import { getScrapeCreatorsClient } from '../lib/scrapecreators-client.js';

const InputSchema = z.object({
  query: z.string().describe('Company or brand name to search for'),
});

type Input = z.infer<typeof InputSchema>;

export async function scSearchCompanies(input: Input): Promise<string> {
  const validate = createToolSchema(InputSchema);
  const { query } = validate(input);
  const client = getScrapeCreatorsClient();

  const result = await client.searchCompanies({ query });
  const companies = result.results || [];

  if (companies.length === 0) {
    return `No companies found matching "${query}". Try a different name.`;
  }

  const lines: string[] = [];
  lines.push(`## Companies matching "${query}" (${companies.length} found)\n`);

  companies.forEach(company => {
    const name = company.name || company.page_name || 'Unknown';
    const pageId = company.pageID || '';
    lines.push(`**${name}**`);
    lines.push(`  Page ID: ${pageId}`);
    if (company.categories?.length) lines.push(`  Categories: ${company.categories.join(', ')}`);
    if (company.likes) lines.push(`  Likes: ${company.likes.toLocaleString()}`);
    lines.push('');
  });

  lines.push('*Use a Page ID with sc-search-ads (page_id param) to fetch ads for a specific company.*');

  return lines.join('\n');
}

export const scSearchCompaniesTool = {
  name: 'sc-search-companies',
  description: 'Search for companies/pages in the Meta Ad Library by name. Returns page IDs that can be used with sc-search-ads to fetch a company\'s ads.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string' as const, description: 'Company or brand name to search for' },
    },
    required: ['query'],
  },
};
