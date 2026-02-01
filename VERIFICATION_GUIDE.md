# Verification Guide

This guide walks through verifying the Meta Ads MCP server implementation according to the plan's success criteria.

## Prerequisites

Before running verification:
1. Complete setup in `QUICK_START.md`
2. Server running (Docker or Node.js)
3. `.env` file configured with all credentials

## Phase 7: Facebook OAuth Authentication

### ✅ Test 1: OAuth Flow Works

**Action**: Complete full OAuth login flow

```bash
# Step 1: Visit login URL
open http://localhost:3000/auth/facebook
```

**Expected**:
1. Redirects to Facebook login page
2. Shows OAuth consent screen
3. After approval, redirects to `http://localhost:3000/auth/callback`
4. Shows success page with welcome message
5. Browser stores `connect.sid` cookie

**Verify**:
- [ ] Redirect to Facebook successful
- [ ] Login completes without errors
- [ ] Callback page loads with user info
- [ ] Cookie appears in DevTools

---

### ✅ Test 2: Unauthenticated Requests Return 401

**Action**: Access protected endpoint without auth

```bash
curl -v http://localhost:3000/mcp
```

**Expected Output**:
```json
HTTP/1.1 401 Unauthorized

{
  "error": "Unauthorized",
  "message": "Authentication required. Please login with Facebook.",
  "loginUrl": "/auth/facebook"
}
```

**Verify**:
- [ ] HTTP status is 401
- [ ] Response includes `loginUrl`
- [ ] Error message is clear

---

### ✅ Test 3: Session Persists for 24 Hours

**Action**: Check session expiry time

```bash
# Login and get cookie
COOKIE="your_cookie_here"

# Get current user info
curl http://localhost:3000/auth/me \
  --cookie "connect.sid=$COOKIE" | jq .
```

**Expected Output**:
```json
{
  "userId": "1234567890",
  "email": "user@example.com",
  "name": "John Doe",
  "expiresAt": "2024-02-01T12:00:00.000Z"
}
```

**Verify**:
- [ ] `expiresAt` is ~24 hours from current time
- [ ] Session works immediately after creation
- [ ] Session works 1 hour later (test persistence)
- [ ] Session expires after 24+ hours (returns 401)

---

### ✅ Test 4: Logout Destroys Session

**Action**: Test logout functionality

```bash
# With valid session
COOKIE="your_cookie_here"

# Logout
curl http://localhost:3000/auth/logout \
  --cookie "connect.sid=$COOKIE" | jq .

# Try to access protected endpoint with same cookie
curl http://localhost:3000/auth/me \
  --cookie "connect.sid=$COOKIE"
```

**Expected**:
1. Logout returns success message
2. Subsequent requests return 401

**Verify**:
- [ ] Logout succeeds with 200 OK
- [ ] Session no longer valid after logout
- [ ] New login required to access endpoints

---

### ✅ Test 5: Multiple Users Can Login Independently

**Action**: Test multi-user isolation

1. **User A**: Login in browser, extract cookie A
2. **User B**: Login in incognito/different browser, extract cookie B

```bash
# User A's session
curl http://localhost:3000/auth/me \
  --cookie "connect.sid=COOKIE_A" | jq .userId

# User B's session
curl http://localhost:3000/auth/me \
  --cookie "connect.sid=COOKIE_B" | jq .userId
```

**Expected**:
- Different `userId` values for each user
- Both sessions work independently
- Logging out User A doesn't affect User B

**Verify**:
- [ ] Both users can login simultaneously
- [ ] Sessions are isolated (different userId)
- [ ] Each user sees their own profile

---

## Phase 10: Remote Deployment

### ✅ Test 6: Server Accessible via HTTP

**Action**: Test remote HTTP access

```bash
# From local machine
curl http://localhost:3000/health

# From another machine (if port forwarded)
curl http://YOUR_IP:3000/health
```

**Expected Output**:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2024-01-31T..."
}
```

**Verify**:
- [ ] Server responds on port 3000
- [ ] Health endpoint accessible
- [ ] Response is valid JSON

---

### ✅ Test 7: All 9 Tools Work via HTTP

**Action**: Test each MCP tool via HTTP transport

```bash
# Login first and get cookie
COOKIE="your_cookie_here"

# Test 1: get-account
curl -X POST http://localhost:3000/mcp \
  --cookie "connect.sid=$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get-account",
      "arguments": {}
    }
  }'

# Test 2: get-campaign-performance
curl -X POST http://localhost:3000/mcp \
  --cookie "connect.sid=$COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get-campaign-performance",
      "arguments": {
        "date_preset": "last_7d"
      }
    }
  }'

# Test remaining 7 tools similarly...
```

**Expected**: Each tool returns data without errors

**Verify**:
- [ ] get-account
- [ ] get-campaign-performance
- [ ] get-adset-performance
- [ ] get-ad-performance
- [ ] get-video-performance
- [ ] get-video-demographics
- [ ] get-video-engagement
- [ ] compare-time-periods
- [ ] compare-entities

---

### ✅ Test 8: Docker Container Builds

**Action**: Build Docker image

```bash
# Build with Docker Compose
docker-compose build

# Or build directly
docker build -t meta-ads-mcp .
```

**Expected**:
- Build completes without errors
- Image size reasonable (~200-300MB)
- All dependencies installed

**Verify**:
- [ ] Build succeeds
- [ ] No error messages
- [ ] Image appears in `docker images`

---

### ✅ Test 9: Container Runs Successfully

**Action**: Run and test container

```bash
# Start container
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Test health
curl http://localhost:3000/health
```

**Expected Output** (logs):
```
Meta Ads MCP server running on http://0.0.0.0:3000
Health check: http://0.0.0.0:3000/health
Login: http://0.0.0.0:3000/auth/facebook
Environment: production
```

**Verify**:
- [ ] Container starts successfully
- [ ] No crash loops
- [ ] Health check passes
- [ ] Logs show startup message

---

### ✅ Test 10: Health Check Endpoint

**Action**: Test health check

```bash
# Direct HTTP
curl http://localhost:3000/health

# Docker health check
docker inspect meta-ads-mcp | jq '.[0].State.Health'
```

**Expected**:
- HTTP 200 OK
- Valid JSON response
- Docker health status "healthy"

**Verify**:
- [ ] Returns 200 OK
- [ ] No authentication required
- [ ] Docker reports container as healthy

---

## Integration Testing

### ✅ Test 11: Claude Code Integration

**Action**: Configure and test Claude Code

1. **Configure mcp.json**:
```json
{
  "mcpServers": {
    "meta-ads": {
      "url": "http://localhost:3000/mcp",
      "transport": "http",
      "headers": {
        "Cookie": "connect.sid=YOUR_COOKIE"
      }
    }
  }
}
```

2. **Restart Claude Code**

3. **Test prompts**:
```
Show me campaign performance for last 7 days
```

```
What's my best performing video ad?
```

```
Compare this week vs last week performance
```

**Verify**:
- [ ] Claude Code connects to MCP server
- [ ] Tools are discovered
- [ ] Tool calls return data
- [ ] No authentication errors

---

## Automated Test Script

Run the automated test suite:

```bash
# Without authentication (basic tests)
./test-endpoints.sh

# With authentication (full tests)
./test-endpoints.sh YOUR_COOKIE
```

**Verify**:
- [ ] All tests pass
- [ ] No errors in output
- [ ] Green checkmarks for each test

---

## Success Criteria Summary

Mark each as complete:

### Phase 7 - OAuth:
- [ ] ✅ OAuth flow works (login → callback → session)
- [ ] ✅ Unauthenticated requests return 401 with loginUrl
- [ ] ✅ Session persists for 24 hours, expires correctly
- [ ] ✅ Logout destroys session
- [ ] ✅ Multiple users can login independently

### Phase 10 - Deployment:
- [ ] ✅ Server accessible remotely via HTTP on port 3000
- [ ] ✅ All 9 existing tools work via HTTP transport
- [ ] ✅ Docker container builds successfully
- [ ] ✅ Health check endpoint returns 200 OK

### Integration:
- [ ] ✅ OAuth-authenticated users can access all MCP tools

---

## Troubleshooting Verification Issues

### Test fails: "Connection refused"
- Server not running: `docker-compose up -d` or `npm start`
- Wrong port: Check `PORT` in `.env`

### Test fails: "401 Unauthorized"
- Cookie expired: Re-login and get new cookie
- Cookie not set: Check `--cookie` flag in curl
- Session middleware issue: Check logs for errors

### Test fails: "OAuth callback error"
- Facebook App not configured: Check redirect URI settings
- Wrong credentials: Verify `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`

### Test fails: "Meta API error"
- Token expired: Generate new token in Graph API Explorer
- Wrong account ID: Verify `META_AD_ACCOUNT_ID` format
- No permissions: Check token has `ads_read` permission

### Docker build fails
- Out of disk space: Clean up old images
- Network issues: Check internet connection
- Dependency errors: Clear npm cache

---

## Final Verification Checklist

Complete all before marking implementation done:

- [ ] All Phase 7 tests passing
- [ ] All Phase 10 tests passing
- [ ] Integration tests passing
- [ ] Automated test script passes
- [ ] Docker container healthy
- [ ] Claude Code successfully queries server
- [ ] Documentation complete (README, QUICK_START)
- [ ] No security warnings in logs
- [ ] Environment variables validated
- [ ] Multi-user scenarios tested

---

**Once all items are checked, the implementation is verified and ready for use!** ✅
