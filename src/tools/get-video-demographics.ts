/**
 * Get Video Demographics Tool
 *
 * MCP tool for querying video completion metrics segmented by demographic breakdowns.
 * Enables audience targeting insights by analyzing video engagement across age groups,
 * genders, locations, and platforms.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { parseVideoMetrics, parseActions } from '../lib/parsers.js';
import { env } from '../config/env.js';

/**
 * Input schema for get-video-demographics tool
 *
 * Validates date range, aggregation level, optional entity filter, and breakdown dimensions.
 */
const GetVideoDemographicsSchema = z.object({
  dateRange: z
    .enum(['last_7d', 'last_30d', 'last_90d', 'this_month'])
    .default('last_7d')
    .describe('Date range preset for video demographics query'),
  level: z
    .enum(['campaign', 'adset', 'ad'])
    .default('campaign')
    .describe('Aggregation level for video metrics'),
  entityId: z
    .string()
    .optional()
    .describe('Optional campaign/adset/ad ID to filter results'),
  breakdowns: z
    .array(
      z.enum(['age', 'gender', 'country', 'device_platform', 'publisher_platform'])
    )
    .min(1)
    .default(['age', 'gender'])
    .describe('Demographic breakdown dimensions (WARNING: combinations multiply rows)'),
});

type GetVideoDemographicsInput = z.infer<typeof GetVideoDemographicsSchema>;

/**
 * Video demographics response format
 */
interface VideoDemographics {
  dateRange: string;
  level: string;
  breakdowns: string[];
  segments: Array<{
    [key: string]: string | number | object; // Breakdown dimension values (age, gender, etc.)
    completionFunnel: {
      plays: number;
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
 * Query video demographics from Meta Insights API
 *
 * @param args - Tool arguments (dateRange, level, entityId, breakdowns)
 * @returns Pretty-printed JSON with segmented video completion data
 */
export async function getVideoDemographics(args: unknown): Promise<string> {
  // Validate input
  const input = GetVideoDemographicsSchema.parse(args);

  try {
    // Initialize MetricsService with account ID from environment
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Define video-specific metric fields to request
    const fields = [
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p95_watched_actions',
      'video_p100_watched_actions',
      'video_thruplay_watched_actions',
      'video_play_actions',
    ];

    // Prepare query parameters with breakdowns
    const params = {
      date_preset: input.dateRange,
      level: input.level,
      time_increment: 'all_days' as const, // Single aggregated result per breakdown
      breakdowns: input.breakdowns,
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
      return `No demographic breakdown data for date range ${input.dateRange}`;
    }

    // Warn if result set is very large
    if (videoInsights.length > 100) {
      console.warn(
        `[get-video-demographics] Large result set: ${videoInsights.length} segments. Consider fewer breakdowns.`
      );
    }

    // Format response by grouping results by breakdown dimensions
    const segments = videoInsights.map((insight) => {
      // Parse video completion percentiles
      const videoMetrics = parseVideoMetrics(insight);

      // Parse play actions
      const playActions = parseActions(insight.video_play_actions || []);
      const plays = playActions.video_view || 0;

      // Parse ThruPlay (15s or complete view)
      const thruplayActions = parseActions(insight.video_thruplay_watched_actions || []);
      const thruplay = thruplayActions.video_view || 0;

      // Build completion funnel
      const completionFunnel = {
        plays,
        '25percent': videoMetrics.p25,
        '50percent': videoMetrics.p50,
        '75percent': videoMetrics.p75,
        '95percent': videoMetrics.p95,
        '100percent': videoMetrics.p100,
        thruplay,
      };

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

      // Extract breakdown dimension values from insight
      const segment: any = {};
      for (const breakdown of input.breakdowns) {
        segment[breakdown] = insight[breakdown] || 'unknown';
      }

      // Add completion data to segment
      segment.completionFunnel = completionFunnel;
      segment.completionRates = completionRates;

      return segment;
    });

    // Build response
    const response: VideoDemographics = {
      dateRange: input.dateRange,
      level: input.level,
      breakdowns: input.breakdowns,
      segments,
    };

    // Return pretty-printed JSON for Claude consumption
    return JSON.stringify(response, null, 2);
  } catch (error) {
    // Format error messages for user clarity
    if (error instanceof Error) {
      return `Error querying video demographics: ${error.message}`;
    }
    return 'Unknown error occurred while querying video demographics';
  }
}

/**
 * MCP Tool definition for get-video-demographics
 */
export const getVideoDemographicsTool: Tool = {
  name: 'get-video-demographics',
  description:
    'Query video completion metrics segmented by demographic breakdowns (age, gender, location, platform). Enables audience targeting insights.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_30d', 'last_90d', 'this_month'],
        description: 'Date range preset for video demographics query',
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
      breakdowns: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['age', 'gender', 'country', 'device_platform', 'publisher_platform'],
        },
        description:
          'Demographic breakdown dimensions (WARNING: combinations multiply rows)',
        default: ['age', 'gender'],
      },
    },
  },
};
