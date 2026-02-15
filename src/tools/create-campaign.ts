import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AdCreatorService } from '../meta/ad-creator.js';
import { env } from '../config/env.js';

const CreateCampaignSchema = z.object({
  name: z.string().describe('Campaign name'),
  objective: z.enum([
    'OUTCOME_AWARENESS',
    'OUTCOME_ENGAGEMENT',
    'OUTCOME_LEADS',
    'OUTCOME_SALES',
    'OUTCOME_TRAFFIC',
    'OUTCOME_APP_PROMOTION',
  ]).describe('Campaign objective'),
  status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED').describe('Campaign status (default: PAUSED)'),
  specialAdCategories: z.array(z.enum([
    'NONE',
    'EMPLOYMENT',
    'HOUSING',
    'CREDIT',
    'ISSUES_ELECTIONS_POLITICS',
  ])).default([]).describe('Special ad categories (empty array if none)'),
  buyingType: z.enum(['AUCTION', 'RESERVED']).default('AUCTION').describe('Buying type'),
  dailyBudget: z.number().optional().describe('Daily budget in cents (mutually exclusive with lifetimeBudget)'),
  lifetimeBudget: z.number().optional().describe('Lifetime budget in cents (mutually exclusive with dailyBudget)'),
  bidStrategy: z.enum([
    'LOWEST_COST_WITHOUT_CAP',
    'LOWEST_COST_WITH_BID_CAP',
    'COST_CAP',
  ]).optional().describe('Bid strategy'),
  accountId: z.string().optional().describe('Meta Ad Account ID. Defaults to configured account.'),
});

export async function createCampaign(input: unknown): Promise<string> {
  const args = CreateCampaignSchema.parse(input);

  // Validate budget exclusivity
  if (args.dailyBudget && args.lifetimeBudget) {
    return JSON.stringify({ error: 'Cannot set both dailyBudget and lifetimeBudget. Choose one.' }, null, 2);
  }

  const accountId = args.accountId
    ? (args.accountId.startsWith('act_') ? args.accountId : `act_${args.accountId}`)
    : env.META_AD_ACCOUNT_ID;

  try {
    const service = new AdCreatorService(accountId);
    const result = await service.createCampaign({
      name: args.name,
      objective: args.objective,
      status: args.status,
      special_ad_categories: args.specialAdCategories,
      buying_type: args.buyingType,
      ...(args.dailyBudget && { daily_budget: args.dailyBudget.toString() }),
      ...(args.lifetimeBudget && { lifetime_budget: args.lifetimeBudget.toString() }),
      ...(args.bidStrategy && { bid_strategy: args.bidStrategy }),
    });

    return JSON.stringify(result, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to create campaign: ${errorMessage}` }, null, 2);
  }
}

export const createCampaignTool: Tool = {
  name: 'create-campaign',
  description: 'Create a new Meta ad campaign. Campaigns are created in PAUSED status by default. Set objective, budget, and bid strategy.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' as const, description: 'Campaign name' },
      objective: {
        type: 'string' as const,
        enum: ['OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_APP_PROMOTION'],
        description: 'Campaign objective',
      },
      status: { type: 'string' as const, enum: ['ACTIVE', 'PAUSED'], description: 'Campaign status (default: PAUSED)', default: 'PAUSED' },
      specialAdCategories: { type: 'array' as const, items: { type: 'string' as const }, description: 'Special ad categories (empty array if none)', default: [] },
      buyingType: { type: 'string' as const, enum: ['AUCTION', 'RESERVED'], description: 'Buying type', default: 'AUCTION' },
      dailyBudget: { type: 'number' as const, description: 'Daily budget in cents' },
      lifetimeBudget: { type: 'number' as const, description: 'Lifetime budget in cents' },
      bidStrategy: { type: 'string' as const, enum: ['LOWEST_COST_WITHOUT_CAP', 'LOWEST_COST_WITH_BID_CAP', 'COST_CAP'], description: 'Bid strategy' },
      accountId: { type: 'string' as const, description: 'Meta Ad Account ID. Defaults to configured account.' },
    },
    required: ['name', 'objective'],
  },
};
