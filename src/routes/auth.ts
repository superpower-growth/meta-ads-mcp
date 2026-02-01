/**
 * Authentication Routes
 *
 * Handles OAuth authentication flow endpoints:
 * - GET /auth/facebook - Initiate OAuth flow
 * - GET /auth/callback - Handle OAuth callback
 * - GET /auth/logout - Destroy session
 * - GET /auth/me - Get current user info
 */

import { Router, Request, Response } from 'express';
import { getAuthorizationUrl, handleOAuthCallback } from '../auth/facebook-oauth.js';
import { getSessionExpiry } from '../auth/session.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /auth/facebook
 * Redirect user to Facebook OAuth login page
 */
router.get('/facebook', (_req: Request, res: Response) => {
  const authUrl = getAuthorizationUrl();
  res.redirect(authUrl);
});

/**
 * GET /auth/callback
 * Handle OAuth callback from Facebook
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, error, error_description } = req.query;

  // Handle OAuth errors
  if (error) {
    return res.status(400).json({
      error: 'OAuth failed',
      message: error_description || error,
    });
  }

  // Validate authorization code
  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Authorization code is missing',
    });
  }

  try {
    // Exchange code for user profile
    const user = await handleOAuthCallback(code);

    // Create session
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.name = user.name;
    req.session.expiresAt = getSessionExpiry();

    // Save session and redirect
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session:', err);
        return res.status(500).json({
          error: 'Session creation failed',
          message: 'Failed to create user session',
        });
      }

      // Redirect to success page
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Login Successful</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; }
              .info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; padding: 15px; border-radius: 5px; margin-top: 20px; }
              code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
              pre { background: #f4f4f4; padding: 10px; border-radius: 3px; overflow-x: auto; }
            </style>
          </head>
          <body>
            <h1>Login Successful!</h1>
            <div class="success">
              <p><strong>Welcome, ${user.name}!</strong></p>
              <p>You have successfully authenticated with Facebook.</p>
              <p>Email: ${user.email}</p>
            </div>
            <div class="info">
              <h3>Next Steps: Configure Claude Code</h3>
              <ol>
                <li>Open your browser's Developer Tools (F12)</li>
                <li>Go to <strong>Application → Cookies</strong></li>
                <li>Find and copy the <code>connect.sid</code> cookie value</li>
                <li>Update your <code>~/.config/claude-code/mcp.json</code>:</li>
              </ol>
              <pre>{
  "mcpServers": {
    "meta-ads": {
      "url": "http://localhost:3000/mcp",
      "transport": "http",
      "headers": {
        "Cookie": "connect.sid=YOUR_SESSION_COOKIE"
      }
    }
  }
}</pre>
              <p><strong>Session expires in 24 hours.</strong> Repeat this process to renew.</p>
            </div>
          </body>
        </html>
      `);
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      error: 'Authentication failed',
      message: errorMessage,
    });
  }
});

/**
 * GET /auth/logout
 * Destroy user session and logout
 */
router.get('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({
        error: 'Logout failed',
        message: 'Failed to destroy session',
      });
    }

    res.json({
      message: 'Logged out successfully',
      loginUrl: '/auth/facebook',
    });
  });
});

/**
 * GET /auth/me
 * Get current authenticated user information
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({
    userId: req.session.userId,
    email: req.session.email,
    name: req.session.name,
    expiresAt: req.session.expiresAt,
  });
});

export default router;
