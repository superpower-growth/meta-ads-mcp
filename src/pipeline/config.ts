import { env } from '../config/env.js';

export const pipelineConfig = {
  pollIntervalMs: env.PIPELINE_POLL_INTERVAL_MS,
  maxConcurrency: env.PIPELINE_MAX_CONCURRENCY,
  maxRetries: 3,
  notionDbId: env.NOTION_MEDIA_DB_ID,
  staleJobCleanupIntervalMs: 30 * 60 * 1000, // 30 min
  claudeModel: 'claude-sonnet-4-20250514' as const,
} as const;
