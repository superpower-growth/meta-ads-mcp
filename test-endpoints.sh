#!/bin/bash
# Test script for Meta Ads MCP Server endpoints
# Usage: ./test-endpoints.sh [session_cookie]

set -e

BASE_URL="http://localhost:3000"
COOKIE="${1:-}"

echo "==========================================="
echo "Meta Ads MCP Server - Endpoint Tests"
echo "==========================================="
echo ""

# Test 1: Health Check (no auth required)
echo "Test 1: Health Check (no auth)"
echo "$ curl $BASE_URL/health"
HEALTH_RESPONSE=$(curl -s "$BASE_URL/health")
echo "$HEALTH_RESPONSE" | jq .
echo ""

if echo "$HEALTH_RESPONSE" | jq -e '.status == "ok"' > /dev/null; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed"
  exit 1
fi
echo ""

# Test 2: MCP endpoint without auth (should fail)
echo "Test 2: MCP Endpoint without auth (should return 401)"
echo "$ curl $BASE_URL/mcp"
UNAUTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/mcp")
HTTP_CODE=$(echo "$UNAUTH_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$UNAUTH_RESPONSE" | head -n-1)

echo "$RESPONSE_BODY" | jq .
echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Unauthorized access correctly blocked"
else
  echo "❌ Expected 401, got $HTTP_CODE"
  exit 1
fi
echo ""

# Test 3: OAuth redirect
echo "Test 3: OAuth Redirect URL"
echo "$ curl -I $BASE_URL/auth/facebook"
REDIRECT_RESPONSE=$(curl -s -I "$BASE_URL/auth/facebook")
LOCATION=$(echo "$REDIRECT_RESPONSE" | grep -i "Location:" | cut -d' ' -f2 | tr -d '\r')

echo "Location: $LOCATION"
echo ""

if echo "$LOCATION" | grep -q "facebook.com"; then
  echo "✅ OAuth redirect to Facebook works"
else
  echo "❌ OAuth redirect failed"
  exit 1
fi
echo ""

# If cookie provided, test authenticated endpoints
if [ -n "$COOKIE" ]; then
  echo "==========================================="
  echo "Authenticated Endpoint Tests"
  echo "==========================================="
  echo ""

  # Test 4: Current user info
  echo "Test 4: Get Current User (/auth/me)"
  echo "$ curl $BASE_URL/auth/me --cookie 'connect.sid=...'"
  ME_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/auth/me" \
    --cookie "connect.sid=$COOKIE")
  ME_HTTP_CODE=$(echo "$ME_RESPONSE" | tail -n1)
  ME_BODY=$(echo "$ME_RESPONSE" | head -n-1)

  echo "$ME_BODY" | jq .
  echo "HTTP Status: $ME_HTTP_CODE"
  echo ""

  if [ "$ME_HTTP_CODE" = "200" ]; then
    echo "✅ User info retrieved successfully"
  else
    echo "❌ Failed to get user info (HTTP $ME_HTTP_CODE)"
    echo "Make sure your session cookie is valid"
  fi
  echo ""

  # Test 5: MCP endpoint with auth
  echo "Test 5: MCP Endpoint with auth"
  echo "$ curl $BASE_URL/mcp --cookie 'connect.sid=...'"
  MCP_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/mcp" \
    --cookie "connect.sid=$COOKIE")
  MCP_HTTP_CODE=$(echo "$MCP_RESPONSE" | tail -n1)

  echo "HTTP Status: $MCP_HTTP_CODE"
  echo ""

  if [ "$MCP_HTTP_CODE" = "200" ] || [ "$MCP_HTTP_CODE" = "204" ]; then
    echo "✅ MCP endpoint accessible with auth"
  else
    echo "❌ MCP endpoint failed (HTTP $MCP_HTTP_CODE)"
  fi
  echo ""

else
  echo "==========================================="
  echo "Skipping authenticated tests"
  echo "==========================================="
  echo ""
  echo "To test authenticated endpoints:"
  echo "1. Visit $BASE_URL/auth/facebook in your browser"
  echo "2. Login with Facebook"
  echo "3. Extract 'connect.sid' cookie from DevTools"
  echo "4. Run: ./test-endpoints.sh YOUR_COOKIE_VALUE"
  echo ""
fi

echo "==========================================="
echo "Test Summary"
echo "==========================================="
echo ""
echo "✅ All basic tests passed!"
echo ""
echo "Next steps:"
echo "1. Complete Facebook OAuth login in browser"
echo "2. Extract session cookie"
echo "3. Configure Claude Code with the cookie"
echo "4. Test MCP tools in Claude Code"
echo ""
