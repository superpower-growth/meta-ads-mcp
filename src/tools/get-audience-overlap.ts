/**
 * Get Audience Overlap Tool
 *
 * Compares targeting specs across campaigns/ad sets to identify audience overlap.
 * Helps diagnose auction competition between your own campaigns and wasted spend.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AdAccount, Campaign, AdSet, FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { env } from '../config/env.js';

const GetAudienceOverlapSchema = z.object({
  campaign_ids: z
    .array(z.string())
    .optional()
    .describe('Campaign IDs to compare. Fetches all ad sets within each campaign for comparison.'),
  adset_ids: z
    .array(z.string())
    .optional()
    .describe('Ad set IDs to compare directly.'),
  accountId: z
    .string()
    .optional()
    .describe('Meta Ad Account ID (with or without act_ prefix). Defaults to configured account.'),
}).refine(
  (data) => (data.campaign_ids && data.campaign_ids.length > 0) || (data.adset_ids && data.adset_ids.length > 0),
  { message: 'At least one of campaign_ids or adset_ids must be provided' }
);

const TARGETING_FIELDS = [
  'id',
  'name',
  'campaign_id',
  'targeting',
  'status',
  'effective_status',
];

interface TargetingEntity {
  id: string;
  name: string;
  campaignId?: string;
  status: string;
  targeting: any;
}

/**
 * Extract comparable targeting elements from a targeting spec
 */
function extractTargetingElements(targeting: any): {
  countries: string[];
  regions: string[];
  cities: string[];
  ageMin: number;
  ageMax: number;
  genders: number[];
  interests: Array<{ id: string; name: string }>;
  behaviors: Array<{ id: string; name: string }>;
  customAudiences: Array<{ id: string; name: string }>;
  excludedCustomAudiences: Array<{ id: string; name: string }>;
  lookalikeSpecs: any[];
} {
  const geo = targeting.geo_locations || {};
  return {
    countries: (geo.countries || []).map((c: string) => c.toUpperCase()),
    regions: (geo.regions || []).map((r: any) => r.key || r.name || String(r)),
    cities: (geo.cities || []).map((c: any) => c.key || c.name || String(c)),
    ageMin: targeting.age_min || 18,
    ageMax: targeting.age_max || 65,
    genders: targeting.genders || [0], // 0 = all, 1 = male, 2 = female
    interests: (targeting.interests || []).map((i: any) => ({ id: String(i.id), name: i.name || String(i.id) })),
    behaviors: (targeting.behaviors || []).map((b: any) => ({ id: String(b.id), name: b.name || String(b.id) })),
    customAudiences: (targeting.custom_audiences || []).map((ca: any) => ({ id: String(ca.id), name: ca.name || String(ca.id) })),
    excludedCustomAudiences: (targeting.excluded_custom_audiences || []).map((ca: any) => ({ id: String(ca.id), name: ca.name || String(ca.id) })),
    lookalikeSpecs: targeting.lookalike_spec ? [targeting.lookalike_spec] : [],
  };
}

/**
 * Calculate set overlap between two arrays of objects with id fields
 */
function calculateSetOverlap(
  setA: Array<{ id: string; name: string }>,
  setB: Array<{ id: string; name: string }>
): { shared: Array<{ id: string; name: string }>; uniqueToA: Array<{ id: string; name: string }>; uniqueToB: Array<{ id: string; name: string }>; overlapPct: number } {
  const idsA = new Set(setA.map((x) => x.id));
  const idsB = new Set(setB.map((x) => x.id));

  const shared = setA.filter((x) => idsB.has(x.id));
  const uniqueToA = setA.filter((x) => !idsB.has(x.id));
  const uniqueToB = setB.filter((x) => !idsA.has(x.id));

  const totalUnique = new Set([...idsA, ...idsB]).size;
  const overlapPct = totalUnique > 0 ? Math.round((shared.length / totalUnique) * 100) : 0;

  return { shared, uniqueToA, uniqueToB, overlapPct };
}

/**
 * Calculate age range overlap percentage
 */
function calculateAgeOverlap(
  minA: number, maxA: number,
  minB: number, maxB: number
): number {
  const overlapMin = Math.max(minA, minB);
  const overlapMax = Math.min(maxA, maxB);
  if (overlapMin > overlapMax) return 0;

  const overlapRange = overlapMax - overlapMin;
  const unionRange = Math.max(maxA, maxB) - Math.min(minA, minB);
  return unionRange > 0 ? Math.round((overlapRange / unionRange) * 100) : 0;
}

/**
 * Compare two targeting entities and produce an overlap analysis
 */
function comparePair(entityA: TargetingEntity, entityB: TargetingEntity): any {
  const tA = extractTargetingElements(entityA.targeting || {});
  const tB = extractTargetingElements(entityB.targeting || {});

  const warnings: string[] = [];

  // Geo overlap
  const sharedCountries = tA.countries.filter((c) => tB.countries.includes(c));
  const allCountries = [...new Set([...tA.countries, ...tB.countries])];
  const geoOverlapPct = allCountries.length > 0
    ? Math.round((sharedCountries.length / allCountries.length) * 100)
    : 0;

  // Age overlap
  const ageOverlapPct = calculateAgeOverlap(tA.ageMin, tA.ageMax, tB.ageMin, tB.ageMax);

  // Gender overlap
  const gendersA = new Set(tA.genders);
  const gendersB = new Set(tB.genders);
  const allGender = gendersA.has(0) || gendersB.has(0);
  let genderOverlap = false;
  if (allGender) {
    genderOverlap = true;
  } else {
    genderOverlap = [...gendersA].some((g) => gendersB.has(g));
  }

  // Interest overlap
  const interestOverlap = calculateSetOverlap(tA.interests, tB.interests);

  // Behavior overlap
  const behaviorOverlap = calculateSetOverlap(tA.behaviors, tB.behaviors);

  // Custom audience overlap
  const customAudienceOverlap = calculateSetOverlap(tA.customAudiences, tB.customAudiences);

  // Exclusion gap analysis
  const exclusionGaps: string[] = [];
  // Check if A's custom audiences are excluded in B
  for (const ca of tA.customAudiences) {
    const isExcludedInB = tB.excludedCustomAudiences.some((ex) => ex.id === ca.id);
    if (!isExcludedInB && tB.customAudiences.length > 0) {
      // Only flag if both are using custom audiences
    }
  }

  // Calculate composite overlap estimate
  const overlapFactors: number[] = [];
  if (allCountries.length > 0) overlapFactors.push(geoOverlapPct);
  overlapFactors.push(ageOverlapPct);
  overlapFactors.push(genderOverlap ? 100 : 0);
  if (tA.interests.length > 0 || tB.interests.length > 0) {
    overlapFactors.push(interestOverlap.overlapPct);
  }
  if (tA.behaviors.length > 0 || tB.behaviors.length > 0) {
    overlapFactors.push(behaviorOverlap.overlapPct);
  }
  if (tA.customAudiences.length > 0 || tB.customAudiences.length > 0) {
    overlapFactors.push(customAudienceOverlap.overlapPct);
  }

  const compositeOverlap = overlapFactors.length > 0
    ? Math.round(overlapFactors.reduce((a, b) => a + b, 0) / overlapFactors.length)
    : 0;

  // Generate warnings
  if (compositeOverlap >= 50) {
    const sharedInterestNames = interestOverlap.shared.map((i) => i.name).join(', ');
    const interestDetail = interestOverlap.shared.length > 0
      ? ` share ${interestOverlap.shared.length}/${Math.max(tA.interests.length, tB.interests.length)} interests (${sharedInterestNames})`
      : '';
    const ageDetail = ageOverlapPct >= 80 ? ' and target the same age range' : '';
    warnings.push(
      `⚠️ ${entityA.name} and ${entityB.name}${interestDetail}${ageDetail} — estimated ~${compositeOverlap}% audience overlap`
    );
  }

  if (geoOverlapPct === 100 && ageOverlapPct >= 80 && genderOverlap) {
    if (tA.customAudiences.length > 0 && tB.customAudiences.length > 0) {
      const aExcludesB = tB.customAudiences.every((ca) =>
        tA.excludedCustomAudiences.some((ex) => ex.id === ca.id)
      );
      const bExcludesA = tA.customAudiences.every((ca) =>
        tB.excludedCustomAudiences.some((ex) => ex.id === ca.id)
      );
      if (!aExcludesB || !bExcludesA) {
        warnings.push(
          `⚠️ Custom audiences are not mutually excluded — consider adding exclusions to prevent overlap`
        );
      }
    }
  }

  return {
    entityA: { id: entityA.id, name: entityA.name },
    entityB: { id: entityB.id, name: entityB.name },
    compositeOverlapEstimate: `${compositeOverlap}%`,
    geo: {
      overlapPct: `${geoOverlapPct}%`,
      sharedCountries,
      allCountries,
    },
    age: {
      overlapPct: `${ageOverlapPct}%`,
      entityA: { min: tA.ageMin, max: tA.ageMax },
      entityB: { min: tB.ageMin, max: tB.ageMax },
    },
    gender: {
      overlap: genderOverlap,
      entityA: tA.genders,
      entityB: tB.genders,
    },
    interests: {
      overlapPct: `${interestOverlap.overlapPct}%`,
      shared: interestOverlap.shared,
      uniqueToA: interestOverlap.uniqueToA,
      uniqueToB: interestOverlap.uniqueToB,
    },
    behaviors: {
      overlapPct: `${behaviorOverlap.overlapPct}%`,
      shared: behaviorOverlap.shared,
      uniqueToA: behaviorOverlap.uniqueToA,
      uniqueToB: behaviorOverlap.uniqueToB,
    },
    customAudiences: {
      overlapPct: `${customAudienceOverlap.overlapPct}%`,
      shared: customAudienceOverlap.shared,
      uniqueToA: customAudienceOverlap.uniqueToA,
      uniqueToB: customAudienceOverlap.uniqueToB,
    },
    exclusions: {
      entityAExcludes: tA.excludedCustomAudiences,
      entityBExcludes: tB.excludedCustomAudiences,
    },
    warnings,
  };
}

/**
 * Compare targeting specs across campaigns/ad sets to identify audience overlap
 */
export async function getAudienceOverlap(input: unknown): Promise<string> {
  const args = GetAudienceOverlapSchema.parse(input);

  const accountId = args.accountId
    ? (args.accountId.startsWith('act_') ? args.accountId : `act_${args.accountId}`)
    : env.META_AD_ACCOUNT_ID;

  try {
    FacebookAdsApi.init(env.META_ACCESS_TOKEN);

    const entities: TargetingEntity[] = [];

    // Fetch ad sets from campaigns
    if (args.campaign_ids && args.campaign_ids.length > 0) {
      for (const campaignId of args.campaign_ids) {
        try {
          const campaign = new Campaign(campaignId);
          const adSetsResponse = await campaign.getAdSets(TARGETING_FIELDS, { limit: 500 });
          for (const adSet of adSetsResponse) {
            entities.push({
              id: adSet.id,
              name: adSet.name || `Ad Set ${adSet.id}`,
              campaignId,
              status: adSet.effective_status || adSet.status || 'UNKNOWN',
              targeting: adSet.targeting || {},
            });
          }
        } catch (error: any) {
          console.warn(`[getAudienceOverlap] Failed to fetch ad sets for campaign ${campaignId}: ${error.message}`);
        }
      }
    }

    // Fetch specific ad sets
    if (args.adset_ids && args.adset_ids.length > 0) {
      for (const adSetId of args.adset_ids) {
        try {
          const adSet = new AdSet(adSetId);
          await adSet.get(TARGETING_FIELDS);
          const data = adSet._data as any;
          entities.push({
            id: data.id || adSetId,
            name: data.name || `Ad Set ${adSetId}`,
            campaignId: data.campaign_id,
            status: data.effective_status || data.status || 'UNKNOWN',
            targeting: data.targeting || {},
          });
        } catch (error: any) {
          console.warn(`[getAudienceOverlap] Failed to fetch ad set ${adSetId}: ${error.message}`);
        }
      }
    }

    if (entities.length < 2) {
      return JSON.stringify({
        accountId,
        message: `Found ${entities.length} ad set(s) — need at least 2 to compare overlap.`,
        entities: entities.map((e) => ({ id: e.id, name: e.name, status: e.status })),
      }, null, 2);
    }

    // Pairwise comparison
    const comparisons: any[] = [];
    const allWarnings: string[] = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const comparison = comparePair(entities[i], entities[j]);
        comparisons.push(comparison);
        allWarnings.push(...comparison.warnings);
      }
    }

    // Sort comparisons by overlap estimate (descending)
    comparisons.sort((a, b) => {
      const pctA = parseInt(a.compositeOverlapEstimate, 10);
      const pctB = parseInt(b.compositeOverlapEstimate, 10);
      return pctB - pctA;
    });

    return JSON.stringify({
      accountId,
      totalEntities: entities.length,
      totalComparisons: comparisons.length,
      entities: entities.map((e) => ({
        id: e.id,
        name: e.name,
        campaignId: e.campaignId,
        status: e.status,
      })),
      summaryWarnings: allWarnings,
      comparisons,
    }, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      return `Error analyzing audience overlap: ${error.message}`;
    }
    return 'Unknown error occurred while analyzing audience overlap';
  }
}

/**
 * MCP Tool definition for get-audience-overlap
 */
export const getAudienceOverlapTool: Tool = {
  name: 'get-audience-overlap',
  description:
    'Compare targeting specs across campaigns/ad sets to identify audience overlap. Analyzes geo, age, gender, interests, behaviors, and custom audience overlap pairwise. Flags high-overlap pairs that may compete in the same auction and waste budget.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      campaign_ids: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Campaign IDs to compare. Fetches all ad sets within each campaign for comparison.',
      },
      adset_ids: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Ad set IDs to compare directly.',
      },
      accountId: {
        type: 'string' as const,
        description: 'Meta Ad Account ID (with or without act_ prefix). Defaults to configured account.',
      },
    },
    required: [],
  },
};
