/**
 * Get Video Engagement Tool
 *
 * MCP tool for advanced video engagement analysis with retention scores,
 * average watch percentage, and drop-off identification for creative optimization.
 * Analyzes video viewing depth beyond simple completion rates.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { parseVideoMetrics, parseActions } from '../lib/parsers.js';
import {
  calculateAverageWatchPercentage,
  calculateRetentionScore,
  identifyWeakPoints,
  classifyPerformance,
  type CompletionData,
} from '../lib/video-analysis.js';
import { env } from '../config/env.js';

/**
 * Input schema for get-video-engagement tool
 *
 * Validates date range, aggregation level, optional entity filter, and weak points flag.
 */
const GetVideoEngagementSchema = z.object({
  dateRange: z
    .enum(['last_7d', 'last_30d', 'last_90d', 'this_month'])
    .default('last_7d')
    .describe('Date range preset for video engagement query'),
  level: z
    .enum(['campaign', 'adset', 'ad'])
    .default('campaign')
    .describe('Aggregation level for video engagement metrics'),
  entityId: z
    .string()
    .optional()
    .describe('Optional campaign/adset/ad ID to filter results'),
  includeWeakPoints: z
    .boolean()
    .default(true)
    .describe('Include weak point identification (drop-offs >20%)'),
  attributionWindows: z
    .array(z.enum(['1d_click', '7d_click', '28d_click', '1d_view']))
    .default(['7d_click', '1d_view'])
    .describe('Attribution windows for conversion tracking. Options: 1d_click, 7d_click (default), 28d_click, 1d_view'),
});

type GetVideoEngagementInput = z.infer<typeof GetVideoEngagementSchema>;

/**
 * Video engagement response format
 */
interface VideoEngagement {
  dateRange: string;
  level: string;
  engagement: Array<{
    id: string;
    name: string;
    impressions: number;
    plays: number;
    viewDepth: {
      '2secViews': number;
      '15secViews': number;
      '30secViews': number;
      thruplay: number;
      completions: number;
    };
    engagementMetrics: {
      playRate: string;
      avgWatchPct: string;
      retentionScore: number;
      classification: string;
    };
    weakPoints?: Array<{
      from: string;
      to: string;
      dropPct: number;
    }>;
  }>;
}

/**
 * Query video engagement metrics from Meta Insights API
 *
 * @param args - Tool arguments (dateRange, level, entityId, includeWeakPoints)
 * @returns Pretty-printed JSON with video engagement analysis
 */
export async function getVideoEngagement(args: unknown): Promise<string> {
  // Validate input
  const input = GetVideoEngagementSchema.parse(args);

  try {
    // Initialize MetricsService with account ID from environment
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Define video engagement metric fields to request
    const fields = [
      'impressions',
      'video_play_actions',
      'video_continuous_2_sec_watched_actions',
      'video_15_sec_watched_actions',
      'video_30_sec_watched_actions',
      'video_thruplay_watched_actions',
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p95_watched_actions',
      'video_p100_watched_actions',
    ];

    // Prepare query parameters
    const params = {
      date_preset: input.dateRange,
      level: input.level,
      time_increment: 'all_days' as const, // Single aggregated result per entity
      action_attribution_windows: input.attributionWindows,
    };

    // Query insights from Meta API
    const insights = await metricsService.getAccountInsights(fields, params);

    // Filter to specific entity if requested
    let filteredInsights = insights;
    if (input.entityId) {
      const idField =
        input.level === 'campaign'
          ? 'campaign_id'
          : input.level === 'adset'
            ? 'adset_id'
            : 'ad_id';

      filteredInsights = insights.filter((insight) => insight[idField] === input.entityId);

      // Return error if entity not found
      if (filteredInsights.length === 0) {
        const levelName = input.level.charAt(0).toUpperCase() + input.level.slice(1);
        return `${levelName} ${input.entityId} not found in date range ${input.dateRange}`;
      }
    }

    // Filter to only entities with video metrics (exclude static image ads)
    const videoInsights = filteredInsights.filter((insight) => {
      const playActions = parseActions(insight.video_play_actions || []);
      const plays = playActions.video_view || 0;
      return plays > 0; // Only include if video plays exist
    });

    // Return message if no video ads found
    if (videoInsights.length === 0) {
      return `No video ad engagement data for date range ${input.dateRange}`;
    }

    // Format response with engagement analysis
    const response: VideoEngagement = {
      dateRange: input.dateRange,
      level: input.level,
      engagement: videoInsights.map((insight) => {
        // Parse video completion percentiles
        const videoMetrics = parseVideoMetrics(insight);

        // Parse play actions
        const playActions = parseActions(
          insight.video_play_actions || [],
          input.attributionWindows
        );
        const plays = playActions.video_view || 0;

        // Parse engagement depth metrics
        const twoSecActions = parseActions(
          insight.video_continuous_2_sec_watched_actions || [],
          input.attributionWindows
        );
        const twoSecViews = twoSecActions.video_view || 0;

        const fifteenSecActions = parseActions(
          insight.video_15_sec_watched_actions || [],
          input.attributionWindows
        );
        const fifteenSecViews = fifteenSecActions.video_view || 0;

        const thirtySecActions = parseActions(
          insight.video_30_sec_watched_actions || [],
          input.attributionWindows
        );
        const thirtySecViews = thirtySecActions.video_view || 0;

        const thruplayActions = parseActions(
          insight.video_thruplay_watched_actions || [],
          input.attributionWindows
        );
        const thruplay = thruplayActions.video_view || 0;

        // Parse impressions
        const impressions = parseInt(insight.impressions || '0', 10);

        // Build completion data for analysis
        const completionData: CompletionData = {
          plays,
          p25: videoMetrics.p25,
          p50: videoMetrics.p50,
          p75: videoMetrics.p75,
          p95: videoMetrics.p95,
          p100: videoMetrics.p100,
        };

        // Calculate engagement metrics
        const avgWatchPct = calculateAverageWatchPercentage(completionData);
        const retentionScore = calculateRetentionScore(completionData, impressions);
        const classification = classifyPerformance(completionData);

        // Calculate play rate
        const playRate = impressions > 0 ? ((plays / impressions) * 100).toFixed(2) + '%' : '0.00%';

        // Identify weak points if requested
        let weakPoints;
        if (input.includeWeakPoints) {
          weakPoints = identifyWeakPoints(completionData);
        }

        // Get entity name based on level
        const nameField =
          input.level === 'campaign'
            ? insight.campaign_name
            : input.level === 'adset'
              ? insight.adset_name
              : insight.ad_name;

        const idField =
          input.level === 'campaign'
            ? insight.campaign_id
            : input.level === 'adset'
              ? insight.adset_id
              : insight.ad_id;

        // Build engagement object
        const engagementObj: any = {
          id: idField || '',
          name: nameField || idField || 'Unknown',
          impressions,
          plays,
          viewDepth: {
            '2secViews': twoSecViews,
            '15secViews': fifteenSecViews,
            '30secViews': thirtySecViews,
            thruplay,
            completions: videoMetrics.p100,
          },
          engagementMetrics: {
            playRate,
            avgWatchPct: avgWatchPct.toFixed(1) + '%',
            retentionScore: Math.round(retentionScore * 10) / 10, // Round to 1 decimal
            classification,
          },
        };

        // Add weak points if requested and they exist
        if (input.includeWeakPoints && weakPoints && weakPoints.length > 0) {
          engagementObj.weakPoints = weakPoints;
        }

        return engagementObj;
      }),
    };

    // Return pretty-printed JSON for Claude consumption
    return JSON.stringify(response, null, 2);
  } catch (error) {
    // Format error messages for user clarity
    if (error instanceof Error) {
      return `Error querying video engagement: ${error.message}`;
    }
    return 'Unknown error occurred while querying video engagement';
  }
}

/**
 * MCP Tool definition for get-video-engagement
 */
export const getVideoEngagementTool: Tool = {
  name: 'get-video-engagement',
  description:
    'Analyze video ad engagement depth with retention scores, average watch percentage, and drop-off identification for creative optimization',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_30d', 'last_90d', 'this_month'],
        description: 'Date range preset for video engagement query',
        default: 'last_7d',
      },
      level: {
        type: 'string' as const,
        enum: ['campaign', 'adset', 'ad'],
        description: 'Aggregation level for video engagement metrics',
        default: 'campaign',
      },
      entityId: {
        type: 'string' as const,
        description: 'Optional campaign/adset/ad ID to filter results',
      },
      includeWeakPoints: {
        type: 'boolean' as const,
        description: 'Include weak point identification (drop-offs >20%)',
        default: true,
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
    },
  },
};
