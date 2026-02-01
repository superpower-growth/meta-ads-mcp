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
router.get('/facebook', (req: Request, res: Response) => {
  const state = req.query.state as string | undefined;
  const authUrl = getAuthorizationUrl(state);
  res.redirect(authUrl);
});

/**
 * GET /auth/callback
 * Handle OAuth callback from Facebook
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;

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

    // Device flow: state = "device:<deviceCode>"
    if (state && typeof state === 'string' && state.startsWith('device:')) {
      const deviceCode = state.substring(7); // Extract device code

      try {
        // Authorize the device code with user data
        await global.deviceCodeStore.authorize(deviceCode, {
          id: user.id,
          email: user.email,
          name: user.name,
        });

        // Return success page for device flow
        return res.send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Authorization Successful</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
              }
              .container {
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                padding: 40px;
                max-width: 480px;
                width: 100%;
                text-align: center;
              }
              .checkmark {
                width: 80px;
                height: 80px;
                border-radius: 50%;
                background: #5cb85c;
                margin: 0 auto 24px;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .checkmark svg {
                width: 50px;
                height: 50px;
                fill: white;
              }
              h1 {
                color: #333;
                font-size: 28px;
                margin-bottom: 12px;
              }
              .subtitle {
                color: #666;
                font-size: 16px;
                margin-bottom: 24px;
              }
              .user-info {
                background: #f8f9fa;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 24px;
              }
              .user-info p {
                color: #555;
                margin: 4px 0;
              }
              .user-info strong {
                color: #333;
              }
              .message {
                color: #666;
                font-size: 14px;
                line-height: 1.6;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="checkmark">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              </div>
              <h1>Device Authorized!</h1>
              <p class="subtitle">Authentication successful</p>
              <div class="user-info">
                <p><strong>${user.name}</strong></p>
                <p>${user.email}</p>
              </div>
              <p class="message">
                You can now close this window and return to Claude Code.<br>
                Your MCP client is authenticated and ready to use.
              </p>
            </div>
          </body>
          </html>
        `);
      } catch (error) {
        console.error('Device flow authorization error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).send(`
          <!DOCTYPE html>
          <html>
            <head><title>Authorization Failed</title></head>
            <body>
              <h1>Authorization Failed</h1>
              <p>Error: ${errorMessage}</p>
              <p><a href="/auth/device">Try again</a></p>
            </body>
          </html>
        `);
      }
    }

    // Traditional flow (existing logic)
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
    userId: req.user?.userId,
    email: req.user?.email,
    name: req.user?.name,
    expiresAt: req.session?.expiresAt,
  });
});

export default router;
