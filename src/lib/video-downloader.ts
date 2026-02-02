/**
 * Video Download and Upload Pipeline
 *
 * Downloads video ad creative files from Meta Marketing API and streams them to Google Cloud Storage.
 * Uses exponential backoff retry logic for network errors and rate limits.
 */

import axios from 'axios';
import axiosRetry from 'axios-retry';
import { pipeline } from 'stream/promises';
import { Ad, AdCreative } from 'facebook-nodejs-business-sdk';
import { api } from '../meta/client.js';
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
    console.warn(`Retry attempt ${retryCount} for ${requestConfig.url}: ${error.message}`);
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
    // Get ad with creative
    const ad = new Ad(adId);
    const adData = await ad.read([Ad.Fields.creative]);

    // Check if creative exists
    const creativeId = (adData as any).creative?.id;
    if (!creativeId) {
      console.log(`Ad ${adId} has no creative, skipping`);
      return null;
    }

    // Get creative details
    const creative = new AdCreative(creativeId);
    const creativeData = await creative.read([AdCreative.Fields.object_story_spec]);

    // Extract video ID from object_story_spec
    const videoId = (creativeData as any).object_story_spec?.video_data?.video_id;
    if (!videoId) {
      console.log(`Ad ${adId} is not a video ad, skipping`);
      return null;
    }

    // Query video node using direct API call (NOT AdVideo class)
    // AdVideo class is for uploads only, use direct API call for retrieval
    const videoResponse = await api.call(
      'GET',
      `/${videoId}`,
      { fields: 'source,picture,length,updated_time' }
    ) as any;

    return {
      videoId,
      videoUrl: videoResponse.source as string,
      thumbnailUrl: videoResponse.picture as string,
      duration: videoResponse.length as number
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
    const response = await axios({
      method: 'GET',
      url: metadata.videoUrl,
      responseType: 'stream',
      timeout: 60000, // 60 second timeout for large videos
      maxContentLength: 200 * 1024 * 1024, // 200MB max (Meta's upload limit)
    });

    // Upload to GCS with metadata
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to download and upload video for ad ${adId}: ${message}`);
  }
}
