# Claude Code Setup Guide

## Super Simple Setup (Works Automatically)

Add this to `~/.config/claude-code/mcp.json`:

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

## How It Works

1. **Add the config** above to Claude Code
2. **Ask a question** like "Show me campaign performance for last 7 days"
3. **Claude automatically prompts you** to authenticate with Facebook
4. **Click the link**, login with Facebook
5. **Done!** Claude can now query your Meta Ads data

## What Just Happened?

Claude Code uses OAuth 2.0 to securely authenticate:

1. When you first use a tool, Claude detects authentication is needed
2. Claude initiates the OAuth flow automatically
3. You login with Facebook (one time)
4. Claude receives an access token
5. Future requests use this token (no re-login needed for 24 hours)

## Troubleshooting

### "Cannot GET /authorize"

The deployment is live now. If you still see this:
1. Make sure you're using the Railway URL (not localhost)
2. Try restarting Claude Code
3. Check you have the latest config (see above)

### "Authentication required"

This is normal! Claude will automatically handle this:
1. You'll see a prompt to authenticate
2. Click it to open Facebook login
3. Login and authorize the app
4. Claude will handle the rest

## Testing

After setup, try these:

```
"Show me my Meta ad account information"
"What's my campaign performance for last 7 days?"  
"Show me my best performing video ads"
"Compare this week vs last week"
```

---

**Need help?** File an issue: https://github.com/superpower-growth/meta-ads-mcp/issues
