import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AdCreatorService } from '../meta/ad-creator.js';
import { env } from '../config/env.js';

const CreateAdCreativeSchema = z.object({
  name: z.string().describe('Creative name'),
  videoId: z.string().describe('Meta Video ID (from upload-ad-video)'),
  pageId: z.string().describe('Facebook Page ID (from get-facebook-pages)'),
  instagramUserId: z.string().optional().describe('Instagram user ID for Instagram placements'),
  primaryText: z.string().describe('Primary text (body copy) shown above the video'),
  headline: z.string().describe('Headline shown below the video'),
  description: z.string().optional().describe('Link description text'),
  callToAction: z.enum([
    'LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'SUBSCRIBE', 'GET_OFFER',
    'BOOK_TRAVEL', 'CONTACT_US', 'DOWNLOAD', 'GET_QUOTE', 'APPLY_NOW',
  ]).default('LEARN_MORE').describe('Call to action button (default: LEARN_MORE)'),
  linkUrl: z.string().url().describe('Landing page URL'),
  thumbnailUrl: z.string().url().optional().describe('Custom thumbnail URL'),
  accountId: z.string().optional().describe('Meta Ad Account ID'),
});

export async function createAdCreative(input: unknown): Promise<string> {
  const args = CreateAdCreativeSchema.parse(input);

  const accountId = args.accountId
    ? (args.accountId.startsWith('act_') ? args.accountId : `act_${args.accountId}`)
    : env.META_AD_ACCOUNT_ID;

  try {
    const service = new AdCreatorService(accountId);
    const result = await service.createAdCreative({
      name: args.name,
      videoId: args.videoId,
      pageId: args.pageId,
      instagramUserId: args.instagramUserId,
      primaryText: args.primaryText,
      headline: args.headline,
      description: args.description,
      callToAction: args.callToAction,
      linkUrl: args.linkUrl,
      thumbnailUrl: args.thumbnailUrl,
    });

    return JSON.stringify(result, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Failed to create ad creative: ${errorMessage}` }, null, 2);
  }
}

export const createAdCreativeTool: Tool = {
  name: 'create-ad-creative',
  description: 'Create a Meta ad creative with video, copy text, headline, CTA, and landing page URL. Requires a video ID (from upload-ad-video) and a Facebook Page ID (from get-facebook-pages).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' as const, description: 'Creative name' },
      videoId: { type: 'string' as const, description: 'Meta Video ID from upload-ad-video' },
      pageId: { type: 'string' as const, description: 'Facebook Page ID from get-facebook-pages' },
      instagramUserId: { type: 'string' as const, description: 'Instagram user ID' },
      primaryText: { type: 'string' as const, description: 'Primary text (body copy)' },
      headline: { type: 'string' as const, description: 'Headline below video' },
      description: { type: 'string' as const, description: 'Link description' },
      callToAction: { type: 'string' as const, enum: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'SUBSCRIBE', 'GET_OFFER', 'BOOK_TRAVEL', 'CONTACT_US', 'DOWNLOAD', 'GET_QUOTE', 'APPLY_NOW'], default: 'LEARN_MORE' },
      linkUrl: { type: 'string' as const, description: 'Landing page URL' },
      thumbnailUrl: { type: 'string' as const, description: 'Custom thumbnail URL' },
      accountId: { type: 'string' as const, description: 'Meta Ad Account ID' },
    },
    required: ['name', 'videoId', 'pageId', 'primaryText', 'headline', 'linkUrl'],
  },
};
