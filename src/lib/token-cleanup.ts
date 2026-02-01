import { DeviceCodeStore, AccessTokenStore } from '../auth/device-flow.js';

/**
 * Background cleanup service for device codes and access tokens
 */
export class TokenCleanupService {
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private deviceCodeStore: DeviceCodeStore,
    private accessTokenStore: AccessTokenStore,
    private intervalMs: number = 5 * 60 * 1000 // 5 minutes
  ) {
    this.cleanupInterval = setInterval(() => this.runCleanup(), intervalMs);
    console.log(`[TokenCleanupService] Started with ${intervalMs}ms interval`);
  }

  /**
   * Run cleanup on all stores
   */
  private runCleanup(): void {
    const startTime = Date.now();

    try {
      // Get stats before cleanup
      const deviceCodeStatsBefore = this.deviceCodeStore.getStats();
      const accessTokenStatsBefore = this.accessTokenStore.getStats();

      // Run cleanup
      this.deviceCodeStore.cleanup();
      this.accessTokenStore.cleanup();

      // Get stats after cleanup
      const deviceCodeStatsAfter = this.deviceCodeStore.getStats();
      const accessTokenStatsAfter = this.accessTokenStore.getStats();

      // Calculate cleaned counts
      const deviceCodesRemoved = deviceCodeStatsBefore.total - deviceCodeStatsAfter.total;
      const accessTokensRemoved = accessTokenStatsBefore.total - accessTokenStatsAfter.total;

      const duration = Date.now() - startTime;

      console.log(`[TokenCleanupService] Cleanup completed in ${duration}ms`);
      console.log(`  Device codes: ${deviceCodesRemoved} removed, ${deviceCodeStatsAfter.total} remaining (${deviceCodeStatsAfter.pending} pending)`);
      console.log(`  Access tokens: ${accessTokensRemoved} removed, ${accessTokenStatsAfter.total} remaining (${accessTokenStatsAfter.active} active)`);
    } catch (error) {
      console.error('[TokenCleanupService] Cleanup failed:', error);
    }
  }

  /**
   * Get current statistics
   */
  getStats(): {
    deviceCodes: ReturnType<DeviceCodeStore['getStats']>;
    accessTokens: ReturnType<AccessTokenStore['getStats']>;
  } {
    return {
      deviceCodes: this.deviceCodeStore.getStats(),
      accessTokens: this.accessTokenStore.getStats(),
    };
  }

  /**
   * Stop the cleanup service
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    console.log('[TokenCleanupService] Stopped');
  }
}
