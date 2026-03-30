/**
 * Get Campaign Config Tool
 *
 * Fetches campaign-level configuration settings from Meta Marketing API.
 * Useful for diagnosing ASC (Advantage+ Shopping Campaign) issues like
 * existing_customer_budget_percentage, bid strategies, and budget allocation.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AdAccount, Campaign, FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { env } from '../config/env.js';

const GetCampaignConfigSchema = z.object({
  campaign_ids: z
    .array(z.string())
    .optional()
    .describe('Optional list of campaign IDs to fetch. If omitted, fetches all campaigns.'),
  status: z
    .enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'])
    .optional()
    .describe('Filter campaigns by effective status'),
  accountId: z
    .string()
    .optional()
    .describe('Meta Ad Account ID (with or without act_ prefix). Defaults to configured account.'),
});

type GetCampaignConfigInput = z.infer<typeof GetCampaignConfigSchema>;

const CAMPAIGN_FIELDS = [
  'id',
  'name',
  'objective',
  'status',
  'configured_status',
  'effective_status',
  'smart_promotion_type',
  'existing_customer_budget_percentage',
  'daily_budget',
  'lifetime_budget',
  'budget_remaining',
  'bid_strategy',
  'buying_type',
  'special_ad_categories',
];

const ADSET_FIELDS = [
  'id',
  'name',
  'targeting',
  'promoted_object',
  'optimization_goal',
  'billing_event',
  'bid_amount',
  'daily_budget',
  'lifetime_budget',
  'status',
  'effective_status',
];

/**
 * Format a single campaign config with diagnostic flags
 */
function formatCampaignConfig(campaign: any, adSets: any[]): any {
  const warnings: string[] = [];

  // Check ASC-related issues
  const isASC = campaign.smart_promotion_type === 'SMART_SHOPPING' ||
    campaign.objective === 'OUTCOME_SALES';

  if (isASC) {
    const existingCustomerPct = campaign.existing_customer_budget_percentage;
    if (existingCustomerPct === undefined || existingCustomerPct === null) {
      warnings.push(
        '⚠️ existing_customer_budget_percentage not set — Meta may spend prospecting budget on existing customers'
      );
    } else if (parseFloat(existingCustomerPct) > 0) {
      warnings.push(
        `⚠️ existing_customer_budget_percentage is ${existingCustomerPct}% — Meta may allocate up to ${existingCustomerPct}% of budget to existing customers`
      );
    }
  }

  // Check budget configuration
  if (!campaign.daily_budget && !campaign.lifetime_budget) {
    warnings.push('⚠️ No campaign-level budget set — budget may be controlled at ad set level');
  }

  // Check bid strategy
  if (!campaign.bid_strategy) {
    warnings.push('⚠️ No bid strategy set — defaulting to LOWEST_COST_WITHOUT_CAP');
  }

  // Check special ad categories
  if (campaign.special_ad_categories && campaign.special_ad_categories.length > 0) {
    warnings.push(
      `ℹ️ Special ad categories active: ${campaign.special_ad_categories.join(', ')} — targeting restrictions apply`
    );
  }

  const config: any = {
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective || 'N/A',
    status: campaign.effective_status || campaign.status || 'N/A',
    configuredStatus: campaign.configured_status || 'N/A',
    smartPromotionType: campaign.smart_promotion_type || null,
    existingCustomerBudgetPercentage: campaign.existing_customer_budget_percentage ?? null,
    dailyBudget: campaign.daily_budget ? `${(parseInt(campaign.daily_budget, 10) / 100).toFixed(2)}` : null,
    lifetimeBudget: campaign.lifetime_budget ? `${(parseInt(campaign.lifetime_budget, 10) / 100).toFixed(2)}` : null,
    budgetRemaining: campaign.budget_remaining ? `${(parseInt(campaign.budget_remaining, 10) / 100).toFixed(2)}` : null,
    bidStrategy: campaign.bid_strategy || null,
    buyingType: campaign.buying_type || 'AUCTION',
    specialAdCategories: campaign.special_ad_categories || [],
  };

  if (warnings.length > 0) {
    config.warnings = warnings;
  }

  if (adSets.length > 0) {
    config.adSets = adSets.map((adSet: any) => {
      const adSetWarnings: string[] = [];

      // Check for broad targeting
      const targeting = adSet.targeting || {};
      if (!targeting.custom_audiences && !targeting.interests && !targeting.behaviors) {
        adSetWarnings.push('⚠️ No custom audiences, interests, or behaviors set — using broad targeting');
      }

      const formattedAdSet: any = {
        id: adSet.id,
        name: adSet.name,
        status: adSet.effective_status || adSet.status || 'N/A',
        optimizationGoal: adSet.optimization_goal || 'N/A',
        billingEvent: adSet.billing_event || 'N/A',
        bidAmount: adSet.bid_amount ? `${(parseInt(adSet.bid_amount, 10) / 100).toFixed(2)}` : null,
        dailyBudget: adSet.daily_budget ? `${(parseInt(adSet.daily_budget, 10) / 100).toFixed(2)}` : null,
        lifetimeBudget: adSet.lifetime_budget ? `${(parseInt(adSet.lifetime_budget, 10) / 100).toFixed(2)}` : null,
        promotedObject: adSet.promoted_object || null,
        targeting: {
          geoLocations: targeting.geo_locations || null,
          ageMin: targeting.age_min || null,
          ageMax: targeting.age_max || null,
          genders: targeting.genders || null,
          interests: targeting.interests?.map((i: any) => ({ id: i.id, name: i.name })) || [],
          behaviors: targeting.behaviors?.map((b: any) => ({ id: b.id, name: b.name })) || [],
          customAudiences: targeting.custom_audiences?.map((ca: any) => ({ id: ca.id, name: ca.name })) || [],
          excludedCustomAudiences: targeting.excluded_custom_audiences?.map((ca: any) => ({ id: ca.id, name: ca.name })) || [],
          lookalikeSpec: targeting.lookalike_spec || null,
        },
      };

      if (adSetWarnings.length > 0) {
        formattedAdSet.warnings = adSetWarnings;
      }

      return formattedAdSet;
    });
  }

  return config;
}

/**
 * Fetch campaign configuration settings from Meta Marketing API
 */
export async function getCampaignConfig(input: unknown): Promise<string> {
  const args = GetCampaignConfigSchema.parse(input);

  const accountId = args.accountId
    ? (args.accountId.startsWith('act_') ? args.accountId : `act_${args.accountId}`)
    : env.META_AD_ACCOUNT_ID;

  try {
    FacebookAdsApi.init(env.META_ACCESS_TOKEN);
    const account = new AdAccount(accountId);

    // Build filtering params
    const params: any = { limit: 500 };
    const filtering: any[] = [];

    if (args.campaign_ids && args.campaign_ids.length > 0) {
      filtering.push({
        field: 'id',
        operator: 'IN',
        value: args.campaign_ids,
      });
    }

    if (args.status) {
      filtering.push({
        field: 'effective_status',
        operator: 'IN',
        value: [args.status],
      });
    }

    if (filtering.length > 0) {
      params.filtering = filtering;
    }

    // Fetch campaigns
    const campaignsResponse = await account.getCampaigns(CAMPAIGN_FIELDS, params);
    const campaigns: any[] = [];
    for (const c of campaignsResponse) {
      campaigns.push(c);
    }

    if (campaigns.length === 0) {
      return JSON.stringify({
        accountId,
        message: 'No campaigns found matching the specified criteria',
        campaigns: [],
      }, null, 2);
    }

    // Fetch ad sets for each campaign
    const campaignConfigs: any[] = [];
    for (const campaign of campaigns) {
      let adSets: any[] = [];
      try {
        const campaignObj = new Campaign(campaign.id);
        const adSetsResponse = await campaignObj.getAdSets(ADSET_FIELDS, { limit: 500 });
        for (const adSet of adSetsResponse) {
          adSets.push(adSet);
        }
      } catch (error: any) {
        console.warn(`[getCampaignConfig] Failed to fetch ad sets for campaign ${campaign.id}: ${error.message}`);
      }

      campaignConfigs.push(formatCampaignConfig(campaign, adSets));
    }

    return JSON.stringify({
      accountId,
      totalCampaigns: campaignConfigs.length,
      campaigns: campaignConfigs,
    }, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      return `Error fetching campaign config: ${error.message}`;
    }
    return 'Unknown error occurred while fetching campaign configuration';
  }
}

/**
 * MCP Tool definition for get-campaign-config
 */
export const getCampaignConfigTool: Tool = {
  name: 'get-campaign-config',
  description:
    'Fetch campaign-level configuration settings including ASC (Advantage+ Shopping) settings, existing_customer_budget_percentage, bid strategies, budgets, and ad set targeting. Diagnoses common issues like missing customer budget caps and broad targeting.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      campaign_ids: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Optional list of campaign IDs to fetch. If omitted, fetches all campaigns.',
      },
      status: {
        type: 'string' as const,
        enum: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'],
        description: 'Filter campaigns by effective status',
      },
      accountId: {
        type: 'string' as const,
        description: 'Meta Ad Account ID (with or without act_ prefix). Defaults to configured account.',
      },
    },
    required: [],
  },
};
