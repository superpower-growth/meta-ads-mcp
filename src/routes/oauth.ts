/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591)
 *
 * Handles client registration for OAuth 2.0 Device Flow.
 * This allows MCP clients to dynamically register and obtain credentials.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';

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
      grant_types: ['urn:ietf:params:oauth:grant-type:device_code'],
      token_endpoint_auth_method: 'none', // Device flow doesn't require client auth

      // Device Flow endpoints (full URLs)
      device_authorization_endpoint: `${baseUrl}/auth/device/code`,
      token_endpoint: `${baseUrl}/auth/device/token`,
      authorization_endpoint: `${baseUrl}/auth/facebook`, // Traditional OAuth for fallback
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
