import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AdCreatorService } from '../meta/ad-creator.js';
import { env } from '../config/env.js';

const GetSavedAudiencesSchema = z.object({
  accountId: z.string().optional().describe('Meta Ad Account ID (with or without act_ prefix). Defaults to configured account.'),
});

export async function getSavedAudiences(input: unknown): Promise<string> {
  const args = GetSavedAudiencesSchema.parse(input);

  const accountId = args.accountId
    ? (args.accountId.startsWith('act_') ? args.accountId : `act_${args.accountId}`)
    : env.META_AD_ACCOUNT_ID;

  const service = new AdCreatorService(accountId);
  const audiences = await service.getSavedAudiences();

  return JSON.stringify({
    accountId,
    audiences,
    count: audiences.length,
  }, null, 2);
}

export const getSavedAudiencesTool: Tool = {
  name: 'get-saved-audiences',
  description: 'Get saved audiences for a Meta ad account. Returns audience names, IDs, and approximate sizes. Use to map ICP targeting to audience IDs for ad set creation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      accountId: {
        type: 'string' as const,
        description: 'Meta Ad Account ID (with or without act_ prefix). Defaults to configured account.',
      },
    },
    required: [],
  },
};
