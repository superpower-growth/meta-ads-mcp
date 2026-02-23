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
    .min(1, 'META_ACCESS_TOKEN or FACEBOOK_MARKETING_API environment variable is required. See .env.example for setup.'),
  META_AD_ACCOUNT_ID: z
    .string()
    .optional()
    .refine((val) => !val || /^act_\d+$/.test(val), 'META_AD_ACCOUNT_ID must be in format: act_123456789')
    .default(''),
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
    .min(1)
    .optional(),
  FACEBOOK_APP_SECRET: z
    .string()
    .min(1)
    .optional(),
  FACEBOOK_CALLBACK_URL: z
    .string()
    .url('FACEBOOK_CALLBACK_URL must be a valid URL')
    .default('http://localhost:3000/auth/callback'),
  SESSION_SECRET: z
    .string()
    .min(1)
    .default('fly-io-default-session-secret-change-me-in-prod-32chars'),
  SESSION_TTL: z
    .string()
    .optional()
    .default('86400000')
    .transform((val) => parseInt(val, 10)),

  // Google Cloud Platform Configuration (optional - for video interpretation features)
  GOOGLE_SERVICE_ACCOUNT_JSON: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true; // Optional field
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid JSON format for GOOGLE_SERVICE_ACCOUNT_JSON'),
  GCS_BUCKET_NAME: z
    .string()
    .default('meta-ads-videos'),
  FIRESTORE_CACHE_TTL_HOURS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(24),
  GCP_PROJECT_ID: z
    .string()
    .optional(),

  // Gemini AI Configuration (optional - for video content analysis)
  GEMINI_API_KEY: z
    .string()
    .optional(),
  GEMINI_MODEL: z
    .string()
    .default('gemini-2.5-flash'),
  GEMINI_USE_VERTEX_AI: z
    .coerce
    .boolean()
    .default(false),
  GEMINI_MAX_COST_PER_ANALYSIS: z
    .coerce
    .number()
    .positive()
    .default(0.10),

  // Google OAuth Configuration (for Drive API access without per-folder sharing)
  GOOGLE_OAUTH_CLIENT_ID: z
    .string()
    .optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z
    .string()
    .optional(),
  GOOGLE_OAUTH_CALLBACK_URL: z
    .string()
    .url()
    .optional()
    .default('https://sp-meta-ads-mcp.fly.dev/auth/google/callback'),

  // Pipeline Configuration (for auto-pilot ad processing)
  ANTHROPIC_API_KEY: z
    .string()
    .optional(),
  NOTION_API_KEY: z
    .string()
    .optional(),
  NOTION_MEDIA_DB_ID: z
    .string()
    .default('2748444481d08045b714e036096a4c5a'),
  PIPELINE_POLL_INTERVAL_MS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(300000),
  PIPELINE_MAX_CONCURRENCY: z
    .coerce
    .number()
    .int()
    .positive()
    .default(3),

  // Ship Ad API Configuration (for n8n automation)
  SHIP_AD_API_KEY: z
    .string()
    .optional(),
  DEFAULT_PAGE_ID: z
    .string()
    .optional(),
  DEFAULT_INSTAGRAM_ACTOR_ID: z
    .string()
    .optional(),
  DEFAULT_CAMPAIGN_ID: z
    .string()
    .optional(),
  DEFAULT_AD_SET_ID: z
    .string()
    .optional(),
  DEFAULT_SAVED_AUDIENCE_ID: z
    .string()
    .optional()
    .default('120238775760670172'),
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    const parsed = envSchema.parse({
      META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN || process.env.FACEBOOK_MARKETING_API,
      META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID,
      PORT: process.env.PORT,
      HOST: process.env.HOST,
      NODE_ENV: process.env.NODE_ENV,
      FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
      FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
      FACEBOOK_CALLBACK_URL: process.env.FACEBOOK_CALLBACK_URL,
      SESSION_SECRET: process.env.SESSION_SECRET,
      SESSION_TTL: process.env.SESSION_TTL,
      GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME,
      FIRESTORE_CACHE_TTL_HOURS: process.env.FIRESTORE_CACHE_TTL_HOURS,
      GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_MODEL: process.env.GEMINI_MODEL,
      GEMINI_USE_VERTEX_AI: process.env.GEMINI_USE_VERTEX_AI,
      GEMINI_MAX_COST_PER_ANALYSIS: process.env.GEMINI_MAX_COST_PER_ANALYSIS,
      GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_OAUTH_CALLBACK_URL: process.env.GOOGLE_OAUTH_CALLBACK_URL,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      NOTION_API_KEY: process.env.NOTION_API_KEY,
      NOTION_MEDIA_DB_ID: process.env.NOTION_MEDIA_DB_ID,
      PIPELINE_POLL_INTERVAL_MS: process.env.PIPELINE_POLL_INTERVAL_MS,
      PIPELINE_MAX_CONCURRENCY: process.env.PIPELINE_MAX_CONCURRENCY,
      SHIP_AD_API_KEY: process.env.SHIP_AD_API_KEY,
      DEFAULT_PAGE_ID: process.env.DEFAULT_PAGE_ID,
      DEFAULT_INSTAGRAM_ACTOR_ID: process.env.DEFAULT_INSTAGRAM_ACTOR_ID,
      DEFAULT_CAMPAIGN_ID: process.env.DEFAULT_CAMPAIGN_ID,
      DEFAULT_AD_SET_ID: process.env.DEFAULT_AD_SET_ID,
      DEFAULT_SAVED_AUDIENCE_ID: process.env.DEFAULT_SAVED_AUDIENCE_ID,
    });

    // Validation: Require GEMINI_API_KEY if not using Vertex AI
    if (!parsed.GEMINI_USE_VERTEX_AI && !parsed.GEMINI_API_KEY) {
      console.warn('Gemini AI not configured: GEMINI_API_KEY not set and GEMINI_USE_VERTEX_AI is false. Video analysis features will be disabled.');
    }

    // Validation: Require GCP setup if using Vertex AI
    if (parsed.GEMINI_USE_VERTEX_AI && !parsed.GOOGLE_SERVICE_ACCOUNT_JSON) {
      console.warn('Gemini Vertex AI mode enabled but GOOGLE_SERVICE_ACCOUNT_JSON not configured. Video analysis features will be disabled.');
    }

    return parsed;
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
