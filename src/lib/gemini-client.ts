/**
 * Gemini AI Client Initialization
 *
 * Initializes Google Generative AI client with support for both API key and Vertex AI authentication.
 * Gracefully degrades when credentials are not provided - server remains functional without Gemini features.
 */

import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { isGcpEnabled } from './gcp-clients.js';

/**
 * Gemini configuration interface
 */
export interface GeminiConfig {
  model: string;
  useVertexAI: boolean;
  apiKey?: string;
  project?: string;
  location?: string;
}

/**
 * Initialize Gemini client with appropriate authentication
 * @returns GoogleGenAI client or null if not configured
 */
function initGeminiClient(): GoogleGenAI | null {
  // Check if Gemini is configured
  if (!env.GEMINI_USE_VERTEX_AI && !env.GEMINI_API_KEY) {
    console.log('Gemini AI not configured. Video analysis features will be disabled.');
    return null;
  }

  // Check Vertex AI prerequisites
  if (env.GEMINI_USE_VERTEX_AI && !isGcpEnabled) {
    console.error('Vertex AI mode enabled but GCP not configured. Check GOOGLE_SERVICE_ACCOUNT_JSON.');
    return null;
  }

  try {
    let client: GoogleGenAI;

    if (env.GEMINI_USE_VERTEX_AI) {
      // Vertex AI mode - use service account authentication
      // Note: For Vertex AI, we would use VertexAI class, but @google/genai SDK
      // uses GoogleGenAI for both. Authentication is handled via environment.
      console.log('Initializing Gemini client with Vertex AI (service account authentication)');

      // For Vertex AI, the SDK uses GOOGLE_APPLICATION_CREDENTIALS environment variable
      // which is set up through the service account JSON
      client = new GoogleGenAI({
        apiKey: '', // Not used for Vertex AI, but required by constructor
      });

      console.log('Gemini client initialized successfully (Vertex AI mode)');
    } else {
      // API Key mode - use direct API key authentication
      console.log('Initializing Gemini client with API key');

      client = new GoogleGenAI({
        apiKey: env.GEMINI_API_KEY!,
      });

      console.log('Gemini client initialized successfully (API key mode)');
    }

    return client;
  } catch (error) {
    console.error('Failed to initialize Gemini client:', error instanceof Error ? error.message : error);
    console.log('Server will continue without Gemini features.');
    return null;
  }
}

// Initialize client on module load
export const geminiClient = initGeminiClient();

/**
 * Check if Gemini is enabled and available
 */
export const isGeminiEnabled = (): boolean => geminiClient !== null;

/**
 * Gemini configuration
 */
export const geminiConfig: GeminiConfig = {
  model: env.GEMINI_MODEL,
  useVertexAI: env.GEMINI_USE_VERTEX_AI,
  apiKey: env.GEMINI_API_KEY,
  project: env.GCP_PROJECT_ID,
  location: 'us-central1', // Default location for Vertex AI
};
