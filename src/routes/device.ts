import express, { Request, Response } from 'express';
import { DeviceCode } from '../auth/device-flow.js';
import {
  rateLimitDeviceCode,
  rateLimitTokenPolling,
  rateLimitCodeVerification,
} from '../middleware/rate-limit.js';

const router = express.Router();

/**
 * POST /auth/device/code
 * Generate a new device code for device flow authentication
 */
router.post('/code', rateLimitDeviceCode, (req: Request, res: Response) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const verificationUri = `${baseUrl}/auth/device`;

    const deviceCode = global.deviceCodeStore.create(verificationUri);

    res.json({
      device_code: deviceCode.deviceCode,
      user_code: deviceCode.userCode,
      verification_uri: verificationUri,
      expires_in: Math.floor((deviceCode.expiresAt.getTime() - Date.now()) / 1000),
      interval: deviceCode.interval,
    });
  } catch (error) {
    console.error('[Device Flow] Error generating device code:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to generate device code',
    });
  }
});

/**
 * GET /auth/device
 * Display the device code entry page
 */
router.get('/', (req: Request, res: Response) => {
  const userCode = req.query.user_code as string | undefined;

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Device Authorization - Meta Ads MCP</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
      max-width: 480px;
      width: 100%;
    }
    h1 {
      color: #333;
      font-size: 28px;
      margin-bottom: 12px;
      text-align: center;
    }
    .subtitle {
      color: #666;
      font-size: 14px;
      margin-bottom: 32px;
      text-align: center;
    }
    .form-group {
      margin-bottom: 24px;
    }
    label {
      display: block;
      color: #333;
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 14px;
    }
    input[type="text"] {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 18px;
      font-family: 'Courier New', monospace;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 2px;
      transition: border-color 0.3s;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: #667eea;
    }
    .hint {
      color: #888;
      font-size: 12px;
      margin-top: 6px;
      text-align: center;
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    button:active {
      transform: translateY(0);
    }
    .error {
      background: #fee;
      border: 1px solid #fcc;
      color: #c33;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 20px;
      font-size: 14px;
      display: none;
    }
    .error.show {
      display: block;
    }
    .info-box {
      background: #f0f4ff;
      border-left: 4px solid #667eea;
      padding: 16px;
      border-radius: 6px;
      margin-bottom: 24px;
    }
    .info-box p {
      color: #555;
      font-size: 14px;
      line-height: 1.6;
    }
    .info-box strong {
      color: #333;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔐 Device Authorization</h1>
    <p class="subtitle">Meta Ads MCP Server</p>

    <div class="info-box">
      <p><strong>Step 1:</strong> Enter the code shown in your terminal</p>
      <p><strong>Step 2:</strong> Click "Continue" to authorize with Facebook</p>
    </div>

    <div id="error" class="error"></div>

    <form id="deviceForm" method="POST" action="/auth/device/verify">
      <div class="form-group">
        <label for="user_code">Enter Your Code</label>
        <input
          type="text"
          id="user_code"
          name="user_code"
          placeholder="XXXX-XXXX"
          maxlength="9"
          value="${userCode || ''}"
          autocomplete="off"
          autocapitalize="characters"
          required
        />
        <p class="hint">8 characters with hyphen (e.g., WDJB-MJHT)</p>
      </div>

      <button type="submit">Continue to Facebook Login</button>
    </form>
  </div>

  <script>
    const input = document.getElementById('user_code');
    const form = document.getElementById('deviceForm');
    const errorDiv = document.getElementById('error');

    // Auto-format input with hyphen
    input.addEventListener('input', (e) => {
      let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

      if (value.length > 4) {
        value = value.slice(0, 4) + '-' + value.slice(4, 8);
      }

      e.target.value = value;
    });

    // Auto-focus input
    input.focus();

    // Form validation
    form.addEventListener('submit', (e) => {
      const code = input.value.replace(/-/g, '');

      if (code.length !== 8) {
        e.preventDefault();
        showError('Please enter a valid 8-character code');
        return;
      }

      errorDiv.classList.remove('show');
    });

    function showError(message) {
      errorDiv.textContent = message;
      errorDiv.classList.add('show');
    }

    // Check for error in URL
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    if (error === 'invalid_code') {
      showError('Invalid or expired code. Please check your code and try again.');
    }
  </script>
</body>
</html>
  `);
});

/**
 * POST /auth/device/verify
 * Verify user code and redirect to OAuth
 */
router.post('/verify', rateLimitCodeVerification, (req: Request, res: Response) => {
  try {
    const userCode = req.body.user_code?.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (!userCode || userCode.length !== 8) {
      return res.redirect('/auth/device?error=invalid_code');
    }

    const deviceCode = global.deviceCodeStore.getByUserCode(userCode);

    if (!deviceCode) {
      return res.redirect('/auth/device?error=invalid_code');
    }

    if (deviceCode.status === 'expired') {
      return res.redirect('/auth/device?error=invalid_code');
    }

    if (deviceCode.status !== 'pending') {
      return res.redirect('/auth/device?error=invalid_code');
    }

    // Store device code in state parameter for OAuth callback
    const state = `device:${deviceCode.deviceCode}`;

    // Redirect to Facebook OAuth
    res.redirect(`/auth/facebook?state=${encodeURIComponent(state)}`);
  } catch (error) {
    console.error('[Device Flow] Error verifying code:', error);
    res.redirect('/auth/device?error=server_error');
  }
});

/**
 * POST /auth/device/token
 * Token polling endpoint
 */
router.post('/token', rateLimitTokenPolling, (req: Request, res: Response) => {
  try {
    const { grant_type, device_code } = req.body;

    // Validate grant type
    if (grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        message: 'Grant type must be "urn:ietf:params:oauth:grant-type:device_code"',
      });
    }

    if (!device_code) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Missing device_code parameter',
      });
    }

    const deviceCodeData = global.deviceCodeStore.getByDeviceCode(device_code);

    if (!deviceCodeData) {
      return res.status(400).json({
        error: 'invalid_grant',
        message: 'Invalid or expired device code',
      });
    }

    // Check status
    switch (deviceCodeData.status) {
      case 'expired':
        return res.status(400).json({
          error: 'expired_token',
          message: 'The device code has expired. Please request a new code.',
        });

      case 'denied':
        return res.status(400).json({
          error: 'access_denied',
          message: 'The authorization request was denied.',
        });

      case 'pending':
        return res.status(400).json({
          error: 'authorization_pending',
          message: 'The authorization request is still pending. Continue polling.',
        });

      case 'authorized':
        // Find the access token for this device code
        // The token was created during authorization
        // We need to find it in the access token store

        // Since we stored the device code in the token data, we can search for it
        // For now, we'll regenerate the token (this is a simplification)
        // In production, you might want to store the token with the device code

        if (!deviceCodeData.userId || !deviceCodeData.email || !deviceCodeData.name) {
          return res.status(500).json({
            error: 'server_error',
            message: 'Invalid device code state',
          });
        }

        // Find or regenerate access token
        const accessToken = findOrCreateAccessToken(deviceCodeData);

        return res.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 24 * 60 * 60, // 24 hours in seconds
        });

      default:
        return res.status(500).json({
          error: 'server_error',
          message: 'Unknown device code status',
        });
    }
  } catch (error) {
    console.error('[Device Flow] Error polling token:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to process token request',
    });
  }
});

/**
 * Helper function to find or create access token for a device code
 */
function findOrCreateAccessToken(deviceCode: DeviceCode): string {
  // Check if we already have a token for this device code
  // This is a simple implementation - in production you might want to store
  // the token reference with the device code

  const { generateAccessToken } = require('../auth/device-flow.js');
  const token = generateAccessToken();

  global.accessTokenStore.set(token, {
    userId: deviceCode.userId!,
    email: deviceCode.email!,
    name: deviceCode.name!,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    deviceCode: deviceCode.deviceCode,
    createdAt: new Date(),
  });

  return token;
}

export default router;
