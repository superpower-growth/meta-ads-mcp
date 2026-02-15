import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AdCreatorService } from '../meta/ad-creator.js';
import { env } from '../config/env.js';

const CreateAdSchema = z.object({
  adSetId: z.string().describe('Ad set ID to place this ad in'),
  creativeId: z.string().describe('Ad creative ID (from create-ad-creative)'),
  name: z.string().describe('Ad name'),
  status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED').describe('Ad status (default: PAUSED)'),
  trackingSpecs: z.array(z.record(z.string(), z.any())).optional().describe('Tracking specifications'),
  accountId: z.string().optional().describe('Meta Ad Account ID'),
});

export async function createAd(input: unknown): Promise<string> {
  const args = CreateAdSchema.parse(input);

  const accountId = args.accountId
    ? (args.accountId.startsWith('act_') ? args.accountId : `act_${args.accountId}`)
    : env.META_AD_ACCOUNT_ID;

  try {
    const service = new AdCreatorService(accountId);
    const result = await service.createAd({
      adset_id: args.adSetId,
      creative_id: args.creativeId,
      name: args.name,
      status: args.status,
      ...(args.trackingSpecs && { tracking_specs: args.trackingSpecs }),
    });

    return JSON.stringify(result, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to create ad: ${errorMessage}` }, null, 2);
  }
}

export const createAdTool: Tool = {
  name: 'create-ad',
  description: 'Create a Meta ad within an ad set using an existing creative. Ads are created in PAUSED status by default. This is the final step in the ad creation hierarchy: Campaign → Ad Set → Creative → Ad.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      adSetId: { type: 'string' as const, description: 'Ad set ID' },
      creativeId: { type: 'string' as const, description: 'Ad creative ID from create-ad-creative' },
      name: { type: 'string' as const, description: 'Ad name' },
      status: { type: 'string' as const, enum: ['ACTIVE', 'PAUSED'], default: 'PAUSED' },
      trackingSpecs: { type: 'array' as const, items: { type: 'object' as const }, description: 'Tracking specs' },
      accountId: { type: 'string' as const, description: 'Meta Ad Account ID' },
    },
    required: ['adSetId', 'creativeId', 'name'],
  },
};
