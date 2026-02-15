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
import crypto from 'crypto';
import { getAuthorizationUrl, handleOAuthCallback } from '../auth/facebook-oauth.js';
import { isGoogleOAuthConfigured, getGoogleAuthUrl, handleGoogleCallback } from '../auth/google-oauth.js';
import { requireAuth } from '../middleware/auth.js';
import { authorizationCodes } from './oauth.js';

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

    // OAuth Authorization Code flow
    const authRequest = req.session.authRequest;

    if (!authRequest) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Invalid Request</title></head>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1>Invalid OAuth Request</h1>
            <p>No authorization request found. Please try again.</p>
            <p><a href="/">Go to homepage</a></p>
          </body>
        </html>
      `);
    }

    // Generate authorization code
    const authorizationCode = crypto.randomBytes(32).toString('hex');

    // Store authorization code with user info
    authorizationCodes.set(authorizationCode, {
      code: authorizationCode,
      clientId: authRequest.clientId,
      redirectUri: authRequest.redirectUri,
      codeChallenge: authRequest.codeChallenge,
      codeChallengeMethod: authRequest.codeChallengeMethod,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    // Clear auth request from session
    delete req.session.authRequest;

    // Redirect back to client with authorization code
    const redirectUrl = new URL(authRequest.redirectUri);
    redirectUrl.searchParams.set('code', authorizationCode);
    if (authRequest.state) {
      redirectUrl.searchParams.set('state', authRequest.state);
    }

    console.log('[OAuth Callback] Authorization successful for:', user.email);
    console.log('[OAuth Callback] Redirecting to:', redirectUrl.toString());
    return res.redirect(redirectUrl.toString());
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
  });
});

/**
 * GET /auth/google
 * Redirect user to Google OAuth consent screen for Drive access
 */
router.get('/google', (_req: Request, res: Response) => {
  if (!isGoogleOAuthConfigured()) {
    return res.status(500).json({
      error: 'Google OAuth not configured',
      message: 'Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET env vars.',
    });
  }
  res.redirect(getGoogleAuthUrl());
});

/**
 * GET /auth/google/callback
 * Handle OAuth callback from Google, store refresh token in Firestore
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ error: 'Google OAuth denied', message: error });
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Invalid request', message: 'Authorization code is missing' });
  }

  try {
    const { email } = await handleGoogleCallback(code);
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Drive Authorized</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center;">
          <h1>Google Drive Access Authorized</h1>
          <p>Signed in as <strong>${email}</strong></p>
          <p>The server can now access Google Drive folders without per-folder sharing.</p>
          <p>You can close this tab.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[Google OAuth] Callback error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'Google OAuth failed', message });
  }
});

export default router;
