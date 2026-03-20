/**
 * Ad Shipper Pipeline Stage
 *
 * Processes a single row end-to-end:
 * Drive folder → GCS staging → Gemini analysis → Copy generation → Adset resolution → Meta ad creation
 */

import {
  extractDriveFolderId,
  listDriveFolderFiles,
  downloadDriveFile,
  detectUrlType,
  type DriveFileInfo,
} from '../../lib/video-url-downloader.js';
import { uploadVideo as uploadToGcs, isGcpEnabled } from '../../lib/gcs-storage.js';
import { storage } from '../../lib/gcp-clients.js';
import { analyzeVideo, type VideoAnalysis } from '../../lib/gemini-analyzer.js';
import { getCached, setCached } from '../../lib/firestore-cache.js';
import { AdCreatorService } from '../../meta/ad-creator.js';
import { env } from '../../config/env.js';
import { generateCopy } from './copy-generator.js';
import type { AdSetCache } from './batch-orchestrator.js';

export interface ShipAdRowInput {
  id: string;
  deliverableName: string;
  assetLink: string;
  angle: string;
  format: string;
  messenger: string;
  landingPageUrl?: string;
  campaignId: string;
  adSetName: string;
  dryRun: boolean;
}

export interface ShipAdRowResult {
  id: string;
  deliverableName: string;
  status: 'shipped' | 'failed' | 'dry_run';
  primaryText?: string;
  headline?: string;
  adIds?: string[];
  creativeIds?: string[];
  videoIds?: string[];
  adSetId?: string;
  adSetCreated?: boolean;
  error?: string;
  durationMs: number;
}

/**
 * Sanitize a GCS path for use as a Firestore document ID.
 * Firestore doc IDs cannot contain slashes.
 */
function sanitizeFirestoreKey(gcsPath: string): string {
  return gcsPath.replace(/\//g, '__');
}

const VIDEO_MIME_PREFIXES = ['video/'];
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.webm', '.mkv', '.mpeg', '.3gp', '.m4v']);

function isVideoFile(file: DriveFileInfo): boolean {
  if (VIDEO_MIME_PREFIXES.some((prefix) => file.mimeType.startsWith(prefix))) return true;
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Stage a Drive video file to GCS and return the GCS path.
 * If a file with the same job key is already cached, returns the cached path.
 */
async function stageDriveVideoToGcs(
  file: DriveFileInfo,
  jobKey: string
): Promise<string> {
  console.log(`[ad-shipper] Staging "${file.name}" (${file.aspectRatio || 'unknown ratio'}) to GCS...`);

  const download = await downloadDriveFile(file.id);
  const gcsPath = await uploadToGcs(download.stream, 'batch-ship', `${jobKey}_${file.name}`, {
    contentType: download.contentType,
    metadata: {
      driveFileId: file.id,
      fileName: file.name,
      aspectRatio: file.aspectRatio || 'unknown',
    },
  });

  console.log(`[ad-shipper] Staged to GCS: ${gcsPath}`);
  return gcsPath;
}

/**
 * Generate a signed URL from a GCS path (1-hour expiry).
 */
async function getSignedUrl(gcsPath: string): Promise<string> {
  if (!storage) throw new Error('GCS storage not initialized');
  const bucket = storage.bucket(env.GCS_BUCKET_NAME);
  const file = bucket.file(gcsPath);
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000,
  });
  return signedUrl;
}

/**
 * Resolve an adset by name: find existing or create new with cloned targeting.
 * Uses promise memoization via adSetCache to prevent duplicate creation.
 */
async function resolveAdSet(
  service: AdCreatorService,
  campaignId: string,
  adSetName: string,
  adSetCache: AdSetCache
): Promise<{ adSetId: string; created: boolean }> {
  // Check cache first — promise memoization ensures only one in-flight request per name
  const existing = adSetCache.get(adSetName);
  if (existing) {
    console.log(`[ad-shipper] Adset cache hit for "${adSetName}"`);
    return existing;
  }

  const promise = (async () => {
    // Try to find existing adset by exact name
    const found = await service.findAdSetByName(campaignId, adSetName);
    if (found) {
      console.log(`[ad-shipper] Found existing adset: ${found.id} "${found.name}"`);
      return { adSetId: found.id, created: false };
    }

    // Not found — clone settings from most recent adset and create new one
    console.log(`[ad-shipper] Adset "${adSetName}" not found, creating new one...`);
    const cloned = await service.cloneAdSetSettings(campaignId);

    const createParams: any = {
      campaign_id: campaignId,
      name: adSetName,
      status: 'PAUSED',
      billing_event: cloned?.billing_event || 'IMPRESSIONS',
      optimization_goal: cloned?.optimization_goal || 'REACH',
    };

    // Only set ad set budget if campaign doesn't use CBO
    const isCBO = await service.isCampaignBudgetOptimization(campaignId);
    if (!isCBO) {
      createParams.daily_budget = '20000'; // $200/day in cents
    } else {
      console.log(`[ad-shipper] Campaign uses CBO, skipping ad set budget`);
    }

    if (cloned?.targeting) {
      createParams.targeting = cloned.targeting;
    } else {
      // Use saved audience as default targeting
      createParams.saved_audience_id = env.DEFAULT_SAVED_AUDIENCE_ID;
      console.log(`[ad-shipper] No existing adsets to clone targeting from, using saved audience ${env.DEFAULT_SAVED_AUDIENCE_ID}`);
    }
    if (cloned?.promoted_object) createParams.promoted_object = cloned.promoted_object;

    // Attribution: 7-day click, 1-day engaged view, 1-day view
    createParams.attribution_spec = [
      { event_type: 'CLICK_THROUGH', window_days: 7 },
      { event_type: 'VIEW_THROUGH', window_days: 1 },
      { event_type: 'ENGAGED_VIDEO_VIEW', window_days: 1 },
    ];

    const result = await service.createAdSet(createParams);
    console.log(`[ad-shipper] Created new adset: ${result.adSetId} "${adSetName}"`);
    return { adSetId: result.adSetId, created: true };
  })();

  adSetCache.set(adSetName, promise);
  return promise;
}

/**
 * Process a single ad row end-to-end.
 */
export async function shipOneRow(input: ShipAdRowInput, adSetCache: AdSetCache): Promise<ShipAdRowResult> {
  const start = Date.now();
  const { id, deliverableName } = input;

  try {
    if (!isGcpEnabled) {
      throw new Error('GCP not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON.');
    }

    // Step 1: List Drive folder and find 4:5 + 9:16 videos
    const urlType = detectUrlType(input.assetLink);
    if (urlType !== 'google-drive-folder') {
      throw new Error(`Expected Google Drive folder URL, got: ${urlType}`);
    }

    const folderId = extractDriveFolderId(input.assetLink);
    const files = await listDriveFolderFiles(folderId);
    const videoFiles = files.filter(isVideoFile);

    if (videoFiles.length === 0) {
      throw new Error(`No video files found in Drive folder. Found ${files.length} non-video files.`);
    }

    const video4x5 = videoFiles.find((f) => f.aspectRatio === '4:5');
    const video9x16 = videoFiles.find((f) => f.aspectRatio === '9:16');

    if (!video4x5 && !video9x16) {
      throw new Error(
        `No video with recognized aspect ratio found. Available: ${videoFiles.map((f) => `${f.name} (${f.aspectRatio || 'unknown'})`).join(', ')}`
      );
    }

    console.log(
      `[ad-shipper] Found videos - ` +
        (video4x5 ? `4:5: "${video4x5.name}"` : 'no 4:5') +
        (video9x16 ? `, 9:16: "${video9x16.name}"` : ', no 9:16')
    );

    // Step 2: Stage videos to GCS for Gemini analysis
    // Use 4:5 for Gemini (better framing for analysis), fall back to 9:16
    const geminiVideo = video4x5 || video9x16!;
    const geminiJobKey = `${id}_${video4x5 ? '4x5' : '9x16'}`;
    const gcsPathGemini = await stageDriveVideoToGcs(geminiVideo, geminiJobKey);

    // Check Gemini cache, run analysis if not cached
    let videoAnalysis: VideoAnalysis;
    const cacheKey = sanitizeFirestoreKey(gcsPathGemini);
    const cached = await getCached(cacheKey);
    if (cached) {
      console.log(`[ad-shipper] Gemini cache hit for analysis video`);
      videoAnalysis = cached.analysisResults as VideoAnalysis;
    } else {
      console.log(`[ad-shipper] Running Gemini analysis on video...`);
      videoAnalysis = await analyzeVideo(gcsPathGemini);
      await setCached({
        videoId: cacheKey,
        adId: id,
        analysisResults: videoAnalysis,
        gcsPath: gcsPathGemini,
      });
    }

    // Step 3: Stage 9:16 to GCS if not already staged (for Meta upload)
    let gcsPath9x16: string;
    if (video9x16 && video4x5) {
      // 4:5 was used for Gemini, stage 9:16 separately for Meta upload
      const jobKey9x16 = `${id}_9x16`;
      gcsPath9x16 = await stageDriveVideoToGcs(video9x16, jobKey9x16);
    } else if (video9x16) {
      // 9:16 was already staged as Gemini video
      gcsPath9x16 = gcsPathGemini;
    } else {
      // No 9:16 — use 4:5 as fallback for Meta upload
      console.log(`[ad-shipper] No 9:16 video, using 4:5 as fallback for Meta upload`);
      gcsPath9x16 = gcsPathGemini;
    }

    // Step 4: Generate copy
    console.log(`[ad-shipper] Generating copy for "${deliverableName}"...`);
    const copyResult = await generateCopy({
      videoAnalysis,
      angle: input.angle,
      format: input.format,
      messenger: input.messenger,
      deliverableName,
    });
    console.log(`[ad-shipper] Copy generated: "${copyResult.headline}" (revised: ${copyResult.reviewLog.revised})`);

    // Build landing page URL (from input or default)
    const rawLandingUrl = input.landingPageUrl || 'superpower.com';
    const landingUrl = rawLandingUrl.startsWith('http')
      ? rawLandingUrl
      : `https://${rawLandingUrl}`;

    // Append UTM parameters (Meta dynamic macros)
    const utmParams = 'utm_source=meta&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_content={{ad.name}}';
    const linkUrlWithUtm = landingUrl.includes('?')
      ? `${landingUrl}&${utmParams}`
      : `${landingUrl}?${utmParams}`;

    // Append landing page URL to primary text
    const primaryTextWithUrl = `${copyResult.primaryText}\n\n${landingUrl}`;

    // Step 5: If dry run, return here
    if (input.dryRun) {
      return {
        id,
        deliverableName,
        status: 'dry_run',
        primaryText: primaryTextWithUrl,
        headline: copyResult.headline,
        durationMs: Date.now() - start,
      };
    }

    // Step 6: Resolve adset (find existing or create new)
    const service = new AdCreatorService();
    const { adSetId, created: adSetCreated } = await resolveAdSet(
      service, input.campaignId, input.adSetName, adSetCache
    );

    // Step 7: Upload only 9:16 video to Meta (Meta handles Feed via video_auto_crop)
    const pageId = env.DEFAULT_PAGE_ID;
    if (!pageId) throw new Error('DEFAULT_PAGE_ID not configured');
    const instagramUserId = env.DEFAULT_INSTAGRAM_ACTOR_ID;

    const signedUrl = await getSignedUrl(gcsPath9x16);
    const videoRatio = video9x16 ? '9:16' : '4:5';
    const upload = await service.uploadVideo(signedUrl, `${deliverableName} - ${videoRatio}`);

    // Step 8: Create creative with video_auto_crop and ad
    const creative = await service.createPlacementMappedCreative({
      name: `${deliverableName} Creative`,
      pageId,
      instagramUserId,
      videos: [{ videoId: upload.videoId, thumbnailUrl: upload.thumbnailUrl, ratio: videoRatio }],
      primaryText: primaryTextWithUrl,
      headline: copyResult.headline,
      description: copyResult.description,
      callToAction: 'LEARN_MORE',
      linkUrl: linkUrlWithUtm,
    });

    const ad = await service.createAd({
      adset_id: adSetId,
      creative_id: creative.creativeId,
      name: deliverableName,
      status: 'PAUSED',
    });

    console.log(`[ad-shipper] Shipped "${deliverableName}": 1 ad, ${videoRatio} video + auto_crop`);

    return {
      id,
      deliverableName,
      status: 'shipped',
      primaryText: primaryTextWithUrl,
      headline: copyResult.headline,
      adIds: [ad.adId],
      creativeIds: [creative.creativeId],
      videoIds: [upload.videoId],
      adSetId,
      adSetCreated,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ad-shipper] Failed "${deliverableName}": ${errorMessage}`);

    return {
      id,
      deliverableName,
      status: 'failed',
      error: errorMessage,
      durationMs: Date.now() - start,
    };
  }
}
