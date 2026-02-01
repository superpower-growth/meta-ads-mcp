/**
 * Authentication Middleware
 *
 * Protects routes by requiring valid session authentication.
 * Returns 401 Unauthorized with login URL if user is not authenticated.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to require authentication for protected routes
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Check if user has a valid session
  if (!req.session?.userId) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required. Please login with Facebook.',
      loginUrl: '/auth/facebook',
    });
    return;
  }

  // Check if session has expired
  if (req.session.expiresAt && new Date() > new Date(req.session.expiresAt)) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying expired session:', err);
      }
    });

    res.status(401).json({
      error: 'Session expired',
      message: 'Your session has expired. Please login again.',
      loginUrl: '/auth/facebook',
    });
    return;
  }

  // User is authenticated, proceed to next handler
  next();
}
