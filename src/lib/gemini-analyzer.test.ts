import { describe, it, expect, vi } from 'vitest';

// Mock all side-effect modules before importing the module under test
vi.mock('../config/env.js', () => ({
  env: {
    GEMINI_MAX_CONCURRENT_ANALYSES: 2,
    GEMINI_MAX_COST_PER_ANALYSIS: 0.10,
    GCS_BUCKET_NAME: 'test-bucket',
  },
}));
vi.mock('./gemini-client.js', () => ({
  geminiClient: null,
  isGeminiEnabled: () => false,
  geminiConfig: { model: 'gemini-2.5-flash' },
}));
vi.mock('./gcp-clients.js', () => ({
  storage: null,
}));

import { VideoAnalysisSchema } from './gemini-analyzer.js';

// Minimal valid analysis (no spoken content — backwards-compatible)
const baseAnalysis = {
  scenes: [{ timestamp: '00:00', description: 'Opening shot', shotType: 'wide shot', visualElements: ['logo'] }],
  textOverlays: [{ timestamp: '00:05', text: 'Buy Now', purpose: 'cta' as const }],
  emotionalTone: 'aspirational',
  creativeApproach: 'testimonial',
  productPresentation: 'lifestyle',
  callToAction: 'Shop Now',
  targetAudienceIndicators: ['women 25-34'],
  keyMessages: ['Feel your best'],
};

describe('VideoAnalysisSchema', () => {
  it('validates an analysis without spoken fields (backwards compat)', () => {
    const result = VideoAnalysisSchema.safeParse(baseAnalysis);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transcript).toBeUndefined();
      expect(result.data.spokenTheme).toBeUndefined();
      expect(result.data.spokenThemeDetails).toBeUndefined();
    }
  });

  it('validates an analysis with full spoken content', () => {
    const withSpoken = {
      ...baseAnalysis,
      transcript: [
        { timestamp: '00:01', speaker: 'narrator', text: 'Are you tired of…' },
        { timestamp: '00:10', speaker: 'voiceover', text: 'Try Superpower today.' },
      ],
      spokenTheme: 'pain-agitate-solve',
      spokenThemeDetails: {
        primaryTheme: 'pain-agitate-solve',
        secondaryThemes: ['benefit-driven'],
        hookStatement: 'Are you tired of…',
        spokenCta: 'Try Superpower today.',
        keySpokenMessages: ['Feel your best', 'Backed by science'],
      },
    };

    const result = VideoAnalysisSchema.safeParse(withSpoken);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transcript).toHaveLength(2);
      expect(result.data.spokenTheme).toBe('pain-agitate-solve');
      expect(result.data.spokenThemeDetails?.hookStatement).toBe('Are you tired of…');
      expect(result.data.spokenThemeDetails?.keySpokenMessages).toHaveLength(2);
    }
  });

  it('validates an analysis with only spokenTheme (no details or transcript)', () => {
    const partial = { ...baseAnalysis, spokenTheme: 'social-proof' };
    const result = VideoAnalysisSchema.safeParse(partial);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.spokenTheme).toBe('social-proof');
      expect(result.data.transcript).toBeUndefined();
      expect(result.data.spokenThemeDetails).toBeUndefined();
    }
  });

  it('rejects transcript entries missing required fields', () => {
    const bad = {
      ...baseAnalysis,
      transcript: [{ timestamp: '00:01', text: 'missing speaker' }],
    };
    const result = VideoAnalysisSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects spokenThemeDetails missing required fields', () => {
    const bad = {
      ...baseAnalysis,
      spokenThemeDetails: { primaryTheme: 'benefit-driven' },
    };
    const result = VideoAnalysisSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
