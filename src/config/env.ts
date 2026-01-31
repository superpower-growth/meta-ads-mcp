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
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    return envSchema.parse({
      META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
      META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID,
      PORT: process.env.PORT,
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
