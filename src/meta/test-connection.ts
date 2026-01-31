/**
 * Meta API Connection Test Script
 *
 * This is a test script. Run with: tsx src/meta/test-connection.ts after setting META_ACCESS_TOKEN in .env
 *
 * Verifies Meta Marketing API connectivity by:
 * 1. Authenticating with access token
 * 2. Querying basic ad account information
 * 3. Displaying account name, ID, and currency
 *
 * Common Meta API error codes:
 * - 190: Invalid OAuth 2.0 Access Token
 * - 100: Invalid parameter or permission error
 * - 17: User request limit reached (rate limit)
 * - 32: Page request limit reached (rate limit)
 */

import { api, API_VERSION } from './client.js';
import { AdAccount } from 'facebook-nodejs-business-sdk';
import { env } from '../config/env.js';

async function testConnection() {
  try {
    console.log('Testing Meta Marketing API connection...');
    console.log(`API Version: ${API_VERSION}`);
    console.log(`Ad Account ID: ${env.META_AD_ACCOUNT_ID}\n`);

    // Create AdAccount instance
    const account = new AdAccount(env.META_AD_ACCOUNT_ID);

    // Fetch basic account information
    console.log('Fetching account details...');
    const accountData = await account.get(['name', 'account_id', 'currency']);

    // Success - display account information
    // Note: SDK dynamically adds fields to the object, so we cast to any for access
    const data = accountData as any;
    console.log('\n✓ Connection successful!\n');
    console.log('Account Details:');
    console.log(`  Name: ${data.name || 'N/A'}`);
    console.log(`  ID: ${data.account_id || 'N/A'}`);
    console.log(`  Currency: ${data.currency || 'N/A'}`);

    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Connection failed!\n');

    // Handle Meta API-specific errors
    if (error.response?.error) {
      const metaError = error.response.error;
      console.error(`Meta API Error ${metaError.code}: ${metaError.message}`);
      console.error(`Type: ${metaError.type || 'Unknown'}`);

      // Provide specific guidance for common errors
      switch (metaError.code) {
        case 190:
          console.error(
            '\nTroubleshooting: Invalid access token. Please check:\n' +
              '  1. Token is valid and not expired\n' +
              '  2. Token has required permissions (ads_read, ads_management)\n' +
              '  3. Token is properly set in .env file'
          );
          break;
        case 100:
          console.error(
            '\nTroubleshooting: Invalid parameter or permission error. Please check:\n' +
              '  1. Ad account ID format is correct (act_123456789)\n' +
              '  2. You have access to this ad account\n' +
              '  3. Token has required permissions'
          );
          break;
        case 17:
        case 32:
          console.error(
            '\nTroubleshooting: Rate limit reached. Please:\n' +
              '  1. Wait a few minutes before retrying\n' +
              '  2. Check API usage in Meta Business Manager'
          );
          break;
        default:
          console.error('\nSee: https://developers.facebook.com/docs/graph-api/using-graph-api/error-handling');
      }

      if (metaError.error_subcode) {
        console.error(`Error Subcode: ${metaError.error_subcode}`);
      }
    } else {
      // Generic error (network, etc.)
      console.error('Error:', error.message || error);
    }

    process.exit(1);
  }
}

// Run the test
testConnection();
