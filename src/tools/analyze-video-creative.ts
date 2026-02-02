/**
 * Analyze Video Creative Tool
 *
 * MCP tool for analyzing video ad creative content using Gemini AI.
 * Returns structured insights including scenes, text overlays, emotional tone,
 * creative approach, and target audience indicators.
 *
 * Integrates video download pipeline (Phase 12) and Gemini analysis (Phase 13)
 * into conversational MCP interface for Claude Code users.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { downloadAndUploadVideo, getVideoMetadata } from '../lib/video-downloader.js';
import { analyzeVideoWithCostGuard, estimateAnalysisCost, type VideoAnalysis } from '../lib/gemini-analyzer.js';
import { isGeminiEnabled } from '../lib/gemini-client.js';

/**
 * Input schema for analyze-video-creative tool
 *
 * Validates ad ID and metadata inclusion preference.
 */
export const AnalyzeVideoCreativeSchema = z.object({
  adId: z.string().describe('Meta Ad ID to analyze video creative for'),
  includeMetadata: z.boolean().default(true).describe('Include video metadata (duration, thumbnail URL) in response'),
});

export type AnalyzeVideoCreativeInput = z.infer<typeof AnalyzeVideoCreativeSchema>;

/**
 * Response interface for video creative analysis
 */
interface AnalyzeVideoCreativeResponse {
  adId: string;
  videoId: string | null;
  analysis: VideoAnalysis | null;
  metadata?: {
    duration: number;
    thumbnailUrl: string;
    gcsPath: string;
  };
  message?: string; // For non-video ads or errors
}

/**
 * Analyze video ad creative content using Gemini AI
 *
 * Orchestrates the complete analysis pipeline:
 * 1. Checks if Gemini is configured
 * 2. Gets video metadata from Meta API
 * 3. Downloads video and uploads to GCS
 * 4. Analyzes video with Gemini AI (with cost guard)
 * 5. Returns structured analysis or graceful error messages
 *
 * @param input - Tool arguments (adId, includeMetadata)
 * @returns Structured analysis response with video insights or error message
 */
export async function analyzeVideoCreative(input: unknown): Promise<string> {
  // Validate input
  const args = AnalyzeVideoCreativeSchema.parse(input);

  try {
    // Check if Gemini is enabled
    if (!isGeminiEnabled()) {
      const response: AnalyzeVideoCreativeResponse = {
        adId: args.adId,
        videoId: null,
        analysis: null,
        message: 'Gemini AI not configured. Please set GEMINI_API_KEY or configure Vertex AI.'
      };
      return JSON.stringify(response, null, 2);
    }

    // Get video metadata
    const metadata = await getVideoMetadata(args.adId);
    if (!metadata) {
      const response: AnalyzeVideoCreativeResponse = {
        adId: args.adId,
        videoId: null,
        analysis: null,
        message: 'Ad is not a video ad or video metadata unavailable.'
      };
      return JSON.stringify(response, null, 2);
    }

    // Log cost estimation before analysis
    const estimatedCost = estimateAnalysisCost(metadata.duration);
    console.log(`Analyzing video ${metadata.videoId} for ad ${args.adId}: estimated cost $${estimatedCost.toFixed(4)} (${metadata.duration}s)`);

    // Download and upload video to GCS
    const gcsPath = await downloadAndUploadVideo(args.adId);
    if (!gcsPath) {
      const response: AnalyzeVideoCreativeResponse = {
        adId: args.adId,
        videoId: metadata.videoId,
        analysis: null,
        message: 'Failed to download video from Meta API or upload to GCS.'
      };
      console.error(`Video download/upload failed for ad ${args.adId}, video ${metadata.videoId}`);
      return JSON.stringify(response, null, 2);
    }

    // Analyze video with cost guard
    let analysis: VideoAnalysis;
    try {
      analysis = await analyzeVideoWithCostGuard(gcsPath, metadata.duration);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for cost guard rejection
      if (errorMessage.includes('exceeds maximum')) {
        const response: AnalyzeVideoCreativeResponse = {
          adId: args.adId,
          videoId: metadata.videoId,
          analysis: null,
          message: `Analysis cost too high: ${errorMessage}`
        };
        return JSON.stringify(response, null, 2);
      }

      // Check for rate limit
      if (errorMessage.includes('429') || errorMessage.includes('quota')) {
        console.error(`Rate limit hit for video ${metadata.videoId}, ad ${args.adId}`);
        const response: AnalyzeVideoCreativeResponse = {
          adId: args.adId,
          videoId: metadata.videoId,
          analysis: null,
          message: 'Gemini API rate limit reached. Please try again later or upgrade your API tier.'
        };
        return JSON.stringify(response, null, 2);
      }

      // Generic analysis error
      console.error(`Analysis failed for video ${metadata.videoId}, ad ${args.adId}: ${errorMessage}`);
      throw error;
    }

    // Validate analysis structure
    if (!analysis.scenes || !analysis.textOverlays || !analysis.emotionalTone) {
      console.warn(`Incomplete analysis for video ${metadata.videoId}, ad ${args.adId}: missing required fields`);
      const response: AnalyzeVideoCreativeResponse = {
        adId: args.adId,
        videoId: metadata.videoId,
        analysis: null,
        message: 'Analysis incomplete - missing required fields in Gemini response'
      };
      return JSON.stringify(response, null, 2);
    }

    // Log success
    console.log(`Successfully analyzed video ${metadata.videoId} for ad ${args.adId}: ${analysis.scenes.length} scenes, ${analysis.textOverlays.length} text overlays`);

    // Build response
    const response: AnalyzeVideoCreativeResponse = {
      adId: args.adId,
      videoId: metadata.videoId,
      analysis,
    };

    if (args.includeMetadata) {
      response.metadata = {
        duration: metadata.duration,
        thumbnailUrl: metadata.thumbnailUrl,
        gcsPath,
      };
    }

    return JSON.stringify(response, null, 2);
  } catch (error) {
    // Format error messages for user clarity
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error analyzing video creative for ad ${args.adId}: ${errorMessage}`);

    const response: AnalyzeVideoCreativeResponse = {
      adId: args.adId,
      videoId: null,
      analysis: null,
      message: `Error analyzing video creative: ${errorMessage}`
    };
    return JSON.stringify(response, null, 2);
  }
}

/**
 * MCP Tool definition for analyze-video-creative
 */
export const analyzeVideoCreativeTool: Tool = {
  name: 'analyze-video-creative',
  description: 'Analyze video ad creative content using Gemini AI. Returns structured insights including scenes, text overlays, emotional tone, creative approach, and target audience indicators. Requires Gemini API key or Vertex AI configuration.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      adId: {
        type: 'string' as const,
        description: 'Meta Ad ID to analyze video creative for',
      },
      includeMetadata: {
        type: 'boolean' as const,
        description: 'Include video metadata (duration, thumbnail URL) in response',
        default: true,
      },
    },
    required: ['adId'],
  },
};
