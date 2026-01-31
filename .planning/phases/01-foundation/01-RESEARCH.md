# Phase 1: Foundation - Research

**Researched:** 2026-01-31
**Domain:** Meta Marketing API integration + MCP server architecture
**Confidence:** HIGH

<research_summary>
## Summary

Researched the Meta Marketing API ecosystem and MCP (Model Context Protocol) server architecture for building a remote MCP server that enables team access to Meta ad analytics. The standard approach uses Meta's official Node.js Business SDK with TypeScript definitions, combined with the MCP TypeScript SDK v1.x for server implementation and OAuth 2.1 for remote authentication.

Key finding: Don't hand-roll Meta API authentication, rate limit handling, or MCP transport layers. The facebook-nodejs-business-sdk handles OAuth flows, token management, and API versioning automatically. The @modelcontextprotocol/sdk provides production-ready server/client implementations with built-in OAuth 2.1 support for remote deployments.

Critical 2026 updates: Meta is deprecating legacy Advantage Shopping/App Campaign APIs in Q1 2026 (v25), and removed 7-day/28-day view-through attribution windows effective January 12, 2026. MCP SDK v2.0 releases Q1 2026 with Streamable HTTP as the recommended remote transport.

**Primary recommendation:** Use facebook-nodejs-business-sdk + @types for Meta API integration, @modelcontextprotocol/sdk v1.x for MCP server (upgrade to v2 in Q1 2026), and OAuth 2.1 device flow for team authentication. Deploy as Streamable HTTP remote server for multi-user access.
</research_summary>

<standard_stack>
## Standard Stack

The established libraries/tools for Meta Marketing API + MCP server integration:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| facebook-nodejs-business-sdk | 24.0.1 | Meta Marketing API client | Official SDK from Meta, handles auth/versioning/rate limits |
| @types/facebook-nodejs-business-sdk | 23.0.0 | TypeScript definitions | Community-maintained types for type safety |
| @modelcontextprotocol/sdk | 1.x (v2 Q1 2026) | MCP server/client | Official MCP SDK, production-ready, OAuth 2.1 support |
| zod | 3.25+ | Schema validation | Required peer dependency for MCP SDK |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| express | Latest | HTTP server framework | For middleware/routing if using HTTP transport |
| @modelcontextprotocol/node | Latest | Node.js HTTP wrapper | Streamable HTTP transport (recommended for remote) |
| typescript | 5.x | Type safety | Essential for catching Meta API type errors early |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| facebook-nodejs-business-sdk | Direct Graph API calls | Official SDK handles versioning, rate limits, OAuth - don't hand-roll |
| MCP SDK v1.x | MCP SDK v2 (pre-alpha) | v2 has breaking changes, use v1 until stable Q1 2026 release |
| Streamable HTTP | stdio transport | stdio is local-only, remote servers need HTTP/SSE/WebSocket |

**Installation:**
```bash
npm install facebook-nodejs-business-sdk @types/facebook-nodejs-business-sdk
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Project Structure
```
src/
├── index.ts              # Entry point, MCP server setup
├── meta/
│   ├── client.ts         # FacebookAdsApi initialization
│   ├── auth.ts           # OAuth token management
│   └── types.ts          # Meta API TypeScript types
├── tools/
│   ├── get-metrics.ts    # MCP tool: query ad performance
│   ├── get-campaigns.ts  # MCP tool: list campaigns
│   └── index.ts          # Tool registry
├── lib/
│   ├── errors.ts         # Error handling utilities
│   └── validation.ts     # Input validation with Zod
└── config/
    └── env.ts            # Environment configuration
```

### Pattern 1: Meta API Client Initialization
**What:** Initialize FacebookAdsApi singleton with access token
**When to use:** At server startup, before registering MCP tools
**Example:**
```typescript
// Source: facebook-nodejs-business-sdk GitHub examples
import { FacebookAdsApi } from 'facebook-nodejs-business-sdk';

const accessToken = process.env.META_ACCESS_TOKEN;
const api = FacebookAdsApi.init(accessToken);

// Set API version explicitly (Q1 2026: use v25+)
api.setVersion('v25.0');

export { api };
```

### Pattern 2: MCP Server with HTTP Transport
**What:** Set up MCP server with Streamable HTTP for remote team access
**When to use:** For multi-user remote deployment (not local stdio)
**Example:**
```typescript
// Source: MCP TypeScript SDK documentation
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createHTTPServer } from '@modelcontextprotocol/node';

const server = new Server(
  {
    name: 'meta-ads-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'get_campaign_metrics',
      description: 'Query Meta ad campaign performance metrics',
      inputSchema: {
        type: 'object',
        properties: {
          campaignId: { type: 'string' },
          metrics: { type: 'array', items: { type: 'string' } },
        },
        required: ['campaignId', 'metrics'],
      },
    },
  ],
}));

// Create HTTP server (for remote deployment)
const httpServer = createHTTPServer(server);
httpServer.listen(3000);
```

### Pattern 3: OAuth 2.1 Device Flow for Team Auth
**What:** Use OAuth device flow for user-level Meta API authentication
**When to use:** When multiple team members need to access their own ad accounts
**Example:**
```typescript
// Source: MCP OAuth 2.1 documentation + Meta OAuth docs
// 1. MCP server initiates device flow
// 2. User visits URL and authorizes
// 3. Server polls for token
// 4. Store user-specific access token

// Note: Implementation details in MCP SDK v2.0 OAuth helpers (Q1 2026)
// For v1.x, implement standard OAuth device flow against Meta's OAuth endpoints
```

### Anti-Patterns to Avoid
- **Hardcoding API version:** Meta deprecates versions quarterly - use env var or config
- **Not handling rate limits:** Meta returns 429 errors - implement exponential backoff
- **Storing long-term tokens in code:** Use environment variables or secrets manager
- **Using stdio transport for remote:** stdio is local-only, use HTTP/SSE for team access
- **Hand-rolling OAuth flows:** Use Meta's SDK init() or MCP's OAuth helpers (v2.0)
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Meta OAuth flow | Custom OAuth client | FacebookAdsApi.init() | Handles token refresh, app verification, scope management |
| API rate limiting | Manual retry logic | SDK built-in handling | Meta's limits are complex, SDK respects them |
| API versioning | Manual endpoint URLs | SDK versioned methods | Breaking changes every quarter, SDK auto-migrates |
| MCP transport layer | Custom HTTP/WebSocket | @modelcontextprotocol/node | Handles SSE, reconnection, protocol compliance |
| Input validation | Manual checks | Zod schemas | MCP SDK requires Zod, reuse for all validation |
| Token expiration | Manual refresh timers | SDK auto-refresh | Long-term tokens expire, SDK handles refresh flows |

**Key insight:** Meta's Marketing API has 15+ years of edge cases (rate limits, token types, versioning, permissions). The facebook-nodejs-business-sdk encapsulates all of this. Custom implementations hit "works in development, breaks in production" issues around token refresh, rate limiting, and API version migrations. MCP SDK similarly handles protocol nuances (capability negotiation, error codes, transport-specific quirks) that are painful to implement correctly.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: API Version Deprecation Without Warning
**What goes wrong:** Code breaks when Meta deprecates API version (every 90 days)
**Why it happens:** Not pinning API version or tracking deprecation schedule
**How to avoid:**
- Set explicit version: `api.setVersion('v25.0')`
- Subscribe to Meta's developer changelog
- Test against next version before current deprecates
- Use env var for version to update without code changes
**Warning signs:** Sudden 400 errors with "API version no longer supported"

### Pitfall 2: Rate Limit Exhaustion on Insights Queries
**What goes wrong:** Getting 429 errors when querying ad performance data
**Why it happens:** Insights API has strict per-user rate limits (~200 req/hour for Standard Access)
**How to avoid:**
- Request Advanced Access for higher limits (requires app review)
- Batch multiple metric requests into single API call
- Implement exponential backoff on 429 responses
- Cache results, don't re-query same data
**Warning signs:** 429 errors during normal usage, "Please reduce the amount of data requested"

### Pitfall 3: Access Token Expiration in Production
**What goes wrong:** MCP server stops working after 60 days when token expires
**Why it happens:** Long-term tokens expire, code doesn't handle refresh
**How to avoid:**
- Use System User tokens (never expire, tied to Business Manager)
- Or implement OAuth refresh flow for user tokens
- Monitor token expiration dates
- Set up alerts for approaching expiration
**Warning signs:** "Invalid OAuth access token" errors after weeks of working

### Pitfall 4: Missing Permissions for Ad Account Access
**What goes wrong:** API calls succeed but return empty data or permission errors
**Why it happens:** User/app doesn't have ads_management permission or ad account access
**How to avoid:**
- Request ads_read and ads_management permissions during OAuth
- Verify user has access to specific ad account (Business Manager role)
- Check permission status before making calls
- Handle permission errors gracefully with clear messages
**Warning signs:** Empty arrays returned for campaigns, or "User does not have permission" errors

### Pitfall 5: Q1 2026 Breaking Changes Not Addressed
**What goes wrong:** Code breaks when Advantage Shopping Campaign API is removed
**Why it happens:** Not migrating to Advantage+ structure before Q1 2026 deadline
**How to avoid:**
- Audit code for ASC/AAC campaign creation
- Migrate to Advantage+ campaign structure now
- Remove existing_customer_budget_percentage field usage
- Test with Marketing API v25.0+ beta
**Warning signs:** Deprecation warnings in API responses, ASC/AAC campaign creation failing
</common_pitfalls>

<code_examples>
## Code Examples

Verified patterns from official sources:

### Basic Meta API Setup
```typescript
// Source: facebook-nodejs-business-sdk GitHub README
import { FacebookAdsApi, AdAccount } from 'facebook-nodejs-business-sdk';

// Initialize API
const accessToken = process.env.META_ACCESS_TOKEN;
const accountId = process.env.META_AD_ACCOUNT_ID; // format: act_123456789
const api = FacebookAdsApi.init(accessToken);
api.setVersion('v25.0');

// Get ad account
const account = new AdAccount(accountId);

// Query campaigns
const campaigns = await account.getCampaigns(
  ['name', 'status', 'objective'],
  { limit: 100 }
);

campaigns.forEach((campaign: any) => {
  console.log(campaign.name, campaign.status);
});
```

### MCP Tool Implementation for Meta Metrics
```typescript
// Source: MCP SDK examples + Meta Insights API docs
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { AdAccount } from 'facebook-nodejs-business-sdk';
import { z } from 'zod';

// Define input schema with Zod
const GetMetricsSchema = z.object({
  campaignId: z.string(),
  metrics: z.array(z.enum(['impressions', 'clicks', 'ctr', 'cpc', 'spend'])),
  datePreset: z.enum(['today', 'yesterday', 'last_7d', 'last_30d']).default('last_7d'),
});

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'get_campaign_metrics') {
    const args = GetMetricsSchema.parse(request.params.arguments);

    const account = new AdAccount(accountId);
    const insights = await account.getInsights(
      args.metrics,
      {
        level: 'campaign',
        filtering: [{ field: 'campaign.id', operator: 'EQUAL', value: args.campaignId }],
        date_preset: args.datePreset,
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(insights, null, 2),
        },
      ],
    };
  }
});
```

### Error Handling for Meta API Calls
```typescript
// Source: Best practices from facebook-nodejs-business-sdk issues
import { FacebookAdsApi } from 'facebook-nodejs-business-sdk';

async function safeMetaAPICall<T>(
  apiCall: () => Promise<T>
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const data = await apiCall();
    return { success: true, data };
  } catch (error: any) {
    // Meta API errors have specific structure
    const metaError = error?.response?.error;

    if (metaError?.code === 190) {
      // Token issue
      return { success: false, error: 'Access token expired or invalid' };
    } else if (metaError?.code === 17 || metaError?.code === 32) {
      // Rate limit
      return { success: false, error: 'Rate limit exceeded - retry later' };
    } else if (metaError?.code === 100) {
      // Permission issue
      return { success: false, error: 'Missing required permissions' };
    }

    return { success: false, error: metaError?.message || 'Unknown Meta API error' };
  }
}
```
</code_examples>

<sota_updates>
## State of the Art (2024-2026)

What's changed recently:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP SDK v1.x | MCP SDK v2.0 | Q1 2026 | Streamable HTTP is now default, OAuth 2.1 built-in, breaking changes |
| SSE transport | Streamable HTTP | Late 2025 | Better performance, simpler API, recommended for remote servers |
| Legacy ASC/AAC campaigns | Advantage+ campaigns | Q1 2026 deprecation | Must migrate before v25.0, existing_customer_budget_percentage removed |
| 7d/28d view-through windows | Click-only attribution | Jan 12, 2026 | Can only use click-through windows in Insights API |
| Manual OAuth flows | MCP OAuth 2.1 helpers | March 2025 spec | Standardized auth, device flow, phantom tokens |

**New tools/patterns to consider:**
- **MCP SDK v2 OAuth helpers:** Built-in device flow, access token management, phantom token pattern for remote servers (Q1 2026)
- **System User tokens:** Never-expiring tokens for server-to-server, better than user tokens for production MCP servers
- **Streamable HTTP transport:** Replaces SSE, better for remote deployments with multiple concurrent clients
- **Meta's Graph API v25.0+:** Advantage+ campaign structure is now the only way to create shopping/app campaigns

**Deprecated/outdated:**
- **MCP stdio-only deployments:** Only for local use, remote needs HTTP/WebSocket
- **Short-term access tokens:** Use long-term (60 day) or System User tokens
- **Legacy campaign creation APIs:** ASC/AAC APIs removed Q1 2026
- **View-through attribution windows (7d, 28d):** Removed January 2026
</sota_updates>

<open_questions>
## Open Questions

Things that couldn't be fully resolved:

1. **Remote MCP hosting architecture**
   - What we know: MCP SDK supports HTTP/SSE, OAuth 2.1 spec exists
   - What's unclear: Best hosting platform for multi-user remote MCP (Cloudflare Workers, traditional Node server, serverless?)
   - Recommendation: Start with traditional Node.js Express server on VPS/container for simplicity, evaluate serverless later if scaling needed

2. **Meta System User vs User Tokens**
   - What we know: System Users don't expire, regular user tokens last 60 days
   - What's unclear: Whether System User tokens work for Insights API (permissions may differ from user tokens)
   - Recommendation: Test System User approach in Phase 1, fall back to OAuth user tokens if permissions insufficient

3. **MCP SDK v2 migration timing**
   - What we know: v2 releases Q1 2026, v1 supported for 6 months after
   - What's unclear: Exact release date, severity of breaking changes
   - Recommendation: Build on v1.x now, plan v2 migration for Q2 2026 after stable release
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- [Model Context Protocol Official Docs](https://modelcontextprotocol.io/docs/sdk) - MCP SDK overview, transport options
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) - v1.x/v2.0 info, examples, project structure
- [facebook-nodejs-business-sdk GitHub](https://github.com/facebook/facebook-nodejs-business-sdk) - Official Meta SDK, current version
- [@types/facebook-nodejs-business-sdk npm](https://www.npmjs.com/package/@types/facebook-nodejs-business-sdk) - TypeScript definitions availability

### Secondary (MEDIUM confidence - cross-verified with official sources)
- [Meta Ads API Complete Guide (2025)](https://admanage.ai/blog/meta-ads-api) - Q1 2026 deprecations verified against Meta changelog
- [MCP Authorization Tutorial](https://modelcontextprotocol.io/docs/tutorials/security/authorization) - OAuth 2.1 patterns
- [AWS MCP Authentication Guide](https://aws.amazon.com/blogs/opensource/open-protocols-for-agent-interoperability-part-2-authentication-on-mcp/) - Device flow details
- [How to Build MCP Servers (TypeScript)](https://dev.to/shadid12/how-to-build-mcp-servers-with-typescript-sdk-1c28) - Project structure patterns

### Tertiary (LOW confidence - needs validation)
- None - all critical findings verified against official documentation

</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Meta Marketing API + MCP TypeScript SDK
- Ecosystem: facebook-nodejs-business-sdk, @modelcontextprotocol/sdk, Zod, Express
- Patterns: MCP server structure, Meta API client init, OAuth device flow
- Pitfalls: Rate limits, token expiration, API versioning, Q1 2026 deprecations

**Confidence breakdown:**
- Standard stack: HIGH - verified with official SDKs, current versions confirmed
- Architecture: HIGH - from official MCP and Meta documentation and examples
- Pitfalls: HIGH - documented in official guides, Meta changelog, SDK issues
- Code examples: HIGH - from official SDK READMEs and MCP documentation

**Research date:** 2026-01-31
**Valid until:** 2026-04-30 (90 days - Meta deprecates quarterly, MCP v2 releases Q1)

**Critical dates:**
- Q1 2026: MCP SDK v2.0 stable release (breaking changes, must migrate)
- Q1 2026: Meta Marketing API v25.0 removes ASC/AAC APIs (breaking change)
- January 12, 2026: View-through attribution windows removed (already effective)

</metadata>

---

*Phase: 01-foundation*
*Research completed: 2026-01-31*
*Ready for planning: yes*
