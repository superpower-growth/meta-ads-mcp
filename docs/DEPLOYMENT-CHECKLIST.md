# Device Flow Deployment Checklist

## Pre-Deployment Verification

- [x] Code builds successfully: `npm run build`
- [x] All tests pass: `./test-device-flow.sh`
- [x] TypeScript compiles without errors
- [x] No new environment variables required
- [x] Backward compatibility maintained

## Deployment Steps

1. **Push to Repository**
   ```bash
   git push origin main
   ```

2. **Railway Auto-Deploy**
   - Railway will automatically detect the push
   - Build process will run
   - Server will restart with zero downtime

3. **Verify Deployment**
   ```bash
   # Check health
   curl https://meta-ads-mcp-production-3b99.up.railway.app/health

   # Test device code generation
   curl -X POST https://meta-ads-mcp-production-3b99.up.railway.app/auth/device/code
   ```

## Post-Deployment Testing

### Test 1: Health Check
```bash
curl https://meta-ads-mcp-production-3b99.up.railway.app/health
```
**Expected:** `{"status":"ok",...}`

### Test 2: Device Code Generation
```bash
curl -X POST https://meta-ads-mcp-production-3b99.up.railway.app/auth/device/code
```
**Expected:**
```json
{
  "device_code": "...",
  "user_code": "XXXX-XXXX",
  "verification_uri": "https://meta-ads-mcp-production-3b99.up.railway.app/auth/device",
  "expires_in": 900,
  "interval": 5
}
```

### Test 3: Verification Page
Visit: `https://meta-ads-mcp-production-3b99.up.railway.app/auth/device`

**Expected:** Beautiful HTML page with code entry form

### Test 4: Authentication Required
```bash
curl https://meta-ads-mcp-production-3b99.up.railway.app/mcp
```
**Expected:**
```json
{
  "error": "authentication_required",
  "message": "Please authenticate using device flow.",
  "device_flow": {...}
}
```

### Test 5: Traditional Auth Still Works
Visit: `https://meta-ads-mcp-production-3b99.up.railway.app/auth/facebook`

**Expected:** Redirect to Facebook OAuth

### Test 6: Rate Limiting
```bash
# Generate multiple device codes quickly
for i in {1..12}; do
  curl -X POST https://meta-ads-mcp-production-3b99.up.railway.app/auth/device/code
done
```
**Expected:** After 10 requests, receive `rate_limit_exceeded` error

## End-to-End User Test

1. **Add MCP Server to Claude Code**
   ```bash
   claude add https://meta-ads-mcp-production-3b99.up.railway.app/mcp
   ```

2. **Trigger Authentication**
   - Ask Claude to use a Meta Ads tool
   - Claude should display device flow instructions

3. **Complete Device Flow**
   - POST to `/auth/device/code`
   - Visit verification URL
   - Enter user code
   - Complete Facebook OAuth
   - Poll `/auth/device/token`

4. **Verify Tool Access**
   - Use Bearer token in Authorization header
   - Successfully call MCP tools

## Rollback Plan

If issues are detected:

1. **Revert Commit**
   ```bash
   git revert 99dae48
   git push origin main
   ```

2. **Railway Auto-Redeploy**
   - Railway will automatically deploy previous version
   - Existing users continue working

## Success Criteria

- [ ] Health check responds with 200
- [ ] Device code generation works
- [ ] Verification page loads
- [ ] OAuth callback handles both flows
- [ ] Traditional cookie auth still works
- [ ] Bearer token auth works
- [ ] Rate limiting is active
- [ ] No errors in Railway logs
- [ ] Zero downtime for existing users

## Monitoring

After deployment, monitor:

1. **Railway Logs**
   - Check for any errors
   - Verify cleanup service is running
   - Monitor authentication requests

2. **Server Metrics**
   - Response times
   - Error rates
   - Memory usage

3. **User Feedback**
   - Test with actual Claude Code integration
   - Verify user experience is smooth

## Notes

- **Zero Downtime**: Deployment is backward compatible
- **No Migration**: All stores are in-memory (no database changes)
- **Existing Users**: Unaffected by changes
- **New Feature**: Opt-in for users who want device flow
- **Security**: All endpoints properly rate-limited and secured
