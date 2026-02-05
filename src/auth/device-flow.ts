import crypto from 'crypto';
import { firestore, isGcpEnabled } from '../lib/gcp-clients.js';

/**
 * Device code data structure for OAuth device flow
 */
export interface DeviceCode {
  deviceCode: string;        // UUID for polling
  userCode: string;          // User-friendly code (e.g., "WDJB-MJHT")
  verificationUri: string;
  expiresAt: Date;          // 15 minutes
  interval: number;          // 5 seconds
  status: 'pending' | 'authorized' | 'denied' | 'expired';
  userId?: string;           // Set after authorization
  email?: string;
  name?: string;
  createdAt: Date;
}

/**
 * Access token data structure
 */
export interface AccessTokenData {
  userId: string;
  email: string;
  name: string;
  expiresAt: Date;          // 24 hours
  deviceCode?: string;
  createdAt: Date;
}

/**
 * User data from OAuth callback
 */
export interface UserData {
  id: string;
  email: string;
  name: string;
}

// Constants
const DEVICE_CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const ACCESS_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const POLLING_INTERVAL_SECONDS = 5;
const USER_CODE_LENGTH = 8;

// Characters for user code generation (excluding ambiguous characters)
const USER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0, O, 1, I

/**
 * Generate a cryptographically secure device code (UUID)
 */
export function generateDeviceCode(): string {
  return crypto.randomUUID();
}

/**
 * Generate a user-friendly code (e.g., "WDJB-MJHT")
 */
export function generateUserCode(): string {
  const chars: string[] = [];
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    const randomIndex = crypto.randomInt(USER_CODE_CHARS.length);
    chars.push(USER_CODE_CHARS[randomIndex]);
  }

  // Add hyphen in the middle (XXXX-XXXX)
  const firstHalf = chars.slice(0, 4).join('');
  const secondHalf = chars.slice(4, 8).join('');

  return `${firstHalf}-${secondHalf}`;
}

/**
 * Generate a cryptographically secure access token
 */
export function generateAccessToken(): string {
  const randomBytes = crypto.randomBytes(32);
  return `mcp_${randomBytes.toString('hex')}`;
}

/**
 * In-memory store for device codes
 */
export class DeviceCodeStore {
  private codes: Map<string, DeviceCode> = new Map();
  private userCodeIndex: Map<string, string> = new Map(); // userCode -> deviceCode
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Create a new device code
   */
  create(verificationUri: string): DeviceCode {
    const deviceCode = generateDeviceCode();
    let userCode = generateUserCode();

    // Ensure user code is unique
    while (this.userCodeIndex.has(userCode)) {
      userCode = generateUserCode();
    }

    const code: DeviceCode = {
      deviceCode,
      userCode,
      verificationUri,
      expiresAt: new Date(Date.now() + DEVICE_CODE_EXPIRY_MS),
      interval: POLLING_INTERVAL_SECONDS,
      status: 'pending',
      createdAt: new Date(),
    };

    this.codes.set(deviceCode, code);
    this.userCodeIndex.set(userCode, deviceCode);

    return code;
  }

  /**
   * Get device code by device code
   */
  getByDeviceCode(deviceCode: string): DeviceCode | undefined {
    const code = this.codes.get(deviceCode);

    if (!code) {
      return undefined;
    }

    // Check if expired
    if (new Date() > code.expiresAt) {
      code.status = 'expired';
      this.codes.set(deviceCode, code);
    }

    return code;
  }

  /**
   * Get device code by user code
   */
  getByUserCode(userCode: string): DeviceCode | undefined {
    const deviceCode = this.userCodeIndex.get(userCode);

    if (!deviceCode) {
      return undefined;
    }

    return this.getByDeviceCode(deviceCode);
  }

  /**
   * Authorize a device code with user data
   */
  async authorize(deviceCode: string, userData: UserData): Promise<string> {
    const code = this.getByDeviceCode(deviceCode);

    if (!code) {
      throw new Error('Invalid device code');
    }

    if (code.status === 'expired') {
      throw new Error('Device code has expired');
    }

    if (code.status === 'authorized') {
      throw new Error('Device code already used');
    }

    // Update device code with user data
    code.status = 'authorized';
    code.userId = userData.id;
    code.email = userData.email;
    code.name = userData.name;
    this.codes.set(deviceCode, code);

    // Generate access token
    const accessToken = generateAccessToken();
    const tokenData: AccessTokenData = {
      userId: userData.id,
      email: userData.email,
      name: userData.name,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS),
      deviceCode,
      createdAt: new Date(),
    };

    // Store in global access token store
    if (global.accessTokenStore) {
      await global.accessTokenStore.set(accessToken, tokenData);
    }

    return accessToken;
  }

  /**
   * Deny authorization for a device code
   */
  deny(deviceCode: string): void {
    const code = this.getByDeviceCode(deviceCode);

    if (code && code.status === 'pending') {
      code.status = 'denied';
      this.codes.set(deviceCode, code);
    }
  }

  /**
   * Clean up expired device codes
   */
  cleanup(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [deviceCode, code] of this.codes.entries()) {
      if (now > code.expiresAt || code.status === 'authorized') {
        // Remove from both indexes
        this.codes.delete(deviceCode);
        this.userCodeIndex.delete(code.userCode);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[DeviceCodeStore] Cleaned up ${cleanedCount} expired/used device codes`);
    }
  }

  /**
   * Get store statistics
   */
  getStats(): { total: number; pending: number; authorized: number; expired: number; denied: number } {
    const stats = {
      total: this.codes.size,
      pending: 0,
      authorized: 0,
      expired: 0,
      denied: 0,
    };

    for (const code of this.codes.values()) {
      stats[code.status]++;
    }

    return stats;
  }

  /**
   * Destroy the store and cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.codes.clear();
    this.userCodeIndex.clear();
  }
}

/**
 * Persistent store for access tokens with Firestore backing
 * Tokens survive server restarts when Firestore is enabled
 */
export class AccessTokenStore {
  private tokens: Map<string, AccessTokenData> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private collectionName = 'access_tokens';
  private isFirestoreEnabled: boolean;

  constructor() {
    this.isFirestoreEnabled = isGcpEnabled;
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Load tokens from Firestore on startup
   */
  async loadFromFirestore(): Promise<void> {
    if (!this.isFirestoreEnabled || !firestore) {
      console.log('[AccessTokenStore] Firestore not enabled, using in-memory only');
      return;
    }

    try {
      const snapshot = await firestore.collection(this.collectionName).get();
      const now = new Date();
      let loadedCount = 0;
      let expiredCount = 0;

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const token = doc.id;

        // Convert Firestore Timestamp to Date
        const expiresAt = data.expiresAt?.toDate() || new Date(data.expiresAt);
        const createdAt = data.createdAt?.toDate() || new Date(data.createdAt);

        // Skip expired tokens
        if (now > expiresAt) {
          expiredCount++;
          // Delete expired token from Firestore
          await doc.ref.delete();
          continue;
        }

        const tokenData: AccessTokenData = {
          userId: data.userId,
          email: data.email,
          name: data.name,
          expiresAt,
          deviceCode: data.deviceCode,
          createdAt,
        };

        this.tokens.set(token, tokenData);
        loadedCount++;
      }

      console.log(`[AccessTokenStore] Loaded ${loadedCount} tokens from Firestore (cleaned ${expiredCount} expired)`);
    } catch (error) {
      console.error('[AccessTokenStore] Failed to load from Firestore:', error);
      // Continue with in-memory only mode
    }
  }

  /**
   * Store an access token (persists to Firestore if enabled)
   */
  async set(token: string, data: AccessTokenData): Promise<void> {
    this.tokens.set(token, data);

    // Persist to Firestore if enabled
    if (this.isFirestoreEnabled && firestore) {
      try {
        await firestore.collection(this.collectionName).doc(token).set({
          userId: data.userId,
          email: data.email,
          name: data.name,
          expiresAt: data.expiresAt,
          deviceCode: data.deviceCode,
          createdAt: data.createdAt,
        });
        console.log(`[AccessTokenStore] Persisted token to Firestore for user: ${data.email}`);
      } catch (error) {
        console.error('[AccessTokenStore] Failed to persist token to Firestore:', error);
        // Continue with in-memory only
      }
    }
  }

  /**
   * Validate and retrieve token data
   */
  validate(token: string): AccessTokenData | null {
    const data = this.tokens.get(token);

    if (!data) {
      return null;
    }

    // Check if expired
    if (new Date() > data.expiresAt) {
      this.tokens.delete(token);
      // Delete from Firestore asynchronously (don't await)
      this.deleteFromFirestore(token);
      return null;
    }

    return data;
  }

  /**
   * Revoke an access token (removes from Firestore if enabled)
   */
  async revoke(token: string): Promise<boolean> {
    const deleted = this.tokens.delete(token);

    // Delete from Firestore if enabled
    if (deleted && this.isFirestoreEnabled && firestore) {
      await this.deleteFromFirestore(token);
    }

    return deleted;
  }

  /**
   * Delete token from Firestore
   */
  private async deleteFromFirestore(token: string): Promise<void> {
    if (!this.isFirestoreEnabled || !firestore) {
      return;
    }

    try {
      await firestore.collection(this.collectionName).doc(token).delete();
      console.log(`[AccessTokenStore] Deleted token from Firestore`);
    } catch (error) {
      console.error('[AccessTokenStore] Failed to delete token from Firestore:', error);
    }
  }

  /**
   * Clean up expired tokens (both in-memory and Firestore)
   */
  async cleanup(): Promise<void> {
    const now = new Date();
    let cleanedCount = 0;
    const tokensToDelete: string[] = [];

    for (const [token, data] of this.tokens.entries()) {
      if (now > data.expiresAt) {
        this.tokens.delete(token);
        tokensToDelete.push(token);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[AccessTokenStore] Cleaned up ${cleanedCount} expired access tokens from memory`);
    }

    // Clean up Firestore asynchronously
    if (tokensToDelete.length > 0 && this.isFirestoreEnabled && firestore) {
      try {
        const batch = firestore.batch();
        for (const token of tokensToDelete) {
          batch.delete(firestore.collection(this.collectionName).doc(token));
        }
        await batch.commit();
        console.log(`[AccessTokenStore] Cleaned up ${tokensToDelete.length} expired tokens from Firestore`);
      } catch (error) {
        console.error('[AccessTokenStore] Failed to clean up Firestore tokens:', error);
      }
    }
  }

  /**
   * Get store statistics
   */
  getStats(): { total: number; active: number } {
    const now = new Date();
    let active = 0;

    for (const data of this.tokens.values()) {
      if (now <= data.expiresAt) {
        active++;
      }
    }

    return {
      total: this.tokens.size,
      active,
    };
  }

  /**
   * Destroy the store and cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.tokens.clear();
  }
}

// Global declarations for TypeScript
declare global {
  var deviceCodeStore: DeviceCodeStore;
  var accessTokenStore: AccessTokenStore;
}
