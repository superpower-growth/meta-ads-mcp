import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  downloadFromUrl,
  detectUrlType,
  extractDriveFolderId,
  listDriveFolderFiles,
  downloadDriveFile,
  type DriveFileInfo,
} from '../lib/video-url-downloader.js';
import { uploadVideo, isGcpEnabled } from '../lib/gcs-storage.js';
import { analyzeVideoWithCostGuard, type VideoAnalysis } from '../lib/gemini-analyzer.js';
import { isGeminiEnabled } from '../lib/gemini-client.js';

const VIDEO_MIME_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
  'video/x-matroska', 'video/mpeg', 'video/3gpp', 'video/x-m4v',
]);

const AnalyzeVideoUrlSchema = z.object({
  videoUrl: z.string().url().describe('Video URL or Google Drive folder URL containing videos'),
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
  console.log(`[analyze-video-url] Processing ${urlType} URL...`);

  try {
    let download;
    let folderContents: { name: string; mimeType: string; aspectRatio?: string; width?: number; height?: number }[] | undefined;
    let analyzedFile: string | undefined;
    let folderId: string | undefined;

    if (urlType === 'google-drive-folder') {
      folderId = extractDriveFolderId(args.videoUrl);
      console.log(`[analyze-video-url] Listing files in Drive folder: ${folderId}`);
      const allFiles = await listDriveFolderFiles(folderId);
      const videos = allFiles.filter(f => VIDEO_MIME_TYPES.has(f.mimeType));

      folderContents = allFiles.map(f => ({
        name: f.name,
        mimeType: f.mimeType,
        aspectRatio: f.aspectRatio,
        width: f.width,
        height: f.height,
      }));

      if (videos.length === 0) {
        return JSON.stringify({
          error: 'No video files found in Google Drive folder.',
          folderContents,
          sourceUrl: args.videoUrl,
          urlType,
        }, null, 2);
      }

      const video = videos[0];
      analyzedFile = video.name;
      console.log(`[analyze-video-url] Found ${videos.length} video(s), analyzing: "${video.name}" (${video.mimeType}, ${video.aspectRatio || 'unknown ratio'})`);
      download = await downloadDriveFile(video.id);
    } else {
      download = await downloadFromUrl(args.videoUrl);
    }

    // Upload to GCS with a generated ID
    const videoId = `url_${Date.now()}`;
    const adId = 'url-upload';
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
    const estimatedDuration = 60;

    // Analyze with Gemini
    const analysis = await analyzeVideoWithCostGuard(gcsPath, estimatedDuration);

    console.log(`[analyze-video-url] Analysis complete: ${analysis.scenes.length} scenes`);

    return JSON.stringify({
      gcsPath,
      analysis,
      ...(folderContents && { folderContents }),
      ...(analyzedFile && { analyzedFile }),
      metadata: {
        sourceUrl: args.videoUrl,
        urlType,
        ...(folderId && { folderId }),
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
  description: 'Download a video from URL or Google Drive folder, upload to GCS, and analyze with Gemini AI. For Drive folders, lists ALL files with dimensions/aspect ratios (4:5, 9:16, etc.) and analyzes the most recent video. Returns structured video analysis including scenes, text overlays, emotional tone, and creative approach. Use BEFORE writing ad copy to understand video content.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      videoUrl: {
        type: 'string' as const,
        description: 'Video URL or Google Drive folder URL containing videos',
      },
      title: {
        type: 'string' as const,
        description: 'Optional title for the video',
      },
    },
    required: ['videoUrl'],
  },
};
