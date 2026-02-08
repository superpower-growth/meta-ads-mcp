# Team Onboarding Guide - Meta Ads MCP

## 🚀 Quick Start (30 Seconds)

### Option 1: Simple Copy-Paste (Recommended)

**Step 1:** Copy this entire command and paste it into your terminal:

```bash
claude add https://meta-ads-mcp-production-3b99.up.railway.app/mcp
```

**Step 2:** When Claude Code starts, just ask:
```
"Show me campaign performance for last 7 days"
```

Claude will automatically prompt you to authenticate with Facebook, and you're done!

---

### Option 2: Manual Configuration

If `claude add` doesn't work, manually edit `~/.config/claude-code/mcp.json`:

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

Then restart Claude Code.

---

## 🔧 Troubleshooting

### "Connection failed" or "Stale session"

This happens after server redeployments. **Solution:**

1. Restart Claude Code
2. Try your query again
3. If prompted, re-authenticate with Facebook

### Session expired (after 24 hours)

Your session lasts 24 hours. When it expires:
1. Claude will prompt you to re-authenticate
2. Click the authentication link
3. Sign in with Facebook again

### Still having issues?

Contact the team admin (that's you!) or check the server status:
```bash
curl https://meta-ads-mcp-production-3b99.up.railway.app/health
```

---

## 📊 What You Can Do

### Basic Analytics
- "Show me campaign performance for last 7 days"
- "What's my best performing video ad?"
- "Compare this week vs last week performance"

### Video Creative Analysis
- "Analyze the video creative for ad 123456789"
- "Show last 30 days performance with video analysis"
- "Which emotional tone drives best CTR?"

### Custom Queries
- "Show ads with 'brain fog' in the text"
- "Compare subscription_created conversions by placement"
- "Find top performing symptom-based ads"

---

## 🔐 Security Notes

- Each team member authenticates with **their own Facebook account**
- Sessions are isolated per user
- All data is encrypted in transit (HTTPS)
- Sessions expire after 24 hours for security
