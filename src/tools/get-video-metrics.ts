/**
 * Get Video Metrics Tool (Consolidated)
 *
 * Replaces: get-video-performance, get-video-engagement
 *
 * Unified tool for querying video ad metrics including completion funnel,
 * engagement depth analysis, retention scores, and drop-off identification.
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
 * Input schema for get-video-metrics tool
 */
const GetVideoMetricsSchema = z.object({
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
  attributionWindows: z
    .array(z.enum(['1d_click', '7d_click', '28d_click', '1d_view']))
    .default(['7d_click', '1d_view'])
    .describe('Attribution windows for conversion tracking'),
  includeEngagement: z
    .boolean()
    .default(true)
    .describe('Include 2-sec, 15-sec, 30-sec view depth, retention score, and play rate'),
  includeWeakPoints: z
    .boolean()
    .default(false)
    .describe('Include weak point identification (drop-offs >20% between percentiles)'),
});

type GetVideoMetricsInput = z.infer<typeof GetVideoMetricsSchema>;

/** Level config for field names */
const LEVEL_CONFIG = {
  campaign: { idField: 'campaign_id', nameField: 'campaign_name' },
  adset: { idField: 'adset_id', nameField: 'adset_name' },
  ad: { idField: 'ad_id', nameField: 'ad_name' },
} as const;

/**
 * Query video metrics from Meta Insights API
 */
export async function getVideoMetrics(args: unknown): Promise<string> {
  const input = GetVideoMetricsSchema.parse(args);
  const config = LEVEL_CONFIG[input.level];

  try {
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);

    // Build fields list - always include completion funnel
    const fields: string[] = [
      'impressions',
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p95_watched_actions',
      'video_p100_watched_actions',
      'video_thruplay_watched_actions',
      'video_play_actions',
      config.idField,
      config.nameField,
    ];

    // Engagement depth fields
    if (input.includeEngagement) {
      fields.push(
        'video_continuous_2_sec_watched_actions',
        'video_15_sec_watched_actions',
        'video_30_sec_watched_actions'
      );
    }

    const params: any = {
      date_preset: input.dateRange,
      level: input.level,
      time_increment: 'all_days' as const,
      action_attribution_windows: input.attributionWindows,
    };

    // Server-side filtering when entityId is provided
    if (input.entityId) {
      params.filtering = [{
        field: `${input.level}.id`,
        operator: 'EQUAL',
        value: input.entityId,
      }];
    }

    const insights = await metricsService.getAllInsights(fields, params);

    // Filter to specific entity (belt-and-suspenders)
    let filtered = insights;
    if (input.entityId) {
      filtered = insights.filter((i) => i[config.idField] === input.entityId);
      if (filtered.length === 0) {
        const label = input.level.charAt(0).toUpperCase() + input.level.slice(1);
        return `${label} ${input.entityId} not found in date range ${input.dateRange}`;
      }
    }

    // Filter to video ads only
    const videoInsights = filtered.filter((insight) => {
      const playActions = parseActions(insight.video_play_actions || []);
      return (playActions.video_view || 0) > 0;
    });

    if (videoInsights.length === 0) {
      return `No video ad data found for date range ${input.dateRange}`;
    }

    // Format response
    const videos = videoInsights.map((insight) => {
      const videoMetrics = parseVideoMetrics(insight);
      const impressions = parseInt(insight.impressions || '0', 10);

      const playActions = parseActions(insight.video_play_actions || [], input.attributionWindows);
      const plays = playActions.video_view || 0;

      const thruplayActions = parseActions(insight.video_thruplay_watched_actions || [], input.attributionWindows);
      const thruplay = thruplayActions.video_view || 0;

      // Completion funnel
      const completionFunnel: any = {
        plays,
        '25percent': videoMetrics.p25,
        '50percent': videoMetrics.p50,
        '75percent': videoMetrics.p75,
        '95percent': videoMetrics.p95,
        '100percent': videoMetrics.p100,
        thruplay,
      };

      // Completion rates
      const calcRate = (count: number): string =>
        plays === 0 ? '0.00%' : ((count / plays) * 100).toFixed(2) + '%';

      const completionRates = {
        '25percent': calcRate(videoMetrics.p25),
        '50percent': calcRate(videoMetrics.p50),
        '75percent': calcRate(videoMetrics.p75),
        '95percent': calcRate(videoMetrics.p95),
        '100percent': calcRate(videoMetrics.p100),
      };

      const video: any = {
        id: insight[config.idField] || '',
        name: insight[config.nameField] || insight[config.idField] || 'Unknown',
        impressions,
        completionFunnel,
        completionRates,
      };

      // Engagement depth metrics
      if (input.includeEngagement) {
        const twoSec = parseActions(insight.video_continuous_2_sec_watched_actions || [], input.attributionWindows);
        const fifteenSec = parseActions(insight.video_15_sec_watched_actions || [], input.attributionWindows);
        const thirtySec = parseActions(insight.video_30_sec_watched_actions || [], input.attributionWindows);

        completionFunnel['2secViews'] = twoSec.video_view || 0;

        const completionData: CompletionData = {
          plays,
          p25: videoMetrics.p25,
          p50: videoMetrics.p50,
          p75: videoMetrics.p75,
          p95: videoMetrics.p95,
          p100: videoMetrics.p100,
        };

        const playRate = impressions > 0 ? ((plays / impressions) * 100).toFixed(2) + '%' : '0.00%';

        video.viewDepth = {
          '2secViews': twoSec.video_view || 0,
          '15secViews': fifteenSec.video_view || 0,
          '30secViews': thirtySec.video_view || 0,
          thruplay,
          completions: videoMetrics.p100,
        };

        video.engagementMetrics = {
          playRate,
          avgWatchPct: calculateAverageWatchPercentage(completionData).toFixed(1) + '%',
          retentionScore: Math.round(calculateRetentionScore(completionData, impressions) * 10) / 10,
          classification: classifyPerformance(completionData),
        };
      }

      // Weak points
      if (input.includeWeakPoints) {
        const completionData: CompletionData = {
          plays,
          p25: videoMetrics.p25,
          p50: videoMetrics.p50,
          p75: videoMetrics.p75,
          p95: videoMetrics.p95,
          p100: videoMetrics.p100,
        };

        const weakPoints = identifyWeakPoints(completionData);
        if (weakPoints.length > 0) {
          video.weakPoints = weakPoints;
        }
      }

      return video;
    });

    const response = {
      dateRange: input.dateRange,
      level: input.level,
      videos,
    };

    return JSON.stringify(response, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      return `Error querying video metrics: ${error.message}`;
    }
    return 'Unknown error occurred while querying video metrics';
  }
}

/**
 * MCP Tool definition for get-video-metrics
 */
export const getVideoMetricsTool: Tool = {
  name: 'get-video-metrics',
  description:
    'Query video ad metrics including completion funnel (25/50/75/95/100%), ThruPlay, engagement depth (2s/15s/30s views), retention scores, average watch percentage, and drop-off weak points. Replaces get-video-performance and get-video-engagement.',
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
      attributionWindows: {
        type: 'array' as const,
        items: {
          type: 'string' as const,
          enum: ['1d_click', '7d_click', '28d_click', '1d_view'],
        },
        description: 'Attribution windows for conversion tracking',
        default: ['7d_click', '1d_view'],
      },
      includeEngagement: {
        type: 'boolean' as const,
        description: 'Include 2-sec/15-sec/30-sec view depth, retention score, avg watch %, and performance classification',
        default: true,
      },
      includeWeakPoints: {
        type: 'boolean' as const,
        description: 'Include weak point identification (drop-offs >20% between percentiles)',
        default: false,
      },
    },
  },
};
