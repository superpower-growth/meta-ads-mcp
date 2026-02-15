/**
 * Google OAuth 2.0 for Drive API Access
 *
 * One-time OAuth flow: visit /auth/google, authorize Drive read access,
 * and the server stores a refresh token in Firestore. All future Drive API
 * calls use this token (auto-refreshed). Falls back to service account
 * if OAuth isn't configured.
 */

import axios from 'axios';
import { env } from '../config/env.js';
import { firestore, isGcpEnabled } from '../lib/gcp-clients.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const FIRESTORE_COLLECTION = 'google_oauth';
const FIRESTORE_DOC = 'drive_credentials';

interface DriveCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
  email: string;
  authorizedAt: string;
}

/**
 * Check if Google OAuth env vars are configured
 */
export function isGoogleOAuthConfigured(): boolean {
  return !!(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

/**
 * Build the Google consent URL for Drive readonly + email scopes
 */
export function getGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: env.GOOGLE_OAUTH_CALLBACK_URL!,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.readonly email',
    access_type: 'offline',
    prompt: 'consent',
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange auth code for tokens, fetch user email, save to Firestore
 */
export async function handleGoogleCallback(code: string): Promise<{ email: string }> {
  // Exchange code for tokens
  const tokenResponse = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
    code,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
    redirect_uri: env.GOOGLE_OAUTH_CALLBACK_URL!,
    grant_type: 'authorization_code',
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const { access_token, refresh_token, expires_in } = tokenResponse.data;

  if (!refresh_token) {
    throw new Error('No refresh token received. Ensure prompt=consent and access_type=offline.');
  }

  // Fetch user email
  const userResponse = await axios.get(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const email = userResponse.data.email || 'unknown';

  // Save to Firestore
  if (!isGcpEnabled || !firestore) {
    throw new Error('Firestore not available — cannot persist Google OAuth credentials');
  }

  const credentials: DriveCredentials = {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: Date.now() + expires_in * 1000,
    email,
    authorizedAt: new Date().toISOString(),
  };

  await firestore.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).set(credentials);
  console.log(`[Google OAuth] Credentials saved for ${email}`);

  return { email };
}

/**
 * Load credentials from Firestore, refresh if expired, return access token or null
 */
export async function getDriveAccessToken(): Promise<string | null> {
  if (!isGoogleOAuthConfigured() || !isGcpEnabled || !firestore) {
    return null;
  }

  try {
    const doc = await firestore.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).get();
    if (!doc.exists) return null;

    const creds = doc.data() as DriveCredentials;

    // If token expires within 5 minutes, refresh it
    if (creds.expiresAt - Date.now() < 5 * 60 * 1000) {
      const refreshResponse = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
        client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
        refresh_token: creds.refreshToken,
        grant_type: 'refresh_token',
      }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const { access_token, expires_in } = refreshResponse.data;

      // Update Firestore with new access token
      const updated: Partial<DriveCredentials> = {
        accessToken: access_token,
        expiresAt: Date.now() + expires_in * 1000,
      };
      await firestore.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).update(updated);

      console.log('[Google OAuth] Access token refreshed');
      return access_token;
    }

    return creds.accessToken;
  } catch (error) {
    console.error('[Google OAuth] Failed to get Drive access token:', error instanceof Error ? error.message : error);
    return null;
  }
}
