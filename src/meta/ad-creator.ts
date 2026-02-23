import { AdAccount, Campaign, AdSet, Ad, AdCreative, AdVideo, FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { env } from '../config/env.js';

export interface SavedAudience {
  id: string;
  name: string;
  approximateSize: number;
}

export interface FacebookPage {
  pageId: string;
  name: string;
  category: string;
  instagramActorId?: string;
}

export interface AdSetSummary {
  adSetId: string;
  name: string;
  status: string;
  dailyBudget?: string;
  lifetimeBudget?: string;
}

export interface CampaignResult {
  campaignId: string;
  name: string;
  status: string;
  objective: string;
}

export interface AdSetResult {
  adSetId: string;
  name: string;
  campaignId: string;
  status: string;
}

export interface VideoUploadResult {
  videoId: string;
  title: string;
  status: string;
  thumbnailUrl?: string;
}

export interface AdCreativeResult {
  creativeId: string;
  name: string;
  videoId: string;
  pageId: string;
}

export interface AdResult {
  adId: string;
  name: string;
  adSetId: string;
  creativeId: string;
  status: string;
}

export interface CreateCampaignParams {
  name: string;
  objective: string;
  status?: string;
  special_ad_categories?: string[];
  buying_type?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
}

export interface CreateAdSetParams {
  campaign_id: string;
  name: string;
  status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_amount?: string;
  billing_event: string;
  optimization_goal: string;
  targeting?: Record<string, any>;
  saved_audience_id?: string;
  start_time?: string;
  end_time?: string;
  promoted_object?: Record<string, any>;
  attribution_spec?: Array<{ event_type: string; window_days: number }>;
}

export interface CreateAdCreativeParams {
  name: string;
  pageId: string;
  instagramUserId?: string;
  videoId: string;
  primaryText: string;
  headline?: string;
  description?: string;
  callToAction?: string;
  linkUrl: string;
  thumbnailUrl?: string;
}

export interface CreatePlacementMappedCreativeParams {
  name: string;
  pageId: string;
  instagramUserId?: string;
  videos: Array<{ videoId: string; thumbnailUrl?: string; ratio: string }>;
  primaryText: string;
  headline: string;
  description: string;
  callToAction?: string;
  linkUrl: string;
}

export interface FlexibleAdGroup {
  videos: Array<{ video_id: string }>;
  texts: Array<{ text: string }>;
  titles: Array<{ text: string }>;
  descriptions: Array<{ text: string }>;
  call_to_action_types: string[];
  link_urls: Array<{ website_url: string }>;
  ad_formats: string[];
}

export interface CreateAdParams {
  adset_id: string;
  creative_id: string;
  name: string;
  status?: string;
  tracking_specs?: Record<string, any>[];
  creative_asset_groups_spec?: {
    groups: FlexibleAdGroup[];
  };
}

export class AdCreatorService {
  private accountId: string;

  constructor(accountId?: string) {
    this.accountId = accountId || env.META_AD_ACCOUNT_ID;
  }

  private initApi() {
    FacebookAdsApi.init(env.META_ACCESS_TOKEN);
  }

  private formatMetaError(error: any): string {
    // Log all enumerable properties of the error
    const allProps: Record<string, any> = {};
    for (const key of Object.getOwnPropertyNames(error)) {
      try { allProps[key] = error[key]; } catch { allProps[key] = '[unreadable]'; }
    }
    console.error('[AdCreatorService] Raw Meta API error (all props):', JSON.stringify(allProps, null, 2));
    // Prefer the user-facing message from Meta (most descriptive)
    const userMsg = error.response?.error_user_msg || error.error_user_msg;
    if (userMsg) return `${error.message}: ${userMsg}`;
    if (error.message) return error.message;
    if (error.error?.message) return error.error.message;
    return 'Unknown Meta API error occurred';
  }

  async getActiveCampaigns(): Promise<Array<{ id: string; name: string }>> {
    try {
      this.initApi();
      const account = new AdAccount(this.accountId);
      const response = await account.getCampaigns(
        ['id', 'name'],
        { filtering: [{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }], limit: 500 }
      );

      const campaigns = response.map((c: any) => ({ id: c.id, name: c.name }));
      console.log(`[AdCreatorService] Fetched ${campaigns.length} active campaigns`);
      return campaigns;
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to get active campaigns: ${errorMessage}`);
    }
  }

  async findCampaignByName(name: string): Promise<{ id: string; name: string } | null> {
    try {
      this.initApi();
      const account = new AdAccount(this.accountId);
      const response = await account.getCampaigns(
        ['id', 'name'],
        { filtering: [{ field: 'name', operator: 'CONTAIN', value: name }], limit: 100 }
      );

      // Exact match first, then substring match
      for (const campaign of response) {
        if (campaign.name === name) {
          console.log(`[AdCreatorService] Found campaign by exact name: ${campaign.id} "${campaign.name}"`);
          return { id: campaign.id, name: campaign.name };
        }
      }

      // No exact match found
      if (response.length > 0) {
        console.log(`[AdCreatorService] No exact match for campaign "${name}", found ${response.length} partial matches`);
      }
      return null;
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to find campaign by name: ${errorMessage}`);
    }
  }

  async findAdSetByName(campaignId: string, name: string): Promise<{ id: string; name: string } | null> {
    try {
      this.initApi();
      const account = new AdAccount(this.accountId);
      const response = await account.getAdSets(
        ['id', 'name', 'status'],
        {
          filtering: [
            { field: 'campaign_id', operator: 'EQUAL', value: campaignId },
            { field: 'name', operator: 'CONTAIN', value: name },
          ],
          limit: 100,
        }
      );

      for (const adSet of response) {
        if (adSet.name === name) {
          console.log(`[AdCreatorService] Found ad set by exact name: ${adSet.id} "${adSet.name}"`);
          return { id: adSet.id, name: adSet.name };
        }
      }

      return null;
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to find ad set by name: ${errorMessage}`);
    }
  }

  async isCampaignBudgetOptimization(campaignId: string): Promise<boolean> {
    try {
      this.initApi();
      const campaign = new Campaign(campaignId);
      const response: any = await campaign.get(['id', 'daily_budget', 'lifetime_budget']);
      const hasCBO = !!(response.daily_budget || response.lifetime_budget);
      console.log(`[AdCreatorService] Campaign ${campaignId} CBO: ${hasCBO} (daily_budget=${response.daily_budget}, lifetime_budget=${response.lifetime_budget})`);
      return hasCBO;
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to check campaign budget: ${errorMessage}`);
    }
  }

  async cloneAdSetSettings(campaignId: string): Promise<Record<string, any> | null> {
    try {
      this.initApi();
      const campaign = new Campaign(campaignId);
      const response = await campaign.getAdSets(
        ['id', 'name', 'billing_event', 'optimization_goal', 'targeting', 'daily_budget', 'lifetime_budget', 'promoted_object', 'bid_strategy', 'created_time'],
        { limit: 10 }
      );

      // Sort by created_time descending to get the most recent adset
      response.sort((a: any, b: any) => {
        const timeA = new Date(a.created_time || 0).getTime();
        const timeB = new Date(b.created_time || 0).getTime();
        return timeB - timeA;
      });

      if (response.length === 0) return null;

      const source = response[0];
      console.log(`[AdCreatorService] Cloning settings from ad set: ${source.id} "${source.name}"`);
      return {
        billing_event: source.billing_event || 'IMPRESSIONS',
        optimization_goal: source.optimization_goal || 'REACH',
        targeting: source.targeting,
        daily_budget: source.daily_budget,
        lifetime_budget: source.lifetime_budget,
        promoted_object: source.promoted_object,
        bid_strategy: source.bid_strategy,
      };
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to clone ad set settings: ${errorMessage}`);
    }
  }

  async getSavedAudiences(): Promise<SavedAudience[]> {
    try {
      this.initApi();
      const account = new AdAccount(this.accountId);
      const response = await account.getSavedAudiences(
        ['id', 'name', 'approximate_count_upper_bound']
      );

      const audiences: SavedAudience[] = [];
      for (const audience of response) {
        audiences.push({
          id: audience.id,
          name: audience.name,
          approximateSize: audience.approximate_count_upper_bound || 0,
        });
      }

      console.log(`[AdCreatorService] Fetched ${audiences.length} saved audiences`);
      return audiences;
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to get saved audiences: ${errorMessage}`);
    }
  }

  async getFacebookPages(): Promise<FacebookPage[]> {
    try {
      const api = FacebookAdsApi.init(env.META_ACCESS_TOKEN);
      const response: any = await api.call('GET', '/me/accounts', {
        fields: 'id,name,category,instagram_business_account',
      });

      const pages: FacebookPage[] = [];
      const data = response?.data?.data || response?.data || [];
      for (const page of data) {
        pages.push({
          pageId: page.id,
          name: page.name,
          category: page.category || '',
          instagramActorId: page.instagram_business_account?.id,
        });
      }

      console.log(`[AdCreatorService] Fetched ${pages.length} Facebook pages`);
      return pages;
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to get Facebook pages: ${errorMessage}`);
    }
  }

  async listAdSets(campaignId: string): Promise<AdSetSummary[]> {
    try {
      this.initApi();
      const account = new AdAccount(this.accountId);
      const response = await account.getAdSets(
        ['id', 'name', 'status', 'daily_budget', 'lifetime_budget', 'targeting'],
        { campaign_id: campaignId }
      );

      const adSets: AdSetSummary[] = [];
      for (const adSet of response) {
        adSets.push({
          adSetId: adSet.id,
          name: adSet.name,
          status: adSet.status,
          dailyBudget: adSet.daily_budget,
          lifetimeBudget: adSet.lifetime_budget,
        });
      }

      console.log(`[AdCreatorService] Fetched ${adSets.length} ad sets for campaign ${campaignId}`);
      return adSets;
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to list ad sets: ${errorMessage}`);
    }
  }

  async createCampaign(params: CreateCampaignParams): Promise<CampaignResult> {
    try {
      this.initApi();
      const account = new AdAccount(this.accountId);

      const campaignParams: Record<string, any> = {
        name: params.name,
        objective: params.objective,
        status: params.status || 'PAUSED',
        special_ad_categories: params.special_ad_categories || [],
      };

      if (params.buying_type) campaignParams.buying_type = params.buying_type;
      if (params.daily_budget) campaignParams.daily_budget = params.daily_budget;
      if (params.lifetime_budget) campaignParams.lifetime_budget = params.lifetime_budget;
      if (params.bid_strategy) campaignParams.bid_strategy = params.bid_strategy;

      const result = await account.createCampaign([], campaignParams);

      console.log(`[AdCreatorService] Created campaign: ${result.id}`);
      return {
        campaignId: result.id,
        name: params.name,
        status: campaignParams.status,
        objective: params.objective,
      };
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to create campaign: ${errorMessage}`);
    }
  }

  async createAdSet(params: CreateAdSetParams): Promise<AdSetResult> {
    try {
      this.initApi();

      // Validate budget constraints
      if (params.daily_budget && params.lifetime_budget) {
        throw new Error('Cannot set both daily_budget and lifetime_budget. Choose one.');
      }

      if (params.lifetime_budget && (!params.start_time || !params.end_time)) {
        throw new Error('lifetime_budget requires both start_time and end_time.');
      }

      const account = new AdAccount(this.accountId);

      const adSetParams: Record<string, any> = {
        campaign_id: params.campaign_id,
        name: params.name,
        status: params.status || 'PAUSED',
        billing_event: params.billing_event,
        optimization_goal: params.optimization_goal,
      };

      if (params.daily_budget) adSetParams.daily_budget = params.daily_budget;
      if (params.lifetime_budget) adSetParams.lifetime_budget = params.lifetime_budget;
      if (params.bid_amount) adSetParams.bid_amount = params.bid_amount;
      if (params.start_time) adSetParams.start_time = params.start_time;
      if (params.end_time) adSetParams.end_time = params.end_time;
      if (params.promoted_object) adSetParams.promoted_object = params.promoted_object;

      if (params.saved_audience_id) {
        adSetParams.targeting = { saved_audience_id: params.saved_audience_id };
      } else if (params.targeting) {
        adSetParams.targeting = params.targeting;
      }

      if (params.attribution_spec) {
        adSetParams.attribution_spec = params.attribution_spec;
      }

      const result = await account.createAdSet([], adSetParams);

      console.log(`[AdCreatorService] Created ad set: ${result.id}`);
      return {
        adSetId: result.id,
        name: params.name,
        campaignId: params.campaign_id,
        status: adSetParams.status,
      };
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to create ad set: ${errorMessage}`);
    }
  }

  async uploadVideo(videoUrl: string, title: string): Promise<VideoUploadResult> {
    try {
      this.initApi();
      const account = new AdAccount(this.accountId);

      const result = await account.createAdVideo([], {
        file_url: videoUrl,
        title: title,
      });

      console.log(`[AdCreatorService] Uploaded video: ${result.id}`);

      // Wait for video to finish processing and get thumbnail
      const thumbnailUrl = await this.waitForVideoReady(result.id);

      return {
        videoId: result.id,
        title: title,
        status: 'ready',
        thumbnailUrl,
      };
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to upload video: ${errorMessage}`);
    }
  }

  private async waitForVideoReady(videoId: string): Promise<string | undefined> {
    try {
      console.log(`[AdCreatorService] Waiting for video ${videoId} to finish encoding...`);

      // Poll video status via Graph API
      const maxAttempts = 30; // 5 minutes max (10s intervals)
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const statusUrl = `https://graph.facebook.com/v22.0/${videoId}?fields=status&access_token=${env.META_ACCESS_TOKEN}`;
          const res = await fetch(statusUrl);
          const data = await res.json() as any;
          const status = data?.status?.video_status;
          console.log(`[AdCreatorService] Video ${videoId} status: ${status} (attempt ${attempt}/${maxAttempts})`);
          if (status === 'ready') break;
          if (status === 'error') throw new Error(`Video ${videoId} encoding failed`);
        } catch (pollError: any) {
          console.warn(`[AdCreatorService] Status poll error: ${pollError.message}`);
        }
        await new Promise((r) => setTimeout(r, 10000));
      }
      // Extra 5s buffer after "ready" — Meta sometimes needs a moment
      await new Promise((r) => setTimeout(r, 5000));
      console.log(`[AdCreatorService] Video ${videoId} encoding complete`);

      // Fetch thumbnail via Graph API
      try {
        const api = FacebookAdsApi.init(env.META_ACCESS_TOKEN);
        const thumbResponse: any = await api.call('GET', `/${videoId}/thumbnails`, { fields: 'uri' });
        const thumbData = thumbResponse?.data?.data || thumbResponse?.data || [];
        if (thumbData.length > 0 && thumbData[0].uri) {
          console.log(`[AdCreatorService] Got thumbnail for video ${videoId}`);
          return thumbData[0].uri;
        }
        console.warn(`[AdCreatorService] No thumbnails returned for video ${videoId}`);
      } catch (thumbError: any) {
        console.warn(`[AdCreatorService] Thumbnail fetch failed: ${thumbError.message}`);
      }

      // Fallback: use Facebook's video picture URL with access token
      return `https://graph.facebook.com/${videoId}/picture?access_token=${env.META_ACCESS_TOKEN}`;
    } catch (error: any) {
      console.warn(`[AdCreatorService] waitForVideoReady error: ${error.message}`);
    }
    return undefined;
  }

  async createAdCreative(params: CreateAdCreativeParams): Promise<AdCreativeResult> {
    try {
      this.initApi();
      const account = new AdAccount(this.accountId);

      const videoData: Record<string, any> = {
        video_id: params.videoId,
        message: params.primaryText,
        call_to_action: {
          type: params.callToAction || 'LEARN_MORE',
          value: { link: params.linkUrl },
        },
      };

      if (params.headline) videoData.title = params.headline;
      if (params.description) videoData.link_description = params.description;
      if (params.thumbnailUrl) videoData.image_url = params.thumbnailUrl;

      const objectStorySpec: Record<string, any> = {
        page_id: params.pageId,
        video_data: videoData,
      };

      const creativeParams: Record<string, any> = {
        name: params.name,
        object_story_spec: objectStorySpec,
      };

      if (params.instagramUserId) {
        creativeParams.instagram_user_id = params.instagramUserId;
      }

      console.log(`[AdCreatorService] Creating ad creative with params:`, JSON.stringify(creativeParams, null, 2));
      const result = await account.createAdCreative([], creativeParams);

      console.log(`[AdCreatorService] Created ad creative: ${result.id}`);
      return {
        creativeId: result.id,
        name: params.name,
        videoId: params.videoId,
        pageId: params.pageId,
      };
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to create ad creative: ${errorMessage}`);
    }
  }

  async createPlacementMappedCreative(params: CreatePlacementMappedCreativeParams): Promise<AdCreativeResult> {
    try {
      this.initApi();
      const account = new AdAccount(this.accountId);

      const feedVideo = params.videos.find((v) => v.ratio === '4:5');
      const reelsVideo = params.videos.find((v) => v.ratio === '9:16');

      // If we have both formats, use asset_feed_spec with asset_customization_rules
      // to serve native 4:5 on Feed and native 9:16 on Stories/Reels.
      // If only one format, fall back to single-video creative with auto_crop.
      if (feedVideo && reelsVideo) {
        return this.createAssetFeedCreative(params, feedVideo, reelsVideo);
      }

      // Fallback: single video with auto_crop
      const primaryVideo = reelsVideo || feedVideo!;
      return this.createSingleVideoCreative(params, primaryVideo);
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to create placement-mapped creative: ${errorMessage}`);
    }
  }

  /**
   * Create a creative using asset_feed_spec with asset_customization_rules
   * for true per-placement video (4:5 Feed, 9:16 Reels/Stories).
   */
  private async createAssetFeedCreative(
    params: CreatePlacementMappedCreativeParams,
    feedVideo: { videoId: string; thumbnailUrl?: string; ratio: string },
    reelsVideo: { videoId: string; thumbnailUrl?: string; ratio: string }
  ): Promise<AdCreativeResult> {
    const account = new AdAccount(this.accountId);

    const assetFeedSpec: Record<string, any> = {
      ad_formats: ['SINGLE_VIDEO'],
      optimization_type: 'PLACEMENT',
      videos: [
        { video_id: feedVideo.videoId, adlabels: [{ name: 'feed' }] },
        { video_id: reelsVideo.videoId, adlabels: [{ name: 'reels' }] },
      ],
      bodies: [{ text: params.primaryText, adlabels: [{ name: 'default' }] }],
      titles: [{ text: params.headline, adlabels: [{ name: 'default' }] }],
      descriptions: [{ text: params.description || params.headline, adlabels: [{ name: 'default' }] }],
      link_urls: [{ website_url: params.linkUrl, adlabels: [{ name: 'default' }] }],
      call_to_action_types: [params.callToAction || 'LEARN_MORE'],
      asset_customization_rules: [
        {
          customization_spec: {
            publisher_platforms: ['facebook', 'instagram'],
            facebook_positions: ['feed'],
            instagram_positions: ['stream'],
          },
          video_label: { name: 'feed' },
          body_label: { name: 'default' },
          title_label: { name: 'default' },
          description_label: { name: 'default' },
          link_url_label: { name: 'default' },
        },
        {
          customization_spec: {
            publisher_platforms: ['facebook', 'instagram'],
            facebook_positions: ['story', 'facebook_reels'],
            instagram_positions: ['story', 'reels'],
          },
          video_label: { name: 'reels' },
          body_label: { name: 'default' },
          title_label: { name: 'default' },
          description_label: { name: 'default' },
          link_url_label: { name: 'default' },
        },
        {
          // Default catch-all rule (required by Meta — must have empty customization_spec)
          customization_spec: {},
          video_label: { name: 'feed' },
          body_label: { name: 'default' },
          title_label: { name: 'default' },
          description_label: { name: 'default' },
          link_url_label: { name: 'default' },
          is_default: true,
        },
      ],
    };

    // Add thumbnail images if available
    if (feedVideo.thumbnailUrl) {
      assetFeedSpec.videos[0].image_url = feedVideo.thumbnailUrl;
    }
    if (reelsVideo.thumbnailUrl) {
      assetFeedSpec.videos[1].image_url = reelsVideo.thumbnailUrl;
    }

    const creativeParams: Record<string, any> = {
      name: params.name,
      asset_feed_spec: assetFeedSpec,
      object_story_spec: {
        page_id: params.pageId,
      },
    };

    if (params.instagramUserId) {
      creativeParams.instagram_user_id = params.instagramUserId;
    }

    const allVideoIds = params.videos.map((v) => v.videoId).join(',');
    console.log(`[AdCreatorService] Creating asset_feed_spec creative (4:5 feed + 9:16 reels) with params:`, JSON.stringify(creativeParams, null, 2));
    const result = await account.createAdCreative([], creativeParams);

    console.log(`[AdCreatorService] Created asset_feed_spec creative: ${result.id} (feed: ${feedVideo.videoId}, reels: ${reelsVideo.videoId})`);
    return {
      creativeId: result.id,
      name: params.name,
      videoId: allVideoIds,
      pageId: params.pageId,
    };
  }

  /**
   * Fallback: single-video creative with video_auto_crop for cross-placement.
   */
  private async createSingleVideoCreative(
    params: CreatePlacementMappedCreativeParams,
    primaryVideo: { videoId: string; thumbnailUrl?: string; ratio: string }
  ): Promise<AdCreativeResult> {
    const account = new AdAccount(this.accountId);

    const videoData: Record<string, any> = {
      video_id: primaryVideo.videoId,
      call_to_action: {
        type: params.callToAction || 'LEARN_MORE',
        value: { link: params.linkUrl },
      },
      message: params.primaryText,
    };

    if (params.headline) videoData.title = params.headline;
    if (params.description) videoData.link_description = params.description;
    if (primaryVideo.thumbnailUrl) videoData.image_url = primaryVideo.thumbnailUrl;

    const objectStorySpec: Record<string, any> = {
      page_id: params.pageId,
      video_data: videoData,
    };
    if (params.instagramUserId) {
      objectStorySpec.instagram_user_id = params.instagramUserId;
    }

    const creativeParams: Record<string, any> = {
      name: params.name,
      object_story_spec: objectStorySpec,
      degrees_of_freedom_spec: {
        creative_features_spec: {
          video_auto_crop: { enroll_status: 'OPT_IN' },
        },
      },
    };

    if (params.instagramUserId) {
      creativeParams.instagram_user_id = params.instagramUserId;
    }

    const allVideoIds = params.videos.map((v) => v.videoId).join(',');
    console.log(`[AdCreatorService] Creating single-video creative (${primaryVideo.ratio} primary + auto_crop) with params:`, JSON.stringify(creativeParams, null, 2));
    const result = await account.createAdCreative([], creativeParams);

    console.log(`[AdCreatorService] Created single-video creative: ${result.id} (primary: ${primaryVideo.videoId})`);
    return {
      creativeId: result.id,
      name: params.name,
      videoId: allVideoIds,
      pageId: params.pageId,
    };
  }

  async createAd(params: CreateAdParams): Promise<AdResult> {
    try {
      this.initApi();
      const account = new AdAccount(this.accountId);

      const adParams: Record<string, any> = {
        adset_id: params.adset_id,
        creative: { creative_id: params.creative_id },
        name: params.name,
        status: params.status || 'PAUSED',
      };

      if (params.tracking_specs) adParams.tracking_specs = params.tracking_specs;
      if (params.creative_asset_groups_spec) {
        adParams.creative_asset_groups_spec = params.creative_asset_groups_spec;
        console.log(`[AdCreatorService] Using Flexible Ads with creative_asset_groups_spec:`, JSON.stringify(params.creative_asset_groups_spec, null, 2));
      }

      const result = await account.createAd([], adParams);

      console.log(`[AdCreatorService] Created ad: ${result.id}`);
      return {
        adId: result.id,
        name: params.name,
        adSetId: params.adset_id,
        creativeId: params.creative_id,
        status: adParams.status,
      };
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to create ad: ${errorMessage}`);
    }
  }
}
