import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AdCreatorService } from '../meta/ad-creator.js';
import { env } from '../config/env.js';
import { pipelineConfig } from '../pipeline/config.js';

export async function syncCampaignsToNotion(): Promise<string> {
  if (!env.NOTION_API_KEY) {
    throw new Error('NOTION_API_KEY is not configured');
  }

  const dbId = pipelineConfig.notionDbId;
  if (!dbId) {
    throw new Error('NOTION_MEDIA_DB_ID is not configured');
  }

  // Fetch active campaigns from Meta
  const service = new AdCreatorService();
  const campaigns = await service.getActiveCampaigns();

  if (campaigns.length === 0) {
    return JSON.stringify({ synced: 0, message: 'No active campaigns found in Meta' });
  }

  // Build select options for Notion's "Meta Campaign" property
  const selectOptions = campaigns.map((c) => ({
    name: `${c.name} (${c.id})`,
  }));

  // PATCH Notion database to update the "Meta Campaign" select options
  const response = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        'Meta Campaign': {
          select: {
            options: selectOptions,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Notion API error (${response.status}): ${errorBody}`);
  }

  return JSON.stringify({
    synced: campaigns.length,
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name })),
    message: `Updated "Meta Campaign" select with ${campaigns.length} active campaigns`,
  }, null, 2);
}

export const syncCampaignsToNotionTool: Tool = {
  name: 'sync-campaigns-to-notion',
  description:
    'Fetches all ACTIVE campaigns from Meta Ads and syncs them as select options in the Notion Media Deliverables database\'s "Meta Campaign" property. ' +
    'Notion\'s PATCH merges options, so existing options are preserved.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};
