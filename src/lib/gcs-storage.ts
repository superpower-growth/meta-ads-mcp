/**
 * Google Cloud Storage - Bucket Management and Video Upload
 *
 * Utilities for managing GCS buckets with lifecycle policies and streaming video uploads.
 * Supports graceful degradation when GCP is not configured.
 */

import { Bucket, Storage } from '@google-cloud/storage';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { storage, isGcpEnabled } from './gcp-clients.js';
import { env } from '../config/env.js';

/**
 * Ensure GCS bucket exists and return bucket instance
 *
 * @returns Bucket instance
 * @throws Error if storage client not initialized or bucket creation fails
 */
export async function ensureBucket(): Promise<Bucket> {
  if (!storage) {
    throw new Error('GCS storage client not initialized. Please configure GOOGLE_SERVICE_ACCOUNT_JSON.');
  }

  const bucketName = env.GCS_BUCKET_NAME;
  const bucket = storage.bucket(bucketName);

  try {
    const [exists] = await bucket.exists();

    if (!exists) {
      console.log(`Creating GCS bucket: ${bucketName}`);
      await storage.createBucket(bucketName, {
        location: 'us-central1',
        storageClass: 'STANDARD',
      });
      console.log(`Bucket ${bucketName} created successfully`);
    }

    return bucket;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to ensure bucket exists: ${message}`);
  }
}

/**
 * Configure lifecycle policy for automatic cost optimization
 *
 * - Move to Nearline storage after 30 days (50% cost savings)
 * - Delete videos after 90 days (automatic cleanup)
 *
 * @param bucket - GCS bucket instance
 * @throws Error if lifecycle policy cannot be set
 */
export async function setLifecyclePolicy(bucket: Bucket): Promise<void> {
  try {
    await bucket.setMetadata({
      lifecycle: {
        rule: [
          {
            action: {
              type: 'SetStorageClass',
              storageClass: 'NEARLINE',
            },
            condition: {
              age: 30,
              matchesPrefix: ['videos/raw/'],
              matchesStorageClass: ['STANDARD'],
            },
          },
          {
            action: {
              type: 'Delete',
            },
            condition: {
              age: 90,
              matchesPrefix: ['videos/raw/'],
            },
          },
        ],
      },
    });

    console.log(`Lifecycle policy set: Nearline after 30 days, Delete after 90 days`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to set lifecycle policy: ${message}`);
  }
}

/**
 * Upload video stream to GCS with resumable upload and integrity validation
 *
 * Path structure: videos/raw/YYYY/MM/DD/{adId}_{videoId}_{timestamp}.mp4
 *
 * @param videoStream - Readable stream from axios response or fs.createReadStream
 * @param adId - Meta Ad ID
 * @param videoId - Meta Video ID
 * @param options - Optional metadata and content type
 * @returns GCS path of uploaded video
 * @throws Error if upload fails or storage client not initialized
 */
export async function uploadVideo(
  videoStream: Readable,
  adId: string,
  videoId: string,
  options?: {
    contentType?: string;
    metadata?: Record<string, string>;
  }
): Promise<string> {
  if (!storage) {
    throw new Error('GCS storage client not initialized. Caller should check isGcpEnabled first.');
  }

  try {
    // Ensure bucket exists (creates on first upload if needed)
    const bucket = await ensureBucket();

    // Generate date-based path for lifecycle management
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const timestamp = Date.now();

    const gcsPath = `videos/raw/${year}/${month}/${day}/${adId}_${videoId}_${timestamp}.mp4`;

    // Create file reference and write stream
    const file = bucket.file(gcsPath);
    const writeStream = file.createWriteStream({
      resumable: true, // Enable resumable uploads for reliability
      validation: 'crc32c', // Verify upload integrity
      metadata: {
        contentType: options?.contentType || 'video/mp4',
        metadata: {
          adId,
          videoId,
          uploadedAt: now.toISOString(),
          uploadedBy: 'meta-ads-mcp-server',
          ...options?.metadata,
        },
      },
    });

    // Pipe video stream to GCS with automatic cleanup on error
    await pipeline(videoStream, writeStream);

    console.log(`Video uploaded successfully: ${gcsPath}`);
    return gcsPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to upload video (adId: ${adId}, videoId: ${videoId}): ${message}`);
  }
}

// Re-export isGcpEnabled for convenience
export { isGcpEnabled };
