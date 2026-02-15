import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { downloadFromUrl, detectUrlType } from '../lib/video-url-downloader.js';
import { uploadVideo, isGcpEnabled } from '../lib/gcs-storage.js';
import { analyzeVideoWithCostGuard, type VideoAnalysis } from '../lib/gemini-analyzer.js';
import { isGeminiEnabled } from '../lib/gemini-client.js';

const AnalyzeVideoUrlSchema = z.object({
  videoUrl: z.string().url().describe('Video URL (Google Drive, Dropbox, or direct link)'),
  title: z.string().optional().describe('Optional title for the video'),
});

export async function analyzeVideoUrl(input: unknown): Promise<string> {
  const args = AnalyzeVideoUrlSchema.parse(input);

  // Check prerequisites
  if (!isGcpEnabled) {
    return JSON.stringify({
      error: 'GCP not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON for video features.',
    }, null, 2);
  }

  if (!isGeminiEnabled()) {
    return JSON.stringify({
      error: 'Gemini AI not configured. Set GEMINI_API_KEY or configure Vertex AI.',
    }, null, 2);
  }

  const urlType = detectUrlType(args.videoUrl);
  console.log(`[analyze-video-url] Downloading video from ${urlType} URL...`);

  try {
    // Download video
    const download = await downloadFromUrl(args.videoUrl);

    // Upload to GCS with a generated ID
    const videoId = `url_${Date.now()}`;
    const adId = 'url-upload'; // Not from Meta, use placeholder
    const gcsPath = await uploadVideo(download.stream, adId, videoId, {
      contentType: download.contentType,
      metadata: {
        sourceUrl: args.videoUrl,
        urlType,
        title: args.title || 'Untitled',
      },
    });

    console.log(`[analyze-video-url] Video uploaded to GCS: ${gcsPath}`);

    // Estimate duration - for URL uploads we don't know duration, use a reasonable default
    // The cost guard will protect against very long videos
    const estimatedDuration = 60; // assume 60s for cost estimation

    // Analyze with Gemini
    const analysis = await analyzeVideoWithCostGuard(gcsPath, estimatedDuration);

    console.log(`[analyze-video-url] Analysis complete: ${analysis.scenes.length} scenes`);

    return JSON.stringify({
      gcsPath,
      analysis,
      metadata: {
        sourceUrl: args.videoUrl,
        urlType,
        title: args.title || 'Untitled',
        estimatedDuration,
      },
    }, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[analyze-video-url] Error: ${errorMessage}`);
    return JSON.stringify({
      error: `Failed to analyze video: ${errorMessage}`,
      sourceUrl: args.videoUrl,
      urlType,
    }, null, 2);
  }
}

export const analyzeVideoUrlTool: Tool = {
  name: 'analyze-video-url',
  description: 'Download a video from URL (Google Drive, Dropbox, or direct link), upload to GCS, and analyze with Gemini AI. Returns structured video analysis including scenes, text overlays, emotional tone, and creative approach. Use BEFORE writing ad copy to understand video content.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      videoUrl: {
        type: 'string' as const,
        description: 'Video URL (Google Drive, Dropbox, or direct link)',
      },
      title: {
        type: 'string' as const,
        description: 'Optional title for the video',
      },
    },
    required: ['videoUrl'],
  },
};
