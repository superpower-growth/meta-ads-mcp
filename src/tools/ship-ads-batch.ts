import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { runBatchShip } from '../pipeline/stages/batch-orchestrator.js';

const RowSchema = z.object({
  id: z.string().describe('Notion page ID (for result tracking)'),
  deliverableName: z.string().describe('Ad concept name'),
  assetLink: z.string().url().describe('Google Drive folder URL containing export/ with 4:5 and 9:16 video variants'),
  angle: z.string().describe('Ad angle (e.g. cholesterol, testosterone, womens health)'),
  format: z.string().describe('Ad format (e.g. UGC, testimonials)'),
  messenger: z.string().describe('Messenger type (e.g. Creator, Founder, Clinician)'),
  landingPageUrl: z.string().describe('Landing page URL (e.g. superpower.com/join)'),
  adSetName: z.string().describe('Ad set name — finds existing adset by name or creates a new one with cloned targeting'),
});

const ShipAdsBatchSchema = z.object({
  campaignId: z.string().describe('Meta campaign ID to place ads in'),
  rows: z.array(RowSchema).min(1).describe('Array of ad rows to process'),
  dryRun: z.boolean().default(false).describe('If true, generate copy and analyze videos but skip Meta ad creation'),
});

export async function shipAdsBatch(input: unknown): Promise<string> {
  const args = ShipAdsBatchSchema.parse(input);

  const result = await runBatchShip({
    campaignId: args.campaignId,
    rows: args.rows,
    dryRun: args.dryRun,
  });

  return JSON.stringify(result, null, 2);
}

export const shipAdsBatchTool: Tool = {
  name: 'ship-ads-batch',
  description:
    'Ship video ads in batch to Meta Ads. For each row: lists the Google Drive export folder to find 4:5 and 9:16 video variants, ' +
    'stages them in GCS, runs Gemini video analysis, generates compliant ad copy (Maya → Vera/Marcus review → Reviser), ' +
    'uploads both video formats to Meta, and creates 2 ads per creative (4:5 feed + 9:16 reels). ' +
    'All ads are created as PAUSED. Each row specifies an adSetName — the pipeline finds an existing adset by that name or creates a new one ' +
    '(PAUSED, $200/day budget, cloned targeting from most recent adset). Use dryRun=true to generate copy without shipping to Meta. ' +
    'Rows are processed with concurrency control (max 3 parallel). Failures are isolated per-row.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      campaignId: { type: 'string' as const, description: 'Meta campaign ID' },
      rows: {
        type: 'array' as const,
        description: 'Array of ad rows to process (from Notion Media Deliverables)',
        items: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const, description: 'Notion page ID' },
            deliverableName: { type: 'string' as const, description: 'Ad name' },
            assetLink: { type: 'string' as const, description: 'Google Drive folder URL' },
            angle: { type: 'string' as const, description: 'Ad angle' },
            format: { type: 'string' as const, description: 'Ad format' },
            messenger: { type: 'string' as const, description: 'Messenger type' },
            landingPageUrl: { type: 'string' as const, description: 'Landing page URL' },
            adSetName: { type: 'string' as const, description: 'Ad set name (finds existing or creates new)' },
          },
          required: ['id', 'deliverableName', 'assetLink', 'angle', 'format', 'messenger', 'landingPageUrl', 'adSetName'],
        },
      },
      dryRun: { type: 'boolean' as const, description: 'Generate copy only, skip Meta shipping', default: false },
    },
    required: ['campaignId', 'rows'],
  },
};
