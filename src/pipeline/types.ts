import { Timestamp } from '@google-cloud/firestore';

export type JobStatus = 'queued' | 'analyzing' | 'writing_copy' | 'reviewing_copy' | 'updating_notion' | 'completed' | 'failed' | 'skipped';

export interface VeraReview {
  verdict: 'PASS' | 'PASS_WITH_FIXES' | 'FAIL';
  flags: Array<{
    text: string;
    rule: string;
    severity: 'RED' | 'YELLOW';
    fix: string;
  }>;
}

export interface MarcusReview {
  verdict: 'GREEN' | 'YELLOW' | 'RED';
  claims: Array<{
    claim: string;
    accuracy: 'ACCURATE' | 'OVERSTATED' | 'INACCURATE';
    evidence: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
    issue?: string;
    fix?: string;
  }>;
}

export interface PipelineJob {
  id: string;
  notionPageId: string;
  deliverableName: string;
  assetLink: string;
  angle: string;
  format: string;
  messenger: string;
  mediaType: string;

  status: JobStatus;
  error?: string;
  retryCount: number;

  gcsPath?: string;
  videoAnalysis?: object;
  primaryText?: string;
  headline?: string;

  draftPrimaryText?: string;
  draftHeadline?: string;
  veraReview?: VeraReview;
  marcusReview?: MarcusReview;
  copyRevised: boolean;

  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;

  geminiCached: boolean;
  durationMs?: number;
  batchId?: string;
}

export interface PipelineSettings {
  enabled: boolean;
  pollIntervalMs: number;
  maxConcurrency: number;
  maxRetries: number;
  notionDbId: string;
}

export interface CopyResult {
  primaryText: string;
  headline: string;
  description: string;
  reviewLog: {
    vera: VeraReview;
    marcus: MarcusReview;
    revised: boolean;
  };
}

export interface NotionAdPage {
  id: string;
  deliverableName: string;
  assetLink: string;
  angle: string;
  format: string;
  messenger: string;
  mediaType: string;
  landingPageUrl: string;
}
