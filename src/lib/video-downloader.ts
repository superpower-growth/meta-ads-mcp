/**
 * Video Download and Upload Pipeline
 *
 * Downloads video ad creative files from Meta Marketing API and streams them to Google Cloud Storage.
 * Uses exponential backoff retry logic for network errors and rate limits.
 */

import axios from 'axios';
import axiosRetry from 'axios-retry';
import { pipeline } from 'stream/promises';
import { Ad, AdCreative, FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { env } from '../config/env.js';
import { uploadVideo } from './gcs-storage.js';
import { isGcpEnabled } from './gcp-clients.js';

// Configure axios-retry for robust network handling
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay, // 100ms, 200ms, 400ms, 800ms
  retryCondition: (error) => {
    // Retry on network errors and transient failures
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
           error.response?.status === 429 ||  // Rate limit
           (error.response?.status ?? 0) >= 500; // Server errors
  },
  onRetry: (retryCount, error, requestConfig) => {
    const status = error.response?.status;
    if (status === 429) {
      console.warn(`Rate limit hit - retrying with exponential backoff (attempt ${retryCount}/3)`);
    } else {
      console.warn(`Retry attempt ${retryCount}/3 for ${requestConfig.url}: ${error.message}`);
    }
  }
});

/**
 * Video metadata from Meta Marketing API
 */
export interface VideoMetadata {
  videoId: string;
  videoUrl: string;
  thumbnailUrl: string;
  duration: number; // seconds
}

/**
 * Get video metadata from an ad creative
 *
 * @param adId - Meta Ad ID
 * @returns Video metadata if ad has video creative, null if not a video ad
 * @throws Error if API call fails
 */
export async function getVideoMetadata(adId: string): Promise<VideoMetadata | null> {
  try {
    // Re-initialize API to ensure token is available (ES module initialization issue)
    FacebookAdsApi.init(env.META_ACCESS_TOKEN);

    // Get ad with creative and preview URL (for fallback)
    const ad = new Ad(adId);
    const adData = await ad.read([
      Ad.Fields.creative,
      Ad.Fields.preview_shareable_link,
      'effective_status' // To check if ad is archived
    ]);

    const effectiveStatus = (adData as any).effective_status;
    const isArchived = effectiveStatus === 'ARCHIVED' || effectiveStatus === 'DELETED';

    if (isArchived) {
      console.warn(`Ad ${adId} is ${effectiveStatus} - video access may be limited`);
    }

    // Check if creative exists
    const creativeId = (adData as any).creative?.id;
    if (!creativeId) {
      console.log(`Ad ${adId} has no creative, skipping`);
      return null;
    }

    // Get creative details with additional fields for video URL extraction
    const creative = new AdCreative(creativeId);
    const creativeData = await creative.read([
      AdCreative.Fields.object_story_spec,
      AdCreative.Fields.video_id, // Direct video ID field
      'asset_feed_spec' // For dynamic creative videos
    ]);

    // Extract video ID from multiple possible locations
    let videoId = (creativeData as any).video_id || // Direct field
                  (creativeData as any).object_story_spec?.video_data?.video_id ||
                  (creativeData as any).asset_feed_spec?.videos?.[0]?.video_id;

    if (!videoId) {
      console.log(`Ad ${adId} is not a video ad, skipping`);
      return null;
    }

    // Query video node using direct API call (NOT AdVideo class)
    // AdVideo class is for uploads only, use direct API call for retrieval
    const videoResponse = await FacebookAdsApi.init(env.META_ACCESS_TOKEN).call(
      'GET',
      [videoId],
      {
        fields: 'source,picture,length,updated_time,permalink_url,format,thumbnails,status'
      }
    ) as any;

    // Try to get video URL from multiple possible fields
    const videoUrl = videoResponse.source ||
                     videoResponse.permalink_url ||
                     videoResponse.format?.find((f: any) => f.filter === 'original')?.picture ||
                     null;

    if (!videoUrl) {
      console.warn(`Video ${videoId} found but no downloadable URL available (possibly archived/deleted)`);
      throw new Error(`Video ${videoId} exists but has no accessible download URL. Status: ${videoResponse.status || 'unknown'}. This often happens with archived or deleted ads.`);
    }

    return {
      videoId,
      videoUrl,
      thumbnailUrl: videoResponse.picture || videoResponse.thumbnails?.data?.[0]?.uri || '',
      duration: videoResponse.length as number
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Provide helpful context for common errors
    if (message.includes('access token') || message.includes('permission')) {
      throw new Error(`Failed to get video metadata for ad ${adId}: ${message}. This often happens with archived/killed ads where the video asset has been deleted or access has been restricted. Try using an active ad instead.`);
    }

    if (message.includes('does not exist') || message.includes('cannot be loaded')) {
      throw new Error(`Failed to get video metadata for ad ${adId}: ${message}. The ad or video asset may have been deleted from Meta's systems.`);
    }

    throw new Error(`Failed to get video metadata for ad ${adId}: ${message}`);
  }
}

/**
 * Download video from Meta and upload to Google Cloud Storage
 *
 * Streams video directly from Meta API to GCS without disk storage.
 * Uses exponential backoff for network errors and rate limits.
 *
 * @param adId - Meta Ad ID
 * @returns GCS path of uploaded video, or null if not a video ad
 * @throws Error if GCP not enabled, download fails, or upload fails
 */
export async function downloadAndUploadVideo(adId: string): Promise<string | null> {
  // Check if GCP is enabled
  if (!isGcpEnabled) {
    throw new Error('GCP is not enabled. Please configure GOOGLE_SERVICE_ACCOUNT_JSON to use video download features.');
  }

  try {
    // Get video metadata
    const metadata = await getVideoMetadata(adId);
    if (metadata === null) {
      // Not a video ad - this is not an error
      return null;
    }

    console.log(`Downloading video ${metadata.videoId} for ad ${adId} from Meta API`);

    // Download video with streaming
    let response;
    try {
      response = await axios({
        method: 'GET',
        url: metadata.videoUrl,
        responseType: 'stream',
        timeout: 60000, // 60 second timeout for large videos
        maxContentLength: 200 * 1024 * 1024, // 200MB max (Meta's upload limit)
      });
    } catch (error: any) {
      // Enhanced error handling for download failures
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new Error(`Video download timeout for ad ${adId}, video ${metadata.videoId}: Network timeout after 60 seconds. Video may be too large or network connection is slow.`);
      } else if (error.response?.status === 403 || error.response?.status === 404) {
        throw new Error(`Video URL may have expired for ad ${adId}, video ${metadata.videoId}: ${error.response.status} response. Video URLs from Meta are temporary and must be downloaded immediately.`);
      } else {
        throw new Error(`Failed to download video for ad ${adId}, video ${metadata.videoId}: ${error.message}`);
      }
    }

    // Upload to GCS with metadata
    try {
      const gcsPath = await uploadVideo(
        response.data,
        adId,
        metadata.videoId,
        {
          contentType: 'video/mp4',
          metadata: {
            duration: metadata.duration.toString(),
            thumbnailUrl: metadata.thumbnailUrl,
          }
        }
      );

      console.log(`Video ${metadata.videoId} for ad ${adId} uploaded to ${gcsPath}`);
      return gcsPath;
    } catch (error: any) {
      throw new Error(`Failed to upload video to GCS for ad ${adId}, video ${metadata.videoId}: ${error.message}`);
    }
  } catch (error) {
    // Re-throw if already a detailed error from above
    if (error instanceof Error && error.message.includes('ad ' + adId)) {
      throw error;
    }
    // Generic fallback
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unexpected error processing video for ad ${adId}: ${message}`);
  }
}
