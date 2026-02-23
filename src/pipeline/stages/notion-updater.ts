import axios from 'axios';
import { env } from '../../config/env.js';

export async function updateNotionPage(
  pageId: string,
  primaryText: string,
  headline: string
): Promise<void> {
  const token = env.NOTION_API_KEY;
  if (!token) throw new Error('NOTION_API_KEY not configured');

  await axios.patch(
    `https://api.notion.com/v1/pages/${pageId}`,
    {
      properties: {
        'Primary Text': {
          rich_text: [{ text: { content: primaryText } }],
        },
        'Headline': {
          rich_text: [{ text: { content: headline } }],
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
    }
  );
}
