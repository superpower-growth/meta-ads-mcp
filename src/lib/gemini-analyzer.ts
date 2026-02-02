/**
 * Gemini Video Analysis Utilities
 *
 * Provides video ad content analysis using Gemini AI with structured JSON output.
 * Analyzes visual scenes, text overlays, emotional tone, and creative approach.
 */

import { geminiClient, isGeminiEnabled, geminiConfig } from './gemini-client.js';
import { z } from 'zod';
import { env } from '../config/env.js';

/**
 * Video analysis schema - defines the structure of analysis results
 */
const VideoAnalysisSchema = z.object({
  scenes: z.array(z.object({
    timestamp: z.string(), // MM:SS format
    description: z.string(),
    shotType: z.string(), // "close-up", "wide shot", "medium shot", etc.
    visualElements: z.array(z.string())
  })),
  textOverlays: z.array(z.object({
    timestamp: z.string(),
    text: z.string(),
    purpose: z.enum(['headline', 'subheading', 'cta', 'disclaimer', 'pricing', 'other'])
  })),
  emotionalTone: z.string(), // "aspirational", "humorous", "urgent", "educational", etc.
  creativeApproach: z.string(), // "problem-solution", "testimonial", "lifestyle", "product demo", etc.
  productPresentation: z.string(),
  callToAction: z.string(),
  targetAudienceIndicators: z.array(z.string()),
  keyMessages: z.array(z.string()) // Main value propositions
});

export type VideoAnalysis = z.infer<typeof VideoAnalysisSchema>;

/**
 * Gemini response schema (JSON Schema format for API)
 */
const geminiAnalysisSchema = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          timestamp: { type: 'string' },
          description: { type: 'string' },
          shotType: { type: 'string' },
          visualElements: { type: 'array', items: { type: 'string' } }
        },
        required: ['timestamp', 'description', 'shotType']
      }
    },
    textOverlays: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          timestamp: { type: 'string' },
          text: { type: 'string' },
          purpose: { type: 'string', enum: ['headline', 'subheading', 'cta', 'disclaimer', 'pricing', 'other'] }
        },
        required: ['timestamp', 'text', 'purpose']
      }
    },
    emotionalTone: { type: 'string' },
    creativeApproach: { type: 'string' },
    productPresentation: { type: 'string' },
    callToAction: { type: 'string' },
    targetAudienceIndicators: { type: 'array', items: { type: 'string' } },
    keyMessages: { type: 'array', items: { type: 'string' } }
  },
  required: ['scenes', 'textOverlays', 'emotionalTone', 'creativeApproach']
};

/**
 * Comprehensive video analysis prompt template
 */
const ANALYSIS_PROMPT = `Analyze this video advertisement comprehensively:

VISUAL ANALYSIS:
- Break down into distinct scenes with timestamps (MM:SS format)
- Identify shot types (close-up, wide shot, medium shot, etc.)
- Note key visual elements in each scene

TEXT ANALYSIS:
- Extract all text overlays with exact timestamps
- Identify purpose of each text element (headline, CTA, pricing, etc.)
- Note the exact text content

EMOTIONAL & CREATIVE ANALYSIS:
- Overall emotional tone (aspirational, humorous, urgent, educational, etc.)
- Creative approach (problem-solution, testimonial, lifestyle, product demo, etc.)
- Product presentation strategy
- Call-to-action elements and messaging
- Target audience indicators (age, lifestyle, interests)
- Key value propositions and messages

Format your response as structured JSON matching the schema provided.`;

/**
 * Retry configuration interface
 */
interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
}

/**
 * Retry an operation with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = { maxRetries: 3, baseDelayMs: 1000 }
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRateLimit = errorMessage.includes('429') || errorMessage.includes('quota');
      const isServerError = errorMessage.includes('500') || errorMessage.includes('503');

      if (!isRateLimit && !isServerError) {
        // Not a transient error, don't retry
        throw error;
      }

      if (attempt === options.maxRetries) {
        // Final attempt failed
        throw error;
      }

      // Exponential backoff
      const delayMs = options.baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`Retry attempt ${attempt}/${options.maxRetries} after ${delayMs}ms: ${errorMessage}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError!;
}

/**
 * Parse JSON response with markdown code block handling
 */
function parseJsonResponse(responseText: string): any {
  let cleaned = responseText.trim();

  // Remove markdown code blocks if present
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    cleaned = lines.slice(1, -1).join('\n');
    if (cleaned.startsWith('json')) {
      cleaned = cleaned.substring(4).trim();
    }
  }

  return JSON.parse(cleaned);
}

/**
 * Analyze video content using Gemini AI (internal implementation without retry)
 *
 * @param gcsPath - Path to video file in Google Cloud Storage (gs://bucket/path)
 * @returns Structured analysis of video content
 * @throws Error if Gemini not enabled or analysis fails
 */
async function analyzeVideoInternal(gcsPath: string): Promise<VideoAnalysis> {
  console.log(`Starting video analysis for: ${gcsPath}`);

  // Upload video to Gemini Files API
  const uploadedFile = await geminiClient!.files.upload({
    file: gcsPath,
    config: {
      mimeType: 'video/mp4'
    }
  });

  console.log(`Video uploaded to Files API: ${uploadedFile.uri}`);

  // Generate analysis with structured output
  const response = await geminiClient!.models.generateContent({
    model: geminiConfig.model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            fileData: {
              mimeType: uploadedFile.mimeType,
              fileUri: uploadedFile.uri
            }
          },
          {
            text: ANALYSIS_PROMPT
          }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: geminiAnalysisSchema
    }
  });

  // Extract response text
  const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText) {
    throw new Error('No response text from Gemini API');
  }

  console.log(`Received analysis response (${responseText.length} chars)`);

  // Parse and validate response
  const parsed = parseJsonResponse(responseText);
  const validated = VideoAnalysisSchema.parse(parsed);

  console.log(`Analysis completed: ${validated.scenes.length} scenes, ${validated.textOverlays.length} text overlays`);

  return validated;
}

/**
 * Analyze video content using Gemini AI with retry logic
 *
 * @param gcsPath - Path to video file in Google Cloud Storage (gs://bucket/path)
 * @returns Structured analysis of video content
 * @throws Error if Gemini not enabled or analysis fails
 */
export async function analyzeVideo(gcsPath: string): Promise<VideoAnalysis> {
  if (!isGeminiEnabled()) {
    throw new Error('Gemini client not initialized. Check GEMINI_API_KEY or Vertex AI setup.');
  }

  try {
    // Wrap analysis in retry logic
    return await retryWithBackoff(
      () => analyzeVideoInternal(gcsPath),
      { maxRetries: 3, baseDelayMs: 2000 } // 2s, 4s, 8s backoff
    );
  } catch (error) {
    // Enhanced error logging
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('429') || errorMessage.includes('quota')) {
      console.error(`Rate limit hit for ${gcsPath}. Consider upgrading tier or reducing request rate.`);
    } else if (errorMessage.includes('auth') || errorMessage.includes('permission')) {
      console.error(`Authentication failed for ${gcsPath}. Check GEMINI_API_KEY or service account permissions.`);
    } else {
      console.error(`Analysis failed for ${gcsPath}: ${errorMessage}`);
    }

    throw error;
  }
}

/**
 * Estimate the cost of analyzing a video
 *
 * @param videoDurationSeconds - Duration of video in seconds
 * @returns Estimated cost in USD
 */
export function estimateAnalysisCost(videoDurationSeconds: number): number {
  // Video processing parameters
  const framesPerSecond = 1; // Default FPS for Gemini video processing
  const tokensPerFrame = 258; // Standard resolution token count

  // Calculate input tokens
  const inputTokens = videoDurationSeconds * framesPerSecond * tokensPerFrame;

  // Estimate output tokens (typically ~1K for structured analysis)
  const outputTokens = 1000;

  // Model pricing (per 1M tokens)
  const pricing = geminiConfig.model === 'gemini-2.5-flash'
    ? { input: 0.30, output: 2.50 }
    : { input: 1.25, output: 10.00 }; // Pro pricing

  // Calculate total cost
  const cost = (inputTokens / 1_000_000) * pricing.input +
               (outputTokens / 1_000_000) * pricing.output;

  return cost;
}

/**
 * Analyze video with cost guard to prevent expensive analyses
 *
 * @param gcsPath - Path to video file in Google Cloud Storage (gs://bucket/path)
 * @param videoDurationSeconds - Duration of video in seconds
 * @returns Structured analysis of video content
 * @throws Error if estimated cost exceeds maximum or analysis fails
 */
export async function analyzeVideoWithCostGuard(
  gcsPath: string,
  videoDurationSeconds: number
): Promise<VideoAnalysis> {
  const estimatedCost = estimateAnalysisCost(videoDurationSeconds);

  if (estimatedCost > env.GEMINI_MAX_COST_PER_ANALYSIS) {
    throw new Error(
      `Estimated analysis cost ($${estimatedCost.toFixed(4)}) exceeds maximum ($${env.GEMINI_MAX_COST_PER_ANALYSIS}). ` +
      `Video duration: ${videoDurationSeconds}s. Consider using lower resolution or adjusting GEMINI_MAX_COST_PER_ANALYSIS.`
    );
  }

  console.log(`Estimated analysis cost: $${estimatedCost.toFixed(4)} for ${videoDurationSeconds}s video (model: ${geminiConfig.model})`);
  return analyzeVideo(gcsPath);
}

// Export schema for external use
export { VideoAnalysisSchema };
