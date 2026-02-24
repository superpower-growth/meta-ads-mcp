import { describe, it, expect } from 'vitest';
import {
  groupByCreativeDimension,
  identifyTopCreativePatterns,
  findSimilarHighPerformers,
  generateCorrelationSummary,
  analyzeSpokenMessagePatterns,
  type EnrichedAd,
} from './creative-correlation.js';
import type { VideoAnalysis } from './gemini-analyzer.js';

function makeAd(overrides: Partial<{
  adId: string;
  emotionalTone: string;
  creativeApproach: string;
  callToAction: string;
  spokenTheme: string;
  spokenThemeDetails: VideoAnalysis['spokenThemeDetails'];
  ctr: number;
  cpc: number;
  spend: number;
}>): EnrichedAd {
  const {
    adId = 'ad_1',
    emotionalTone = 'aspirational',
    creativeApproach = 'testimonial',
    callToAction = 'Shop Now',
    spokenTheme,
    spokenThemeDetails,
    ctr = 0.03,
    cpc = 1.50,
    spend = 100,
  } = overrides;

  return {
    adId,
    adName: `Ad ${adId}`,
    videoId: `vid_${adId}`,
    analysis: {
      scenes: [],
      textOverlays: [],
      emotionalTone,
      creativeApproach,
      productPresentation: 'lifestyle',
      callToAction,
      targetAudienceIndicators: [],
      keyMessages: ['value prop'],
      ...(spokenTheme ? { spokenTheme } : {}),
      ...(spokenThemeDetails ? { spokenThemeDetails } : {}),
    },
    metrics: { adId, adName: `Ad ${adId}`, ctr, cpc, spend },
  };
}

describe('groupByCreativeDimension', () => {
  it('groups by spokenTheme', () => {
    const ads = [
      makeAd({ adId: '1', spokenTheme: 'social-proof', ctr: 0.04 }),
      makeAd({ adId: '2', spokenTheme: 'social-proof', ctr: 0.02 }),
      makeAd({ adId: '3', spokenTheme: 'urgency-scarcity', ctr: 0.05 }),
    ];

    const result = groupByCreativeDimension(ads, 'spokenTheme');
    expect(result).toHaveLength(2);
    // Sorted by CTR desc — urgency-scarcity (0.05) first
    expect(result[0].value).toBe('urgency-scarcity');
    expect(result[0].adCount).toBe(1);
    expect(result[1].value).toBe('social-proof');
    expect(result[1].adCount).toBe(2);
    expect(result[1].avgCtr).toBe(0.03);
  });

  it('skips ads without spokenTheme', () => {
    const ads = [
      makeAd({ adId: '1', spokenTheme: 'benefit-driven' }),
      makeAd({ adId: '2' }), // no spokenTheme
    ];

    const result = groupByCreativeDimension(ads, 'spokenTheme');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('benefit-driven');
    expect(result[0].adCount).toBe(1);
  });
});

describe('identifyTopCreativePatterns', () => {
  it('includes spokenTheme in return value', () => {
    const ads = [
      makeAd({ adId: '1', spokenTheme: 'social-proof', ctr: 0.04 }),
      makeAd({ adId: '2', spokenTheme: 'social-proof', ctr: 0.02 }),
    ];

    const patterns = identifyTopCreativePatterns(ads);
    expect(patterns).toHaveProperty('spokenTheme');
    expect(patterns.spokenTheme).toHaveLength(1);
    expect(patterns.spokenTheme[0].value).toBe('social-proof');
  });

  it('filters spokenTheme by minAdCount', () => {
    const ads = [
      makeAd({ adId: '1', spokenTheme: 'social-proof' }),
    ];

    const patterns = identifyTopCreativePatterns(ads, 2);
    expect(patterns.spokenTheme).toHaveLength(0);
  });
});

describe('findSimilarHighPerformers', () => {
  it('uses spokenTheme in similarity when both ads have it', () => {
    const target = makeAd({
      adId: 'target',
      emotionalTone: 'aspirational',
      creativeApproach: 'testimonial',
      callToAction: 'Shop Now',
      spokenTheme: 'benefit-driven',
    });

    // Matches all 4 dimensions
    const fullMatch = makeAd({
      adId: 'full',
      emotionalTone: 'aspirational',
      creativeApproach: 'testimonial',
      callToAction: 'Shop Now',
      spokenTheme: 'benefit-driven',
      ctr: 0.05,
    });

    // Matches 3 visual dimensions but not spokenTheme
    const partialMatch = makeAd({
      adId: 'partial',
      emotionalTone: 'aspirational',
      creativeApproach: 'testimonial',
      callToAction: 'Shop Now',
      spokenTheme: 'urgency-scarcity',
      ctr: 0.05,
    });

    const results = findSimilarHighPerformers(target, [fullMatch, partialMatch], 0.5);
    expect(results).toHaveLength(2);
    // fullMatch should come first (higher similarity)
    expect(results[0].adId).toBe('full');
    expect(results[1].adId).toBe('partial');
  });

  it('ignores spokenTheme weight when target has no spokenTheme', () => {
    const target = makeAd({
      adId: 'target',
      emotionalTone: 'aspirational',
      creativeApproach: 'testimonial',
      callToAction: 'Shop Now',
      // no spokenTheme
    });

    const match = makeAd({
      adId: 'match',
      emotionalTone: 'aspirational',
      creativeApproach: 'testimonial',
      callToAction: 'Shop Now',
      spokenTheme: 'benefit-driven',
      ctr: 0.05,
    });

    const results = findSimilarHighPerformers(target, [match], 0.5);
    expect(results).toHaveLength(1);
    // Should still match based on 3 visual dimensions (score = 0.80/0.80 = 1.0)
    expect(results[0].adId).toBe('match');
  });
});

describe('generateCorrelationSummary', () => {
  it('includes spoken theme section when data exists', () => {
    const ads = [
      makeAd({ adId: '1', spokenTheme: 'social-proof', ctr: 0.04 }),
      makeAd({ adId: '2', spokenTheme: 'social-proof', ctr: 0.02 }),
    ];

    const summary = generateCorrelationSummary(ads);
    expect(summary).toContain('Top Spoken Messaging Themes by CTR');
    expect(summary).toContain('social-proof');
  });

  it('omits spoken theme section when no data', () => {
    const ads = [
      makeAd({ adId: '1' }),
      makeAd({ adId: '2' }),
    ];

    const summary = generateCorrelationSummary(ads);
    expect(summary).not.toContain('Top Spoken Messaging Themes');
  });
});

describe('analyzeSpokenMessagePatterns', () => {
  it('aggregates key spoken messages across ads', () => {
    const ads = [
      makeAd({
        adId: '1',
        spokenThemeDetails: {
          primaryTheme: 'benefit-driven',
          secondaryThemes: [],
          hookStatement: 'hook',
          spokenCta: 'cta',
          keySpokenMessages: ['feel your best', 'backed by science'],
        },
        ctr: 0.04,
      }),
      makeAd({
        adId: '2',
        spokenThemeDetails: {
          primaryTheme: 'benefit-driven',
          secondaryThemes: [],
          hookStatement: 'hook',
          spokenCta: 'cta',
          keySpokenMessages: ['feel your best', 'premium ingredients'],
        },
        ctr: 0.06,
      }),
    ];

    const result = analyzeSpokenMessagePatterns(ads, 2);
    expect(result).toHaveLength(1); // only "feel your best" appears in 2+ ads
    expect(result[0].message).toBe('feel your best');
    expect(result[0].adCount).toBe(2);
    expect(result[0].avgCtr).toBe(0.05);
  });

  it('skips ads without spokenThemeDetails', () => {
    const ads = [
      makeAd({ adId: '1' }), // no spokenThemeDetails
      makeAd({ adId: '2' }),
    ];

    const result = analyzeSpokenMessagePatterns(ads);
    expect(result).toHaveLength(0);
  });

  it('returns empty when below minAdCount', () => {
    const ads = [
      makeAd({
        adId: '1',
        spokenThemeDetails: {
          primaryTheme: 'benefit-driven',
          secondaryThemes: [],
          hookStatement: 'hook',
          spokenCta: 'cta',
          keySpokenMessages: ['unique message'],
        },
      }),
    ];

    const result = analyzeSpokenMessagePatterns(ads, 2);
    expect(result).toHaveLength(0);
  });
});
