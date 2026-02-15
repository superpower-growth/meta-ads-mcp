import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AdCreatorService } from '../meta/ad-creator.js';
import { env } from '../config/env.js';

const ListAdSetsSchema = z.object({
  campaignId: z.string().describe('Meta Campaign ID to list ad sets for'),
  accountId: z.string().optional().describe('Meta Ad Account ID (with or without act_ prefix). Defaults to configured account.'),
});

export async function listAdSets(input: unknown): Promise<string> {
  const args = ListAdSetsSchema.parse(input);

  const accountId = args.accountId
    ? (args.accountId.startsWith('act_') ? args.accountId : `act_${args.accountId}`)
    : env.META_AD_ACCOUNT_ID;

  const service = new AdCreatorService(accountId);
  const adSets = await service.listAdSets(args.campaignId);

  return JSON.stringify({
    campaignId: args.campaignId,
    accountId,
    adSets,
    count: adSets.length,
  }, null, 2);
}

export const listAdSetsTool: Tool = {
  name: 'list-ad-sets',
  description: 'List ad sets within a specific Meta campaign. Returns ad set names, IDs, statuses, and budgets. Critical for mapping Notion ad set names to Meta ad set IDs.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      campaignId: {
        type: 'string' as const,
        description: 'Meta Campaign ID to list ad sets for',
      },
      accountId: {
        type: 'string' as const,
        description: 'Meta Ad Account ID (with or without act_ prefix). Defaults to configured account.',
      },
    },
    required: ['campaignId'],
  },
};
