/**
 * Firestore Cache Utilities
 *
 * Provides caching layer for video analysis results using Firestore with TTL expiration.
 * Gracefully handles failures - cache operations don't crash the application.
 */

import { FieldValue, Timestamp } from '@google-cloud/firestore';
import { firestore, isGcpEnabled } from './gcp-clients.js';
import { env } from '../config/env.js';

const COLLECTION_NAME = 'video_analysis_cache';

/**
 * Cache entry structure for video analysis results
 */
export interface CacheEntry {
  videoId: string;
  adId: string;
  analysisResults: any; // Will be Gemini analysis object from Phase 13
  gcsPath: string; // Path to video in GCS
  expiresAt: Date; // TTL field for auto-deletion
  hitCount: number; // Track cache hits
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get cached video analysis result by video ID
 *
 * @param videoId - Meta Video ID to look up
 * @returns Cached entry or null if not found/expired
 */
export async function getCached(videoId: string): Promise<CacheEntry | null> {
  // Check if Firestore is available
  if (!firestore) {
    return null;
  }

  try {
    const docRef = firestore.collection(COLLECTION_NAME).doc(videoId);
    const snap = await docRef.get();

    // Cache miss: document doesn't exist
    if (!snap.exists) {
      return null;
    }

    const data = snap.data();
    if (!data) {
      return null;
    }

    // Check expiry
    const expiresAt = data.expiresAt.toDate();
    const now = new Date();

    if (now > expiresAt) {
      // Cache miss: expired entry (optionally clean up)
      await docRef.delete().catch((err) => {
        console.warn(`Failed to delete expired cache entry ${videoId}:`, err.message);
      });
      return null;
    }

    // Cache hit: increment hit count and update access time
    await docRef.update({
      hitCount: FieldValue.increment(1),
      updatedAt: Timestamp.fromDate(now),
    }).catch((err) => {
      console.warn(`Failed to update cache hit count for ${videoId}:`, err.message);
    });

    // Return cache entry with dates converted
    return {
      videoId: data.videoId,
      adId: data.adId,
      analysisResults: data.analysisResults,
      gcsPath: data.gcsPath,
      expiresAt: data.expiresAt.toDate(),
      hitCount: data.hitCount + 1, // Reflect updated count
      createdAt: data.createdAt.toDate(),
      updatedAt: now,
    };
  } catch (error) {
    console.warn(`Cache read failed for ${videoId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Set cached video analysis result
 *
 * @param entry - Cache entry without metadata fields (hitCount, createdAt, updatedAt, expiresAt)
 */
export async function setCached(
  entry: Omit<CacheEntry, 'hitCount' | 'createdAt' | 'updatedAt' | 'expiresAt'>
): Promise<void> {
  // Check if Firestore is available
  if (!firestore) {
    throw new Error('Firestore not initialized. Cannot set cache entry.');
  }

  try {
    const now = new Date();

    // Calculate expiration timestamp from TTL
    const ttlHours = env.FIRESTORE_CACHE_TTL_HOURS;
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

    // Build full cache entry
    const fullEntry = {
      videoId: entry.videoId,
      adId: entry.adId,
      analysisResults: entry.analysisResults,
      gcsPath: entry.gcsPath,
      hitCount: 0,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      expiresAt: Timestamp.fromDate(expiresAt),
    };

    // Write to Firestore
    await firestore.collection(COLLECTION_NAME).doc(entry.videoId).set(fullEntry);

    console.log(`Cached video analysis for ${entry.videoId} (expires in ${ttlHours}h)`);
  } catch (error) {
    console.warn(`Cache write failed for ${entry.videoId}:`, error instanceof Error ? error.message : error);
    // Don't throw - cache failures should not crash application
  }
}

/**
 * Clear expired cache entries (manual cleanup)
 * Firestore TTL policy handles automatic deletion, but this can be used for immediate cleanup
 *
 * @returns Number of entries deleted
 */
export async function clearExpired(): Promise<number> {
  // Check if Firestore is available
  if (!firestore) {
    return 0;
  }

  try {
    const now = Timestamp.fromDate(new Date());

    // Query expired documents (limit to 500 for batch operations)
    const snapshot = await firestore
      .collection(COLLECTION_NAME)
      .where('expiresAt', '<', now)
      .limit(500)
      .get();

    if (snapshot.empty) {
      return 0;
    }

    // Delete in batch
    const batch = firestore.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`Cleared ${snapshot.size} expired cache entries`);
    return snapshot.size;
  } catch (error) {
    console.warn('Failed to clear expired cache entries:', error instanceof Error ? error.message : error);
    return 0;
  }
}

/**
 * Display setup instructions for Firestore TTL policy
 * TTL policies must be configured via Firebase Console or gcloud CLI
 */
export function ensureTTLPolicy(): void {
  if (!firestore) {
    console.log('Firestore not initialized. Skipping TTL policy setup instructions.');
    return;
  }

  console.log('');
  console.log('=== Firestore TTL Policy Setup Instructions ===');
  console.log('Firestore TTL policy must be configured manually:');
  console.log('1. Go to Firebase Console > Firestore > Indexes');
  console.log('2. Create TTL policy on collection: video_analysis_cache');
  console.log('3. TTL field: expiresAt');
  console.log('4. Docs will auto-delete within 24h of expiration');
  console.log('');
  console.log('Alternatively, use the clearExpired() function on a scheduled basis.');
  console.log('================================================');
  console.log('');
}
