import crypto from 'crypto';

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
      global.accessTokenStore.set(accessToken, tokenData);
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
 * In-memory store for access tokens
 */
export class AccessTokenStore {
  private tokens: Map<string, AccessTokenData> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Store an access token
   */
  set(token: string, data: AccessTokenData): void {
    this.tokens.set(token, data);
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
      return null;
    }

    return data;
  }

  /**
   * Revoke an access token
   */
  revoke(token: string): boolean {
    return this.tokens.delete(token);
  }

  /**
   * Clean up expired tokens
   */
  cleanup(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [token, data] of this.tokens.entries()) {
      if (now > data.expiresAt) {
        this.tokens.delete(token);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[AccessTokenStore] Cleaned up ${cleanedCount} expired access tokens`);
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
