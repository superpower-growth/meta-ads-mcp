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
 * Middleware to require authentication for protected routes
 * Supports both Bearer token (Priority 1) and session cookie (Priority 2)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Priority 1: Check Bearer token (device flow)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Validate token with access token store
    if (global.accessTokenStore) {
      const tokenData = global.accessTokenStore.validate(token);
      if (tokenData) {
        // Set user data on request
        req.user = {
          userId: tokenData.userId,
          email: tokenData.email,
          name: tokenData.name,
        };
        return next();
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

      return sendDeviceFlowChallenge(res);
    }

    // Set user data on request
    req.user = {
      userId: req.session.userId,
      email: req.session.email || '',
      name: req.session.name || '',
    };
    return next();
  }

  // Unauthenticated: Return device flow instructions
  sendDeviceFlowChallenge(res);
}
