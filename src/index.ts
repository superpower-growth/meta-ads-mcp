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

  // Find the tool in our registry
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  // Tool implementation will be added when we create actual tools
  // For now, return placeholder
  return {
    content: [
      {
        type: 'text',
        text: `Tool ${name} called with args: ${JSON.stringify(args)}`,
      },
    ],
  };
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
