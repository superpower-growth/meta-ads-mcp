/**
 * Get Ad Performance Tool
 *
 * MCP tool for querying individual ad creative performance metrics including
 * CTR, CPC, ROAS, and basic video completion rates for a specified date range.
 *
 * Ads are the most granular level, representing individual creative units.
 * Exposes Meta Insights API capabilities through conversational interface.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { parseRoas, parseActions } from '../lib/parsers.js';
import { resolveActionType } from '../lib/custom-conversions.js';
import { env } from '../config/env.js';
import { getVideoMetadata } from '../lib/video-downloader.js';
import { getCached } from '../lib/firestore-cache.js';
import { type VideoAnalysis } from '../lib/gemini-analyzer.js';
import { isGeminiEnabled } from '../lib/gemini-client.js';

/**
 * Custom date range schema
 */
const CustomDateRangeSchema = z.object({
  since: z.string().describe('Start date in YYYY-MM-DD format'),
  until: z.string().describe('End date in YYYY-MM-DD format'),
});

/**
 * Input schema for get-ad-performance tool
 *
 * Validates date range, optional ad ID filter, and metric selection.
 */
const GetAdPerformanceSchema = z.object({
  dateRange: z
    .union([
      z.enum(['last_7d', 'last_30d', 'last_90d', 'this_month']),
      CustomDateRangeSchema,
    ])
    .default('last_7d')
    .describe(
      'Date range preset or custom date range {since: "YYYY-MM-DD", until: "YYYY-MM-DD"}'
    ),
  adId: z
    .string()
    .optional()
    .describe('Optional ad ID to filter results (queries all ads if omitted)'),
  metrics: z
    .array(
      z.enum([
        'impressions',
        'clicks',
        'spend',
        'ctr',
        'cpc',
        'cpm',
        'purchase_roas',
        'reach',
      ])
    )
    .default(['impressions', 'clicks', 'spend', 'ctr', 'cpc'])
    .describe('Metrics to include in response'),
  customActions: z
    .array(z.string())
    .optional()
    .describe(
      'Custom conversion action types to retrieve (e.g., ["subscription_created", "registration_started"])'
    ),
  includeActionValues: z
    .boolean()
    .default(false)
    .describe('Include action value amounts (purchase value, etc.)'),
  attributionWindows: z
    .array(z.enum(['1d_click', '7d_click', '28d_click', '1d_view']))
    .default(['7d_click', '1d_view'])
    .describe('Attribution windows for conversion tracking. Options: 1d_click, 7d_click (default), 28d_click, 1d_view'),
  includeVideoAnalysis: z
    .boolean()
    .default(false)
    .describe('Include AI-powered video creative analysis using Gemini (adds scenes, text overlays, emotional tone, creative approach)'),
});

type GetAdPerformanceInput = z.infer<typeof GetAdPerformanceSchema>;

/**
 * Ad performance response format
 */
interface AdPerformance {
  dateRange: string;
  ads: Array<{
    id: string;
    name: string;
    period: string;
    metrics: Record<string, number>;
    videoCreative?: {
      videoId: string | null;
      analysis: VideoAnalysis | null;
      cacheStatus?: 'hit' | 'miss' | 'unavailable';
      message?: string;
    };
  }>;
}

/**
 * Query ad performance metrics from Meta Insights API
 *
 * Optionally enriches response with video creative analysis when includeVideoAnalysis=true.
 * Video analysis returns cached results only (no on-demand analysis in performance queries).
 * Use analyze-video-creative tool to analyze videos first, then query performance with enrichment.
 *
 * @param args - Tool arguments (dateRange, adId, metrics, includeVideoAnalysis)
 * @returns Pretty-printed JSON with ad metrics and optional video creative insights
 */
export async function getAdPerformance(args: unknown): Promise<string> {
  // Validate input
  const input = GetAdPerformanceSchema.parse(args);

  try {
    // Initialize MetricsService with account ID from environment
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Determine fields to request
    const fields = [...input.metrics];

    // Always include ad_id and ad_name for ad-level queries
    if (!fields.includes('ad_id' as any)) {
      fields.push('ad_id' as any);
    }
    if (!fields.includes('ad_name' as any)) {
      fields.push('ad_name' as any);
    }

    // Add action-related fields if custom actions requested
    if (input.customActions && input.customActions.length > 0) {
      if (!fields.includes('actions' as any)) {
        fields.push('actions' as any);
      }
      if (!fields.includes('cost_per_action_type' as any)) {
        fields.push('cost_per_action_type' as any);
      }
      if (input.includeActionValues && !fields.includes('action_values' as any)) {
        fields.push('action_values' as any);
      }
    }

    // Prepare query parameters
    const params: any = {
      level: 'ad' as const,
      time_increment: 'all_days' as const, // Single aggregated result per ad
      action_attribution_windows: input.attributionWindows,
    };

    // Handle date range (preset or custom)
    if (typeof input.dateRange === 'string') {
      params.date_preset = input.dateRange;
    } else {
      params.time_range = {
        since: input.dateRange.since,
        until: input.dateRange.until,
      };
    }

    // Query insights from Meta API with automatic pagination
    const insights = await metricsService.getAllInsights(fields, params);

    // Filter to specific ad if requested
    let filteredInsights = insights;
    if (input.adId) {
      filteredInsights = insights.filter(
        (insight) => insight.ad_id === input.adId
      );

      // Return error if ad not found
      if (filteredInsights.length === 0) {
        return `Ad ${input.adId} not found in date range ${input.dateRange}`;
      }
    }

    // Return message if no ads found
    if (filteredInsights.length === 0) {
      return `No ads found for date range ${input.dateRange}`;
    }

    // Format response
    const response: AdPerformance = {
      dateRange:
        typeof input.dateRange === 'string'
          ? input.dateRange
          : `${input.dateRange.since} to ${input.dateRange.until}`,
      ads: filteredInsights.map((insight) => {
        // Build metrics object from requested fields
        const metrics: Record<string, number> = {};

        // Parse standard numeric metrics
        if (input.metrics.includes('impressions') && insight.impressions) {
          metrics.impressions = parseInt(insight.impressions, 10);
        }
        if (input.metrics.includes('clicks') && insight.clicks) {
          metrics.clicks = parseInt(insight.clicks, 10);
        }
        if (input.metrics.includes('spend') && insight.spend) {
          metrics.spend = parseFloat(insight.spend);
        }
        if (input.metrics.includes('ctr') && insight.ctr) {
          metrics.ctr = parseFloat(insight.ctr);
        }
        if (input.metrics.includes('cpc') && insight.cpc) {
          metrics.cpc = parseFloat(insight.cpc);
        }
        if (input.metrics.includes('cpm') && insight.cpm) {
          metrics.cpm = parseFloat(insight.cpm);
        }
        if (input.metrics.includes('reach') && insight.reach) {
          metrics.reach = parseInt(insight.reach, 10);
        }

        // Parse ROAS if requested (using parser utility)
        if (input.metrics.includes('purchase_roas')) {
          const roas = parseRoas(insight);
          if (roas.purchase > 0) {
            metrics.purchase_roas = roas.purchase;
          }
        }

        // Parse custom actions if requested
        if (input.customActions && input.customActions.length > 0) {
          const actions = parseActions(insight.actions || [], input.attributionWindows);
          const costPerActions = parseActions(
            insight.cost_per_action_type || [],
            input.attributionWindows
          );
          const actionValues = input.includeActionValues
            ? parseActions(insight.action_values || [], input.attributionWindows)
            : {};

          // Extract requested custom action values
          for (const actionName of input.customActions) {
            const actionType = resolveActionType(actionName);

            // Add action count
            if (actions[actionType] !== undefined) {
              metrics[actionName] = actions[actionType];
            }

            // Add cost per action
            if (costPerActions[actionType] !== undefined) {
              metrics[`cost_per_${actionName}`] = costPerActions[actionType];
            }

            // Add action value if requested
            if (input.includeActionValues && actionValues[actionType] !== undefined) {
              metrics[`${actionName}_value`] = actionValues[actionType];
            }
          }
        }

        return {
          id: insight.ad_id || '',
          // Handle missing ad_name gracefully (some ads may not have names)
          name: insight.ad_name || `Ad ${insight.ad_id || 'Unknown'}`,
          period: `${insight.date_start} to ${insight.date_stop}`,
          metrics,
        };
      }),
    };

    // Optionally enrich with video creative analysis
    if (input.includeVideoAnalysis) {
      console.log(`Video analysis enrichment requested for ${response.ads.length} ad(s)`);

      // Check if Gemini is configured
      if (!isGeminiEnabled()) {
        console.warn('Video analysis requested but Gemini not configured');
        // Add warning to first ad only (avoid spam)
        if (response.ads.length > 0) {
          response.ads[0].videoCreative = {
            videoId: null,
            analysis: null,
            message: 'Gemini AI not configured. Set GEMINI_API_KEY or configure Vertex AI.',
          };
        }
      } else {
        // Analyze each ad's video creative
        for (const ad of response.ads) {
          try {
            // Get video metadata to check if it's a video ad
            const metadata = await getVideoMetadata(ad.id);

            if (!metadata) {
              // Not a video ad
              ad.videoCreative = {
                videoId: null,
                analysis: null,
                message: 'Not a video ad',
              };
              continue;
            }

            // Check cache first
            const cachedEntry = await getCached(metadata.videoId);

            if (cachedEntry) {
              // Cache hit
              ad.videoCreative = {
                videoId: metadata.videoId,
                analysis: cachedEntry.analysisResults,
                cacheStatus: 'hit',
              };
              console.log(`Cache HIT for video ${metadata.videoId} in ad ${ad.id}`);
            } else {
              // Cache miss - skip analysis in performance query to avoid long delays
              // User should use analyze-video-creative tool directly for first analysis
              ad.videoCreative = {
                videoId: metadata.videoId,
                analysis: null,
                cacheStatus: 'miss',
                message: 'Video not analyzed yet. Use analyze-video-creative tool to analyze first.',
              };
              console.log(`Cache MISS for video ${metadata.videoId} in ad ${ad.id} - skipping analysis in performance query`);
            }
          } catch (error) {
            // Don't fail the entire query if video analysis fails
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Failed to analyze video for ad ${ad.id}:`, errorMessage);
            ad.videoCreative = {
              videoId: null,
              analysis: null,
              message: `Video analysis failed: ${errorMessage}`,
            };
          }
        }
      }
    }

    // Return pretty-printed JSON for Claude consumption
    return JSON.stringify(response, null, 2);
  } catch (error) {
    // Format error messages for user clarity
    if (error instanceof Error) {
      return `Error querying ad performance: ${error.message}`;
    }
    return 'Unknown error occurred while querying ad performance';
  }
}

/**
 * MCP Tool definition for get-ad-performance
 */
export const getAdPerformanceTool: Tool = {
  name: 'get-ad-performance',
  description:
    'Query individual ad creative performance metrics including CTR, CPC, ROAS, custom conversions (subscription_created, etc.), and video completion rates for a specified date range. Optionally include AI-powered video creative analysis (scenes, text overlays, emotional tone) when includeVideoAnalysis=true. Video analysis returns cached results only (use analyze-video-creative tool to analyze videos first). Supports both preset date ranges and custom date ranges for all-time analysis.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        oneOf: [
          {
            type: 'string' as const,
            enum: ['last_7d', 'last_30d', 'last_90d', 'this_month'],
            description: 'Date range preset for metrics query',
          },
          {
            type: 'object' as const,
            properties: {
              since: {
                type: 'string' as const,
                description: 'Start date in YYYY-MM-DD format',
              },
              until: {
                type: 'string' as const,
                description: 'End date in YYYY-MM-DD format',
              },
            },
            required: ['since', 'until'],
            description: 'Custom date range for all-time or specific period analysis',
          },
        ],
        description:
          'Date range preset or custom date range {since: "YYYY-MM-DD", until: "YYYY-MM-DD"}',
        default: 'last_7d',
      },
      adId: {
        type: 'string' as const,
        description: 'Optional ad ID to filter results (queries all ads if omitted)',
      },
      metrics: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: [
            'impressions',
            'clicks',
            'spend',
            'ctr',
            'cpc',
            'cpm',
            'purchase_roas',
            'reach',
          ],
        },
        description: 'Metrics to include in response',
        default: ['impressions', 'clicks', 'spend', 'ctr', 'cpc'],
      },
      customActions: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
        },
        description:
          'Custom conversion action types to retrieve. Use friendly names like "subscription_created" or full action type IDs like "offsite_conversion.custom.797731396203109". Returns action counts and cost-per-action for each.',
      },
      includeActionValues: {
        type: 'boolean' as const,
        description:
          'Include action value amounts (purchase value, etc.) for custom actions',
        default: false,
      },
      attributionWindows: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['1d_click', '7d_click', '28d_click', '1d_view'],
        },
        description: 'Attribution windows for conversion tracking. Options: 1d_click, 7d_click (default), 28d_click, 1d_view',
        default: ['7d_click', '1d_view'],
      },
      includeVideoAnalysis: {
        type: 'boolean' as const,
        description: 'Include AI-powered video creative analysis (cached results only, returns cache miss message if not yet analyzed)',
        default: false,
      },
    },
  },
};
