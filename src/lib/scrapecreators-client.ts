/**
 * ScrapeCreators API Client
 *
 * HTTP client for the ScrapeCreators Meta Ad Library API.
 * Provides typed methods for all endpoints with cursor-based pagination.
 *
 * API docs: https://docs.scrapecreators.com/
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';

// ── Types ──────────────────────────────────────────────────────────────

export interface SearchAdsParams {
  query: string;
  sort_by?: 'total_impressions' | 'relevancy_monthly_grouped';
  search_type?: 'keyword_unordered' | 'keyword_exact_phrase';
  ad_type?: 'all' | 'political_and_issue_ads';
  country?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  media_type?: 'ALL' | 'IMAGE' | 'VIDEO' | 'MEME' | 'IMAGE_AND_MEME' | 'NONE';
  start_date?: string;
  end_date?: string;
  cursor?: string;
  trim?: boolean;
}

export interface CompanyAdsParams {
  pageId?: string;
  companyName?: string;
  country?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  media_type?: 'ALL' | 'IMAGE' | 'VIDEO' | 'MEME' | 'IMAGE_AND_MEME' | 'NONE';
  language?: string;
  sort_by?: 'total_impressions' | 'relevancy_monthly_grouped';
  start_date?: string;
  end_date?: string;
  cursor?: string;
  trim?: boolean;
}

export interface GetAdParams {
  id?: string;
  url?: string;
  get_transcript?: boolean;
  trim?: boolean;
}

export interface SearchCompaniesParams {
  query: string;
}

export interface SCAdSnapshot {
  body?: { markup?: { __html?: string } };
  images?: Array<{ original_image_url?: string; resized_image_url?: string }>;
  videos?: Array<{ video_sd_url?: string; video_hd_url?: string; video_preview_image_url?: string }>;
  cards?: any[];
  cta_text?: string;
  cta_type?: string;
  link_url?: string;
  link_description?: string;
  link_title?: string;
  display_format?: string;
  title?: string;
  [key: string]: any;
}

export interface SCAd {
  ad_archive_id?: string;
  adid?: string;
  collation_id?: string;
  collation_count?: number;
  is_active?: boolean;
  page_id?: string;
  page_name?: string;
  snapshot?: SCAdSnapshot;
  publisher_platform?: string[];
  start_date?: number;
  end_date?: number;
  currency?: string;
  impressions?: { lower_bound?: string; upper_bound?: string };
  spend?: { lower_bound?: string; upper_bound?: string };
  demographic_distribution?: any[];
  delivery_by_region?: any[];
  languages?: string[];
  target_locations?: any[];
  target_ages?: string;
  target_gender?: string;
  bylines?: string;
  [key: string]: any;
}

export interface SCCompany {
  pageID?: string;
  name?: string;
  page_name?: string;
  page_profile_picture_url?: string;
  categories?: string[];
  likes?: number;
  [key: string]: any;
}

export interface SearchAdsResponse {
  searchResults?: SCAd[];
  searchResultsCount?: number;
  cursor?: string;
}

export interface CompanyAdsResponse {
  results?: SCAd[];
  cursor?: string;
}

export interface SearchCompaniesResponse {
  results?: SCCompany[];
  [key: string]: any;
}

// ── Client ─────────────────────────────────────────────────────────────

class ScrapeCreatorsClient {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: 'https://api.scrapecreators.com',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  // ── Search Ads ──

  async searchAds(params: SearchAdsParams): Promise<SearchAdsResponse> {
    const response: AxiosResponse<SearchAdsResponse> = await this.client.get(
      '/v1/facebook/adLibrary/search/ads',
      { params },
    );
    return response.data;
  }

  async searchAdsPost(params: SearchAdsParams): Promise<SearchAdsResponse> {
    const response: AxiosResponse<SearchAdsResponse> = await this.client.post(
      '/v1/facebook/adLibrary/search/ads',
      params,
    );
    return response.data;
  }

  // ── Company Ads ──

  async getCompanyAds(params: CompanyAdsParams): Promise<CompanyAdsResponse> {
    const response: AxiosResponse<CompanyAdsResponse> = await this.client.get(
      '/v1/facebook/adLibrary/company/ads',
      { params },
    );
    return response.data;
  }

  async getCompanyAdsPost(params: CompanyAdsParams): Promise<CompanyAdsResponse> {
    const response: AxiosResponse<CompanyAdsResponse> = await this.client.post(
      '/v1/facebook/adLibrary/company/ads',
      params,
    );
    return response.data;
  }

  // ── Single Ad ──

  async getAd(params: GetAdParams): Promise<SCAd> {
    const response: AxiosResponse<SCAd> = await this.client.get(
      '/v1/facebook/adLibrary/ad',
      { params },
    );
    return response.data;
  }

  // ── Search Companies ──

  async searchCompanies(params: SearchCompaniesParams): Promise<SearchCompaniesResponse> {
    const response: AxiosResponse<SearchCompaniesResponse> = await this.client.get(
      '/v1/facebook/adLibrary/search/companies',
      { params },
    );
    return response.data;
  }

  // ── Auto-pagination ──

  /**
   * Fetch all pages of search results using cursor-based pagination.
   * Automatically switches from GET to POST when cursor gets large (>1500 chars).
   * Deduplicates by ad_archive_id.
   */
  async fetchAllSearchAds(params: SearchAdsParams, maxPages = 20): Promise<SCAd[]> {
    const allAds: SCAd[] = [];
    const seen = new Set<string>();
    let currentParams = { ...params };
    let usePost = false;

    for (let page = 0; page < maxPages; page++) {
      const result = usePost
        ? await this.searchAdsPost(currentParams)
        : await this.searchAds(currentParams);

      const ads = result.searchResults || [];
      for (const ad of ads) {
        const id = ad.ad_archive_id || ad.adid;
        if (id && !seen.has(id)) {
          seen.add(id);
          allAds.push(ad);
        }
      }

      if (!result.cursor || ads.length === 0) break;

      // Switch to POST when cursor gets too large for GET query string
      if (result.cursor.length > 1500) usePost = true;
      currentParams = { ...currentParams, cursor: result.cursor };
    }

    console.log(`[ScrapeCreators] fetchAllSearchAds: ${allAds.length} unique ads`);
    return allAds;
  }

  /**
   * Fetch all pages of company ads using cursor-based pagination.
   * Automatically switches to POST when cursor gets large.
   */
  async fetchAllCompanyAds(params: CompanyAdsParams, maxPages = 20): Promise<SCAd[]> {
    const allAds: SCAd[] = [];
    const seen = new Set<string>();
    let currentParams = { ...params };
    let usePost = false;

    for (let page = 0; page < maxPages; page++) {
      const result = usePost
        ? await this.getCompanyAdsPost(currentParams)
        : await this.getCompanyAds(currentParams);

      const ads = result.results || [];
      for (const ad of ads) {
        const id = ad.ad_archive_id || ad.adid;
        if (id && !seen.has(id)) {
          seen.add(id);
          allAds.push(ad);
        }
      }

      if (!result.cursor || ads.length === 0) break;

      if (result.cursor.length > 1500) usePost = true;
      currentParams = { ...currentParams, cursor: result.cursor };
    }

    console.log(`[ScrapeCreators] fetchAllCompanyAds: ${allAds.length} unique ads`);
    return allAds;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

let scrapeCreatorsClient: ScrapeCreatorsClient | null = null;

function autoInit(): ScrapeCreatorsClient | null {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) {
    console.warn('[ScrapeCreators] SCRAPECREATORS_API_KEY not set. Ad library search tools will be disabled.');
    return null;
  }
  console.log('[ScrapeCreators] Client initialized successfully.');
  return new ScrapeCreatorsClient(apiKey);
}

scrapeCreatorsClient = autoInit();

export function initScrapeCreatorsClient(): ScrapeCreatorsClient | null {
  if (!scrapeCreatorsClient) {
    scrapeCreatorsClient = autoInit();
  }
  return scrapeCreatorsClient;
}

export function isScrapeCreatorsEnabled(): boolean {
  return scrapeCreatorsClient !== null;
}

export function getScrapeCreatorsClient(): ScrapeCreatorsClient {
  if (!scrapeCreatorsClient) {
    throw new Error('ScrapeCreators not configured. Set SCRAPECREATORS_API_KEY environment variable.');
  }
  return scrapeCreatorsClient;
}
