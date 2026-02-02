/**
 * Meta Ads MCP Server
 *
 * Entry point for the Model Context Protocol server that provides
 * conversational access to Meta Marketing API for video ad analytics.
 *
 * Remote HTTP server with Facebook OAuth authentication.
 */

import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import crypto from 'crypto';
import { env } from './config/env.js';
import { getSessionConfig } from './auth/session.js';
import { requireAuthForToolCall } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import { AccessTokenStore } from './auth/device-flow.js';
import { tools } from './tools/index.js';
import { getAccountInfo } from './tools/get-account.js';
import { getCampaignPerformance } from './tools/get-campaign-performance.js';
import { getAdsetPerformance } from './tools/get-adset-performance.js';
import { getAdPerformance } from './tools/get-ad-performance.js';
import { getVideoPerformance } from './tools/get-video-performance.js';
import { getVideoDemographics } from './tools/get-video-demographics.js';
import { getVideoEngagement } from './tools/get-video-engagement.js';
import { compareTimePeriods } from './tools/compare-time-periods.js';
import { compareEntities } from './tools/compare-entities.js';
import { getAdCreativeText } from './tools/get-ad-creative-text.js';

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
      case 'get-adset-performance': {
        const result = await getAdsetPerformance(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'get-ad-performance': {
        const result = await getAdPerformance(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'get-video-performance': {
        const result = await getVideoPerformance(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'get-video-demographics': {
        const result = await getVideoDemographics(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'get-video-engagement': {
        const result = await getVideoEngagement(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'compare-time-periods': {
        const result = await compareTimePeriods(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'compare-entities': {
        const result = await compareEntities(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'get-ad-creative-text': {
        const result = await getAdCreativeText(args as any);
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
 * Initialize access token store
 */
const accessTokenStore = new AccessTokenStore();

// Make store globally accessible
global.accessTokenStore = accessTokenStore;

/**
 * Start MCP server with HTTP transport and OAuth authentication
 */
async function main() {
  const app = express();

  // Trust Railway proxy for secure cookies
  // Railway terminates SSL at the proxy level, so we need to trust X-Forwarded-Proto
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true })); // For OAuth token requests
  app.use(session(getSessionConfig()));

  // Health check endpoint (no auth required)
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });

  // OAuth 2.0 Dynamic Client Registration
  app.use(oauthRoutes);

  // Auth routes
  app.use('/auth', authRoutes);

  // MCP transport with session-based authentication
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  // Connect MCP server to transport
  await server.connect(transport);

  // MCP endpoints (allow tool discovery, require auth for tool calls)
  app.get('/mcp', requireAuthForToolCall, async (req, res) => {
    await transport.handleRequest(req, res);
  });

  // Parse body first, then check auth
  const mcpBodyParser = express.text({ type: '*/*' });
  app.post('/mcp', mcpBodyParser, requireAuthForToolCall, async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });

  // Start HTTP server
  const PORT = env.PORT;
  const HOST = env.HOST;

  const httpServer = app.listen(PORT, HOST, () => {
    console.error(`Meta Ads MCP server running on http://${HOST}:${PORT}`);
    console.error(`Health check: http://${HOST}:${PORT}/health`);
    console.error(`OAuth: http://${HOST}:${PORT}/authorize`);
    console.error(`Environment: ${env.NODE_ENV}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.error('SIGTERM received, shutting down gracefully...');
    accessTokenStore.destroy();
    httpServer.close(() => {
      console.error('HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.error('SIGINT received, shutting down gracefully...');
    accessTokenStore.destroy();
    httpServer.close(() => {
      console.error('HTTP server closed');
      process.exit(0);
    });
  });
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
