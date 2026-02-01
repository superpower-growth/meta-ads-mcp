/**
 * Authentication Middleware
 *
 * Protects routes by requiring valid authentication.
 * Supports both Bearer token (device flow) and session cookie authentication.
 * Returns 401 Unauthorized with device flow instructions if user is not authenticated.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Extend Express Request to include user data
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        name: string;
      };
    }
  }
}

/**
 * Send device flow challenge response
 */
function sendDeviceFlowChallenge(res: Response): void {
  res.status(401).json({
    error: 'authentication_required',
    message: 'Please authenticate using device flow.',
    device_flow: {
      endpoint: '/auth/device/code',
      instructions: [
        '1. POST to /auth/device/code to get device code',
        '2. Visit verification_uri and enter user_code',
        '3. Poll /auth/device/token until authorized',
        '4. Use access_token in Authorization: Bearer header',
      ],
    },
    loginUrl: '/auth/facebook', // Backward compatibility
  });
}

/**
 * Check if user is authenticated (helper function)
 * Returns user data if authenticated, null otherwise
 */
function checkAuth(req: Request): { userId: string; email: string; name: string } | null {
  // Priority 1: Check Bearer token (device flow)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Validate token with access token store
    if (global.accessTokenStore) {
      const tokenData = global.accessTokenStore.validate(token);
      if (tokenData) {
        return {
          userId: tokenData.userId,
          email: tokenData.email,
          name: tokenData.name,
        };
      }
    }
  }

  // Priority 2: Check session cookie (traditional flow)
  if (req.session?.userId) {
    // Check if session has expired
    if (req.session.expiresAt && new Date() > new Date(req.session.expiresAt)) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying expired session:', err);
        }
      });
      return null;
    }

    return {
      userId: req.session.userId,
      email: req.session.email || '',
      name: req.session.name || '',
    };
  }

  return null;
}

/**
 * Middleware to require authentication for protected routes
 * Supports both Bearer token (Priority 1) and session cookie (Priority 2)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = checkAuth(req);

  if (user) {
    req.user = user;
    return next();
  }

  // Unauthenticated: Return device flow instructions
  sendDeviceFlowChallenge(res);
}

/**
 * Middleware for MCP endpoints that allows tool discovery without auth
 * but requires auth for tool execution
 */
export function requireAuthForToolCall(req: Request, res: Response, next: NextFunction): void {
  const user = checkAuth(req);

  if (user) {
    req.user = user;
    return next();
  }

  // For GET requests (SSE handshake), allow without auth
  if (req.method === 'GET') {
    return next();
  }

  // For POST requests (MCP protocol), check the method
  if (req.method === 'POST' && req.body) {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      // Allow MCP protocol messages without authentication:
      // - initialize: Required for MCP handshake
      // - tools/list: Tool discovery
      // - initialized: Notification after initialization
      const allowedMethods = ['initialize', 'tools/list', 'initialized', 'notifications/initialized'];

      if (body.method && allowedMethods.includes(body.method)) {
        return next();
      }

      // Require auth for tool calls
      if (body.method === 'tools/call') {
        return sendDeviceFlowChallenge(res);
      }
    } catch (error) {
      // Invalid JSON, allow it through (MCP will handle the error)
      return next();
    }
  }

  // Default: allow (MCP protocol will handle)
  next();
}
