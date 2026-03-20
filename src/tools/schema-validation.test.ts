/**
 * Schema Validation Tests for Consolidated Tools
 *
 * Tests tool definitions and JSON schema structure without importing
 * implementation code (which requires Meta API credentials).
 * Also tests the fatigue algorithm integration.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

// Resolve to the src/tools directory regardless of whether running
// from source (src/) or build (build/) directory
const thisFile = typeof __filename !== 'undefined'
  ? __filename
  : fileURLToPath(import.meta.url);
const thisDir = join(thisFile, '..');
// If running from build/, point back to src/tools/
const toolsDir = thisDir.includes('/build/')
  ? thisDir.replace('/build/tools', '/src/tools')
  : thisDir.replace('/build\\tools', '/src\\tools').includes('/src/tools')
    ? thisDir
    : thisDir; // fallback to current dir

describe('get-performance tool definition', () => {
  const filePath = join(toolsDir, 'get-performance.ts');
  const content = readFileSync(filePath, 'utf-8');

  it('has correct tool name', () => {
    expect(content).toContain("name: 'get-performance'");
  });

  it('supports all three levels', () => {
    expect(content).toContain("enum: ['campaign', 'adset', 'ad']");
  });

  it('includes quality scores option', () => {
    expect(content).toContain('includeQualityScores');
    expect(content).toContain('quality_ranking');
    expect(content).toContain('engagement_rate_ranking');
    expect(content).toContain('conversion_rate_ranking');
  });

  it('includes video analysis option', () => {
    expect(content).toContain('includeVideoAnalysis');
  });

  it('supports custom date ranges', () => {
    expect(content).toContain('CustomDateRangeSchema');
    expect(content).toContain('since');
    expect(content).toContain('until');
  });

  it('supports custom actions', () => {
    expect(content).toContain('customActions');
    expect(content).toContain('resolveActionType');
  });

  it('includes reach metric', () => {
    expect(content).toContain("'reach'");
  });

  it('requests entity ID and name fields for all levels', () => {
    expect(content).toContain('config.idField');
    expect(content).toContain('config.nameField');
  });

  it('handles video analysis only at ad level', () => {
    // Check that video analysis is gated on ad level
    expect(content).toContain("input.includeVideoAnalysis && input.level === 'ad'");
  });

  it('handles quality scores only at ad level', () => {
    expect(content).toContain("input.includeQualityScores && input.level === 'ad'");
  });
});

describe('get-video-metrics tool definition', () => {
  const filePath = join(toolsDir, 'get-video-metrics.ts');
  const content = readFileSync(filePath, 'utf-8');

  it('has correct tool name', () => {
    expect(content).toContain("name: 'get-video-metrics'");
  });

  it('includes engagement depth fields', () => {
    expect(content).toContain('video_continuous_2_sec_watched_actions');
    expect(content).toContain('video_15_sec_watched_actions');
    expect(content).toContain('video_30_sec_watched_actions');
  });

  it('includes completion funnel fields', () => {
    expect(content).toContain('video_p25_watched_actions');
    expect(content).toContain('video_p100_watched_actions');
    expect(content).toContain('video_thruplay_watched_actions');
  });

  it('includes weak point detection', () => {
    expect(content).toContain('identifyWeakPoints');
    expect(content).toContain('includeWeakPoints');
  });

  it('includes retention scoring', () => {
    expect(content).toContain('calculateRetentionScore');
    expect(content).toContain('calculateAverageWatchPercentage');
    expect(content).toContain('classifyPerformance');
  });

  it('filters to video ads only', () => {
    expect(content).toContain('video_view');
    expect(content).toContain('> 0');
  });
});

describe('get-demographics tool definition', () => {
  const filePath = join(toolsDir, 'get-demographics.ts');
  const content = readFileSync(filePath, 'utf-8');

  it('has correct tool name', () => {
    expect(content).toContain("name: 'get-demographics'");
  });

  it('supports all breakdown dimensions including platform_position', () => {
    expect(content).toContain("'platform_position'");
    expect(content).toContain("'age'");
    expect(content).toContain("'gender'");
    expect(content).toContain("'country'");
    expect(content).toContain("'device_platform'");
    expect(content).toContain("'publisher_platform'");
  });

  it('has three metrics modes', () => {
    expect(content).toContain("'standard'");
    expect(content).toContain("'video'");
    expect(content).toContain("'conversions'");
  });

  it('requests entity ID/name fields in all modes', () => {
    // Video mode should include config.idField/nameField
    // Standard mode should include them too
    // Count occurrences of config.idField in the fields arrays
    const fieldMatches = content.match(/config\.idField/g);
    // Should appear in all 3 modes + formatters (at least 5 times)
    expect(fieldMatches!.length).toBeGreaterThanOrEqual(5);
  });

  it('has default for conversionMetrics', () => {
    expect(content).toContain(".default(['purchase'])");
  });

  it('includes conversion summary calculation', () => {
    expect(content).toContain('totalConversions');
    expect(content).toContain('avgCostPerConversion');
  });
});

describe('get-creative-fatigue tool definition', () => {
  const filePath = join(toolsDir, 'get-creative-fatigue.ts');
  const content = readFileSync(filePath, 'utf-8');

  it('has correct tool name', () => {
    expect(content).toContain("name: 'get-creative-fatigue'");
  });

  it('requires entityId', () => {
    expect(content).toContain("required: ['entityId']");
  });

  it('uses daily time increment', () => {
    expect(content).toContain('time_increment: 1');
  });

  it('sorts by date ascending', () => {
    expect(content).toContain('dateA.localeCompare(dateB)');
  });

  it('imports fatigue scoring', () => {
    expect(content).toContain('calculateFatigueScore');
  });
});

describe('get-creative-performance tool definition', () => {
  const filePath = join(toolsDir, 'get-creative-performance.ts');
  const content = readFileSync(filePath, 'utf-8');

  it('has correct tool name', () => {
    expect(content).toContain("name: 'get-creative-performance'");
  });

  it('requests creative field from API', () => {
    expect(content).toContain("'creative'");
  });

  it('groups by creative ID', () => {
    expect(content).toContain('creativeMap');
    expect(content).toContain('creativeMapping');
  });

  it('fetches creative mapping via Ads API', () => {
    expect(content).toContain('fetchCreativeMapping');
    expect(content).toContain('Ad.Fields.creative');
  });

  it('calculates weighted-average rates', () => {
    // CTR, CPC, CPM should be calculated from aggregated totals
    expect(content).toContain('totalClicks / totalImpressions');
    expect(content).toContain('totalSpend / totalClicks');
    expect(content).toContain('totalSpend / totalImpressions');
  });

  it('supports custom date ranges', () => {
    expect(content).toContain('CustomDateRangeSchema');
  });

  it('sorts by spend descending', () => {
    expect(content).toContain('b.metrics.spend');
  });
});

describe('Tool registry', () => {
  const filePath = join(toolsDir, 'index.ts');
  const content = readFileSync(filePath, 'utf-8');

  it('exports exactly 22 tools', () => {
    // Count the entries in the tools array
    const entries = content.match(/Tool,$/gm) || content.match(/\w+Tool[,\n]/gm) || [];
    // More reliable: count imports
    const imports = content.match(/import \{.*Tool.*\}/g) || [];
    expect(imports.length).toBe(22);
  });

  it('does not import any deleted tools', () => {
    expect(content).not.toContain('getCampaignPerformanceTool');
    expect(content).not.toContain('getAdsetPerformanceTool');
    expect(content).not.toContain('getAdPerformanceTool');
    expect(content).not.toContain('getVideoPerformanceTool');
    expect(content).not.toContain('getVideoEngagementTool');
    expect(content).not.toContain('getVideoDemographicsTool');
    expect(content).not.toContain('getAdDemographicsTool');
    expect(content).not.toContain('getPlacementConversionsTool');
  });

  it('imports all new tools', () => {
    expect(content).toContain('getPerformanceTool');
    expect(content).toContain('getVideoMetricsTool');
    expect(content).toContain('getDemographicsTool');
    expect(content).toContain('getCreativeFatigueTool');
    expect(content).toContain('getCreativePerformanceTool');
  });
});
