import axios from 'axios';
import { env } from '../../config/env.js';
import { pipelineConfig } from '../config.js';
import { NotionAdPage } from '../types.js';

export async function fetchNewAdPages(): Promise<NotionAdPage[]> {
  const token = env.NOTION_API_KEY;
  if (!token) throw new Error('NOTION_API_KEY not configured');

  const response = await axios.post(
    `https://api.notion.com/v1/databases/${pipelineConfig.notionDbId}/query`,
    {
      filter: {
        and: [
          {
            property: 'Asset Link',
            url: { is_not_empty: true },
          },
          {
            property: 'Primary Text',
            rich_text: { is_empty: true },
          },
        ],
      },
      page_size: 100,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.results.map((page: any) => {
    const props = page.properties;
    return {
      id: page.id,
      deliverableName: extractTitle(props['Deliverable Name'] || props['Name']),
      assetLink: props['Asset Link']?.url || '',
      angle: extractRichText(props['Angle']),
      format: extractSelect(props['Format']),
      messenger: extractSelect(props['Messenger']),
      mediaType: extractSelect(props['Media Type']) || 'video',
      landingPageUrl: extractSelect(props['Landing Page URL']) || '',
    };
  });
}

function extractTitle(prop: any): string {
  if (!prop) return '';
  if (prop.title) return prop.title.map((t: any) => t.plain_text).join('');
  return '';
}

function extractRichText(prop: any): string {
  if (!prop?.rich_text) return '';
  return prop.rich_text.map((t: any) => t.plain_text).join('');
}

function extractSelect(prop: any): string {
  if (!prop?.select) return '';
  return prop.select.name || '';
}
