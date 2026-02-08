/**
 * Server Readiness Manager
 *
 * Tracks server startup state and blocks requests until critical resources
 * (like authentication tokens) are loaded from database.
 *
 * Prevents race condition where server accepts connections before tokens
 * are loaded into memory, causing authentication failures.
 */

export type ReadinessState = 'starting' | 'ready' | 'degraded';

interface ReadinessStatus {
  state: ReadinessState;
  tokenLoadStartedAt?: Date;
  tokenLoadCompletedAt?: Date;
  tokenCount?: number;
  tokenLoadDurationMs?: number;
  error?: string;
}

export class ServerReadiness {
  private state: ReadinessState = 'starting';
  private tokenLoadStartedAt?: Date;
  private tokenLoadCompletedAt?: Date;
  private tokenCount?: number;
  private error?: string;
  private readyPromise?: Promise<ReadinessState>;
  private readyResolve?: (state: ReadinessState) => void;

  constructor() {
    // Create a promise that resolves when server is ready
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /**
   * Mark that token loading has started
   */
  startTokenLoad(): void {
    this.tokenLoadStartedAt = new Date();
    console.log('[ServerReadiness] Token loading started');
  }

  /**
   * Mark that token loading has completed (success or error)
   * @param count - Number of tokens loaded (0 if error)
   * @param error - Error that occurred during loading (if any)
   */
  completeTokenLoad(count: number, error?: Error): void {
    this.tokenLoadCompletedAt = new Date();
    this.tokenCount = count;

    if (error) {
      this.error = error.message;
      this.state = 'degraded';
      console.error('[ServerReadiness] Token loading failed:', error.message);
      console.error('[ServerReadiness] Server in degraded state - accepting connections without tokens');
    } else {
      this.state = 'ready';
      const durationMs = this.tokenLoadStartedAt
        ? this.tokenLoadCompletedAt.getTime() - this.tokenLoadStartedAt.getTime()
        : 0;
      console.log(`[ServerReadiness] Token loading complete: ${count} tokens in ${durationMs}ms`);
    }

    // Resolve the ready promise
    if (this.readyResolve) {
      this.readyResolve(this.state);
    }
  }

  /**
   * Check if server is ready to accept requests
   */
  isReady(): boolean {
    return this.state === 'ready' || this.state === 'degraded';
  }

  /**
   * Wait until server is ready, with timeout
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @returns The readiness state when ready or after timeout
   */
  async waitUntilReady(timeoutMs: number = 10000): Promise<ReadinessState> {
    if (this.isReady()) {
      return this.state;
    }

    // Race between ready promise and timeout
    const timeoutPromise = new Promise<ReadinessState>((resolve) => {
      setTimeout(() => {
        console.warn(`[ServerReadiness] Timeout after ${timeoutMs}ms - proceeding in degraded state`);
        this.state = 'degraded';
        resolve('degraded');
      }, timeoutMs);
    });

    return Promise.race([this.readyPromise!, timeoutPromise]);
  }

  /**
   * Get current readiness status for monitoring
   */
  getStatus(): ReadinessStatus {
    const status: ReadinessStatus = {
      state: this.state,
    };

    if (this.tokenLoadStartedAt) {
      status.tokenLoadStartedAt = this.tokenLoadStartedAt;
    }

    if (this.tokenLoadCompletedAt) {
      status.tokenLoadCompletedAt = this.tokenLoadCompletedAt;
      status.tokenCount = this.tokenCount;

      // Only calculate duration if we have both timestamps
      if (this.tokenLoadStartedAt) {
        const durationMs = this.tokenLoadCompletedAt.getTime() - this.tokenLoadStartedAt.getTime();
        status.tokenLoadDurationMs = durationMs;
      }
    }

    if (this.error) {
      status.error = this.error;
    }

    return status;
  }

  /**
   * Reset readiness state (for testing)
   */
  reset(): void {
    this.state = 'starting';
    this.tokenLoadStartedAt = undefined;
    this.tokenLoadCompletedAt = undefined;
    this.tokenCount = undefined;
    this.error = undefined;

    // Create new ready promise
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }
}

// Global singleton instance
declare global {
  var serverReadiness: ServerReadiness | undefined;
}
