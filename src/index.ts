/**
 * Meta Ads MCP Server
 *
 * Entry point for the Model Context Protocol server that provides
 * conversational access to Meta Marketing API for video ad analytics.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { tools } from './tools/index.js';
import { getAccountInfo } from './tools/get-account.js';
import { getCampaignPerformance } from './tools/get-campaign-performance.js';

// TODO: Switch to HTTP transport after verification (for remote deployment)

/**
 * Initialize MCP server with protocol-compliant configuration
 */
const server = new Server(
  {
    name: 'meta-ads-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Register tools/list handler
 * Returns all available Meta API tools for Claude to discover
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools,
  };
});

/**
 * Register tools/call handler
 * Executes the requested tool with provided arguments
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Route to appropriate tool handler
    switch (name) {
      case 'get-account': {
        const result = await getAccountInfo(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'get-campaign-performance': {
        const result = await getCampaignPerformance(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Format errors for MCP protocol
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start MCP server with stdio transport
 */
async function main() {
  const transport = new StdioServerTransport();

  try {
    await server.connect(transport);
    console.error('Meta Ads MCP server started successfully');
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

main();
