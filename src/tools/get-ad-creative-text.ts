/**
 * Get Ad Creative Text Tool
 *
 * MCP tool for retrieving ad creative text content including primary text,
 * headline, and description. Used for content analysis and ad categorization.
 *
 * Retrieves text from ad creative fields through Meta Marketing API.
 * Handles both link_data and video_data creative structures.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { env } from '../config/env.js';
import bizSdk from 'facebook-nodejs-business-sdk';

const AdAccount = bizSdk.AdAccount;
const Ad = bizSdk.Ad;
const AdCreative = bizSdk.AdCreative;

/**
 * Input schema for get-ad-creative-text tool
 */
const GetAdCreativeTextSchema = z.object({
  adIds: z
    .array(z.string())
    .optional()
    .describe('Optional ad IDs to filter results (retrieves all active ads if omitted)'),
  includeInactive: z
    .boolean()
    .default(false)
    .describe('Include paused/archived ads in results'),
});

type GetAdCreativeTextInput = z.infer<typeof GetAdCreativeTextSchema>;

/**
 * Ad creative text response format
 */
interface AdCreativeText {
  ads: Array<{
    adId: string;
    adName: string;
    creativeId: string;
    text: {
      primaryText: string;
      headline: string;
      description: string;
      body: string;
    };
  }>;
}

/**
 * Extract text from creative object_story_spec
 *
 * Handles both link_data and video_data structures from Meta API.
 * Extracts primary text, headline, and description fields.
 */
function extractCreativeText(creative: any): {
  primaryText: string;
  headline: string;
  description: string;
  body: string;
} {
  const text = {
    primaryText: '',
    headline: '',
    description: '',
    body: creative.body || '',
  };

  // Extract from object_story_spec
  const objectStorySpec = creative.object_story_spec;
  if (!objectStorySpec) {
    return text;
  }

  // Try link_data structure (most common for link ads)
  if (objectStorySpec.link_data) {
    text.primaryText = objectStorySpec.link_data.message || '';
    text.headline = objectStorySpec.link_data.name || '';
    text.description = objectStorySpec.link_data.description || '';
  }

  // Try video_data structure (for video ads)
  if (objectStorySpec.video_data) {
    text.primaryText = objectStorySpec.video_data.message || text.primaryText;
    text.headline = objectStorySpec.video_data.title || text.headline;
    text.description = objectStorySpec.video_data.call_to_action?.value?.link_description || text.description;
  }

  // Fallback to title field if no headline found
  if (!text.headline && creative.title) {
    text.headline = creative.title;
  }

  return text;
}

/**
 * Query ad creative text from Meta Marketing API
 *
 * @param args - Tool arguments (adIds, includeInactive)
 * @returns Pretty-printed JSON with ad creative text
 */
export async function getAdCreativeText(args: unknown): Promise<string> {
  // Validate input
  const input = GetAdCreativeTextSchema.parse(args);

  try {
    const account = new AdAccount(env.META_AD_ACCOUNT_ID);
    let ads: any[] = [];

    // If specific ad IDs provided, fetch those ads
    if (input.adIds && input.adIds.length > 0) {
      // Fetch each ad individually
      const adPromises = input.adIds.map(async (adId) => {
        try {
          const ad = new Ad(adId);
          const adData = await ad.read([
            Ad.Fields.id,
            Ad.Fields.name,
            Ad.Fields.creative,
            Ad.Fields.status,
          ]);
          return adData;
        } catch (error) {
          console.error(`Failed to fetch ad ${adId}:`, error);
          return null;
        }
      });

      const adResults = await Promise.all(adPromises);
      ads = adResults.filter((ad) => ad !== null);
    } else {
      // Query all ads from account
      const params: any = {
        fields: [Ad.Fields.id, Ad.Fields.name, Ad.Fields.creative, Ad.Fields.status],
        limit: 500, // Fetch up to 500 ads
      };

      // Filter by status if not including inactive
      if (!input.includeInactive) {
        params.filtering = [
          {
            field: 'ad.effective_status',
            operator: 'IN',
            value: ['ACTIVE', 'PAUSED'], // Include active and paused, exclude archived/deleted
          },
        ];
      }

      ads = await account.getAds([], params);
    }

    // Return message if no ads found
    if (ads.length === 0) {
      return input.adIds && input.adIds.length > 0
        ? `No ads found for the specified IDs`
        : `No ads found in account`;
    }

    // Fetch creative details for each ad
    const adCreativePromises = ads.map(async (ad: any) => {
      try {
        // Get creative ID from ad
        const creativeId = ad.creative?.id;
        if (!creativeId) {
          return {
            adId: ad.id,
            adName: ad.name || `Ad ${ad.id}`,
            creativeId: '',
            text: {
              primaryText: '',
              headline: '',
              description: '',
              body: '',
            },
          };
        }

        // Fetch creative details
        const creative = new AdCreative(creativeId);
        const creativeData = await creative.read([
          AdCreative.Fields.id,
          AdCreative.Fields.name,
          AdCreative.Fields.body,
          AdCreative.Fields.title,
          AdCreative.Fields.object_story_spec,
        ]);

        // Extract text from creative
        const text = extractCreativeText(creativeData);

        return {
          adId: ad.id,
          adName: ad.name || `Ad ${ad.id}`,
          creativeId: creativeData.id,
          text,
        };
      } catch (error) {
        console.error(`Failed to fetch creative for ad ${ad.id}:`, error);
        return {
          adId: ad.id,
          adName: ad.name || `Ad ${ad.id}`,
          creativeId: '',
          text: {
            primaryText: '',
            headline: '',
            description: '',
            body: '',
          },
        };
      }
    });

    const adCreatives = await Promise.all(adCreativePromises);

    // Format response
    const response: AdCreativeText = {
      ads: adCreatives,
    };

    // Return pretty-printed JSON for Claude consumption
    return JSON.stringify(response, null, 2);
  } catch (error) {
    // Format error messages for user clarity
    if (error instanceof Error) {
      return `Error querying ad creative text: ${error.message}`;
    }
    return 'Unknown error occurred while querying ad creative text';
  }
}

/**
 * MCP Tool definition for get-ad-creative-text
 */
export const getAdCreativeTextTool: Tool = {
  name: 'get-ad-creative-text',
  description:
    'Retrieve ad creative text content including primary text, headline, and description for content analysis and ad categorization. Returns text from all active ads or specific ads by ID.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      adIds: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
        },
        description:
          'Optional ad IDs to filter results (retrieves all active ads if omitted)',
      },
      includeInactive: {
        type: 'boolean' as const,
        description: 'Include paused/archived ads in results',
        default: false,
      },
    },
  },
};
