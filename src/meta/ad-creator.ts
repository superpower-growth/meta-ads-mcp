import { AdAccount, Campaign, AdSet, Ad, AdCreative, FacebookAdsApi } from 'facebook-nodejs-business-sdk';
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
}

export interface CreateAdCreativeParams {
  name: string;
  pageId: string;
  instagramActorId?: string;
  videoId: string;
  primaryText: string;
  headline?: string;
  description?: string;
  callToAction?: string;
  linkUrl: string;
  thumbnailUrl?: string;
}

export interface CreateAdParams {
  adset_id: string;
  creative_id: string;
  name: string;
  status?: string;
  tracking_specs?: Record<string, any>[];
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
    console.error('[AdCreatorService] Raw Meta API error:', {
      message: error.message,
      code: error.code,
      type: error.type,
      error_subcode: error.error_subcode,
    });
    if (error.message) return error.message;
    if (error.error?.message) return error.error.message;
    return 'Unknown Meta API error occurred';
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
      return {
        videoId: result.id,
        title: title,
        status: 'processing',
      };
    } catch (error: any) {
      const errorMessage = this.formatMetaError(error);
      throw new Error(`Failed to upload video: ${errorMessage}`);
    }
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

      if (params.instagramActorId) {
        objectStorySpec.instagram_actor_id = params.instagramActorId;
      }

      const creativeParams = {
        name: params.name,
        object_story_spec: objectStorySpec,
      };

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
