# Meta Ads MCP Server

A Model Context Protocol (MCP) server that provides access to Meta Marketing API for comprehensive ad analytics and AI-powered video creative analysis.

## Quick Start (Claude Code)

```bash
claude add https://recime-meta-ads-mcp.fly.dev/mcp
```

Then ask:
```
"Show me campaign performance for last 7 days"
```

Claude will prompt you to authenticate with Facebook automatically.

### Manual Configuration

Edit `~/.config/claude-code/mcp.json`:

```json
{
  "mcpServers": {
    "meta-ads": {
      "url": "https://recime-meta-ads-mcp.fly.dev/mcp",
      "transport": "http"
    }
  }
}
```

## Features

- **Facebook OAuth Authentication** with multi-user session isolation
- **18 MCP Tools** for ad analytics, creative analysis, and comparisons
- **AI Video Analysis** via Gemini AI with Firestore caching
- **StreamableHTTP Transport** for remote MCP connections

## Available Tools (18)

### Performance Analytics
| Tool | Description |
|------|-------------|
| `get-account` | Ad account info and summary metrics |
| `get-performance` | Unified metrics at campaign/adset/ad level with relevance diagnostics |
| `get-video-metrics` | Video completion funnel, engagement depth, retention scoring |
| `get-demographics` | Breakdowns by age, gender, country, device, platform, placement |
| `get-creative-fatigue` | Daily frequency/CTR trends with fatigue scoring |
| `get-creative-performance` | Aggregate performance by creative ID across ads |
| `list-custom-conversions` | Available custom conversion events |

### Creative Analysis
| Tool | Description |
|------|-------------|
| `get-ad-creative-text` | Extract ad copy (primary, headline, description) |
| `analyze-video-creative` | AI scene-by-scene analysis of Meta video ads |
| `batch-analyze-video-creative` | Parallel AI analysis of multiple video ads |
| `analyze-video-url` | Analyze video from URL (Google Drive, Dropbox, direct) |
| `analyze-image-url` | Analyze image from URL |
| `analyze-ad-themes` | Cluster ads by messaging theme correlated with performance |

### Comparisons
| Tool | Description |
|------|-------------|
| `compare-time-periods` | A/B time period analysis |
| `compare-entities` | Rank campaigns/adsets/ads side by side |

### Account & Setup
| Tool | Description |
|------|-------------|
| `get-saved-audiences` | List saved targeting audiences |
| `get-facebook-pages` | List linked Facebook pages |
| `list-ad-sets` | List ad sets in a campaign |

## Run Locally

### Prerequisites

- Node.js 24+
- Meta/Facebook Developer Account with an ad account
- Facebook App with OAuth configured

Optional (for video analysis):
- Google Cloud Storage bucket
- Firestore database
- Gemini API key or Vertex AI

### Setup

```bash
git clone https://github.com/team-recime/meta-ads-mcp.git
cd meta-ads-mcp
cp .env.example .env
# Edit .env with your credentials
npm install
npm run build
npm start
```

For local development without OAuth, set `REQUIRE_AUTH=false` in `.env`.

### Environment Variables

See `.env.example` for full documentation. Key variables:

| Variable | Description |
|----------|-------------|
| `META_ACCESS_TOKEN` | Long-lived token from Graph API Explorer |
| `META_AD_ACCOUNT_ID` | Ad account ID (format: `act_123456789`) |
| `FACEBOOK_APP_ID` | From Facebook App Settings |
| `FACEBOOK_APP_SECRET` | From Facebook App Settings |
| `SESSION_SECRET` | Random 32+ char secret (`openssl rand -base64 32`) |
| `REQUIRE_AUTH` | `true` for OAuth, `false` for local dev |

#### Video Analysis (Optional)

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Gemini API key (or use Vertex AI) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | GCP service account key |
| `GCS_BUCKET_NAME` | GCS bucket for video staging |
| `FIRESTORE_CACHE_TTL_HOURS` | Cache TTL (default: 24) |

## Deployment

### Docker

```bash
docker build -t meta-ads-mcp .
docker run -d -p 3000:3000 --env-file .env meta-ads-mcp
```

### Fly.io

```bash
fly deploy
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check (no auth) |
| `GET /mcp` | MCP SSE streaming |
| `POST /mcp` | MCP request/response |
| `GET /mcp-metadata` | MCP server metadata for `claude add` |

## Troubleshooting

**"Session not found" after redeployment** — Restart Claude Code to reconnect. Tokens are persisted in Firestore.

**"Unauthorized" errors** — Sessions last 24 hours. Re-authenticate by restarting Claude Code.

**Meta API errors** — Verify your token has `ads_read` permission and `META_AD_ACCOUNT_ID` has the `act_` prefix.

## License

MIT

---

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
