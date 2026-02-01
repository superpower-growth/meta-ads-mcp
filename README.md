# Meta Ads MCP Server

A remote Model Context Protocol (MCP) server that provides authenticated access to Meta Marketing API for video ad analytics. Built with Facebook OAuth authentication for secure multi-user access.

## Features

- **Facebook OAuth Authentication**: Secure login with Facebook for multi-user access
- **Remote HTTP Access**: StreamableHTTP transport for remote MCP connections
- **Session Management**: 24-hour sessions with automatic expiry
- **9 Analytics Tools**: Comprehensive video ad performance analytics
  - Account information
  - Campaign, Ad Set, and Ad performance metrics
  - Video performance and engagement tracking
  - Demographic insights
  - Time period and entity comparisons
- **Docker Support**: Containerized deployment with health checks
- **Production Ready**: Environment-based configuration, security best practices

## Prerequisites

- Node.js 24+ (or Docker)
- Meta/Facebook Developer Account
- Meta Ad Account with active campaigns
- Facebook App with OAuth configured

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

![Cookie extraction example](https://i.imgur.com/example.png)

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

```
You: "Show me campaign performance for last 7 days"
You: "What's my best performing video ad?"
You: "Compare this week vs last week performance"
```

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
5. **get-video-performance** - Video-specific performance metrics
6. **get-video-demographics** - Audience demographic breakdowns
7. **get-video-engagement** - Video engagement metrics (watch time, completion)
8. **compare-time-periods** - Compare performance across time periods
9. **compare-entities** - Compare multiple campaigns/adsets/ads

## Environment Variables

See `.env.example` for full documentation. Key variables:

### Meta API
- `META_ACCESS_TOKEN` - Long-lived access token from Graph API Explorer
- `META_AD_ACCOUNT_ID` - Your ad account ID (format: `act_123456789`)

### Server
- `HOST` - Server bind address (default: `0.0.0.0`)
- `PORT` - Server port (default: `3000`)
- `NODE_ENV` - Environment mode (`development`, `production`, `test`)

### Facebook OAuth
- `FACEBOOK_APP_ID` - From Facebook App Settings
- `FACEBOOK_APP_SECRET` - From Facebook App Settings
- `FACEBOOK_CALLBACK_URL` - OAuth redirect URI (default: `http://localhost:3000/auth/callback`)

### Session
- `SESSION_SECRET` - Random secret for cookie signing (min 32 chars)
- `SESSION_TTL` - Session duration in milliseconds (default: `86400000` = 24 hours)

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
- GitHub Issues: [Your repo URL]
- Documentation: [Your docs URL]

## Roadmap

Future enhancements (post-MVP):

- [ ] Budget management tools (write operations)
- [ ] Audit trail logging
- [ ] Anomaly detection in metrics
- [ ] Query result caching
- [ ] Redis session store for scalability
- [ ] CLI tool for automatic cookie extraction
- [ ] Browser extension for easier setup

---

**Built with the Model Context Protocol SDK**
