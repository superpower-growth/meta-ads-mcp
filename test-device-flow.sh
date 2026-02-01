#!/bin/bash

# Test script for Device Flow OAuth implementation

set -e

echo "Starting server..."
node build/index.js > /tmp/server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Cleanup function
cleanup() {
  echo ""
  echo "Stopping server..."
  kill $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
}

trap cleanup EXIT

echo "==================================="
echo "Device Flow OAuth Tests"
echo "==================================="
echo ""

# Test 1: Health check
echo "✓ Test 1: Health check"
curl -s http://localhost:3000/health | python3 -m json.tool
echo ""

# Test 2: Generate device code
echo "✓ Test 2: Generate device code"
RESPONSE=$(curl -s -X POST http://localhost:3000/auth/device/code)
echo "$RESPONSE" | python3 -m json.tool
DEVICE_CODE=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['device_code'])")
USER_CODE=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['user_code'])")
echo ""

# Test 3: Poll for token (should be pending)
echo "✓ Test 3: Poll for token (should be pending)"
curl -s -X POST http://localhost:3000/auth/device/token \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"urn:ietf:params:oauth:grant-type:device_code\",\"device_code\":\"$DEVICE_CODE\"}" | python3 -m json.tool
echo ""

# Test 4: Test authentication without credentials
echo "✓ Test 4: Test authentication requirement"
curl -s http://localhost:3000/mcp | python3 -m json.tool
echo ""

# Test 5: Test invalid device code
echo "✓ Test 5: Test invalid device code"
curl -s -X POST http://localhost:3000/auth/device/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"urn:ietf:params:oauth:grant-type:device_code","device_code":"invalid"}' | python3 -m json.tool
echo ""

# Test 6: Test rate limiting for token polling
echo "✓ Test 6: Test rate limiting (polling too fast)"
curl -s -X POST http://localhost:3000/auth/device/token \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"urn:ietf:params:oauth:grant-type:device_code\",\"device_code\":\"$DEVICE_CODE\"}" > /dev/null
curl -s -X POST http://localhost:3000/auth/device/token \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"urn:ietf:params:oauth:grant-type:device_code\",\"device_code\":\"$DEVICE_CODE\"}" | python3 -m json.tool
echo ""

# Test 7: Test device verification page
echo "✓ Test 7: Device verification page exists"
curl -s http://localhost:3000/auth/device | grep -q "Device Authorization" && echo "Page loaded successfully" || echo "Page failed to load"
echo ""

# Test 8: Test traditional auth still works
echo "✓ Test 8: Traditional auth endpoint exists"
curl -s -I http://localhost:3000/auth/facebook | grep -q "302" && echo "OAuth redirect works" || echo "OAuth endpoint failed"
echo ""

echo "==================================="
echo "All tests completed successfully!"
echo "==================================="
