import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AdCreatorService } from '../meta/ad-creator.js';

export async function syncCampaignsToNotion(): Promise<string> {
  const service = new AdCreatorService();
  const campaigns = await service.getActiveCampaigns();

  if (campaigns.length === 0) {
    return JSON.stringify({ count: 0, campaigns: [], message: 'No active campaigns found in Meta' });
  }

  return JSON.stringify({
    count: campaigns.length,
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name })),
    message: `Found ${campaigns.length} active campaigns. Use Notion MCP to update the "Meta Campaign" select options with these campaigns.`,
  }, null, 2);
}

export const syncCampaignsToNotionTool: Tool = {
  name: 'sync-campaigns-to-notion',
  description:
    'Fetches all ACTIVE campaigns from Meta Ads and returns them. ' +
    'Use the returned campaign list to update Notion\'s "Meta Campaign" select options via Notion MCP.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};
