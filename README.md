# Meta Ads MCP Server

A Model Context Protocol (MCP) server that provides access to Meta Marketing API for comprehensive ad analytics. Use the hosted instance with Claude Code in 30 seconds, or run your own.

**🚀 Live Instance:** `https://meta-ads-mcp-production-3b99.up.railway.app/mcp`

## Features

### Core Analytics (v1.0)

- **Facebook OAuth Authentication**: Secure login with Facebook for multi-user access
- **Remote HTTP Access**: StreamableHTTP transport for remote MCP connections
- **Session Management**: 24-hour sessions with automatic expiry
- **10 Analytics Tools**: Comprehensive ad performance analytics
  - Account information
  - Campaign, Ad Set, and Ad performance metrics
  - **Custom conversion tracking** (subscription_created, registration_started, etc.)
  - **Ad creative text analysis** for content categorization
  - Video performance and engagement tracking
  - Demographic insights
  - Time period and entity comparisons
- **Docker Support**: Containerized deployment with health checks
- **Production Ready**: Environment-based configuration, security best practices

### Video Interpretation (v1.1)

- **AI-Powered Creative Analysis**: Analyze video ad creative content using Gemini AI
  - Scene-by-scene breakdown with visual elements
  - Text overlay detection and categorization
  - Emotional tone identification (aspirational, urgent, educational, etc.)
  - Creative approach classification (problem-solution, testimonial, lifestyle, etc.)
  - Key message extraction

- **Intelligent Caching**: Firestore-based result caching
  - Cache by video ID (same video across multiple ads)
  - Configurable TTL (default: 24 hours)
  - Automatic cost savings tracking
  - Cache hit/miss status in responses

- **Performance Correlation**: Connect creative insights with metrics
  - Identify top-performing emotional tones
  - Compare creative approach effectiveness
  - Find similar high-performing ads
  - Analyze key message patterns

- **Conversational Analysis**: Natural language queries through Claude Code
  - "Which emotional tone performs best?"
  - "Find ads similar to my top performer"
  - "What creative elements drive highest CTR?"

## Prerequisites

- Node.js 24+ (or Docker)
- Meta/Facebook Developer Account
- Meta Ad Account with active campaigns
- Facebook App with OAuth configured

### Google Cloud Services (for v1.1 Video Interpretation)

- **Google Cloud Storage**: Video file storage
- **Firestore**: Analysis result caching
- **Gemini API or Vertex AI**: Video content analysis

## Quick Setup for Claude Code (10 Seconds)

**Just add this one line - Claude handles authentication automatically!**

### Step 1: Add to Claude Code

Edit `~/.config/claude-code/mcp.json`:

```json
{
  "mcpServers": {
    "meta-ads": {
      "url": "https://meta-ads-mcp-production-3b99.up.railway.app/mcp",
      "transport": "http"
    }
  }
}
```

### Step 2: Use It!

In Claude Code, try asking:
```
"Show me campaign performance for last 7 days"
```

Claude will automatically:
1. 🔐 Prompt you to authenticate with Facebook
2. 🚀 Handle the OAuth flow
3. ✅ Start querying your Meta Ads data

**That's it!** No manual OAuth setup, no cookies, no installation. Claude handles everything.

---

## Alternative: Run Locally

If you want to run your own instance (for development or customization):

```bash
# 1. Clone and setup
git clone https://github.com/superpower-growth/meta-ads-mcp.git
cd meta-ads-mcp
./setup.sh

# 2. Edit .env and add your Meta credentials:
#    - META_ACCESS_TOKEN (from Graph API Explorer)
#    - META_AD_ACCOUNT_ID (format: act_123456789)
#    - REQUIRE_AUTH=false (for local use)

# 3. Start the server
npm start

# 4. Update Claude Code to use localhost:
{
  "mcpServers": {
    "meta-ads": {
      "url": "http://localhost:3000/mcp",
      "transport": "http"
    }
  }
}
```

## Three Ways to Use This

### 1. Hosted Railway Instance (Easiest - Recommended)
**Best for:** Everyone who just wants to use it with Claude Code

- ✅ Already deployed and running
- ✅ Claude handles OAuth automatically
- ✅ Just add the URL to Claude Code settings
- ✅ No cookies, no manual authentication
- URL: `https://meta-ads-mcp-production-3b99.up.railway.app/mcp`

### 2. Run Locally (Development)
**Best for:** Developers customizing the code

- 🛠️ Full control over code and configuration
- 🛠️ Test changes before deployment
- 🛠️ Requires Node.js installation
- Set `REQUIRE_AUTH=false` in `.env`

### 3. Deploy Your Own Instance (Advanced)
**Best for:** Teams needing their own private deployment

- 🔐 Your own Railway/cloud deployment
- 🔐 Can enable OAuth for multi-user access
- 🔐 Full control over environment and data
- See deployment section below

---

## Detailed Setup (Production Mode with OAuth)

If you need multi-user access or production deployment, follow these steps:

## Quick Start

### 1. Facebook App Setup

1. Create a Facebook App at [developers.facebook.com/apps](https://developers.facebook.com/apps/)
2. Go to **Settings > Basic** to get your App ID and App Secret
3. Add **Facebook Login** product to your app
4. In **Facebook Login > Settings**, add OAuth redirect URI:
   ```
   http://localhost:3000/auth/callback
   ```
5. Request permissions: `email` (for user identification)

### 2. Meta API Access Token

1. Visit [Graph API Explorer](https://developers.facebook.com/tools/explorer)
2. Select your app
3. Click "Generate Access Token"
4. Grant permissions: `ads_read`, `ads_management`
5. For production, exchange for a long-lived token (60 days)

### 3. Environment Setup

```bash
# Copy example environment file
cp .env.example .env

# Generate session secret
openssl rand -base64 32

# Edit .env and add your credentials:
# - META_ACCESS_TOKEN (from Graph API Explorer)
# - META_AD_ACCOUNT_ID (format: act_123456789)
# - FACEBOOK_APP_ID (from Facebook App Settings)
# - FACEBOOK_APP_SECRET (from Facebook App Settings)
# - SESSION_SECRET (generated above)
```

### 4. Installation & Running

#### Option A: Local Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Start server
npm start
```

#### Option B: Docker (Recommended)

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### 5. Login & Extract Session Cookie

1. Visit `http://localhost:3000/auth/facebook` in your browser
2. Login with your Facebook account
3. After successful login, open **Browser DevTools** (F12)
4. Navigate to **Application → Cookies**
5. Find and copy the `connect.sid` cookie value

### 6. Configure Claude Code

Add to your `~/.config/claude-code/mcp.json`:

```json
{
  "mcpServers": {
    "meta-ads": {
      "url": "http://localhost:3000/mcp",
      "transport": "http",
      "headers": {
        "Cookie": "connect.sid=YOUR_ACTUAL_SESSION_COOKIE"
      }
    }
  }
}
```

**Important**: Replace `YOUR_ACTUAL_SESSION_COOKIE` with the cookie value from step 5.

### 7. Test in Claude Code

#### Basic Analytics Queries
```
You: "Show me campaign performance for last 7 days"
You: "What's my best performing video ad?"
You: "Compare this week vs last week performance"
```

#### Video Creative Analysis (v1.1)
```
User: "Analyze the video creative for ad 123456789"
# Returns: scenes, text overlays, emotional tone, creative approach

User: "Show last 30 days performance with video analysis"
# Returns: metrics + creative insights for each video ad

User: "Which emotional tone drives best CTR?"
# Returns: creative-performance correlation analysis
```

See [Video Interpretation Guide](docs/video-interpretation-guide.md) for detailed workflows.

## API Endpoints

### Public Endpoints

- `GET /health` - Health check (no auth required)
  ```bash
  curl http://localhost:3000/health
  # {"status":"ok","version":"0.1.0","timestamp":"2024-01-31T..."}
  ```

### Authentication Endpoints

- `GET /auth/facebook` - Initiate OAuth login
- `GET /auth/callback` - OAuth callback handler
- `GET /auth/logout` - Destroy session
  ```bash
  curl http://localhost:3000/auth/logout \
    --cookie "connect.sid=YOUR_COOKIE"
  ```
- `GET /auth/me` - Get current user info (requires auth)
  ```bash
  curl http://localhost:3000/auth/me \
    --cookie "connect.sid=YOUR_COOKIE"
  # {"userId":"...","email":"...","name":"...","expiresAt":"..."}
  ```

### MCP Endpoints (Require Authentication)

- `GET /mcp` - SSE streaming endpoint
- `POST /mcp` - Request/response endpoint

## Session Management

- **Duration**: 24 hours (configurable via `SESSION_TTL`)
- **Auto-expiry**: Sessions expire automatically after TTL
- **Renewal**: Login again at `/auth/facebook` to get a new session
- **Logout**: Visit `/auth/logout` to manually destroy session

When your session expires (after 24 hours), you'll need to:
1. Re-login at `http://localhost:3000/auth/facebook`
2. Extract the new `connect.sid` cookie
3. Update your `~/.config/claude-code/mcp.json` with the new cookie value

## Available Tools

All tools are accessible via Claude Code once authenticated:

1. **get-account** - Retrieve Meta Ad Account information
2. **get-campaign-performance** - Campaign-level metrics and performance
3. **get-adset-performance** - Ad Set-level performance data
4. **get-ad-performance** - Individual ad performance metrics
   - ✨ **Enhanced**: Custom conversion support (subscription_created, etc.)
   - ✨ **Enhanced**: Custom date ranges for all-time analysis
   - ✨ **Enhanced**: Cost-per-action calculations for custom events
5. **get-ad-creative-text** - Retrieve ad creative text for content analysis
   - Extract primary text, headline, and description
   - Supports both link_data and video_data structures
   - Enable keyword-based ad categorization
6. **get-video-performance** - Video-specific performance metrics
7. **get-video-demographics** - Audience demographic breakdowns
8. **get-video-engagement** - Video engagement metrics (watch time, completion)
9. **compare-time-periods** - Compare performance across time periods
10. **compare-entities** - Compare multiple campaigns/adsets/ads

### Ad Classification Library

Built-in keyword-based categorization for ads:
- **Symptom ads**: tired, fatigue, brain fog, heart health, etc.
- **Comparison ads**: vs, versus, compared to, better than
- **FSA/HSA ads**: fsa eligible, hsa eligible, tax advantage
- **Product explainer**: how it works, science behind, ingredients

Easily customizable in `src/lib/ad-classification.ts`

## Custom Conversions

Configure your custom conversion events in `src/lib/custom-conversions.ts`:

```typescript
export const CUSTOM_CONVERSION_MAP: Record<string, string> = {
  subscription_created: 'offsite_conversion.custom.797731396203109',
  registration_started: 'offsite_conversion.custom.1382332960167482',
  // Add your custom conversions here
};
```

**How to find your conversion IDs:**
1. Go to Meta Events Manager
2. Select your Pixel
3. Click on a custom event
4. The ID is in the URL: `events_manager/pixel/{pixel_id}/event/{event_id}`

Then use friendly names in your queries:
```
get-ad-performance with customActions=["subscription_created"]
```

## Environment Variables

See `.env.example` for full documentation. Key variables:

### Meta API
- `META_ACCESS_TOKEN` - Long-lived access token from Graph API Explorer
- `META_AD_ACCOUNT_ID` - Your ad account ID (format: `act_123456789`)

### Server
- `HOST` - Server bind address (default: `0.0.0.0`)
- `PORT` - Server port (default: `3000`)
- `NODE_ENV` - Environment mode (`development`, `production`, `test`)
- `REQUIRE_AUTH` - Authentication mode (default: `true`)
  - `false` - **Local mode**: Uses `META_ACCESS_TOKEN` directly, no OAuth needed
  - `true` - **Production mode**: Requires Facebook OAuth login

### Facebook OAuth
- `FACEBOOK_APP_ID` - From Facebook App Settings
- `FACEBOOK_APP_SECRET` - From Facebook App Settings
- `FACEBOOK_CALLBACK_URL` - OAuth redirect URI (default: `http://localhost:3000/auth/callback`)

### Session
- `SESSION_SECRET` - Random secret for cookie signing (min 32 chars)
- `SESSION_TTL` - Session duration in milliseconds (default: `86400000` = 24 hours)

### Video Interpretation (v1.1)
```bash
# Google Cloud configuration
GOOGLE_SERVICE_ACCOUNT_JSON=<service-account-key-json>
GCP_PROJECT_ID=<your-gcp-project-id>
GCS_BUCKET_NAME=<your-gcs-bucket-name>

# Gemini AI (choose API key OR Vertex AI)
GEMINI_API_KEY=<your-gemini-api-key>  # Option 1: API key
# OR
GEMINI_USE_VERTEX_AI=true              # Option 2: Vertex AI
GEMINI_PROJECT_ID=<gcp-project-id>
GEMINI_REGION=us-central1

# Caching and cost controls
FIRESTORE_CACHE_TTL_HOURS=24
GEMINI_MAX_COST_PER_VIDEO=0.10
```

## Security Considerations

1. **HTTPS in Production**: Always use HTTPS in production environments
2. **Session Secret**: Use a strong, random 32+ character secret
3. **Environment Variables**: Never commit `.env` to version control
4. **Cookie Security**: Cookies are `httpOnly` and `secure` in production
5. **User Isolation**: Each user has their own Facebook-authenticated session
6. **Token Refresh**: Meta access tokens expire after 60 days - renew regularly

## Troubleshooting

### "Unauthorized" errors

1. Check your session cookie is correctly set in `mcp.json`
2. Verify session hasn't expired (24 hour limit)
3. Re-login at `/auth/facebook` to get a fresh session

### OAuth callback errors

1. Verify `FACEBOOK_CALLBACK_URL` matches the URL in Facebook App Settings
2. Check `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are correct
3. Ensure app has `email` permission approved

### "Environment validation failed"

1. Copy `.env.example` to `.env`
2. Fill in all required variables
3. Generate `SESSION_SECRET` with: `openssl rand -base64 32`
4. Verify `META_AD_ACCOUNT_ID` has `act_` prefix

### Meta API errors

1. Check `META_ACCESS_TOKEN` is valid and not expired
2. Verify token has `ads_read` and `ads_management` permissions
3. Ensure `META_AD_ACCOUNT_ID` format is `act_123456789`
4. Confirm you have access to the ad account

## Development

```bash
# Install dependencies
npm install

# Type checking
npm run type-check

# Development mode with hot reload
npm run dev

# Build
npm run build

# Run built version
npm start
```

## Production Deployment

### Docker (Recommended)

```bash
# Build image
docker build -t meta-ads-mcp .

# Run container
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name meta-ads-mcp \
  meta-ads-mcp

# Or use docker-compose
docker-compose up -d
```

### Cloud Platforms

Deploy to cloud platforms (AWS, GCP, Azure, etc.):

1. Set environment variables in platform's config
2. Update `FACEBOOK_CALLBACK_URL` to your domain
3. Enable HTTPS/SSL certificates
4. Configure firewall to allow port 3000
5. Set `NODE_ENV=production`

## Multi-User Access

This server supports multiple users simultaneously:

- Each user logs in with their own Facebook account
- Sessions are isolated per user
- Users can have different access levels to Meta ad accounts
- Each user extracts their own `connect.sid` cookie for Claude Code

## License

MIT

## Support

For issues or questions:
- GitHub Issues: [https://github.com/superpower-growth/meta-ads-mcp/issues](https://github.com/superpower-growth/meta-ads-mcp/issues)
- Documentation: See [README.md](https://github.com/superpower-growth/meta-ads-mcp#readme)

## Roadmap

### Completed Milestones

- ✅ **v1.0 Core Analytics** - Meta Marketing API integration with OAuth
  - 10 comprehensive analytics tools
  - Custom conversion tracking
  - Ad creative text analysis
  - Docker deployment with health checks

- ✅ **v1.1 Video Interpretation** - AI-powered creative analysis (COMPLETE)
  - ✅ Phase 11: Google Cloud Foundation (GCS + Firestore)
  - ✅ Phase 12: Video Download Pipeline (Meta → GCS)
  - ✅ Phase 13: Gemini API Integration (AI analysis)
  - ✅ Phase 14: Analysis MCP Tool (analyze-video-creative)
  - ✅ Phase 15: Caching Layer (Firestore with TTL)
  - ✅ Phase 16: Existing Tool Enhancement (video analysis flag)
  - ✅ Phase 17: Performance Correlation (creative insights)
  - ✅ Phase 18: Testing & Documentation

### Future Enhancements

- [ ] Budget management tools (write operations)
- [ ] Audit trail logging
- [ ] Anomaly detection in metrics
- [ ] Query result caching for performance data
- [ ] Redis session store for scalability
- [ ] CLI tool for automatic cookie extraction
- [ ] Browser extension for easier setup

---

**Built with the Model Context Protocol SDK**
