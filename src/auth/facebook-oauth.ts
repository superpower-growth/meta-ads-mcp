/**
 * Facebook OAuth 2.0 Implementation
 *
 * Handles the OAuth flow for authenticating users with Facebook:
 * 1. Generate OAuth authorization URL
 * 2. Exchange authorization code for access token
 * 3. Fetch user profile information
 */

import axios from 'axios';
import { env } from '../config/env.js';

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v24.0';
const FACEBOOK_OAUTH_DIALOG = 'https://www.facebook.com/v24.0';

export interface FacebookUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Generate Facebook OAuth authorization URL
 */
export function getAuthorizationUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    redirect_uri: env.FACEBOOK_CALLBACK_URL,
    scope: 'email',
    response_type: 'code',
    ...(state && { state }),
  });

  return `${FACEBOOK_OAUTH_DIALOG}/dialog/oauth?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    client_secret: env.FACEBOOK_APP_SECRET,
    redirect_uri: env.FACEBOOK_CALLBACK_URL,
    code,
  });

  const response = await axios.get(`${FACEBOOK_GRAPH_API}/oauth/access_token?${params.toString()}`);

  if (!response.data.access_token) {
    throw new Error('Failed to obtain access token from Facebook');
  }

  return response.data.access_token;
}

/**
 * Fetch user profile information from Facebook
 */
async function getUserProfile(accessToken: string): Promise<FacebookUser> {
  const response = await axios.get(`${FACEBOOK_GRAPH_API}/me`, {
    params: {
      fields: 'id,name,email',
      access_token: accessToken,
    },
  });

  if (!response.data.id || !response.data.email) {
    throw new Error('Failed to fetch user profile from Facebook');
  }

  return {
    id: response.data.id,
    name: response.data.name || 'Facebook User',
    email: response.data.email,
  };
}

/**
 * Complete OAuth flow: exchange code for token and fetch user profile
 */
export async function handleOAuthCallback(code: string): Promise<FacebookUser> {
  try {
    const accessToken = await exchangeCodeForToken(code);
    const user = await getUserProfile(accessToken);
    return user;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Facebook OAuth error: ${error.response?.data?.error?.message || error.message}`
      );
    }
    throw error;
  }
}
