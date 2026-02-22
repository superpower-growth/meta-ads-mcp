/**
 * Batch Orchestrator
 *
 * Runs shipOneRow() for each row with p-limit concurrency control.
 * Per-row error isolation — one failure doesn't stop the batch.
 * Shared adset cache prevents duplicate adset creation for rows with the same adSetName.
 */

import pLimit from 'p-limit';
import { pipelineConfig } from '../config.js';
import { shipOneRow, type ShipAdRowInput, type ShipAdRowResult } from './ad-shipper.js';

export interface BatchShipInput {
  campaignId: string;
  rows: Array<{
    id: string;
    deliverableName: string;
    assetLink: string;
    angle: string;
    format: string;
    messenger: string;
    landingPageUrl: string;
    adSetName: string;
  }>;
  dryRun?: boolean;
}

export interface BatchShipResult {
  total: number;
  shipped: number;
  failed: number;
  dryRun: number;
  durationMs: number;
  results: ShipAdRowResult[];
}

export type AdSetCache = Map<string, Promise<{ adSetId: string; created: boolean }>>;

/**
 * Process a batch of ad rows with concurrency control.
 */
export async function runBatchShip(input: BatchShipInput): Promise<BatchShipResult> {
  const start = Date.now();
  const { campaignId, rows, dryRun = false } = input;
  const concurrency = pipelineConfig.maxConcurrency;
  const limiter = pLimit(concurrency);

  // Shared adset cache: keyed by adSetName, deduplicates find-or-create across rows
  const adSetCache: AdSetCache = new Map();

  console.log(`[batch] Starting batch: ${rows.length} rows, concurrency=${concurrency}, dryRun=${dryRun}`);

  const tasks = rows.map((row, index) =>
    limiter(async () => {
      console.log(`[batch] Processing row ${index + 1}/${rows.length}: "${row.deliverableName}"`);

      const rowInput: ShipAdRowInput = {
        ...row,
        campaignId,
        dryRun,
      };

      return shipOneRow(rowInput, adSetCache);
    })
  );

  const results = await Promise.all(tasks);

  const shipped = results.filter((r) => r.status === 'shipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const dryRunCount = results.filter((r) => r.status === 'dry_run').length;

  const batchResult: BatchShipResult = {
    total: rows.length,
    shipped,
    failed,
    dryRun: dryRunCount,
    durationMs: Date.now() - start,
    results,
  };

  console.log(`[batch] Complete: ${shipped} shipped, ${failed} failed, ${dryRunCount} dry run (${batchResult.durationMs}ms)`);

  return batchResult;
}
