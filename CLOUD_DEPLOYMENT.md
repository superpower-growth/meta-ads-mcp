# Cloud Deployment Guide

Deploy your Meta Ads MCP server to the cloud for remote access from anywhere.

## Quick Comparison

| Platform | Difficulty | Free Tier | Best For |
|----------|-----------|-----------|----------|
| **Railway** | ⭐ Easiest | $5/month | Fastest deployment |
| **Render** | ⭐⭐ Easy | Yes (limited) | Free option |
| **Fly.io** | ⭐⭐ Easy | Yes (limited) | Docker-native |
| **Google Cloud Run** | ⭐⭐⭐ Medium | Yes (generous) | Serverless |
| **AWS App Runner** | ⭐⭐⭐ Medium | Limited | AWS ecosystem |
| **DigitalOcean** | ⭐⭐⭐ Medium | No | Traditional VPS |

**Recommended**: Start with Railway for easiest setup, or Render for free tier.

---

## Option 1: Railway (Easiest) ⭐

**Pros**: Simplest deployment, automatic HTTPS, great Docker support
**Cons**: No free tier (~$5/month)

### Step-by-Step

1. **Sign up at [railway.app](https://railway.app)**
   - Login with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account
   - Select your `meta-ads-mcp` repository

3. **Configure Environment Variables**
   - In Railway dashboard, click on your service
   - Go to "Variables" tab
   - Add these variables:

   ```bash
   META_ACCESS_TOKEN=your_token
   META_AD_ACCOUNT_ID=act_123456789
   FACEBOOK_APP_ID=your_app_id
   FACEBOOK_APP_SECRET=your_app_secret
   SESSION_SECRET=your_generated_secret

   # Railway-specific
   NODE_ENV=production
   PORT=3000
   HOST=0.0.0.0
   ```

4. **Get Your Domain**
   - Railway auto-generates a domain like: `meta-ads-mcp-production.up.railway.app`
   - Click "Settings" → "Networking" → "Generate Domain"
   - Copy your domain URL

5. **Update Facebook App**
   - Go to [developers.facebook.com](https://developers.facebook.com)
   - Select your app → "Facebook Login" → "Settings"
   - Add to "Valid OAuth Redirect URIs":
     ```
     https://your-app.up.railway.app/auth/callback
     ```
   - Save changes

6. **Update Environment Variable in Railway**
   ```bash
   FACEBOOK_CALLBACK_URL=https://your-app.up.railway.app/auth/callback
   ```

7. **Deploy**
   - Railway auto-deploys on git push
   - Or click "Deploy" in dashboard

8. **Test**
   ```bash
   curl https://your-app.up.railway.app/health
   ```

**Total time**: ~10 minutes

---

## Option 2: Render (Free Tier Available) ⭐⭐

**Pros**: Free tier, automatic HTTPS, easy setup
**Cons**: Free tier spins down after inactivity, slower cold starts

### Step-by-Step

1. **Sign up at [render.com](https://render.com)**
   - Login with GitHub

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect GitHub repository
   - Select `meta-ads-mcp`

3. **Configure Service**
   - Name: `meta-ads-mcp`
   - Environment: `Docker`
   - Region: Choose closest to you
   - Branch: `main`
   - Dockerfile path: `Dockerfile` (auto-detected)

4. **Choose Plan**
   - Free tier: $0/month (spins down after 15min inactivity)
   - Starter: $7/month (always on)

5. **Add Environment Variables**
   - In "Environment" section, add:

   ```bash
   META_ACCESS_TOKEN=your_token
   META_AD_ACCOUNT_ID=act_123456789
   FACEBOOK_APP_ID=your_app_id
   FACEBOOK_APP_SECRET=your_app_secret
   SESSION_SECRET=your_generated_secret

   NODE_ENV=production
   PORT=3000
   HOST=0.0.0.0
   ```

6. **Create Service**
   - Click "Create Web Service"
   - Render will build and deploy (takes 5-10 min first time)

7. **Get Your URL**
   - After deployment, you'll get: `https://meta-ads-mcp.onrender.com`

8. **Update Facebook App**
   - Add OAuth redirect URI:
     ```
     https://meta-ads-mcp.onrender.com/auth/callback
     ```

9. **Update Render Environment Variable**
   ```bash
   FACEBOOK_CALLBACK_URL=https://meta-ads-mcp.onrender.com/auth/callback
   ```

10. **Test**
    ```bash
    curl https://meta-ads-mcp.onrender.com/health
    ```

**Total time**: ~15 minutes

**Note**: Free tier spins down after 15 minutes of inactivity. First request after will take 30-60 seconds to wake up.

---

## Option 3: Fly.io (Docker-Native) ⭐⭐

**Pros**: Docker-native, global deployment, generous free tier
**Cons**: Requires CLI installation

### Step-by-Step

1. **Install Fly CLI**
   ```bash
   # macOS
   brew install flyctl

   # Linux
   curl -L https://fly.io/install.sh | sh

   # Windows
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. **Login**
   ```bash
   fly auth login
   ```

3. **Launch App**
   ```bash
   cd meta-ads-mcp
   fly launch
   ```

4. **Configure During Launch**
   - App name: `meta-ads-mcp` (or your choice)
   - Region: Choose closest
   - Create Postgres? **No**
   - Create Redis? **No**
   - Deploy now? **No** (we need to set env vars first)

5. **Set Environment Variables**
   ```bash
   fly secrets set \
     META_ACCESS_TOKEN=your_token \
     META_AD_ACCOUNT_ID=act_123456789 \
     FACEBOOK_APP_ID=your_app_id \
     FACEBOOK_APP_SECRET=your_app_secret \
     SESSION_SECRET=your_generated_secret \
     NODE_ENV=production
   ```

6. **Edit fly.toml** (auto-generated)
   ```toml
   app = "meta-ads-mcp"

   [build]
     dockerfile = "Dockerfile"

   [env]
     PORT = "3000"
     HOST = "0.0.0.0"

   [[services]]
     internal_port = 3000
     protocol = "tcp"

     [[services.ports]]
       port = 80
       handlers = ["http"]

     [[services.ports]]
       port = 443
       handlers = ["tls", "http"]

   [http_service]
     internal_port = 3000
     force_https = true
   ```

7. **Deploy**
   ```bash
   fly deploy
   ```

8. **Get Your URL**
   ```bash
   fly status
   # Shows: https://meta-ads-mcp.fly.dev
   ```

9. **Update Facebook App**
   - Add OAuth redirect URI:
     ```
     https://meta-ads-mcp.fly.dev/auth/callback
     ```

10. **Update Fly Secret**
    ```bash
    fly secrets set FACEBOOK_CALLBACK_URL=https://meta-ads-mcp.fly.dev/auth/callback
    ```

11. **Test**
    ```bash
    curl https://meta-ads-mcp.fly.dev/health
    ```

**Total time**: ~15 minutes

---

## Option 4: Google Cloud Run (Serverless) ⭐⭐⭐

**Pros**: Generous free tier, auto-scaling, serverless
**Cons**: Requires Google Cloud account setup

### Step-by-Step

1. **Install Google Cloud CLI**
   ```bash
   # macOS
   brew install google-cloud-sdk

   # Or download from: cloud.google.com/sdk/docs/install
   ```

2. **Login and Setup**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **Build and Push Container**
   ```bash
   cd meta-ads-mcp

   # Tag image
   docker build -t gcr.io/YOUR_PROJECT_ID/meta-ads-mcp .

   # Push to Container Registry
   docker push gcr.io/YOUR_PROJECT_ID/meta-ads-mcp
   ```

4. **Deploy to Cloud Run**
   ```bash
   gcloud run deploy meta-ads-mcp \
     --image gcr.io/YOUR_PROJECT_ID/meta-ads-mcp \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars "NODE_ENV=production,PORT=3000,HOST=0.0.0.0" \
     --set-secrets "META_ACCESS_TOKEN=meta-token:latest,META_AD_ACCOUNT_ID=meta-account:latest,FACEBOOK_APP_ID=fb-app-id:latest,FACEBOOK_APP_SECRET=fb-app-secret:latest,SESSION_SECRET=session-secret:latest,FACEBOOK_CALLBACK_URL=fb-callback:latest"
   ```

5. **Get Service URL**
   ```bash
   gcloud run services describe meta-ads-mcp --region us-central1 --format 'value(status.url)'
   # Returns: https://meta-ads-mcp-abc123-uc.a.run.app
   ```

6. **Update Facebook App**
   - Add OAuth redirect URI with your Cloud Run URL

**Total time**: ~20 minutes

---

## After Cloud Deployment

### Update Facebook App Settings

For **any** cloud platform:

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Select your app
3. Go to "Facebook Login" → "Settings"
4. Add your cloud URL to "Valid OAuth Redirect URIs":
   ```
   https://your-cloud-url.com/auth/callback
   ```
5. Save changes

### Configure Claude Code for Cloud

Update `~/.config/claude-code/mcp.json`:

```json
{
  "mcpServers": {
    "meta-ads": {
      "url": "https://your-cloud-url.com/mcp",
      "transport": "http",
      "headers": {
        "Cookie": "connect.sid=YOUR_SESSION_COOKIE"
      }
    }
  }
}
```

### Get Session Cookie from Cloud

1. Visit: `https://your-cloud-url.com/auth/facebook`
2. Login with Facebook
3. Extract `connect.sid` cookie from DevTools
4. Add to Claude Code config above

### Test Cloud Deployment

```bash
# Health check
curl https://your-cloud-url.com/health

# Login
open https://your-cloud-url.com/auth/facebook

# After login, test with Claude Code
# In Claude Code, ask: "Show me campaign performance"
```

---

## Important Security Notes

### HTTPS Required in Production

All cloud platforms provide automatic HTTPS. Make sure:

1. **Always use HTTPS URLs** (not http://)
2. **Cookies are secure** - Already configured in code:
   ```typescript
   cookie: {
     secure: env.NODE_ENV === 'production',  // ✅ Forces HTTPS in production
     httpOnly: true,
     sameSite: 'lax'
   }
   ```

### Environment Variables

Never commit these to git:
- `META_ACCESS_TOKEN`
- `FACEBOOK_APP_SECRET`
- `SESSION_SECRET`

Always set them as platform environment variables/secrets.

### Session Secret

Generate a new strong secret for production:
```bash
openssl rand -base64 48
```

Use this for `SESSION_SECRET` in your cloud platform.

---

## Cost Estimates

| Platform | Free Tier | Paid (Always-On) |
|----------|-----------|------------------|
| Railway | ❌ | ~$5/month |
| Render | ✅ (with sleep) | $7/month |
| Fly.io | ✅ (limited) | ~$5/month |
| Google Cloud Run | ✅ (generous) | ~$0-5/month (usage-based) |
| AWS App Runner | ❌ | ~$10/month |
| DigitalOcean | ❌ | $6/month |

**Recommendation**:
- **Free**: Render or Fly.io
- **Best Value**: Railway or Google Cloud Run
- **Simplest**: Railway

---

## Troubleshooting Cloud Deployment

### "OAuth redirect URI mismatch"
- Ensure Facebook App redirect URI exactly matches your cloud URL
- Include `/auth/callback` path
- Use `https://` not `http://`

### "Session cookie not working"
- Check `NODE_ENV=production` is set
- Verify `secure: true` in cookie settings
- Ensure using HTTPS in Claude Code config

### "Health check fails"
- Check container logs in platform dashboard
- Verify `PORT` and `HOST` environment variables
- Ensure Dockerfile exposes port 3000

### "Container fails to start"
- Check environment variables are set
- Review build logs for errors
- Verify all required secrets are configured

---

## Next Steps

1. Choose a platform (Railway recommended for easiest start)
2. Follow the step-by-step guide above
3. Update Facebook App with cloud URL
4. Login via cloud URL to get session cookie
5. Configure Claude Code with cloud URL and cookie
6. Test with: "Show me campaign performance"

**You're ready to deploy!** 🚀
