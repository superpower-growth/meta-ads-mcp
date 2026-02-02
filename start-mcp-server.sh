#!/bin/bash

# Start Meta Ads MCP Server
# This script starts the server in the background and logs output

cd "$(dirname "$0")"

echo "Starting Meta Ads MCP Server..."

# Check if already running
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Server already running on http://localhost:3000"
    exit 0
fi

# Start server in background
npm start > logs/mcp-server.log 2>&1 &
SERVER_PID=$!

echo "🚀 Server starting with PID: $SERVER_PID"
echo "   Logs: logs/mcp-server.log"

# Wait for server to be ready
for i in {1..10}; do
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo "✅ Server ready on http://localhost:3000"
        exit 0
    fi
    echo "   Waiting for server... ($i/10)"
    sleep 1
done

echo "❌ Server failed to start. Check logs/mcp-server.log"
exit 1
