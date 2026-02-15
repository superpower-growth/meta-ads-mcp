import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { downloadFromUrl, detectUrlType } from '../lib/video-url-downloader.js';
import { uploadVideo as uploadToGcs, isGcpEnabled } from '../lib/gcs-storage.js';
import { AdCreatorService } from '../meta/ad-creator.js';
import { env } from '../config/env.js';
import { storage } from '../lib/gcp-clients.js';

const UploadAdVideoSchema = z.object({
  videoUrl: z.string().url().describe('Video URL (Google Drive, Dropbox, or direct link)'),
  title: z.string().describe('Title for the video ad'),
  accountId: z.string().optional().describe('Meta Ad Account ID. Defaults to configured account.'),
});

export async function uploadAdVideo(input: unknown): Promise<string> {
  const args = UploadAdVideoSchema.parse(input);

  if (!isGcpEnabled) {
    return JSON.stringify({
      error: 'GCP not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON for video upload features.',
    }, null, 2);
  }

  const accountId = args.accountId
    ? (args.accountId.startsWith('act_') ? args.accountId : `act_${args.accountId}`)
    : env.META_AD_ACCOUNT_ID;

  try {
    const urlType = detectUrlType(args.videoUrl);
    console.log(`[upload-ad-video] Downloading video from ${urlType} URL...`);

    // Download video
    const download = await downloadFromUrl(args.videoUrl);

    // Upload to GCS first (for reliable hosting)
    const videoId = `upload_${Date.now()}`;
    const gcsPath = await uploadToGcs(download.stream, 'meta-upload', videoId, {
      contentType: download.contentType,
      metadata: {
        sourceUrl: args.videoUrl,
        title: args.title,
      },
    });

    console.log(`[upload-ad-video] Video staged in GCS: ${gcsPath}`);

    // Generate a signed URL for Meta to download from
    const bucket = storage!.bucket(env.GCS_BUCKET_NAME);
    const file = bucket.file(gcsPath);
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    // Upload to Meta via file_url
    const service = new AdCreatorService(accountId);
    const result = await service.uploadVideo(signedUrl, args.title);

    console.log(`[upload-ad-video] Video uploaded to Meta: ${result.videoId}`);

    return JSON.stringify({
      videoId: result.videoId,
      title: result.title,
      status: result.status,
      gcsPath,
    }, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[upload-ad-video] Error: ${errorMessage}`);
    return JSON.stringify({
      error: `Failed to upload video: ${errorMessage}`,
      sourceUrl: args.videoUrl,
    }, null, 2);
  }
}

export const uploadAdVideoTool: Tool = {
  name: 'upload-ad-video',
  description: 'Download a video from URL (Google Drive, Dropbox, or direct link), stage in GCS, then upload to Meta Ads as an ad video. Returns the Meta video ID for use in create-ad-creative.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      videoUrl: {
        type: 'string' as const,
        description: 'Video URL (Google Drive, Dropbox, or direct link)',
      },
      title: {
        type: 'string' as const,
        description: 'Title for the video ad',
      },
      accountId: {
        type: 'string' as const,
        description: 'Meta Ad Account ID. Defaults to configured account.',
      },
    },
    required: ['videoUrl', 'title'],
  },
};
