import { Request, Response, NextFunction } from 'express';

/**
 * Rate limit entry
 */
interface RateLimitEntry {
  count: number;
  resetAt: Date;
}

/**
 * Rate limiter for device flow endpoints
 */
export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Check if a key is rate limited
   */
  check(key: string, maxAttempts: number, windowMs: number): boolean {
    const now = new Date();
    const entry = this.limits.get(key);

    if (!entry) {
      // First attempt
      this.limits.set(key, {
        count: 1,
        resetAt: new Date(now.getTime() + windowMs),
      });
      return true;
    }

    // Check if window has expired
    if (now > entry.resetAt) {
      // Reset the window
      this.limits.set(key, {
        count: 1,
        resetAt: new Date(now.getTime() + windowMs),
      });
      return true;
    }

    // Check if limit exceeded
    if (entry.count >= maxAttempts) {
      return false;
    }

    // Increment count
    entry.count++;
    this.limits.set(key, entry);
    return true;
  }

  /**
   * Get remaining attempts
   */
  getRemaining(key: string, maxAttempts: number): number {
    const entry = this.limits.get(key);

    if (!entry) {
      return maxAttempts;
    }

    const now = new Date();
    if (now > entry.resetAt) {
      return maxAttempts;
    }

    return Math.max(0, maxAttempts - entry.count);
  }

  /**
   * Get reset time for a key
   */
  getResetAt(key: string): Date | null {
    const entry = this.limits.get(key);
    return entry ? entry.resetAt : null;
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetAt) {
        this.limits.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[RateLimiter] Cleaned up ${cleanedCount} expired rate limit entries`);
    }
  }

  /**
   * Destroy the rate limiter
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.limits.clear();
  }
}

// Global rate limiters
const deviceCodeLimiter = new RateLimiter();
const tokenPollingLimiter = new RateLimiter();
const codeVerificationLimiter = new RateLimiter();

/**
 * Get client IP address
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Rate limit middleware for device code generation
 * Limit: 10 requests per IP per hour
 */
export function rateLimitDeviceCode(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const key = `device-code:${ip}`;
  const maxAttempts = 10;
  const windowMs = 60 * 60 * 1000; // 1 hour

  if (!deviceCodeLimiter.check(key, maxAttempts, windowMs)) {
    const resetAt = deviceCodeLimiter.getResetAt(key);
    const retryAfter = resetAt ? Math.ceil((resetAt.getTime() - Date.now()) / 1000) : 3600;

    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many device code requests. Please try again later.',
      retry_after: retryAfter,
    });
    return;
  }

  next();
}

/**
 * Rate limit middleware for token polling
 * Enforce minimum 5-second interval between polls
 */
export function rateLimitTokenPolling(req: Request, res: Response, next: NextFunction): void {
  const deviceCode = req.body?.device_code;

  if (!deviceCode) {
    return next();
  }

  const key = `token-poll:${deviceCode}`;
  const maxAttempts = 1;
  const windowMs = 5 * 1000; // 5 seconds

  if (!tokenPollingLimiter.check(key, maxAttempts, windowMs)) {
    res.status(400).json({
      error: 'slow_down',
      message: 'Polling too frequently. Please wait at least 5 seconds between requests.',
    });
    return;
  }

  next();
}

/**
 * Rate limit middleware for code verification
 * Limit: 5 attempts per user code
 */
export function rateLimitCodeVerification(req: Request, res: Response, next: NextFunction): void {
  const userCode = req.body?.user_code || req.query?.user_code;

  if (!userCode) {
    return next();
  }

  const key = `verify:${userCode}`;
  const maxAttempts = 5;
  const windowMs = 15 * 60 * 1000; // 15 minutes (same as device code expiry)

  if (!codeVerificationLimiter.check(key, maxAttempts, windowMs)) {
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many verification attempts. Please request a new code.',
    });
    return;
  }

  next();
}

/**
 * Cleanup all rate limiters
 */
export function destroyRateLimiters(): void {
  deviceCodeLimiter.destroy();
  tokenPollingLimiter.destroy();
  codeVerificationLimiter.destroy();
}
