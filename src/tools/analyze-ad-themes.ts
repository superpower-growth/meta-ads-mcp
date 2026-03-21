/**
 * Analyze Ad Themes Tool
 *
 * Clusters ads by messaging theme (from cached Gemini video analyses)
 * and correlates with performance metrics to identify which themes work best.
 *
 * Works on cached data only — no new Gemini calls. Run batch-analyze-video-creative first.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MetricsService } from '../meta/metrics.js';
import { getAllCachedByAdId } from '../lib/firestore-cache.js';
import { parseRoas } from '../lib/parsers.js';
import { env } from '../config/env.js';
import type { VideoAnalysis } from '../lib/gemini-analyzer.js';

const AnalyzeAdThemesSchema = z.object({
  dateRange: z
    .enum(['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month'])
    .default('last_30d')
    .describe('Date range for performance metrics'),
  groupBy: z
    .enum(['spokenTheme', 'emotionalTone', 'creativeApproach'])
    .default('spokenTheme')
    .describe('Theme dimension to group ads by'),
  sortBy: z
    .enum(['spend', 'ctr', 'cpc', 'cpm', 'purchase_roas', 'impressions'])
    .default('ctr')
    .describe('Metric to sort theme clusters by'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe('Max ads to show in detail per theme'),
});

type AnalyzeAdThemesInput = z.infer<typeof AnalyzeAdThemesSchema>;

interface AdWithTheme {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchaseRoas: number;
  // Theme data from Gemini analysis
  spokenTheme: string;
  emotionalTone: string;
  creativeApproach: string;
  hookStatement: string;
  keyMessages: string[];
  callToAction: string;
}

interface ThemeCluster {
  theme: string;
  ads: AdWithTheme[];
  totalSpend: number;
  totalImpressions: number;
  avgCtr: number;
  avgCpc: number;
  avgCpm: number;
  avgRoas: number;
  bestAd: AdWithTheme | null;
}

/**
 * Analyze ad themes and correlate with performance
 */
export async function analyzeAdThemes(args: unknown): Promise<string> {
  const input = AnalyzeAdThemesSchema.parse(args);

  try {
    // Step 1: Fetch all ad performance metrics
    const metricsService = new MetricsService(env.META_AD_ACCOUNT_ID);
    const fields = [
      'ad_id', 'ad_name', 'impressions', 'clicks', 'spend',
      'ctr', 'cpc', 'cpm', 'purchase_roas',
    ];
    const params = {
      date_preset: input.dateRange,
      level: 'ad' as const,
      time_increment: 'all_days' as const,
      limit: 500, // Cap at 500 ads to avoid rate limits on large accounts
    };

    // Use getAccountInsights (single page) instead of getAllInsights to avoid pagination rate limits
    const insights = await metricsService.getAccountInsights(fields, params);

    if (insights.length === 0) {
      return `No ads found for date range ${input.dateRange}`;
    }

    // Step 2: Get all cached video analyses from Firestore (indexed by adId)
    // This avoids per-ad Meta API calls for video metadata — just one Firestore query
    const cachedByAdId = await getAllCachedByAdId();

    // Build adId → analysis map
    const adAnalysisMap = new Map<string, VideoAnalysis>();
    for (const [adId, cached] of cachedByAdId.entries()) {
      if (cached.analysisResults) {
        adAnalysisMap.set(adId, cached.analysisResults as VideoAnalysis);
      }
    }

    // Step 4: Merge performance + theme data
    const adsWithThemes: AdWithTheme[] = [];
    const adsWithoutAnalysis: Array<{ id: string; name: string }> = [];

    for (const insight of insights) {
      const adId = insight.ad_id!;
      const analysis = adAnalysisMap.get(adId);

      if (!analysis) {
        adsWithoutAnalysis.push({ id: adId, name: insight.ad_name || adId });
        continue;
      }

      const roas = parseRoas(insight);

      adsWithThemes.push({
        adId,
        adName: insight.ad_name || adId,
        spend: parseFloat(insight.spend || '0'),
        impressions: parseInt(insight.impressions || '0', 10),
        clicks: parseInt(insight.clicks || '0', 10),
        ctr: parseFloat(insight.ctr || '0'),
        cpc: parseFloat(insight.cpc || '0'),
        cpm: parseFloat(insight.cpm || '0'),
        purchaseRoas: roas.purchase,
        spokenTheme: analysis.spokenTheme || 'no-speech',
        emotionalTone: analysis.emotionalTone || 'unknown',
        creativeApproach: analysis.creativeApproach || 'unknown',
        hookStatement: analysis.spokenThemeDetails?.hookStatement || '',
        keyMessages: analysis.keyMessages || [],
        callToAction: analysis.callToAction || '',
      });
    }

    // Step 5: Cluster by groupBy dimension (normalize case for consistent grouping)
    const clusters = new Map<string, AdWithTheme[]>();
    for (const ad of adsWithThemes) {
      const key = (ad[input.groupBy] as string).toLowerCase();
      if (!clusters.has(key)) {
        clusters.set(key, []);
      }
      clusters.get(key)!.push(ad);
    }

    // Step 6: Compute cluster-level metrics
    const themeClusters: ThemeCluster[] = [];
    for (const [theme, ads] of clusters.entries()) {
      const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
      const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
      const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);

      const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;

      const roasAds = ads.filter(a => a.purchaseRoas > 0);
      const avgRoas = roasAds.length > 0
        ? roasAds.reduce((s, a) => s + a.purchaseRoas, 0) / roasAds.length
        : 0;

      // Find best ad by sortBy metric
      const sortedAds = [...ads].sort((a, b) => {
        const metricMap: Record<string, keyof AdWithTheme> = {
          spend: 'spend', ctr: 'ctr', cpc: 'cpc', cpm: 'cpm',
          purchase_roas: 'purchaseRoas', impressions: 'impressions',
        };
        const key = metricMap[input.sortBy] || 'ctr';
        const aVal = a[key] as number;
        const bVal = b[key] as number;
        // Lower is better for cpc/cpm, higher for everything else
        if (input.sortBy === 'cpc' || input.sortBy === 'cpm') return aVal - bVal;
        return bVal - aVal;
      });

      themeClusters.push({
        theme,
        ads: sortedAds,
        totalSpend,
        totalImpressions,
        avgCtr,
        avgCpc,
        avgCpm,
        avgRoas,
        bestAd: sortedAds[0] || null,
      });
    }

    // Sort clusters by the metric
    themeClusters.sort((a, b) => {
      const metricMap: Record<string, keyof ThemeCluster> = {
        spend: 'totalSpend', ctr: 'avgCtr', cpc: 'avgCpc', cpm: 'avgCpm',
        purchase_roas: 'avgRoas', impressions: 'totalImpressions',
      };
      const key = metricMap[input.sortBy] || 'avgCtr';
      const aVal = a[key] as number;
      const bVal = b[key] as number;
      if (input.sortBy === 'cpc' || input.sortBy === 'cpm') return aVal - bVal;
      return bVal - aVal;
    });

    // Step 7: Format as markdown report
    return formatReport(input, themeClusters, adsWithThemes, adsWithoutAnalysis, insights.length);
  } catch (error) {
    if (error instanceof Error) {
      return `Error analyzing ad themes: ${error.message}`;
    }
    return 'Unknown error analyzing ad themes';
  }
}

function formatReport(
  input: AnalyzeAdThemesInput,
  clusters: ThemeCluster[],
  allAds: AdWithTheme[],
  unanalyzed: Array<{ id: string; name: string }>,
  totalAds: number,
): string {
  const groupLabel = {
    spokenTheme: 'Spoken Theme',
    emotionalTone: 'Emotional Tone',
    creativeApproach: 'Creative Approach',
  }[input.groupBy];

  const lines: string[] = [];

  // Header
  lines.push(`# Ad Theme Analysis`);
  lines.push(`**Period:** ${input.dateRange} | **Grouped by:** ${groupLabel} | **Sorted by:** ${input.sortBy}`);
  lines.push(`**Analyzed:** ${allAds.length}/${totalAds} ads have video analysis cached (${unanalyzed.length} not yet analyzed)`);
  lines.push('');

  // Portfolio summary
  const totalSpend = allAds.reduce((s, a) => s + a.spend, 0);
  const totalImpr = allAds.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = allAds.reduce((s, a) => s + a.clicks, 0);
  const portfolioCtr = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;
  const portfolioCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  lines.push(`## Portfolio Summary`);
  lines.push(`- Total spend: $${fmt(totalSpend)} | Total impressions: ${fmtInt(totalImpr)} | Avg CTR: ${portfolioCtr.toFixed(2)}% | Avg CPC: $${portfolioCpc.toFixed(2)}`);
  lines.push('');

  // Theme performance table
  lines.push(`## Theme Performance`);
  lines.push('');
  lines.push(`| ${groupLabel} | Ads | Spend | Avg CTR | Avg CPC | Avg ROAS | Best Ad |`);
  lines.push(`|---|---|---|---|---|---|---|`);

  for (const c of clusters) {
    const bestName = c.bestAd ? truncate(c.bestAd.adName, 30) : '-';
    lines.push(
      `| ${c.theme} | ${c.ads.length} | $${fmt(c.totalSpend)} | ${c.avgCtr.toFixed(2)}% | $${c.avgCpc.toFixed(2)} | ${c.avgRoas > 0 ? c.avgRoas.toFixed(1) + 'x' : '-'} | ${bestName} |`
    );
  }
  lines.push('');

  // Key insights
  lines.push(`## Key Insights`);
  if (clusters.length > 0) {
    // Best CTR theme
    const bestCtr = [...clusters].sort((a, b) => b.avgCtr - a.avgCtr)[0];
    lines.push(`- **Best CTR:** "${bestCtr.theme}" (${bestCtr.avgCtr.toFixed(2)}%) with ${bestCtr.ads.length} ads, $${fmt(bestCtr.totalSpend)} spend`);

    // Best efficiency (lowest CPC with meaningful spend)
    const withSpend = clusters.filter(c => c.totalSpend > 0 && c.avgCpc > 0);
    if (withSpend.length > 0) {
      const bestCpc = [...withSpend].sort((a, b) => a.avgCpc - b.avgCpc)[0];
      lines.push(`- **Best CPC:** "${bestCpc.theme}" ($${bestCpc.avgCpc.toFixed(2)}) — most cost-efficient clicks`);
    }

    // Highest spend theme
    const highestSpend = [...clusters].sort((a, b) => b.totalSpend - a.totalSpend)[0];
    lines.push(`- **Most invested:** "${highestSpend.theme}" ($${fmt(highestSpend.totalSpend)}) across ${highestSpend.ads.length} ads`);

    // Best ROAS
    const withRoas = clusters.filter(c => c.avgRoas > 0);
    if (withRoas.length > 0) {
      const bestRoas = [...withRoas].sort((a, b) => b.avgRoas - a.avgRoas)[0];
      lines.push(`- **Best ROAS:** "${bestRoas.theme}" (${bestRoas.avgRoas.toFixed(1)}x return)`);
    }

    // Underperformer
    if (clusters.length > 1) {
      const worstCtr = [...clusters].sort((a, b) => a.avgCtr - b.avgCtr)[0];
      if (worstCtr.theme !== bestCtr.theme) {
        lines.push(`- **Underperforming:** "${worstCtr.theme}" (${worstCtr.avgCtr.toFixed(2)}% CTR) — consider reworking or pausing`);
      }
    }
  }
  lines.push('');

  // Per-theme breakdowns
  for (const c of clusters) {
    const adsToShow = c.ads.slice(0, input.limit);
    lines.push(`## ${c.theme} (${c.ads.length} ads, $${fmt(c.totalSpend)} spend)`);

    // Show common hooks if available
    const hooks = c.ads.filter(a => a.hookStatement).map(a => a.hookStatement);
    if (hooks.length > 0) {
      lines.push(`**Common hooks:** ${hooks.slice(0, 3).map(h => `"${truncate(h, 50)}"`).join(' | ')}`);
    }

    lines.push('');
    lines.push(`| Ad Name | Spend | CTR | CPC | Impr | Hook |`);
    lines.push(`|---|---|---|---|---|---|`);

    for (const ad of adsToShow) {
      lines.push(
        `| ${truncate(ad.adName, 35)} | $${fmt(ad.spend)} | ${ad.ctr.toFixed(2)}% | $${ad.cpc.toFixed(2)} | ${fmtInt(ad.impressions)} | ${truncate(ad.hookStatement, 40)} |`
      );
    }

    if (c.ads.length > input.limit) {
      lines.push(`| ... and ${c.ads.length - input.limit} more | | | | | |`);
    }
    lines.push('');
  }

  // Unanalyzed ads
  if (unanalyzed.length > 0) {
    lines.push(`## Not Yet Analyzed (${unanalyzed.length} ads)`);
    lines.push(`Run \`batch-analyze-video-creative\` with these ad IDs to complete analysis:`);
    lines.push('```');
    // Show first 20 IDs
    const idsToShow = unanalyzed.slice(0, 20);
    lines.push(idsToShow.map(a => a.id).join(', '));
    if (unanalyzed.length > 20) {
      lines.push(`... and ${unanalyzed.length - 20} more`);
    }
    lines.push('```');
  }

  return lines.join('\n');
}

function fmt(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n.toFixed(2);
}

function fmtInt(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.substring(0, max - 3) + '...' : s;
}

export const analyzeAdThemesTool: Tool = {
  name: 'analyze-ad-themes',
  description:
    'Analyze messaging themes across video ads and correlate with performance. Groups ads by spoken theme (e.g. pain-agitate-solve, social-proof), emotional tone, or creative approach. Shows which messaging strategies drive the best CTR, CPC, and ROAS. Requires video analyses to be cached first via batch-analyze-video-creative.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      dateRange: {
        type: 'string' as const,
        enum: ['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month'],
        description: 'Date range for performance metrics',
        default: 'last_30d',
      },
      groupBy: {
        type: 'string' as const,
        enum: ['spokenTheme', 'emotionalTone', 'creativeApproach'],
        description: 'Theme dimension to group ads by',
        default: 'spokenTheme',
      },
      sortBy: {
        type: 'string' as const,
        enum: ['spend', 'ctr', 'cpc', 'cpm', 'purchase_roas', 'impressions'],
        description: 'Metric to sort theme clusters by',
        default: 'ctr',
      },
      limit: {
        type: 'number' as const,
        minimum: 1,
        maximum: 50,
        default: 20,
        description: 'Max ads to show per theme cluster',
      },
    },
  },
};
