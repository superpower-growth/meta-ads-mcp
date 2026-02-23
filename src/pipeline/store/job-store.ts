import { Timestamp } from '@google-cloud/firestore';
import { firestore } from '../../lib/gcp-clients.js';
import { PipelineJob, JobStatus } from '../types.js';

const COLLECTION = 'pipeline_jobs';

function getCollection() {
  if (!firestore) throw new Error('Firestore not initialized');
  return firestore.collection(COLLECTION);
}

export async function createJob(
  data: Omit<PipelineJob, 'id' | 'createdAt' | 'retryCount' | 'copyRevised' | 'geminiCached' | 'status'>
): Promise<PipelineJob> {
  const col = getCollection();
  const doc = col.doc();
  const job: PipelineJob = {
    ...data,
    id: doc.id,
    status: 'queued',
    retryCount: 0,
    copyRevised: false,
    geminiCached: false,
    createdAt: Timestamp.now(),
  };
  await doc.set(job);
  return job;
}

export async function updateJob(id: string, updates: Partial<PipelineJob>): Promise<void> {
  const col = getCollection();
  await col.doc(id).update(updates);
}

export async function getJob(id: string): Promise<PipelineJob | null> {
  const col = getCollection();
  const snap = await col.doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as PipelineJob;
}

export async function queryJobs(options: {
  status?: JobStatus | JobStatus[];
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}): Promise<PipelineJob[]> {
  const col = getCollection();
  let query: FirebaseFirestore.Query = col;

  if (options.status) {
    if (Array.isArray(options.status)) {
      query = query.where('status', 'in', options.status);
    } else {
      query = query.where('status', '==', options.status);
    }
  }

  query = query.orderBy(options.orderBy || 'createdAt', options.orderDir || 'desc');

  if (options.offset) {
    query = query.offset(options.offset);
  }

  query = query.limit(options.limit || 50);

  const snap = await query.get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as PipelineJob);
}

export async function getJobCounts(): Promise<Record<JobStatus | 'total', number>> {
  const col = getCollection();
  const snap = await col.get();

  const counts: Record<string, number> = {
    queued: 0, analyzing: 0, writing_copy: 0, reviewing_copy: 0,
    updating_notion: 0, completed: 0, failed: 0, skipped: 0, total: 0,
  };

  snap.docs.forEach(doc => {
    const status = doc.data().status as string;
    if (status in counts) counts[status]++;
    counts.total++;
  });

  return counts as Record<JobStatus | 'total', number>;
}

export async function jobExistsForPage(notionPageId: string): Promise<boolean> {
  const col = getCollection();
  const snap = await col
    .where('notionPageId', '==', notionPageId)
    .where('status', 'not-in', ['failed', 'skipped'])
    .limit(1)
    .get();
  return !snap.empty;
}

export async function getQueuedJobs(limit: number): Promise<PipelineJob[]> {
  return queryJobs({ status: 'queued', limit, orderBy: 'createdAt', orderDir: 'asc' });
}

export async function markFailed(id: string, error: string, retryCount: number, maxRetries: number): Promise<void> {
  const updates: Partial<PipelineJob> = {
    error,
    retryCount,
  };

  if (retryCount < maxRetries) {
    updates.status = 'queued';
  } else {
    updates.status = 'failed';
  }

  await updateJob(id, updates);
}
