import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AdCreatorService } from '../meta/ad-creator.js';
import { env } from '../config/env.js';

const CreateAdSetSchema = z.object({
  campaignId: z.string().describe('Parent campaign ID'),
  name: z.string().describe('Ad set name'),
  status: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED').describe('Ad set status'),
  dailyBudget: z.number().optional().describe('Daily budget in cents'),
  lifetimeBudget: z.number().optional().describe('Lifetime budget in cents'),
  bidAmount: z.number().optional().describe('Bid amount in cents'),
  billingEvent: z.enum(['IMPRESSIONS', 'LINK_CLICKS', 'APP_INSTALLS', 'THRUPLAY']).default('IMPRESSIONS').describe('Billing event'),
  optimizationGoal: z.enum([
    'LINK_CLICKS', 'IMPRESSIONS', 'REACH', 'LANDING_PAGE_VIEWS',
    'OFFSITE_CONVERSIONS', 'VALUE', 'THRUPLAY', 'APP_INSTALLS',
    'LEAD_GENERATION', 'ENGAGED_USERS',
  ]).default('LINK_CLICKS').describe('Optimization goal'),
  savedAudienceId: z.string().optional().describe('Saved audience ID for targeting'),
  targeting: z.record(z.string(), z.any()).optional().describe('Custom targeting spec (if not using savedAudienceId)'),
  startTime: z.string().optional().describe('Start time (ISO 8601 format)'),
  endTime: z.string().optional().describe('End time (ISO 8601 format)'),
  promotedObject: z.record(z.string(), z.any()).optional().describe('Promoted object (e.g., { pixel_id, custom_event_type })'),
  accountId: z.string().optional().describe('Meta Ad Account ID. Defaults to configured account.'),
});

export async function createAdSet(input: unknown): Promise<string> {
  const args = CreateAdSetSchema.parse(input);

  // Validate budget exclusivity
  if (args.dailyBudget && args.lifetimeBudget) {
    return JSON.stringify({ error: 'Cannot set both dailyBudget and lifetimeBudget.' }, null, 2);
  }

  // Validate lifetime budget requires dates
  if (args.lifetimeBudget && (!args.startTime || !args.endTime)) {
    return JSON.stringify({ error: 'Lifetime budget requires both startTime and endTime.' }, null, 2);
  }

  const accountId = args.accountId
    ? (args.accountId.startsWith('act_') ? args.accountId : `act_${args.accountId}`)
    : env.META_AD_ACCOUNT_ID;

  try {
    const service = new AdCreatorService(accountId);

    // Build targeting
    let targeting = args.targeting || { geo_locations: { countries: ['US'] } };
    if (args.savedAudienceId) {
      targeting = { ...targeting, saved_audience_id: args.savedAudienceId };
    }

    const result = await service.createAdSet({
      campaign_id: args.campaignId,
      name: args.name,
      status: args.status,
      billing_event: args.billingEvent,
      optimization_goal: args.optimizationGoal,
      targeting,
      ...(args.dailyBudget && { daily_budget: args.dailyBudget.toString() }),
      ...(args.lifetimeBudget && { lifetime_budget: args.lifetimeBudget.toString() }),
      ...(args.bidAmount && { bid_amount: args.bidAmount.toString() }),
      ...(args.startTime && { start_time: args.startTime }),
      ...(args.endTime && { end_time: args.endTime }),
      ...(args.promotedObject && { promoted_object: args.promotedObject }),
    });

    return JSON.stringify(result, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to create ad set: ${errorMessage}` }, null, 2);
  }
}

export const createAdSetTool: Tool = {
  name: 'create-ad-set',
  description: 'Create a new Meta ad set within a campaign. Configure targeting, budget, optimization, and schedule. Created in PAUSED status by default.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      campaignId: { type: 'string' as const, description: 'Parent campaign ID' },
      name: { type: 'string' as const, description: 'Ad set name' },
      status: { type: 'string' as const, enum: ['ACTIVE', 'PAUSED'], default: 'PAUSED' },
      dailyBudget: { type: 'number' as const, description: 'Daily budget in cents' },
      lifetimeBudget: { type: 'number' as const, description: 'Lifetime budget in cents' },
      bidAmount: { type: 'number' as const, description: 'Bid amount in cents' },
      billingEvent: { type: 'string' as const, enum: ['IMPRESSIONS', 'LINK_CLICKS', 'APP_INSTALLS', 'THRUPLAY'], default: 'IMPRESSIONS' },
      optimizationGoal: { type: 'string' as const, enum: ['LINK_CLICKS', 'IMPRESSIONS', 'REACH', 'LANDING_PAGE_VIEWS', 'OFFSITE_CONVERSIONS', 'VALUE', 'THRUPLAY', 'APP_INSTALLS', 'LEAD_GENERATION', 'ENGAGED_USERS'], default: 'LINK_CLICKS' },
      savedAudienceId: { type: 'string' as const, description: 'Saved audience ID' },
      targeting: { type: 'object' as const, description: 'Custom targeting spec' },
      startTime: { type: 'string' as const, description: 'Start time (ISO 8601)' },
      endTime: { type: 'string' as const, description: 'End time (ISO 8601)' },
      promotedObject: { type: 'object' as const, description: 'Promoted object config' },
      accountId: { type: 'string' as const, description: 'Meta Ad Account ID' },
    },
    required: ['campaignId', 'name'],
  },
};
