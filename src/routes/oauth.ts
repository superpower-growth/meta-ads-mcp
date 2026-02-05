/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591)
 *
 * Handles client registration for OAuth 2.0 Device Flow.
 * This allows MCP clients to dynamically register and obtain credentials.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { generateAccessToken } from '../auth/device-flow.js';

const router = Router();

// Get base URL from environment or request
function getBaseUrl(req: Request): string {
  // In production, use the configured callback URL's base
  if (env.NODE_ENV === 'production') {
    const callbackUrl = new URL(env.FACEBOOK_CALLBACK_URL);
    return `${callbackUrl.protocol}//${callbackUrl.host}`;
  }
  // In development, construct from request
  return `${req.protocol}://${req.get('host')}`;
}

/**
 * GET /.well-known/oauth-authorization-server
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * Allows clients to discover OAuth endpoints and capabilities
 */
router.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
  const baseUrl = getBaseUrl(req);

  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,

    // Supported grant types
    grant_types_supported: ['authorization_code'],

    // Supported response types
    response_types_supported: ['code'],

    // Token endpoint auth methods
    token_endpoint_auth_methods_supported: ['none'],

    // PKCE support
    code_challenge_methods_supported: ['S256', 'plain'],

    // Service documentation
    service_documentation: `${baseUrl}/health`,
  });
});

// Store for authorization codes (in-memory for development)
interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: Date;
  userId?: string;
  email?: string;
  name?: string;
}

export const authorizationCodes = new Map<string, AuthorizationCode>();

/**
 * GET /authorize
 * OAuth 2.0 Authorization Code flow with PKCE
 * Handles authorization requests from MCP clients
 */
router.get('/authorize', (req: Request, res: Response) => {
  const {
    response_type,
    client_id,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
  } = req.query;

  // Validate required parameters
  if (response_type !== 'code') {
    return res.status(400).json({
      error: 'unsupported_response_type',
      error_description: 'Only "code" response type is supported',
    });
  }

  if (!client_id || !redirect_uri) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameters: client_id, redirect_uri',
    });
  }

  // Store authorization request parameters in session
  req.session.authRequest = {
    clientId: client_id as string,
    redirectUri: redirect_uri as string,
    state: state as string,
    codeChallenge: code_challenge as string,
    codeChallengeMethod: (code_challenge_method as string) || 'plain',
  };

  // Redirect to Facebook OAuth for user authentication
  const fbState = `oauth:${state || ''}`;
  res.redirect(`/auth/facebook?state=${encodeURIComponent(fbState)}`);
});

/**
 * POST /token
 * OAuth 2.0 Token endpoint
 * Exchanges authorization code for access token
 */
router.post('/token', async (req: Request, res: Response) => {
  const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body;

  // Validate grant type
  if (grant_type !== 'authorization_code') {
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code grant type is supported',
    });
  }

  // Validate required parameters
  if (!code || !redirect_uri || !client_id) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameters',
    });
  }

  // Retrieve authorization code
  const authCode = authorizationCodes.get(code);

  if (!authCode) {
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Invalid or expired authorization code',
    });
  }

  // Validate authorization code
  if (authCode.expiresAt < new Date()) {
    authorizationCodes.delete(code);
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Authorization code has expired',
    });
  }

  if (authCode.clientId !== client_id) {
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Client ID mismatch',
    });
  }

  if (authCode.redirectUri !== redirect_uri) {
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Redirect URI mismatch',
    });
  }

  // Validate PKCE if code_challenge was provided
  if (authCode.codeChallenge) {
    if (!code_verifier) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'code_verifier is required',
      });
    }

    // Validate code_verifier against code_challenge
    const method = authCode.codeChallengeMethod || 'plain';
    let computedChallenge: string;

    if (method === 'S256') {
      computedChallenge = crypto
        .createHash('sha256')
        .update(code_verifier)
        .digest('base64url');
    } else {
      computedChallenge = code_verifier;
    }

    if (computedChallenge !== authCode.codeChallenge) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid code_verifier',
      });
    }
  }

  // Code is valid, delete it (one-time use)
  authorizationCodes.delete(code);

  // Generate access token
  const accessToken = generateAccessToken();

  // Store access token
  await global.accessTokenStore.set(accessToken, {
    userId: authCode.userId!,
    email: authCode.email!,
    name: authCode.name!,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    createdAt: new Date(),
  });

  // Terminate all existing MCP connections for this user to force reconnection with new token
  if (global.mcpConnectionRegistry) {
    const terminatedCount = global.mcpConnectionRegistry.terminateByUserId(authCode.userId!);
    console.log(`[OAuth Token] Terminated ${terminatedCount} stale connections for user:`, authCode.userId);
  }

  console.log('[OAuth Token] Access token issued for:', {
    clientId: authCode.clientId,
    userId: authCode.userId,
  });

  // Return access token
  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 24 * 60 * 60, // 24 hours in seconds
  });
});

/**
 * POST /register
 * OAuth 2.0 Dynamic Client Registration
 *
 * Accepts client metadata and returns client credentials.
 * For Device Flow, we don't require client authentication.
 */
router.post('/register', (req: Request, res: Response) => {
  try {
    const clientMetadata = req.body;

    // Generate client credentials
    const clientId = `mcp_client_${crypto.randomBytes(16).toString('hex')}`;

    // For Device Flow, client_secret is optional
    // We'll generate one but it won't be required for device flow
    const clientSecret = crypto.randomBytes(32).toString('hex');

    console.log('[OAuth Registration] New client registered:', {
      clientId,
      clientName: clientMetadata?.client_name,
      redirectUris: clientMetadata?.redirect_uris
    });

    const baseUrl = getBaseUrl(req);

    // Return client registration response per RFC 7591
    res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0, // Never expires

      // Echo back the metadata that was provided
      client_name: clientMetadata?.client_name || 'MCP Client',
      redirect_uris: clientMetadata?.redirect_uris || [],
      grant_types: ['authorization_code'],
      token_endpoint_auth_method: 'none',

      // OAuth 2.0 endpoints (full URLs)
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,

      // OAuth metadata discovery
      oauth_authorization_server: `${baseUrl}/.well-known/oauth-authorization-server`
    });
  } catch (error) {
    console.error('[OAuth Registration] Error:', error);
    res.status(400).json({
      error: 'invalid_client_metadata',
      error_description: 'Failed to register client',
    });
  }
});

export default router;
