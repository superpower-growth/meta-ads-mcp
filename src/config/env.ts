/**
 * Environment Configuration
 *
 * Validates and exports environment variables required for Meta Marketing API.
 * Uses zod for runtime validation with clear error messages.
 */

import { z } from 'zod';

const envSchema = z.object({
  META_ACCESS_TOKEN: z
    .string()
    .min(1, 'META_ACCESS_TOKEN environment variable is required. See .env.example for setup.'),
  META_AD_ACCOUNT_ID: z
    .string()
    .min(1, 'META_AD_ACCOUNT_ID environment variable is required. See .env.example for setup.')
    .regex(/^act_\d+$/, 'META_AD_ACCOUNT_ID must be in format: act_123456789'),
  PORT: z
    .string()
    .optional()
    .default('3000')
    .transform((val) => parseInt(val, 10)),
  HOST: z
    .string()
    .optional()
    .default('0.0.0.0'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .optional()
    .default('development'),
  FACEBOOK_APP_ID: z
    .string()
    .min(1, 'FACEBOOK_APP_ID environment variable is required for OAuth. See .env.example for setup.'),
  FACEBOOK_APP_SECRET: z
    .string()
    .min(1, 'FACEBOOK_APP_SECRET environment variable is required for OAuth. See .env.example for setup.'),
  FACEBOOK_CALLBACK_URL: z
    .string()
    .url('FACEBOOK_CALLBACK_URL must be a valid URL')
    .default('http://localhost:3000/auth/callback'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters for security. Generate with: openssl rand -base64 32'),
  SESSION_TTL: z
    .string()
    .optional()
    .default('86400000')
    .transform((val) => parseInt(val, 10)),
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    return envSchema.parse({
      META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
      META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID,
      PORT: process.env.PORT,
      HOST: process.env.HOST,
      NODE_ENV: process.env.NODE_ENV,
      FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
      FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
      FACEBOOK_CALLBACK_URL: process.env.FACEBOOK_CALLBACK_URL,
      SESSION_SECRET: process.env.SESSION_SECRET,
      SESSION_TTL: process.env.SESSION_TTL,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((err) => `  - ${err.path.join('.')}: ${err.message}`);
      throw new Error(
        `Environment validation failed:\n${messages.join('\n')}\n\nPlease check your .env file.`
      );
    }
    throw error;
  }
};

export const env = parseEnv();
