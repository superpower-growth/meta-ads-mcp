/**
 * Batch Analyze Video Creative Tool
 *
 * Processes multiple ad IDs through analyze-video-creative in parallel
 * with concurrency limiting to respect Meta API and Gemini rate limits.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import pLimit from 'p-limit';
import { analyzeVideoCreative } from './analyze-video-creative.js';

const AdEntry = z.union([
  z.string(),
  z.object({
    adId: z.string(),
    creativeId: z.string().optional(),
  }),
]);

const BatchAnalyzeSchema = z.object({
  adIds: z.array(AdEntry).min(1).max(50).describe(
    'Array of ad IDs (strings) or objects with {adId, creativeId}. Pass creativeId for ads with permission issues.'
  ),
});

interface BatchResult {
  adId: string;
  status: 'fulfilled' | 'rejected';
  result?: unknown;
  error?: string;
}

interface BatchResponse {
  results: BatchResult[];
  summary: { total: number; succeeded: number; failed: number; cached: number };
}

/**
 * Analyze multiple video ad creatives in parallel with concurrency limiting.
 *
 * Uses pLimit(2) to run at most 2 ads concurrently — each ad makes 3-4 Meta API
 * calls plus a Gemini call, so this keeps load reasonable. Gemini concurrency is
 * separately gated by the existing analysisLimit pLimit(2) in gemini-analyzer.ts.
 */
export async function batchAnalyzeVideoCreative(input: unknown): Promise<string> {
  const { adIds } = BatchAnalyzeSchema.parse(input);
  const limit = pLimit(2);

  // Normalize entries to {adId, creativeId?}
  const entries = adIds.map((entry) =>
    typeof entry === 'string' ? { adId: entry } : entry
  );

  const settled = await Promise.allSettled(
    entries.map((entry) =>
      limit(() => analyzeVideoCreative({
        adId: entry.adId,
        creativeId: entry.creativeId,
        includeMetadata: true,
      }))
    )
  );

  let succeeded = 0;
  let failed = 0;
  let cached = 0;

  const results: BatchResult[] = settled.map((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      succeeded++;
      const parsed = JSON.parse(outcome.value);
      if (parsed.cacheStatus === 'hit') cached++;
      return { adId: entries[i].adId, status: 'fulfilled' as const, result: parsed };
    } else {
      failed++;
      return {
        adId: entries[i].adId,
        status: 'rejected' as const,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      };
    }
  });

  const response: BatchResponse = {
    results,
    summary: { total: entries.length, succeeded, failed, cached },
  };

  return JSON.stringify(response, null, 2);
}

export const batchAnalyzeVideoCreativeTool: Tool = {
  name: 'batch-analyze-video-creative',
  description:
    'Analyze multiple video ad creatives in a single call. Processes ads in parallel (max 2 concurrent) using Gemini AI. Returns per-ad analysis results with scenes, text overlays, emotional tone, transcript, and spoken themes. Accepts 1-50 entries as ad ID strings or {adId, creativeId} objects. Pass creativeId for ads with permission issues (archived/restricted).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      adIds: {
        type: 'array' as const,
        items: {
          oneOf: [
            { type: 'string' as const, description: 'Meta Ad ID' },
            {
              type: 'object' as const,
              properties: {
                adId: { type: 'string' as const, description: 'Meta Ad ID' },
                creativeId: { type: 'string' as const, description: 'Creative ID for fallback access' },
              },
              required: ['adId'],
            },
          ],
        },
        minItems: 1,
        maxItems: 50,
        description: 'Array of ad IDs (strings) or {adId, creativeId} objects',
      },
    },
    required: ['adIds'],
  },
};
