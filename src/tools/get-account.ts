/**
 * Get Account Tool
 *
 * Basic MCP tool to test Meta API integration.
 * Queries ad account information to verify end-to-end connectivity.
 */

import { z } from 'zod';
import { AdAccount } from 'facebook-nodejs-business-sdk';
import { api } from '../meta/client.js';
import { createToolSchema } from '../lib/validation.js';

/**
 * Input schema for get-account tool
 */
const GetAccountInputSchema = z.object({
  accountId: z.string().describe('Meta Ad Account ID (with or without act_ prefix)'),
});

type GetAccountInput = z.infer<typeof GetAccountInputSchema>;

/**
 * Get account information from Meta Marketing API
 *
 * @param input - Account ID to query
 * @returns Formatted account information
 */
export async function getAccountInfo(input: GetAccountInput): Promise<string> {
  const validate = createToolSchema(GetAccountInputSchema);
  const { accountId } = validate(input);

  // Ensure account ID has act_ prefix
  const normalizedAccountId = accountId.startsWith('act_')
    ? accountId
    : `act_${accountId}`;

  try {
    // Create AdAccount instance and fetch details
    const account = new AdAccount(normalizedAccountId);
    const fields = ['name', 'account_id', 'currency', 'account_status'];

    // Call Meta API (using the initialized api singleton)
    await account.get(fields);

    // Access data from the account object (SDK populates properties dynamically)
    const accountData = account._data as {
      name?: string;
      account_id?: string;
      currency?: string;
      account_status?: number;
    };

    // Format response
    return `Account Information:
- Name: ${accountData.name || 'N/A'}
- ID: ${accountData.account_id || 'N/A'}
- Currency: ${accountData.currency || 'N/A'}
- Status: ${accountData.account_status || 'N/A'}`;
  } catch (error) {
    // Format Meta API errors for user clarity
    if (error instanceof Error) {
      throw new Error(`Meta API error: ${error.message}`);
    }
    throw new Error('Unknown error querying Meta ad account');
  }
}

/**
 * MCP Tool definition for get-account
 */
export const getAccountTool = {
  name: 'get-account',
  description:
    'Get basic information about a Meta ad account including name, ID, currency, and status',
  inputSchema: {
    type: 'object' as const,
    properties: {
      accountId: {
        type: 'string' as const,
        description: 'Meta Ad Account ID (with or without act_ prefix)',
      },
    },
    required: ['accountId'],
  },
};
