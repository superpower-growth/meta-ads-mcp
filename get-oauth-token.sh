#!/bin/bash

# OAuth 2.0 Token Acquisition Script
# This script helps you manually complete the OAuth flow to get an access token

set -e

echo "=== Meta Ads MCP - OAuth Token Helper ==="
echo ""

# Step 1: Register client
echo "Step 1: Registering OAuth client..."
CLIENT_RESPONSE=$(curl -s -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Claude Code MCP Client",
    "redirect_uris": ["http://localhost:8888/callback"]
  }')

CLIENT_ID=$(echo "$CLIENT_RESPONSE" | jq -r .client_id)
CLIENT_SECRET=$(echo "$CLIENT_RESPONSE" | jq -r .client_secret)

echo "✓ Client registered successfully"
echo "  Client ID: $CLIENT_ID"
echo ""

# Step 2: Generate PKCE challenge
echo "Step 2: Generating PKCE code verifier..."
CODE_VERIFIER=$(openssl rand -base64 32 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

echo "✓ PKCE challenge generated"
echo ""

# Step 3: Build authorization URL
AUTH_URL="http://localhost:3000/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=http://localhost:8888/callback&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&state=test123"

echo "Step 3: User Authorization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Open this URL in your browser:"
echo "   $AUTH_URL"
echo ""
echo "2. Login with Facebook"
echo ""
echo "3. After login, you'll be redirected to a URL that looks like:"
echo "   http://localhost:8888/callback?code=XXXXX&state=test123"
echo ""
echo "4. Copy the 'code' parameter value from that URL"
echo "   (The browser will show an error - that's OK, just copy the code)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Enter the authorization code: " AUTH_CODE

echo ""
echo "Step 4: Exchanging code for access token..."

# Step 4: Exchange code for token
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:3000/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=${AUTH_CODE}&redirect_uri=http://localhost:8888/callback&client_id=${CLIENT_ID}&code_verifier=${CODE_VERIFIER}")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r .access_token)
EXPIRES_IN=$(echo "$TOKEN_RESPONSE" | jq -r .expires_in)

if [ "$ACCESS_TOKEN" = "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Failed to get access token"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo "✓ Access token acquired successfully"
echo ""

# Step 5: Save to MCP config
echo "Step 5: Updating MCP configuration..."

MCP_CONFIG=~/.config/claude-code/mcp.json

cat > "$MCP_CONFIG" << EOF
{
  "mcpServers": {
    "meta-ads": {
      "url": "http://localhost:3000/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer $ACCESS_TOKEN"
      }
    }
  }
}
EOF

echo "✓ MCP configuration updated"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo ""
echo "Your access token: $ACCESS_TOKEN"
echo "Expires in: $EXPIRES_IN seconds (24 hours)"
echo ""
echo "MCP configuration saved to: $MCP_CONFIG"
echo ""
echo "You can now use Claude Code to query your Meta Ads data!"
echo "Try: 'Show me campaign performance for the last 7 days'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
