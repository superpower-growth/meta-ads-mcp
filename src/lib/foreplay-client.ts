/**
 * Foreplay API Client
 *
 * HTTP client for the Foreplay competitor research API.
 * Provides typed methods for all API endpoints with credit tracking.
 *
 * API docs: https://public.api.foreplay.co/docs
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';

// ── Types ──────────────────────────────────────────────────────────────

export interface AdFilterParams {
  start_date?: string;
  end_date?: string;
  live?: boolean;
  display_format?: string[];
  publisher_platform?: string[];
  niches?: string[];
  market_target?: string[];
  languages?: string[];
  video_duration_min?: number;
  video_duration_max?: number;
  running_duration_min_days?: number;
  running_duration_max_days?: number;
  cursor?: number;
  limit?: number;
  order?: string;
}

export interface ForeplayBrand {
  id: string;
  name: string;
  description?: string;
  category?: string;
  niches?: string[];
  verification_status?: string;
  url?: string;
  websites?: string[];
  avatar?: string;
  ad_library_id?: string;
  is_delegate_page_with_linked_primary_profile?: boolean;
}

export interface ForeplayAd {
  id: string;
  ad_id?: string;
  brand_id?: string;
  brand_name?: string;
  name?: string;
  title?: string;
  description?: string;
  cta_title?: string;
  cta_type?: string;
  categories?: string[];
  creative_targeting?: string;
  languages?: string[];
  market_target?: string[];
  niches?: string[];
  product_category?: string;
  timestamped_transcription?: string;
  full_transcription?: string;
  cards?: any[];
  avatar?: string;
  display_format?: string;
  emotional_drivers?: string[];
  link_url?: string;
  live?: boolean;
  persona?: string;
  publisher_platform?: string[];
  started_running?: string;
  thumbnail?: string;
  type?: string;
  video?: string;
  image?: string;
  content_filter?: string;
  running_duration?: number;
  created_at?: string;
  updated_at?: string;
  ad_library_id?: string;
  ad_library_url?: string;
  media_urls?: string[];
}

export interface ForeplayBoard {
  id: string;
  name?: string;
  [key: string]: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: {
    cursor?: number;
    filters?: any;
    count?: number;
    order?: string;
  };
}

export interface SingleResponse<T> {
  data: T;
  metadata: Record<string, any>;
}

// ── Client ─────────────────────────────────────────────────────────────

class ForeplayClient {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: 'https://public.api.foreplay.co',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  private async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    const response: AxiosResponse<T> = await this.client.get(path, { params });

    // Log credit usage from response headers
    const creditsRemaining = response.headers['x-credits-remaining'];
    const creditCost = response.headers['x-credit-cost'];
    if (creditsRemaining !== undefined) {
      console.log(`[Foreplay] Credits: ${creditCost || '?'} used, ${creditsRemaining} remaining`);
    }

    return response.data;
  }

  // ── Swipefile ──

  async getSwipefileAds(params: AdFilterParams & { offset?: number } = {}): Promise<PaginatedResponse<ForeplayAd>> {
    return this.get('/api/swipefile/ads', params);
  }

  // ── Boards ──

  async getBoards(params: { offset?: number; limit?: number } = {}): Promise<PaginatedResponse<ForeplayBoard>> {
    return this.get('/api/boards', params);
  }

  async getBoardBrands(boardId: string, params: { offset?: number; limit?: number } = {}): Promise<PaginatedResponse<ForeplayBrand>> {
    return this.get('/api/board/brands', { board_id: boardId, ...params });
  }

  async getBoardAds(boardId: string, params: AdFilterParams = {}): Promise<PaginatedResponse<ForeplayAd>> {
    return this.get('/api/board/ads', { board_id: boardId, ...params });
  }

  // ── Spyder (Tracked Brands) ──

  async getSpyderBrands(params: { offset?: number; limit?: number } = {}): Promise<PaginatedResponse<ForeplayBrand>> {
    return this.get('/api/spyder/brands', params);
  }

  async getSpyderBrand(brandId: string): Promise<SingleResponse<ForeplayBrand>> {
    return this.get('/api/spyder/brand', { brand_id: brandId });
  }

  async getSpyderBrandAds(brandId: string, params: AdFilterParams = {}): Promise<PaginatedResponse<ForeplayAd>> {
    return this.get('/api/spyder/brand/ads', { brand_id: brandId, ...params });
  }

  // ── Ads ──

  async getAd(adId: string): Promise<SingleResponse<ForeplayAd>> {
    return this.get(`/api/ad/${encodeURIComponent(adId)}`);
  }

  async getAdDuplicates(adId: string): Promise<PaginatedResponse<ForeplayAd>> {
    return this.get(`/api/ad/duplicates/${encodeURIComponent(adId)}`);
  }

  // ── Brands ──

  async getAdsByBrandId(brandIds: string[], params: AdFilterParams = {}): Promise<PaginatedResponse<ForeplayAd>> {
    return this.get('/api/brand/getAdsByBrandId', { brand_ids: brandIds, ...params });
  }

  async getAdsByPageId(pageId: string, params: AdFilterParams = {}): Promise<PaginatedResponse<ForeplayAd>> {
    return this.get('/api/brand/getAdsByPageId', { page_id: pageId, ...params });
  }

  async getBrandsByDomain(domain: string, params: { limit?: number; order?: string } = {}): Promise<PaginatedResponse<ForeplayBrand>> {
    return this.get('/api/brand/getBrandsByDomain', { domain, ...params });
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

// Auto-initialize at module load time so tools/index.ts can check
// isForeplayEnabled() during import (before main() runs).
let foreplayClient: ForeplayClient | null = null;

function autoInit(): ForeplayClient | null {
  const apiKey = process.env.FOREPLAY_API_KEY;
  if (!apiKey) {
    console.warn('[Foreplay] FOREPLAY_API_KEY not set. Competitor research tools will be disabled.');
    return null;
  }
  console.log('[Foreplay] Client initialized successfully.');
  return new ForeplayClient(apiKey);
}

foreplayClient = autoInit();

export function initForeplayClient(): ForeplayClient | null {
  if (!foreplayClient) {
    foreplayClient = autoInit();
  }
  return foreplayClient;
}

export function isForeplayEnabled(): boolean {
  return foreplayClient !== null;
}

export function getForeplayClient(): ForeplayClient {
  if (!foreplayClient) {
    throw new Error('Foreplay not configured. Set FOREPLAY_API_KEY environment variable.');
  }
  return foreplayClient;
}
