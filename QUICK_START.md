# Quick Start Guide

## Prerequisites Checklist

- [ ] Node.js 24+ installed (or Docker)
- [ ] Facebook Developer Account
- [ ] Meta Ad Account with active campaigns
- [ ] Facebook App created

## Setup Steps

### 1. Create Facebook App (5 minutes)

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps/)
2. Click **Create App**
3. Select **Consumer** type
4. Fill in app details, click **Create**
5. In dashboard, click **Add Product** → **Facebook Login** → **Set Up**
6. In **Facebook Login Settings**:
   - Valid OAuth Redirect URIs: `http://localhost:3000/auth/callback`
   - Save changes
7. Go to **Settings > Basic**:
   - Copy **App ID**
   - Copy **App Secret** (click Show)

### 2. Get Meta API Token (5 minutes)

1. Visit [Graph API Explorer](https://developers.facebook.com/tools/explorer)
2. Select your app from dropdown
3. Click **Generate Access Token**
4. Select permissions: `ads_read`, `ads_management`
5. Click **Generate Access Token**
6. Copy the token
7. For production: Click **Access Token Tool** → **Extend Access Token** (60 days)

### 3. Find Your Ad Account ID (2 minutes)

**Option A: Business Manager**
1. Go to [business.facebook.com](https://business.facebook.com)
2. Click **Business Settings**
3. Click **Accounts > Ad Accounts**
4. Copy the ID (e.g., `123456789`)
5. Add `act_` prefix → `act_123456789`

**Option B: Ads Manager**
1. Go to [facebook.com/adsmanager](https://facebook.com/adsmanager)
2. Look at URL: `act=123456789`
3. Add `act_` prefix → `act_123456789`

### 4. Configure Environment (3 minutes)

```bash
# Navigate to project
cd meta-ads-mcp

# Copy environment template
cp .env.example .env

# Generate session secret
openssl rand -base64 32

# Edit .env file
nano .env
```

Fill in these values:
```bash
META_ACCESS_TOKEN=your_token_from_step_2
META_AD_ACCOUNT_ID=act_123456789
FACEBOOK_APP_ID=your_app_id_from_step_1
FACEBOOK_APP_SECRET=your_app_secret_from_step_1
SESSION_SECRET=your_generated_secret_from_above
```

### 5. Run Server (2 minutes)

**Option A: Docker (Recommended)**
```bash
docker-compose up -d
docker-compose logs -f
```

**Option B: Node.js**
```bash
npm install
npm run build
npm start
```

Verify it's running:
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok","version":"0.1.0"}
```

### 6. Login & Get Session Cookie (3 minutes)

1. Open browser to: `http://localhost:3000/auth/facebook`
2. Click **Continue** to login with Facebook
3. After redirect, press **F12** to open DevTools
4. Go to **Application** tab → **Cookies** → `http://localhost:3000`
5. Find **connect.sid** cookie
6. **Right-click** → **Copy Value**

Example cookie value:
```
s%3Aabcdefghijklmnopqrstuvwxyz.1234567890abcdef
```

### 7. Configure Claude Code (2 minutes)

```bash
# Edit Claude Code config
nano ~/.config/claude-code/mcp.json
```

Add this configuration:
```json
{
  "mcpServers": {
    "meta-ads": {
      "url": "http://localhost:3000/mcp",
      "transport": "http",
      "headers": {
        "Cookie": "connect.sid=PASTE_YOUR_COOKIE_VALUE_HERE"
      }
    }
  }
}
```

Replace `PASTE_YOUR_COOKIE_VALUE_HERE` with your actual cookie value from step 6.

### 8. Test in Claude Code (1 minute)

Restart Claude Code, then try:
```
Show me campaign performance for last 7 days
```

Expected response: Performance data for your campaigns.

## Troubleshooting

### "Environment validation failed"
- Make sure all required variables are in `.env`
- Check `META_AD_ACCOUNT_ID` has `act_` prefix
- Verify `SESSION_SECRET` is at least 32 characters

### "OAuth callback error"
- Verify redirect URI in Facebook App matches: `http://localhost:3000/auth/callback`
- Check `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are correct

### "Unauthorized" in Claude Code
- Cookie may have expired (24 hour limit)
- Re-login at `http://localhost:3000/auth/facebook`
- Extract new cookie value
- Update `mcp.json` with new cookie

### "Invalid token" from Meta API
- Token may have expired (60 days for long-lived)
- Generate new token in Graph API Explorer
- Update `META_ACCESS_TOKEN` in `.env`
- Restart server

## Session Renewal (Every 24 Hours)

When your session expires:
1. Visit `http://localhost:3000/auth/facebook`
2. Login again
3. Extract new `connect.sid` cookie
4. Update `~/.config/claude-code/mcp.json`
5. Restart Claude Code (if needed)

## Verification Commands

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test OAuth redirect
curl -I http://localhost:3000/auth/facebook

# Test with authentication (replace COOKIE)
curl http://localhost:3000/auth/me \
  --cookie "connect.sid=YOUR_COOKIE"

# Run full test suite
./test-endpoints.sh YOUR_COOKIE
```

## Time Estimate

Total setup time: **~20-25 minutes** (first time)
Session renewal time: **~3 minutes** (every 24 hours)

## Getting Help

If you encounter issues:
1. Check logs: `docker-compose logs -f` (Docker) or terminal output (Node)
2. Verify environment variables: `cat .env`
3. Test endpoints: `./test-endpoints.sh`
4. Review README.md for detailed troubleshooting

---

**You're all set!** 🚀

Your Meta Ads MCP server is now running with OAuth authentication, ready for multi-user remote access via Claude Code.
