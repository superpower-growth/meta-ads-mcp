/**
 * Readiness Middleware
 *
 * Blocks MCP requests until server is ready (tokens loaded from database).
 * Returns 503 Service Unavailable with Retry-After header if still starting.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to wait for server readiness before processing requests
 * Prevents authentication race condition during startup
 */
export async function waitForReadiness(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // If server readiness not initialized, allow through (shouldn't happen)
  if (!global.serverReadiness) {
    return next();
  }

  // If already ready, continue immediately
  if (global.serverReadiness.isReady()) {
    return next();
  }

  // Wait up to 5 seconds for token loading to complete
  const state = await global.serverReadiness.waitUntilReady(5000);

  if (state === 'starting') {
    // Still starting after timeout - return 503
    res.setHeader('Retry-After', '3');
    res.status(503).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Server starting up - authentication tokens loading from database. Please retry in 3 seconds.',
        data: {
          state: 'starting',
          readiness: global.serverReadiness.getStatus(),
        },
      },
      id: null,
    });
    return;
  }

  if (state === 'degraded') {
    // Server is degraded but accepting requests
    console.warn('[Readiness] Request proceeding in degraded state');
  }

  // Ready or degraded - continue
  next();
}
