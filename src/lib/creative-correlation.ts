/**
 * Creative Correlation Utilities
 *
 * Utilities for correlating video creative insights with performance metrics.
 * Enables pattern detection, performance comparison, and actionable recommendations.
 *
 * These utilities are designed to be used through Claude Code's conversational interface.
 * Users ask questions like "which emotional tone performs best?" and Claude uses these
 * functions to analyze data and generate insights.
 *
 * Key concepts:
 * - EnrichedAd: Ad with both creative analysis (from Gemini) and performance metrics (from Meta)
 * - Creative dimensions: emotionalTone, creativeApproach, callToAction, productPresentation
 * - Aggregation: Group ads by creative dimension and aggregate performance metrics
 * - Correlation: Identify patterns that correlate with high/low performance
 *
 * Usage pattern:
 * 1. User queries ads with includeVideoAnalysis=true in get-ad-performance
 * 2. Claude builds EnrichedAd[] from response (video analysis + metrics)
 * 3. Claude calls correlation utilities to generate insights
 * 4. Claude presents findings conversationally to user
 *
 * @example
 * // User asks: "Which emotional tone drives the best CTR?"
 * const patterns = identifyTopCreativePatterns(enrichedAds);
 * // Claude responds with patterns.emotionalTone ranked by CTR
 *
 * @example
 * // User asks: "Find ads similar to ad 12345 that perform better"
 * const similar = findSimilarHighPerformers(targetAd, allAds);
 * // Claude responds with similar high-performing ads
 */

import type { VideoAnalysis } from './gemini-analyzer.js';

/**
 * Performance metrics for a single ad
 */
interface AdPerformanceMetrics {
  adId: string;
  adName: string;
  ctr?: number;
  cpc?: number;
  roas?: number;
  conversions?: number;
  spend?: number;
  impressions?: number;
}

/**
 * Ad with both creative analysis and performance metrics
 */
export interface EnrichedAd {
  adId: string;
  adName: string;
  videoId: string;
  analysis: VideoAnalysis;
  metrics: AdPerformanceMetrics;
}

/**
 * Aggregated performance by creative dimension
 */
export interface CreativeDimensionPerformance {
  dimension: string; // e.g., "emotionalTone", "creativeApproach"
  value: string; // e.g., "aspirational", "testimonial"
  adCount: number;
  avgCtr: number;
  avgCpc: number;
  avgRoas: number | null;
  totalSpend: number;
  totalConversions: number;
  totalImpressions: number;
  adIds: string[]; // For reference
}

/**
 * Group ads by a creative dimension (emotionalTone, creativeApproach, etc.)
 * and aggregate performance metrics
 *
 * @param ads - Array of ads with both creative analysis and performance metrics
 * @param dimension - The creative dimension to group by
 * @returns Array of aggregated performance data, sorted by average CTR (descending)
 *
 * @example
 * const emotionalTonePerformance = groupByCreativeDimension(enrichedAds, 'emotionalTone');
 * // Returns: [{ dimension: 'emotionalTone', value: 'aspirational', adCount: 5, avgCtr: 0.032, ... }, ...]
 */
export function groupByCreativeDimension(
  ads: EnrichedAd[],
  dimension: 'emotionalTone' | 'creativeApproach' | 'callToAction' | 'productPresentation' | 'spokenTheme'
): CreativeDimensionPerformance[] {
  // Group ads by dimension value
  const groups = new Map<string, EnrichedAd[]>();

  for (const ad of ads) {
    const value = ad.analysis[dimension];
    if (!value) continue;

    if (!groups.has(value)) {
      groups.set(value, []);
    }
    groups.get(value)!.push(ad);
  }

  // Aggregate metrics for each group
  const results: CreativeDimensionPerformance[] = [];

  for (const [value, groupAds] of groups) {
    const adCount = groupAds.length;
    const adIds = groupAds.map(a => a.adId);

    // Calculate averages and totals
    let totalCtr = 0;
    let totalCpc = 0;
    let totalRoas = 0;
    let roasCount = 0;
    let totalSpend = 0;
    let totalConversions = 0;
    let totalImpressions = 0;

    for (const ad of groupAds) {
      totalCtr += ad.metrics.ctr || 0;
      totalCpc += ad.metrics.cpc || 0;
      if (ad.metrics.roas) {
        totalRoas += ad.metrics.roas;
        roasCount++;
      }
      totalSpend += ad.metrics.spend || 0;
      totalConversions += ad.metrics.conversions || 0;
      totalImpressions += ad.metrics.impressions || 0;
    }

    results.push({
      dimension,
      value,
      adCount,
      avgCtr: totalCtr / adCount,
      avgCpc: totalCpc / adCount,
      avgRoas: roasCount > 0 ? totalRoas / roasCount : null,
      totalSpend,
      totalConversions,
      totalImpressions,
      adIds,
    });
  }

  // Sort by average CTR descending (best performers first)
  return results.sort((a, b) => b.avgCtr - a.avgCtr);
}

/**
 * Identify creative patterns that correlate with high performance
 * Returns patterns ranked by performance (CTR as primary metric)
 *
 * @param ads - Array of ads with both creative analysis and performance metrics
 * @param minAdCount - Minimum number of ads required to consider a pattern (default: 2)
 * @returns Top performing patterns for emotional tone, creative approach, and call to action
 *
 * @example
 * const patterns = identifyTopCreativePatterns(enrichedAds);
 * console.log(patterns.emotionalTone[0]); // Top emotional tone by CTR
 * console.log(patterns.creativeApproach[0]); // Top creative approach by CTR
 */
export function identifyTopCreativePatterns(
  ads: EnrichedAd[],
  minAdCount: number = 2 // Minimum ads to consider a pattern
): {
  emotionalTone: CreativeDimensionPerformance[];
  creativeApproach: CreativeDimensionPerformance[];
  callToAction: CreativeDimensionPerformance[];
  spokenTheme: CreativeDimensionPerformance[];
} {
  const emotionalTone = groupByCreativeDimension(ads, 'emotionalTone')
    .filter(p => p.adCount >= minAdCount);

  const creativeApproach = groupByCreativeDimension(ads, 'creativeApproach')
    .filter(p => p.adCount >= minAdCount);

  const callToAction = groupByCreativeDimension(ads, 'callToAction')
    .filter(p => p.adCount >= minAdCount);

  const spokenTheme = groupByCreativeDimension(ads, 'spokenTheme')
    .filter(p => p.adCount >= minAdCount);

  return {
    emotionalTone,
    creativeApproach,
    callToAction,
    spokenTheme,
  };
}

/**
 * Find ads similar to a given ad based on creative elements
 * Returns similar ads sorted by performance
 *
 * Similarity scoring:
 * - Emotional tone match: 30% weight
 * - Creative approach match: 40% weight
 * - Call to action match: 30% weight
 *
 * @param targetAd - The ad to find similar ads for
 * @param allAds - All available ads to search through
 * @param minSimilarityScore - Minimum similarity score (0-1) to include in results (default: 0.5)
 * @returns Array of similar ads sorted by similarity score, then by CTR
 *
 * @example
 * const similar = findSimilarHighPerformers(myAd, allAds, 0.6);
 * // Returns ads with 60%+ similarity, sorted by similarity then CTR
 */
export function findSimilarHighPerformers(
  targetAd: EnrichedAd,
  allAds: EnrichedAd[],
  minSimilarityScore: number = 0.5
): EnrichedAd[] {
  const results: Array<{ ad: EnrichedAd; similarityScore: number }> = [];

  for (const ad of allAds) {
    if (ad.adId === targetAd.adId) continue;

    // Calculate similarity score (0-1)
    let score = 0;
    let maxScore = 0;

    // Emotional tone match (weight: 0.25)
    maxScore += 0.25;
    if (ad.analysis.emotionalTone === targetAd.analysis.emotionalTone) {
      score += 0.25;
    }

    // Creative approach match (weight: 0.30)
    maxScore += 0.30;
    if (ad.analysis.creativeApproach === targetAd.analysis.creativeApproach) {
      score += 0.30;
    }

    // Call to action match (weight: 0.25)
    maxScore += 0.25;
    if (ad.analysis.callToAction === targetAd.analysis.callToAction) {
      score += 0.25;
    }

    // Spoken theme match (weight: 0.20, conditional on both ads having it)
    if (ad.analysis.spokenTheme && targetAd.analysis.spokenTheme) {
      maxScore += 0.20;
      if (ad.analysis.spokenTheme === targetAd.analysis.spokenTheme) {
        score += 0.20;
      }
    }

    const normalizedScore = score / maxScore;

    if (normalizedScore >= minSimilarityScore) {
      results.push({ ad, similarityScore: normalizedScore });
    }
  }

  // Sort by similarity first, then by CTR
  return results
    .sort((a, b) => {
      const scoreDiff = b.similarityScore - a.similarityScore;
      if (Math.abs(scoreDiff) > 0.1) return scoreDiff;
      return (b.ad.metrics.ctr || 0) - (a.ad.metrics.ctr || 0);
    })
    .map(r => r.ad);
}

/**
 * Generate a text summary of creative-performance correlations
 * Returns markdown-formatted insights
 *
 * @param ads - Array of ads with both creative analysis and performance metrics
 * @returns Markdown-formatted summary of top performing creative patterns
 *
 * @example
 * const summary = generateCorrelationSummary(enrichedAds);
 * console.log(summary); // Prints markdown report with top emotional tones, approaches, CTAs
 */
export function generateCorrelationSummary(
  ads: EnrichedAd[]
): string {
  if (ads.length === 0) {
    return 'No ads with video analysis available for correlation analysis.';
  }

  const patterns = identifyTopCreativePatterns(ads);
  const lines: string[] = [];

  lines.push('# Creative Performance Correlation Analysis\n');
  lines.push(`Analyzed ${ads.length} video ads with creative insights and performance data.\n`);

  // Emotional tone insights
  if (patterns.emotionalTone.length > 0) {
    lines.push('## Top Emotional Tones by CTR\n');
    for (let i = 0; i < Math.min(3, patterns.emotionalTone.length); i++) {
      const p = patterns.emotionalTone[i];
      lines.push(`${i + 1}. **${p.value}** - ${p.adCount} ads, ${(p.avgCtr * 100).toFixed(2)}% CTR, $${p.avgCpc.toFixed(2)} CPC`);
    }
    lines.push('');
  }

  // Creative approach insights
  if (patterns.creativeApproach.length > 0) {
    lines.push('## Top Creative Approaches by CTR\n');
    for (let i = 0; i < Math.min(3, patterns.creativeApproach.length); i++) {
      const p = patterns.creativeApproach[i];
      lines.push(`${i + 1}. **${p.value}** - ${p.adCount} ads, ${(p.avgCtr * 100).toFixed(2)}% CTR, $${p.avgCpc.toFixed(2)} CPC`);
    }
    lines.push('');
  }

  // Call to action insights
  if (patterns.callToAction.length > 0) {
    lines.push('## Top CTAs by CTR\n');
    for (let i = 0; i < Math.min(3, patterns.callToAction.length); i++) {
      const p = patterns.callToAction[i];
      lines.push(`${i + 1}. **${p.value}** - ${p.adCount} ads, ${(p.avgCtr * 100).toFixed(2)}% CTR, $${p.avgCpc.toFixed(2)} CPC`);
    }
    lines.push('');
  }

  // Spoken theme insights
  if (patterns.spokenTheme.length > 0) {
    lines.push('## Top Spoken Messaging Themes by CTR\n');
    for (let i = 0; i < Math.min(3, patterns.spokenTheme.length); i++) {
      const p = patterns.spokenTheme[i];
      lines.push(`${i + 1}. **${p.value}** - ${p.adCount} ads, ${(p.avgCtr * 100).toFixed(2)}% CTR, $${p.avgCpc.toFixed(2)} CPC`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Key message pattern with performance
 */
export interface KeyMessagePattern {
  message: string; // Normalized message (lowercase, trimmed)
  adCount: number;
  avgCtr: number;
  avgCpc: number;
  totalSpend: number;
  adIds: string[];
}

/**
 * Identify frequently used key messages and their performance
 * Useful for understanding which value propositions resonate
 *
 * @param ads - Array of ads with both creative analysis and performance metrics
 * @param minAdCount - Minimum number of ads required to consider a message pattern (default: 2)
 * @returns Array of key message patterns sorted by average CTR (descending)
 *
 * @example
 * const messagePatterns = analyzeKeyMessagePatterns(enrichedAds);
 * console.log(messagePatterns[0]); // Top performing key message
 */
export function analyzeKeyMessagePatterns(
  ads: EnrichedAd[],
  minAdCount: number = 2
): KeyMessagePattern[] {
  // Collect all key messages across ads
  const messageMap = new Map<string, EnrichedAd[]>();

  for (const ad of ads) {
    for (const msg of ad.analysis.keyMessages) {
      const normalized = msg.toLowerCase().trim();
      if (!messageMap.has(normalized)) {
        messageMap.set(normalized, []);
      }
      messageMap.get(normalized)!.push(ad);
    }
  }

  // Aggregate performance for each message
  const results: KeyMessagePattern[] = [];

  for (const [message, adsWithMessage] of messageMap) {
    if (adsWithMessage.length < minAdCount) continue;

    const adCount = adsWithMessage.length;
    const adIds = adsWithMessage.map(a => a.adId);

    let totalCtr = 0;
    let totalCpc = 0;
    let totalSpend = 0;

    for (const ad of adsWithMessage) {
      totalCtr += ad.metrics.ctr || 0;
      totalCpc += ad.metrics.cpc || 0;
      totalSpend += ad.metrics.spend || 0;
    }

    results.push({
      message,
      adCount,
      avgCtr: totalCtr / adCount,
      avgCpc: totalCpc / adCount,
      totalSpend,
      adIds,
    });
  }

  // Sort by average CTR descending
  return results.sort((a, b) => b.avgCtr - a.avgCtr);
}

/**
 * Identify frequently used spoken messages and their performance
 * Same shape as analyzeKeyMessagePatterns but reads from spokenThemeDetails.keySpokenMessages
 *
 * @param ads - Array of ads with both creative analysis and performance metrics
 * @param minAdCount - Minimum number of ads required to consider a message pattern (default: 2)
 * @returns Array of spoken message patterns sorted by average CTR (descending)
 */
export function analyzeSpokenMessagePatterns(
  ads: EnrichedAd[],
  minAdCount: number = 2
): KeyMessagePattern[] {
  const messageMap = new Map<string, EnrichedAd[]>();

  for (const ad of ads) {
    const spokenMessages = ad.analysis.spokenThemeDetails?.keySpokenMessages;
    if (!spokenMessages) continue;

    for (const msg of spokenMessages) {
      const normalized = msg.toLowerCase().trim();
      if (!messageMap.has(normalized)) {
        messageMap.set(normalized, []);
      }
      messageMap.get(normalized)!.push(ad);
    }
  }

  const results: KeyMessagePattern[] = [];

  for (const [message, adsWithMessage] of messageMap) {
    if (adsWithMessage.length < minAdCount) continue;

    const adCount = adsWithMessage.length;
    const adIds = adsWithMessage.map(a => a.adId);

    let totalCtr = 0;
    let totalCpc = 0;
    let totalSpend = 0;

    for (const ad of adsWithMessage) {
      totalCtr += ad.metrics.ctr || 0;
      totalCpc += ad.metrics.cpc || 0;
      totalSpend += ad.metrics.spend || 0;
    }

    results.push({
      message,
      adCount,
      avgCtr: totalCtr / adCount,
      avgCpc: totalCpc / adCount,
      totalSpend,
      adIds,
    });
  }

  return results.sort((a, b) => b.avgCtr - a.avgCtr);
}

/**
 * Compare performance of specific creative combinations
 * e.g., "aspirational + testimonial" vs "urgent + product demo"
 */
export interface CreativeCombinationPerformance {
  emotionalTone: string;
  creativeApproach: string;
  adCount: number;
  avgCtr: number;
  avgCpc: number;
  avgRoas: number | null;
  totalSpend: number;
  adIds: string[];
}

/**
 * Analyze performance of emotional tone + creative approach combinations
 *
 * @param ads - Array of ads with both creative analysis and performance metrics
 * @param minAdCount - Minimum number of ads required to consider a combination (default: 1)
 * @returns Array of creative combinations sorted by average CTR (descending)
 *
 * @example
 * const combos = analyzeCreativeCombinations(enrichedAds, 2);
 * console.log(combos[0]); // Top performing combination
 * // e.g., { emotionalTone: 'aspirational', creativeApproach: 'testimonial', avgCtr: 0.035, ... }
 */
export function analyzeCreativeCombinations(
  ads: EnrichedAd[],
  minAdCount: number = 1
): CreativeCombinationPerformance[] {
  // Group by combination
  const combos = new Map<string, EnrichedAd[]>();

  for (const ad of ads) {
    const key = `${ad.analysis.emotionalTone}|${ad.analysis.creativeApproach}`;
    if (!combos.has(key)) {
      combos.set(key, []);
    }
    combos.get(key)!.push(ad);
  }

  // Aggregate metrics
  const results: CreativeCombinationPerformance[] = [];

  for (const [key, groupAds] of combos) {
    if (groupAds.length < minAdCount) continue;

    const [emotionalTone, creativeApproach] = key.split('|');
    const adCount = groupAds.length;
    const adIds = groupAds.map(a => a.adId);

    let totalCtr = 0;
    let totalCpc = 0;
    let totalRoas = 0;
    let roasCount = 0;
    let totalSpend = 0;

    for (const ad of groupAds) {
      totalCtr += ad.metrics.ctr || 0;
      totalCpc += ad.metrics.cpc || 0;
      if (ad.metrics.roas) {
        totalRoas += ad.metrics.roas;
        roasCount++;
      }
      totalSpend += ad.metrics.spend || 0;
    }

    results.push({
      emotionalTone,
      creativeApproach,
      adCount,
      avgCtr: totalCtr / adCount,
      avgCpc: totalCpc / adCount,
      avgRoas: roasCount > 0 ? totalRoas / roasCount : null,
      totalSpend,
      adIds,
    });
  }

  // Sort by CTR descending
  return results.sort((a, b) => b.avgCtr - a.avgCtr);
}
