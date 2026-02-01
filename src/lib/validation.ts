/**
 * Validation Helpers
 *
 * Utilities for validating MCP tool inputs using Zod schemas.
 * Provides consistent error formatting across all tools.
 */

import { z } from 'zod';

/**
 * Create a validated tool schema with proper error formatting
 *
 * @param schema - Zod schema for tool input validation
 * @returns Function that validates input and returns parsed result or throws formatted error
 */
export function createToolSchema<T extends z.ZodTypeAny>(schema: T) {
  return (input: unknown): z.infer<T> => {
    try {
      return schema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.issues
          .map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        throw new Error(`Validation failed: ${formattedErrors}`);
      }
      throw error;
    }
  };
}
