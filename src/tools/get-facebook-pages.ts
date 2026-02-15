import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AdCreatorService } from '../meta/ad-creator.js';

const GetFacebookPagesSchema = z.object({});

export async function getFacebookPages(input: unknown): Promise<string> {
  GetFacebookPagesSchema.parse(input || {});

  const service = new AdCreatorService();
  const pages = await service.getFacebookPages();

  return JSON.stringify({
    pages,
    count: pages.length,
  }, null, 2);
}

export const getFacebookPagesTool: Tool = {
  name: 'get-facebook-pages',
  description: 'Get Facebook Pages accessible by the authenticated user. Returns page IDs, names, categories, and linked Instagram actor IDs. Required for creating ad creatives.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};
