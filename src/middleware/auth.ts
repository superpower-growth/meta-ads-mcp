/**
 * Authentication Middleware
 *
 * Protects routes by requiring valid authentication.
 * Supports Bearer token (OAuth) authentication.
 * Returns 401 Unauthorized if user is not authenticated.
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
 * Send authentication required response in JSONRPC format
 */
function sendAuthRequired(req: Request, res: Response): void {
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: 'Authentication required. Please restart Claude Code after authenticating.',
      data: {
        authentication: {
          type: 'oauth2',
          oauth_authorization_server: `${baseUrl}/.well-known/oauth-authorization-server`,
          authorization_endpoint: `${baseUrl}/authorize`,
          token_endpoint: `${baseUrl}/token`,
          registration_endpoint: `${baseUrl}/register`,
          instructions: 'Use /mcp command in Claude Code to authenticate. After authentication completes, restart Claude Code for the connection to refresh.',
        },
      },
    },
    id: null,
  });
}

/**
 * Check if user is authenticated (helper function)
 * Returns user data if authenticated, null otherwise
 */
function checkAuth(req: Request): { userId: string; email: string; name: string } | null {
  // Check Bearer token
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

  return null;
}

/**
 * Middleware to require authentication for protected routes
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = checkAuth(req);

  if (user) {
    req.user = user;
    return next();
  }

  // Unauthenticated
  sendAuthRequired(req, res);
}

/**
 * Middleware for MCP endpoints that allows tool discovery without auth
 * but requires auth for tool execution
 *
 * Can be disabled for local development by setting REQUIRE_AUTH=false
 */
export function requireAuthForToolCall(req: Request, res: Response, next: NextFunction): void {
  // Skip auth if REQUIRE_AUTH=false (local development mode)
  if (process.env.REQUIRE_AUTH === 'false') {
    return next();
  }

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
        return sendAuthRequired(req, res);
      }
    } catch (error) {
      // Invalid JSON, allow it through (MCP will handle the error)
      return next();
    }
  }

  // Default: allow (MCP protocol will handle)
  next();
}
