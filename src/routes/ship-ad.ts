import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { downloadFromUrl, detectUrlType } from '../lib/video-url-downloader.js';
import { uploadVideo as uploadToGcs, isGcpEnabled } from '../lib/gcs-storage.js';
import { storage } from '../lib/gcp-clients.js';
import { AdCreatorService } from '../meta/ad-creator.js';

const ShipAdRequestSchema = z.object({
  adName: z.string().min(1),
  assetUrl: z.string().url(),
  landingPageUrl: z.string().url(),
  mediaType: z.string(),
  primaryText: z.string().optional(),
  headline: z.string().optional(),
  campaignName: z.string().optional(),
  adSetName: z.string().optional(),
  campaignId: z.string().optional(),
  adSetId: z.string().optional(),
  callToAction: z.string().optional(),
});

type PipelineStep = 'validate' | 'resolve_campaign' | 'resolve_adset' | 'upload_video' | 'create_creative' | 'create_ad';

const router = Router();

router.post('/ship-ad', async (req: Request, res: Response) => {
  // Auth: check API key
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!env.SHIP_AD_API_KEY || apiKey !== env.SHIP_AD_API_KEY) {
    res.status(401).json({ success: false, error: 'Invalid or missing API key', step: 'validate' as PipelineStep });
    return;
  }

  let step: PipelineStep = 'validate';

  try {
    const body = ShipAdRequestSchema.parse(req.body);

    // Reject non-video media types for MVP
    const mediaTypeLower = body.mediaType.toLowerCase();
    if (mediaTypeLower !== 'video' && mediaTypeLower !== 'motion') {
      res.status(400).json({
        success: false,
        error: `Media type "${body.mediaType}" not supported in MVP. Only video and motion are supported.`,
        step: 'validate' as PipelineStep,
      });
      return;
    }

    if (!isGcpEnabled) {
      res.status(500).json({
        success: false,
        error: 'GCP not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON for video upload.',
        step: 'validate' as PipelineStep,
      });
      return;
    }

    const pageId = env.DEFAULT_PAGE_ID;
    if (!pageId) {
      res.status(500).json({
        success: false,
        error: 'DEFAULT_PAGE_ID not configured.',
        step: 'validate' as PipelineStep,
      });
      return;
    }

    const service = new AdCreatorService();

    // Resolve campaign ID: direct ID > name lookup > default
    step = 'resolve_campaign';
    let campaignId = body.campaignId;
    if (!campaignId && body.campaignName) {
      console.log(`[ship-ad] Looking up campaign by name: "${body.campaignName}"`);
      const campaign = await service.findCampaignByName(body.campaignName);
      if (!campaign) {
        res.status(400).json({
          success: false,
          error: `Campaign not found: "${body.campaignName}"`,
          step,
        });
        return;
      }
      campaignId = campaign.id;
      console.log(`[ship-ad] Resolved campaign "${body.campaignName}" → ${campaignId}`);
    }
    if (!campaignId) {
      campaignId = env.DEFAULT_CAMPAIGN_ID;
    }
    if (!campaignId) {
      res.status(400).json({
        success: false,
        error: 'No campaign specified. Provide campaignName, campaignId, or set DEFAULT_CAMPAIGN_ID.',
        step,
      });
      return;
    }

    // Resolve ad set ID: direct ID > name lookup (auto-create if missing) > default
    step = 'resolve_adset';
    let adSetId = body.adSetId;
    let adSetCreated = false;
    if (!adSetId && body.adSetName) {
      console.log(`[ship-ad] Looking up ad set by name: "${body.adSetName}" in campaign ${campaignId}`);
      const existing = await service.findAdSetByName(campaignId, body.adSetName);
      if (existing) {
        adSetId = existing.id;
        console.log(`[ship-ad] Found existing ad set "${body.adSetName}" → ${adSetId}`);
      } else {
        // Auto-create: clone settings from an existing ad set in the campaign
        console.log(`[ship-ad] Ad set "${body.adSetName}" not found, creating...`);
        const clonedSettings = await service.cloneAdSetSettings(campaignId);
        if (!clonedSettings) {
          res.status(400).json({
            success: false,
            error: `Cannot auto-create ad set: no existing ad sets in campaign ${campaignId} to clone settings from.`,
            step,
          });
          return;
        }

        const newAdSet = await service.createAdSet({
          campaign_id: campaignId,
          name: body.adSetName,
          status: 'PAUSED',
          billing_event: clonedSettings.billing_event,
          optimization_goal: clonedSettings.optimization_goal,
          targeting: clonedSettings.targeting,
          daily_budget: clonedSettings.daily_budget,
          lifetime_budget: clonedSettings.lifetime_budget,
          promoted_object: clonedSettings.promoted_object,
        });
        adSetId = newAdSet.adSetId;
        adSetCreated = true;
        console.log(`[ship-ad] Created new ad set "${body.adSetName}" → ${adSetId}`);
      }
    }
    if (!adSetId) {
      adSetId = env.DEFAULT_AD_SET_ID;
    }
    if (!adSetId) {
      res.status(400).json({
        success: false,
        error: 'No ad set specified. Provide adSetName, adSetId, or set DEFAULT_AD_SET_ID.',
        step,
      });
      return;
    }

    // Step 1: Download video → GCS → signed URL → Meta upload
    step = 'upload_video';
    const urlType = detectUrlType(body.assetUrl);
    console.log(`[ship-ad] Downloading video from ${urlType} URL: ${body.assetUrl}`);

    const download = await downloadFromUrl(body.assetUrl);

    const tempVideoId = `ship_${Date.now()}`;
    const gcsPath = await uploadToGcs(download.stream, 'ship-ad', tempVideoId, {
      contentType: download.contentType,
      metadata: {
        sourceUrl: body.assetUrl,
        adName: body.adName,
      },
    });

    console.log(`[ship-ad] Video staged in GCS: ${gcsPath}`);

    const bucket = storage!.bucket(env.GCS_BUCKET_NAME);
    const file = bucket.file(gcsPath);
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    const videoResult = await service.uploadVideo(signedUrl, body.adName);
    console.log(`[ship-ad] Video uploaded to Meta: ${videoResult.videoId}`);

    // Step 2: Create ad creative
    step = 'create_creative';
    const creativeResult = await service.createAdCreative({
      name: `${body.adName} - Creative`,
      pageId: pageId,
      instagramActorId: env.DEFAULT_INSTAGRAM_ACTOR_ID,
      videoId: videoResult.videoId,
      primaryText: body.primaryText || body.adName,
      headline: body.headline,
      callToAction: body.callToAction || 'LEARN_MORE',
      linkUrl: body.landingPageUrl,
    });
    console.log(`[ship-ad] Creative created: ${creativeResult.creativeId}`);

    // Step 3: Create ad (PAUSED)
    step = 'create_ad';
    const adResult = await service.createAd({
      adset_id: adSetId,
      creative_id: creativeResult.creativeId,
      name: body.adName,
      status: 'PAUSED',
    });
    console.log(`[ship-ad] Ad created: ${adResult.adId}`);

    res.json({
      success: true,
      adId: adResult.adId,
      creativeId: creativeResult.creativeId,
      videoId: videoResult.videoId,
      campaignId,
      adSetId,
      adSetCreated,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ship-ad] Error at step "${step}": ${errorMessage}`);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: `Validation error: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        step: 'validate' as PipelineStep,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      step,
    });
  }
});

export default router;
