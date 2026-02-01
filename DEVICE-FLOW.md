# Device Flow OAuth Implementation

## Overview

This server now supports OAuth 2.0 Device Authorization Grant (Device Flow) for seamless MCP client authentication. Users can authenticate without manual cookie extraction.

## Features

- **Device Flow Authentication**: RFC 8628 compliant OAuth 2.0 device flow
- **Dual Authentication**: Supports both Bearer tokens (device flow) and session cookies (traditional)
- **Rate Limiting**: Protection against abuse with intelligent rate limits
- **Auto-Cleanup**: Automatic cleanup of expired codes and tokens
- **Backward Compatible**: Existing cookie-based authentication continues to work

## User Experience

```bash
# Step 1: Claude Code triggers authentication
$ claude add https://your-server.com/mcp

# Step 2: Get device code
Authentication required. Please:
1. Visit: https://your-server.com/auth/device
2. Enter code: WDJB-MJHT
3. Login with Facebook

# Step 3: User completes flow in browser
[Automatically polls and gets token]

# Step 4: Success!
Authentication successful! Your MCP tools are now available.
```

## API Endpoints

### Device Flow Endpoints

#### POST /auth/device/code
Generate a new device code for authentication.

**Response:**
```json
{
  "device_code": "f3242649-2240-4c7a-835a-954e1a8d07d3",
  "user_code": "PMR2-UJ63",
  "verification_uri": "http://localhost:3000/auth/device",
  "expires_in": 900,
  "interval": 5
}
```

#### GET /auth/device
HTML page for user to enter their device code.

#### POST /auth/device/verify
Verifies user code and redirects to Facebook OAuth.

#### POST /auth/device/token
Token polling endpoint.

**Request:**
```json
{
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
  "device_code": "f3242649-2240-4c7a-835a-954e1a8d07d3"
}
```

**Success Response:**
```json
{
  "access_token": "mcp_abc123...",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

**Pending Response:**
```json
{
  "error": "authorization_pending",
  "message": "The authorization request is still pending. Continue polling."
}
```

### Authentication

The server accepts two authentication methods (in priority order):

1. **Bearer Token** (Device Flow)
   ```
   Authorization: Bearer mcp_abc123...
   ```

2. **Session Cookie** (Traditional Flow)
   ```
   Cookie: connect.sid=...
   ```

## Security

- **Cryptographically secure** random generation for all codes and tokens
- **15-minute expiry** for device codes
- **24-hour expiry** for access tokens
- **Rate limiting** on all endpoints:
  - Device code generation: 10 per IP per hour
  - Token polling: 5-second minimum interval
  - Code verification: 5 attempts per code
- **One-time use** device codes (invalidated after authorization)
- **State parameter** for OAuth callback security

## Error Codes

- `authorization_pending` - User hasn't authorized yet (keep polling)
- `expired_token` - Device code expired (request new code)
- `access_denied` - User denied authorization (request new code)
- `slow_down` - Polling too fast (increase interval)
- `invalid_grant` - Invalid device code (request new code)
- `authentication_required` - No valid authentication provided
- `rate_limit_exceeded` - Too many requests

## Testing

Run the test suite:

```bash
npm run build
./test-device-flow.sh
```

## Implementation Files

### New Files
- `src/auth/device-flow.ts` - Device code & token stores (330 lines)
- `src/routes/device.ts` - Device flow endpoints (260 lines)
- `src/middleware/rate-limit.ts` - Rate limiting (180 lines)
- `src/lib/token-cleanup.ts` - Cleanup service (80 lines)

### Modified Files
- `src/middleware/auth.ts` - Dual authentication support
- `src/routes/auth.ts` - Device flow callback handling
- `src/index.ts` - Store initialization & graceful shutdown
- `src/auth/session.ts` - Type definitions

## Example: Manual Testing

```bash
# 1. Generate device code
curl -X POST http://localhost:3000/auth/device/code

# Response:
# {
#   "device_code": "f3242649-2240-4c7a-835a-954e1a8d07d3",
#   "user_code": "PMR2-UJ63",
#   "verification_uri": "http://localhost:3000/auth/device",
#   "expires_in": 900,
#   "interval": 5
# }

# 2. Visit verification_uri in browser and enter user_code

# 3. Poll for token
curl -X POST http://localhost:3000/auth/device/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"urn:ietf:params:oauth:grant-type:device_code","device_code":"f3242649-2240-4c7a-835a-954e1a8d07d3"}'

# 4. Use token with MCP
curl http://localhost:3000/mcp \
  -H "Authorization: Bearer mcp_abc123..."
```

## Deployment

1. Build the project: `npm run build`
2. Deploy to Railway (or your hosting platform)
3. No new environment variables needed
4. No database migration needed
5. Zero downtime - backward compatible
6. Existing users unaffected

## Architecture

```
┌─────────────┐
│ MCP Client  │
└──────┬──────┘
       │ 1. Try to use tool (401)
       ▼
┌─────────────────────────────┐
│ POST /auth/device/code      │
│ Get device_code, user_code  │
└──────┬──────────────────────┘
       │ 2. Display to user
       │
       ▼
┌─────────────────────────────┐
│ User visits /auth/device    │
│ Enters user_code            │
└──────┬──────────────────────┘
       │ 3. Verify & redirect
       ▼
┌─────────────────────────────┐
│ Facebook OAuth              │
│ User authorizes             │
└──────┬──────────────────────┘
       │ 4. Callback with state
       ▼
┌─────────────────────────────┐
│ Device code authorized      │
│ Access token generated      │
└──────┬──────────────────────┘
       │ 5. Client polls
       ▼
┌─────────────────────────────┐
│ POST /auth/device/token     │
│ Receive access_token        │
└──────┬──────────────────────┘
       │ 6. Use Bearer token
       ▼
┌─────────────────────────────┐
│ All MCP requests            │
│ Authorization: Bearer ...   │
└─────────────────────────────┘
```

## Code Quality

- **Type-safe**: Full TypeScript with strict mode
- **Well-documented**: Comprehensive JSDoc comments
- **Tested**: All endpoints verified with test suite
- **Clean**: Follows existing codebase patterns
- **Secure**: Industry-standard OAuth 2.0 implementation
- **Efficient**: In-memory stores with automatic cleanup
