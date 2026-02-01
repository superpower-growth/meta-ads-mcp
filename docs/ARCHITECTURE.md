# Meta Ads MCP Server Architecture

## Overview

This document describes the complete architecture of the Meta Ads MCP server, including both traditional session-based authentication and the new OAuth 2.0 Device Flow.

## Authentication Architecture

### Dual Authentication System

The server supports two authentication methods with priority-based fallback:

```
Request → Auth Middleware
           ↓
    ┌──────┴──────┐
    ↓             ↓
Priority 1:   Priority 2:
Bearer Token  Session Cookie
    ↓             ↓
    └──────┬──────┘
           ↓
    Set req.user
           ↓
    Continue to Handler
```

### Priority 1: Bearer Token (Device Flow)

**Flow:**
```
1. Client requests device code
   POST /auth/device/code
   → device_code, user_code, verification_uri

2. User visits verification page
   GET /auth/device
   → HTML form with code entry

3. User enters code and submits
   POST /auth/device/verify
   → Validates code
   → Redirects to Facebook OAuth with state=device:<deviceCode>

4. Facebook OAuth callback
   GET /auth/callback?code=...&state=device:<deviceCode>
   → Exchange code for user profile
   → Authorize device code
   → Generate access token
   → Store in AccessTokenStore

5. Client polls for token
   POST /auth/device/token
   → Returns access_token when authorized

6. Client uses token for all requests
   Authorization: Bearer mcp_abc123...
   → Validated by AccessTokenStore
   → Sets req.user with userId, email, name
```

**Components:**

- **DeviceCodeStore**: In-memory store for pending device authorizations
  - Stores: device_code, user_code, status, expiry
  - Auto-cleanup: Every 60 seconds
  - Expiry: 15 minutes

- **AccessTokenStore**: In-memory store for issued tokens
  - Stores: userId, email, name, expiry, deviceCode
  - Auto-cleanup: Every 5 minutes
  - Expiry: 24 hours

- **Rate Limiters**:
  - Device code generation: 10/IP/hour
  - Token polling: 5-second minimum interval
  - Code verification: 5 attempts/code

### Priority 2: Session Cookie (Traditional Flow)

**Flow:**
```
1. User visits login URL
   GET /auth/facebook
   → Redirects to Facebook OAuth

2. Facebook OAuth callback
   GET /auth/callback?code=...
   → Exchange code for user profile
   → Create session with userId, email, name
   → Save session to connect.sid cookie
   → Display cookie extraction instructions

3. User configures mcp.json with cookie
   {
     "headers": {
       "Cookie": "connect.sid=..."
     }
   }

4. Client uses cookie for all requests
   Cookie: connect.sid=...
   → Session validated
   → Sets req.user from session data
```

**Components:**

- **express-session**: Session middleware with MemoryStore
- **Session expiry**: 24 hours (configurable via SESSION_TTL)
- **Session data**: userId, email, name, expiresAt

## Data Stores

### DeviceCodeStore

```typescript
Map<deviceCode, {
  deviceCode: string        // UUID (e.g., "f3242649-2240-4c7a-835a-954e1a8d07d3")
  userCode: string          // 8-char code (e.g., "WDJB-MJHT")
  verificationUri: string
  expiresAt: Date           // 15 minutes from creation
  interval: number          // 5 seconds
  status: 'pending' | 'authorized' | 'denied' | 'expired'
  userId?: string           // Set after authorization
  email?: string
  name?: string
  createdAt: Date
}>

// Secondary index for user code lookups
Map<userCode, deviceCode>
```

### AccessTokenStore

```typescript
Map<accessToken, {
  userId: string
  email: string
  name: string
  expiresAt: Date          // 24 hours from creation
  deviceCode?: string      // Reference to original device code
  createdAt: Date
}>
```

### Cleanup Service

```
TokenCleanupService
├── Runs every 5 minutes
├── Cleans DeviceCodeStore (expired + authorized codes)
├── Cleans AccessTokenStore (expired tokens)
└── Logs statistics
```

## API Endpoints

### Device Flow Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /auth/device/code | None | Generate device code |
| GET | /auth/device | None | Verification page |
| POST | /auth/device/verify | None | Verify user code |
| POST | /auth/device/token | None | Poll for token |

### Traditional Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /auth/facebook | None | Initiate OAuth |
| GET | /auth/callback | None | OAuth callback |
| GET | /auth/logout | None | Destroy session |
| GET | /auth/me | Required | Get user info |

### MCP Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /mcp | Required | MCP server (SSE) |
| POST | /mcp | Required | MCP messages |

### Utility Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /health | None | Health check |

## Security Features

### Code Generation

- **Device Code**: Crypto.randomUUID() - RFC 4122 compliant
- **User Code**: 8 characters from safe alphabet (no 0,O,1,I)
- **Access Token**: `mcp_` + 32 bytes of crypto.randomBytes()

### Expiry Times

- Device codes: 15 minutes
- Access tokens: 24 hours
- Session cookies: 24 hours

### Rate Limiting

```typescript
DeviceCodeRateLimit
├── Key: IP address
├── Limit: 10 requests/hour
└── Window: 1 hour

TokenPollingRateLimit
├── Key: device_code
├── Limit: 1 request/5 seconds
└── Window: 5 seconds

CodeVerificationRateLimit
├── Key: user_code
├── Limit: 5 attempts
└── Window: 15 minutes (same as device code expiry)
```

### State Parameter

OAuth state parameter encodes device flow context:
- Traditional flow: No state or custom state
- Device flow: `device:<deviceCode>`

Server validates state on callback to link OAuth result to device authorization.

## Error Handling

### Device Flow Errors

| Error Code | HTTP Status | Meaning |
|------------|-------------|---------|
| authorization_pending | 400 | User hasn't authorized yet |
| slow_down | 400 | Polling too fast |
| expired_token | 400 | Device code expired |
| access_denied | 400 | User denied authorization |
| invalid_grant | 400 | Invalid device code |
| rate_limit_exceeded | 429 | Too many requests |
| server_error | 500 | Internal error |

### Authentication Errors

| Error Code | HTTP Status | Meaning |
|------------|-------------|---------|
| authentication_required | 401 | No valid auth provided |
| Unauthorized | 401 | Invalid session (legacy) |
| Session expired | 401 | Session expired (legacy) |

## File Structure

```
src/
├── auth/
│   ├── device-flow.ts          # Device code & token stores
│   ├── facebook-oauth.ts       # Facebook OAuth logic
│   └── session.ts              # Session configuration
├── config/
│   └── env.ts                  # Environment variables
├── lib/
│   ├── token-cleanup.ts        # Cleanup service
│   ├── comparison.ts           # Comparison utilities
│   ├── parsers.ts              # Data parsers
│   ├── ranking.ts              # Ranking logic
│   ├── validation.ts           # Input validation
│   └── video-analysis.ts       # Video analytics
├── middleware/
│   ├── auth.ts                 # Dual auth middleware
│   └── rate-limit.ts           # Rate limiting
├── routes/
│   ├── auth.ts                 # Traditional auth routes
│   └── device.ts               # Device flow routes
├── tools/
│   └── [MCP tool implementations]
└── index.ts                    # Server entry point
```

## Request Flow

### Device Flow Request

```
1. Client → POST /auth/device/code
   ↓
2. DeviceCodeStore.create()
   ↓
3. Return device_code + user_code

4. User → GET /auth/device
   ↓
5. Display HTML form

6. User → POST /auth/device/verify
   ↓
7. DeviceCodeStore.getByUserCode()
   ↓
8. Redirect to /auth/facebook?state=device:<deviceCode>

9. Facebook → GET /auth/callback?state=device:<deviceCode>&code=...
   ↓
10. Exchange code for user profile
    ↓
11. DeviceCodeStore.authorize(deviceCode, user)
    ↓
12. Generate access token
    ↓
13. AccessTokenStore.set(token, userData)
    ↓
14. Display success page

15. Client → POST /auth/device/token
    ↓
16. DeviceCodeStore.getByDeviceCode()
    ↓
17. If authorized, return access_token
    ↓
18. Client → POST /mcp (Authorization: Bearer <token>)
    ↓
19. Auth middleware validates token
    ↓
20. AccessTokenStore.validate(token)
    ↓
21. Set req.user
    ↓
22. Execute MCP tool
```

### Traditional Flow Request

```
1. User → GET /auth/facebook
   ↓
2. Redirect to Facebook OAuth

3. Facebook → GET /auth/callback?code=...
   ↓
4. Exchange code for user profile
   ↓
5. Create session
   ↓
6. Save to session store
   ↓
7. Set connect.sid cookie
   ↓
8. Display cookie extraction page

9. Client → POST /mcp (Cookie: connect.sid=...)
   ↓
10. Auth middleware validates session
    ↓
11. Set req.user from session
    ↓
12. Execute MCP tool
```

## Monitoring & Observability

### Logs

The server logs important events:

- Server startup with endpoints
- Cleanup service statistics
- Device code generation/authorization
- Authentication failures
- Rate limit violations
- OAuth errors

### Metrics to Monitor

- Active device codes (pending/authorized)
- Active access tokens
- Session count
- Request rate by endpoint
- Error rate
- Authentication success/failure rate
- Cleanup efficiency

## Graceful Shutdown

```
SIGTERM/SIGINT
    ↓
1. Stop cleanup service
   ↓
2. Destroy DeviceCodeStore
   ↓
3. Destroy AccessTokenStore
   ↓
4. Close HTTP server
   ↓
5. Exit process
```

## Performance Characteristics

- **Memory**: O(n) where n = active codes + tokens + sessions
- **Cleanup**: O(n) every 5 minutes, efficient Map operations
- **Lookup**: O(1) for all authentication operations
- **Concurrency**: Supports multiple concurrent authentications

## Future Enhancements

Potential improvements:

1. **Persistent Storage**: Replace in-memory stores with Redis/database
2. **Token Refresh**: Implement refresh tokens for long-lived access
3. **Scope Management**: Fine-grained permissions per token
4. **Multi-Factor Auth**: Additional security layer
5. **Audit Logging**: Track all authentication events
6. **Analytics Dashboard**: Visualize auth metrics
7. **Webhook Support**: Notify on authorization events
