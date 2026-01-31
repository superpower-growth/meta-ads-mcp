/**
 * Meta Marketing API Client
 *
 * Initializes FacebookAdsApi with proper authentication and versioning.
 * Follows official SDK patterns from Meta's documentation.
 *
 * @see https://developers.facebook.com/docs/marketing-api/sdks
 */

import { FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { env } from '../config/env.js';

// API version - Meta deprecates versions every 90 days (quarterly)
// SDK version 24.0.1 uses v24.0 API version (hardcoded in FacebookAdsApi.VERSION)
// Note: facebook-nodejs-business-sdk does not expose a setVersion() method.
// The version is determined by the SDK version installed.
const API_VERSION = FacebookAdsApi.VERSION;

// Validate access token
if (!env.META_ACCESS_TOKEN || env.META_ACCESS_TOKEN.trim() === '') {
  throw new Error(
    'META_ACCESS_TOKEN environment variable is required. See .env.example for setup.'
  );
}

// Initialize Facebook Ads API
const api = FacebookAdsApi.init(env.META_ACCESS_TOKEN);

// Enable debug mode only in development (not production)
// Uncomment for development debugging:
// if (process.env.NODE_ENV === 'development') {
//   api.setDebug(true);
// }

export { api, API_VERSION };
