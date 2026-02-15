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
import cors from 'cors';
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
import { waitForReadiness } from './middleware/readiness.js';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import shipAdRouter from './routes/ship-ad.js';
import { AccessTokenStore } from './auth/device-flow.js';
import { storage, firestore, isGcpEnabled } from './lib/gcp-clients.js';
import { isGeminiEnabled, geminiConfig } from './lib/gemini-client.js';
import { isGoogleOAuthConfigured, getDriveAccessToken } from './auth/google-oauth.js';
import { ServerReadiness } from './lib/server-readiness.js';
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
import { analyzeVideoCreative } from './tools/analyze-video-creative.js';
import { getPlacementConversions } from './tools/get-placement-conversions.js';
import { getSavedAudiences } from './tools/get-saved-audiences.js';
import { getFacebookPages } from './tools/get-facebook-pages.js';
import { listAdSets } from './tools/list-ad-sets.js';
import { analyzeVideoUrl } from './tools/analyze-video-url.js';
import { createCampaign } from './tools/create-campaign.js';
import { createAdSet } from './tools/create-ad-set.js';
import { uploadAdVideo } from './tools/upload-ad-video.js';
import { createAdCreative } from './tools/create-ad-creative.js';
import { createAd } from './tools/create-ad.js';

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
      case 'analyze-video-creative': {
        const result = await analyzeVideoCreative(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'get-placement-conversions': {
        const result = await getPlacementConversions(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'get-saved-audiences': {
        const result = await getSavedAudiences(args as any);
        return {
          content: [{ type: 'text', text: result }],
        };
      }
      case 'get-facebook-pages': {
        const result = await getFacebookPages(args as any);
        return {
          content: [{ type: 'text', text: result }],
        };
      }
      case 'list-ad-sets': {
        const result = await listAdSets(args as any);
        return {
          content: [{ type: 'text', text: result }],
        };
      }
      case 'analyze-video-url': {
        const result = await analyzeVideoUrl(args as any);
        return {
          content: [{ type: 'text', text: result }],
        };
      }
      case 'create-campaign': {
        const result = await createCampaign(args as any);
        return {
          content: [{ type: 'text', text: result }],
        };
      }
      case 'create-ad-set': {
        const result = await createAdSet(args as any);
        return {
          content: [{ type: 'text', text: result }],
        };
      }
      case 'upload-ad-video': {
        const result = await uploadAdVideo(args as any);
        return {
          content: [{ type: 'text', text: result }],
        };
      }
      case 'create-ad-creative': {
        const result = await createAdCreative(args as any);
        return {
          content: [{ type: 'text', text: result }],
        };
      }
      case 'create-ad': {
        const result = await createAd(args as any);
        return {
          content: [{ type: 'text', text: result }],
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
 * Initialize server readiness manager
 */
const serverReadiness = new ServerReadiness();

// Make readiness manager globally accessible
global.serverReadiness = serverReadiness;

/**
 * Start MCP server with HTTP transport and OAuth authentication
 */
async function main() {
  // Initialize connection registry
  const { MCPConnectionRegistry } = await import('./mcp/connection-registry.js');
  const mcpConnectionRegistry = new MCPConnectionRegistry();
  global.mcpConnectionRegistry = mcpConnectionRegistry;

  // Cleanup disabled - was disconnecting active users after 30 minutes
  // Connections are cleaned up on:
  // 1. Normal close (close handler)
  // 2. New token issuance (terminateByUserId)
  // 3. Server restart
  // setInterval(() => {
  //   mcpConnectionRegistry.cleanup();
  // }, 5 * 60 * 1000);

  // Load persisted tokens from Firestore
  console.log('[Startup] Loading persisted access tokens from Firestore...');
  await accessTokenStore.loadFromFirestore();
  console.log('[Startup] Access tokens loaded');

  const app = express();

  // Trust Railway proxy for secure cookies
  // Railway terminates SSL at the proxy level, so we need to trust X-Forwarded-Proto
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // CORS configuration for MCP connections
  app.use(cors({
    origin: true, // Allow all origins for MCP clients
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cookie',
      'Accept',
      'Mcp-Session-Id',
      'MCP-Protocol-Version',
      'Last-Event-ID',
    ],
    exposedHeaders: [
      'Content-Type',
      'Mcp-Session-Id',
    ],
  }));

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true })); // For OAuth token requests
  app.use(session(getSessionConfig()));

  // Ship Ad REST API (n8n automation, API key auth)
  app.use('/api', shipAdRouter);

  // MCP Server metadata endpoint for `claude add` compatibility
  app.get('/mcp-metadata', (_req, res) => {
    res.json({
      name: 'meta-ads',
      displayName: 'Meta Ads Analytics',
      description: 'Access Meta Marketing API for comprehensive ad analytics',
      version: '0.1.0',
      transport: 'http',
      url: `${env.NODE_ENV === 'production' ? 'https://meta-ads-mcp-production-3b99.up.railway.app' : 'http://localhost:3000'}/mcp`,
      authentication: {
        type: 'oauth',
        provider: 'facebook',
        automatic: true,
      },
      capabilities: [
        'Campaign performance analytics',
        'Ad creative text analysis',
        'Video performance metrics',
        'Custom conversion tracking',
        'AI-powered video interpretation',
      ],
    });
  });

  // Health check endpoint (no auth required)
  app.get('/health', async (_req, res) => {
    const readinessStatus = serverReadiness.getStatus();
    const healthResponse: any = {
      status: readinessStatus.state === 'ready' ? 'ok' : readinessStatus.state,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      readiness: readinessStatus,
      gcs: {},
      firestore: {},
      gemini: {},
    };

    // Check GCS connectivity
    if (!isGcpEnabled) {
      healthResponse.gcs = {
        enabled: false,
        reason: 'No credentials configured',
      };
    } else {
      try {
        const bucket = storage!.bucket(env.GCS_BUCKET_NAME);
        const [exists] = await bucket.exists();
        healthResponse.gcs = {
          enabled: true,
          bucket: env.GCS_BUCKET_NAME,
          exists,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        healthResponse.gcs = {
          enabled: true,
          bucket: env.GCS_BUCKET_NAME,
          error: message,
        };
      }
    }

    // Check Firestore connectivity
    if (!isGcpEnabled) {
      healthResponse.firestore = {
        enabled: false,
        reason: 'No credentials configured',
      };
    } else {
      try {
        await firestore!.collection('video_analysis_cache').limit(1).get();
        healthResponse.firestore = {
          enabled: true,
          collection: 'video_analysis_cache',
          accessible: true,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        healthResponse.firestore = {
          enabled: true,
          collection: 'video_analysis_cache',
          error: message,
        };
      }
    }

    // Check Gemini AI status
    if (!isGeminiEnabled()) {
      healthResponse.gemini = {
        enabled: false,
        reason: env.GEMINI_USE_VERTEX_AI
          ? 'Vertex AI mode but GCP not configured'
          : 'GEMINI_API_KEY not configured'
      };
    } else {
      healthResponse.gemini = {
        enabled: true,
        mode: geminiConfig.useVertexAI ? 'vertex-ai' : 'api-key',
        model: geminiConfig.model,
        maxCostPerAnalysis: env.GEMINI_MAX_COST_PER_ANALYSIS,
        accessible: true // Assume accessible if client initialized
      };
    }

    // Check Google Drive OAuth status
    if (!isGoogleOAuthConfigured()) {
      healthResponse.googleDriveOAuth = {
        configured: false,
        reason: 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not set',
      };
    } else {
      try {
        const token = await getDriveAccessToken();
        healthResponse.googleDriveOAuth = {
          configured: true,
          authorized: !!token,
        };
      } catch {
        healthResponse.googleDriveOAuth = {
          configured: true,
          authorized: false,
        };
      }
    }

    res.json(healthResponse);
  });

  // OAuth 2.0 Dynamic Client Registration
  app.use(oauthRoutes);

  // Auth routes
  app.use('/auth', authRoutes);

  // MCP transport without session management
  // Session management is optional in MCP spec. We use OAuth bearer tokens
  // for authentication instead of MCP sessions, which avoids stale session
  // issues after server restarts.
  const transport = new StreamableHTTPServerTransport();

  // Connect MCP server to transport
  await server.connect(transport);

  // MCP endpoints (allow tool discovery, require auth for tool calls)
  app.get('/mcp', waitForReadiness, requireAuthForToolCall, async (req, res) => {
    console.log('[MCP] GET /mcp request received', {
      authenticated: !!req.user,
      userId: req.user?.userId,
      headers: {
        authorization: req.headers.authorization ? 'present' : 'missing',
      },
      sessionID: req.sessionID,
    });

    // Register connection if authenticated
    let connectionId: string | undefined;
    if (req.user) {
      connectionId = mcpConnectionRegistry.register(req.user.userId, res);
      console.log('[MCP] SSE connection registered:', connectionId);
    }

    // Handle connection close
    req.on('close', () => {
      if (connectionId) {
        mcpConnectionRegistry.unregister(connectionId);
        console.log('[MCP] SSE connection closed:', connectionId);
      }
    });

    // Set SSE headers for long-lived connections
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    try {
      await transport.handleRequest(req, res);
      console.log('[MCP] GET /mcp SSE connection handled');
    } catch (error) {
      console.error('[MCP] GET /mcp error:', error);
      if (!res.headersSent) {
        // Check if it's a session error
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('session') || errorMessage.includes('Session')) {
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          res.status(401).json({
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: 'Connection reset after server restart. Please restart Claude Code to reconnect.',
              data: {
                authentication: {
                  type: 'oauth2',
                  oauth_authorization_server: `${baseUrl}/.well-known/oauth-authorization-server`,
                  instructions: 'Server was redeployed. Restart Claude Code to establish a fresh connection.',
                },
              },
            },
            id: null,
          });
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    } finally {
      // Always cleanup connection, even on error
      if (connectionId) {
        mcpConnectionRegistry.unregister(connectionId);
        console.log('[MCP] SSE connection cleaned up in finally:', connectionId);
      }
    }
  });

  // Parse body first, then check auth
  const mcpBodyParser = express.text({ type: '*/*' });
  app.post('/mcp', mcpBodyParser, waitForReadiness, requireAuthForToolCall, async (req, res) => {
    let method = 'unknown';
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      method = body?.method || 'unknown';
    } catch (e) {
      // Ignore parsing errors in logging
    }

    console.log('[MCP] POST /mcp request received', {
      authenticated: !!req.user,
      userId: req.user?.userId,
      method,
      headers: {
        authorization: req.headers.authorization ? 'present' : 'missing',
      },
    });

    try {
      await transport.handleRequest(req, res, req.body);
      console.log('[MCP] POST /mcp response sent successfully for method:', method);
    } catch (error) {
      console.error('[MCP] POST /mcp error:', error);
      if (!res.headersSent) {
        // Check if it's a session error
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('session') || errorMessage.includes('Session')) {
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          res.status(200).json({
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: 'Connection reset after server restart. Please restart Claude Code to reconnect.',
              data: {
                authentication: {
                  type: 'oauth2',
                  oauth_authorization_server: `${baseUrl}/.well-known/oauth-authorization-server`,
                  instructions: 'Server was redeployed. Restart Claude Code to establish a fresh connection.',
                },
              },
            },
            id: null,
          });
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    }
  });

  // Start HTTP server
  const PORT = env.PORT;
  const HOST = env.HOST;

  const httpServer = app.listen(PORT, HOST, () => {
    console.error(`Meta Ads MCP server running on http://${HOST}:${PORT}`);
    console.error(`Health check: http://${HOST}:${PORT}/health`);
    console.error(`OAuth: http://${HOST}:${PORT}/authorize`);
    console.error(`Environment: ${env.NODE_ENV}`);
    console.error(`Readiness: ${serverReadiness.getStatus().state} (${serverReadiness.getStatus().tokenCount || 0} tokens loaded)`);
  });

  // Graceful shutdown handler
  let isShuttingDown = false;

  process.on('SIGTERM', async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.error('[Shutdown] SIGTERM received, starting graceful shutdown...');

    // Stop accepting new connections
    httpServer.close(() => {
      console.error('[Shutdown] HTTP server closed');
    });

    // Get all active connections
    const connections = mcpConnectionRegistry.getConnectionCount();
    console.error(`[Shutdown] Draining ${connections} active connections...`);

    // Notify clients to reconnect (send SSE event if possible)
    try {
      mcpConnectionRegistry.notifyRedeployment();
    } catch (error) {
      console.error('[Shutdown] Error notifying clients:', error);
    }

    // Give clients 20 seconds to gracefully disconnect
    const DRAIN_TIMEOUT = 20000;
    await new Promise(resolve => setTimeout(resolve, DRAIN_TIMEOUT));

    // Force close any remaining connections
    console.error('[Shutdown] Forcing remaining connections closed');
    mcpConnectionRegistry.closeAll();

    // Cleanup
    accessTokenStore.destroy();

    console.error('[Shutdown] Graceful shutdown complete');
    process.exit(0);
  });

  // Handle SIGINT (Ctrl+C) same way
  process.on('SIGINT', async () => {
    console.error('[Shutdown] SIGINT received');
    process.kill(process.pid, 'SIGTERM');
  });
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
