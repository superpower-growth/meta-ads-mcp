#!/bin/bash

# Meta Ads MCP Server Setup Script
# Automates initial setup for local development

set -e

echo "=================================================="
echo "Meta Ads MCP Server - Setup"
echo "=================================================="
echo ""

# Check if .env exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists!"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Copy .env.example to .env
echo "✓ Creating .env file from template..."
cp .env.example .env

# Generate session secret
echo "✓ Generating secure session secret..."
SESSION_SECRET=$(openssl rand -base64 32)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/" .env
    sed -i '' "s/REQUIRE_AUTH=.*/REQUIRE_AUTH=false/" .env
else
    # Linux
    sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/" .env
    sed -i "s/REQUIRE_AUTH=.*/REQUIRE_AUTH=false/" .env
fi

echo "✓ Set to local mode (REQUIRE_AUTH=false) - no OAuth needed!"

echo ""
echo "=================================================="
echo "Configuration Required"
echo "=================================================="
echo ""
echo "Please edit .env and add the following:"
echo ""
echo "1. META_ACCESS_TOKEN"
echo "   Get from: https://developers.facebook.com/tools/explorer"
echo "   - Select your app"
echo "   - Click 'Generate Access Token'"
echo "   - Grant permissions: ads_read, ads_management"
echo "   - For production, exchange for long-lived token (60 days)"
echo ""
echo "2. META_AD_ACCOUNT_ID"
echo "   Format: act_123456789"
echo "   Find in Business Manager or Ads Manager URL"
echo ""
echo "3. FACEBOOK_APP_ID & FACEBOOK_APP_SECRET (Optional - only for production/OAuth mode)"
echo "   For local Claude Code use, you can skip this!"
echo "   Only needed if you set REQUIRE_AUTH=true"
echo "   Get from: https://developers.facebook.com/apps/"
echo ""

read -p "Press Enter to open .env in your editor..."

# Open .env in default editor
if [ -n "$EDITOR" ]; then
    $EDITOR .env
elif command -v code &> /dev/null; then
    code .env
elif command -v nano &> /dev/null; then
    nano .env
elif command -v vi &> /dev/null; then
    vi .env
else
    echo "Please edit .env manually"
fi

echo ""
echo "=================================================="
echo "Installing Dependencies"
echo "=================================================="
echo ""

npm install

echo ""
echo "=================================================="
echo "Building Project"
echo "=================================================="
echo ""

npm run build

echo ""
echo "=================================================="
echo "✅ Setup Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Start the server:"
echo "   npm start"
echo "   (or use: ./start-mcp-server.sh)"
echo ""
echo "2. Login to get session cookie:"
echo "   - Visit: http://localhost:3000/auth/facebook"
echo "   - Login with Facebook"
echo "   - Open DevTools > Application > Cookies"
echo "   - Copy the 'connect.sid' cookie value"
echo ""
echo "3. Configure Claude Code:"
echo "   - Edit: ~/.config/claude-code/mcp.json"
echo "   - Add:"
echo '   {
     "mcpServers": {
       "meta-ads": {
         "url": "http://localhost:3000/mcp",
         "transport": "http",
         "headers": {
           "Cookie": "connect.sid=YOUR_COOKIE_HERE"
         }
       }
     }
   }'
echo ""
echo "4. Customize (optional):"
echo "   - Edit src/lib/custom-conversions.ts for your conversion events"
echo "   - Edit src/lib/ad-classification.ts for your ad categories"
echo ""
echo "For more details, see README.md"
echo ""
