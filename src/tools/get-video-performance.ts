/**
 * Get Video Performance Tool
 *
 * MCP tool for querying video ad completion metrics including percentile breakdowns.
 * Exposes video engagement funnel data (25%, 50%, 75%, 95%, 100% completion rates),
 * ThruPlay counts, and total video plays through conversational interface.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { parseVideoMetrics, parseActions } from '../lib/parsers.js';
import { env } from '../config/env.js';

/**
 * Input schema for get-video-performance tool
 *
 * Validates date range, aggregation level, optional entity filter, and engagement metrics flag.
 */
const GetVideoPerformanceSchema = z.object({
  dateRange: z
    .enum(['last_7d', 'last_30d', 'last_90d', 'this_month'])
    .default('last_7d')
    .describe('Date range preset for video metrics query'),
  level: z
    .enum(['campaign', 'adset', 'ad'])
    .default('campaign')
    .describe('Aggregation level for video metrics'),
  entityId: z
    .string()
    .optional()
    .describe('Optional campaign/adset/ad ID to filter results'),
  includeEngagement: z
    .boolean()
    .default(true)
    .describe('Include play actions and 2-second views in response'),
  attributionWindows: z
    .array(z.enum(['1d_click', '7d_click', '28d_click', '1d_view']))
    .default(['7d_click', '1d_view'])
    .describe('Attribution windows for conversion tracking. Options: 1d_click, 7d_click (default), 28d_click, 1d_view'),
});

type GetVideoPerformanceInput = z.infer<typeof GetVideoPerformanceSchema>;

/**
 * Video performance response format
 */
interface VideoPerformance {
  dateRange: string;
  level: string;
  videos: Array<{
    id: string;
    name: string;
    impressions: number;
    completionFunnel: {
      plays: number;
      '2secViews'?: number;
      '25percent': number;
      '50percent': number;
      '75percent': number;
      '95percent': number;
      '100percent': number;
      thruplay: number;
    };
    completionRates: {
      '25percent': string;
      '50percent': string;
      '75percent': string;
      '95percent': string;
      '100percent': string;
    };
  }>;
}

/**
 * Query video performance metrics from Meta Insights API
 *
 * @param args - Tool arguments (dateRange, level, entityId, includeEngagement)
 * @returns Pretty-printed JSON with video completion funnel data
 */
export async function getVideoPerformance(args: unknown): Promise<string> {
  // Validate input
  const input = GetVideoPerformanceSchema.parse(args);

  try {
    // Initialize MetricsService with account ID from environment
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Define video-specific metric fields to request
    const fields = [
      'impressions',
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p95_watched_actions',
      'video_p100_watched_actions',
      'video_thruplay_watched_actions',
      'video_play_actions',
    ];

    // Add engagement metrics if requested
    if (input.includeEngagement) {
      fields.push('video_continuous_2_sec_watched_actions');
    }

    // Prepare query parameters
    const params = {
      date_preset: input.dateRange,
      level: input.level,
      time_increment: 'all_days' as const, // Single aggregated result per entity
      action_attribution_windows: input.attributionWindows,
    };

    // Query insights from Meta API with automatic pagination
    const insights = await metricsService.getAllInsights(fields, params);

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
      const videoMetrics = parseVideoMetrics(insight);
      const playActions = parseActions(insight.video_play_actions || []);
      const plays = playActions.video_view || 0;
      return plays > 0; // Only include if video plays exist
    });

    // Return message if no video ads found
    if (videoInsights.length === 0) {
      return `No video ad data found for date range ${input.dateRange}`;
    }

    // Format response with completion funnel data
    const response: VideoPerformance = {
      dateRange: input.dateRange,
      level: input.level,
      videos: videoInsights.map((insight) => {
        // Parse video completion percentiles
        const videoMetrics = parseVideoMetrics(insight);

        // Parse play actions
        const playActions = parseActions(
          insight.video_play_actions || [],
          input.attributionWindows
        );
        const plays = playActions.video_view || 0;

        // Parse ThruPlay (15s or complete view)
        const thruplayActions = parseActions(
          insight.video_thruplay_watched_actions || [],
          input.attributionWindows
        );
        const thruplay = thruplayActions.video_view || 0;

        // Parse 2-second views if included
        let twoSecViews = 0;
        if (input.includeEngagement && insight.video_continuous_2_sec_watched_actions) {
          const twoSecActions = parseActions(
            insight.video_continuous_2_sec_watched_actions,
            input.attributionWindows
          );
          twoSecViews = twoSecActions.video_view || 0;
        }

        // Build completion funnel
        const completionFunnel: any = {
          plays,
          '25percent': videoMetrics.p25,
          '50percent': videoMetrics.p50,
          '75percent': videoMetrics.p75,
          '95percent': videoMetrics.p95,
          '100percent': videoMetrics.p100,
          thruplay,
        };

        // Add 2-sec views if requested
        if (input.includeEngagement) {
          completionFunnel['2secViews'] = twoSecViews;
        }

        // Calculate completion rates (avoid division by zero)
        const calculateRate = (count: number): string => {
          if (plays === 0) return '0.00%';
          return ((count / plays) * 100).toFixed(2) + '%';
        };

        const completionRates = {
          '25percent': calculateRate(videoMetrics.p25),
          '50percent': calculateRate(videoMetrics.p50),
          '75percent': calculateRate(videoMetrics.p75),
          '95percent': calculateRate(videoMetrics.p95),
          '100percent': calculateRate(videoMetrics.p100),
        };

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

        return {
          id: idField || '',
          name: nameField || idField || 'Unknown',
          impressions: parseInt(insight.impressions || '0', 10),
          completionFunnel,
          completionRates,
        };
      }),
    };

    // Return pretty-printed JSON for Claude consumption
    return JSON.stringify(response, null, 2);
  } catch (error) {
    // Format error messages for user clarity
    if (error instanceof Error) {
      return `Error querying video performance: ${error.message}`;
    }
    return 'Unknown error occurred while querying video performance';
  }
}

/**
 * MCP Tool definition for get-video-performance
 */
export const getVideoPerformanceTool: Tool = {
  name: 'get-video-performance',
  description:
    'Query video ad completion metrics including 25/50/75/95/100% percentiles, ThruPlay counts, and video play actions',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_30d', 'last_90d', 'this_month'],
        description: 'Date range preset for video metrics query',
        default: 'last_7d',
      },
      level: {
        type: 'string' as const,
        enum: ['campaign', 'adset', 'ad'],
        description: 'Aggregation level for video metrics',
        default: 'campaign',
      },
      entityId: {
        type: 'string' as const,
        description: 'Optional campaign/adset/ad ID to filter results',
      },
      includeEngagement: {
        type: 'boolean' as const,
        description: 'Include play actions and 2-second views in response',
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
