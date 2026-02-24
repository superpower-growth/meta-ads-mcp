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

const BatchAnalyzeSchema = z.object({
  adIds: z.array(z.string()).min(1).max(50).describe('Array of Meta Ad IDs to analyze (1-50)'),
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

  const settled = await Promise.allSettled(
    adIds.map((adId) => limit(() => analyzeVideoCreative({ adId, includeMetadata: true })))
  );

  let succeeded = 0;
  let failed = 0;
  let cached = 0;

  const results: BatchResult[] = settled.map((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      succeeded++;
      const parsed = JSON.parse(outcome.value);
      if (parsed.cacheStatus === 'hit') cached++;
      return { adId: adIds[i], status: 'fulfilled' as const, result: parsed };
    } else {
      failed++;
      return {
        adId: adIds[i],
        status: 'rejected' as const,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      };
    }
  });

  const response: BatchResponse = {
    results,
    summary: { total: adIds.length, succeeded, failed, cached },
  };

  return JSON.stringify(response, null, 2);
}

export const batchAnalyzeVideoCreativeTool: Tool = {
  name: 'batch-analyze-video-creative',
  description:
    'Analyze multiple video ad creatives in a single call. Processes ads in parallel (max 2 concurrent) using Gemini AI. Returns per-ad analysis results with scenes, text overlays, emotional tone, transcript, and spoken themes. Accepts 1-50 ad IDs.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      adIds: {
        type: 'array' as const,
        items: { type: 'string' as const },
        minItems: 1,
        maxItems: 50,
        description: 'Array of Meta Ad IDs to analyze',
      },
    },
    required: ['adIds'],
  },
};
