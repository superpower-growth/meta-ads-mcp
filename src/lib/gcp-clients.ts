/**
 * Google Cloud Platform Client Initialization
 *
 * Initializes authenticated GCP clients (Storage and Firestore) using service account credentials.
 * Gracefully degrades when credentials are not provided - server remains functional without GCP features.
 */

import { Storage } from '@google-cloud/storage';
import { Firestore } from '@google-cloud/firestore';
import { env } from '../config/env.js';

// Type for parsed service account credentials
interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

let storage: Storage | null = null;
let firestore: Firestore | null = null;
let isGcpEnabled = false;

/**
 * Initialize GCP clients with service account authentication
 * Called once during server startup
 */
function initializeClients() {
  const serviceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;

  // If no credentials provided, return null clients (graceful degradation)
  if (!serviceAccountJson) {
    console.log('GCP credentials not provided. Server will run without video storage and caching features.');
    return;
  }

  try {
    // Parse service account JSON
    const credentials: ServiceAccountCredentials = JSON.parse(serviceAccountJson);

    // Determine project ID (explicit override or from service account)
    const projectId = env.GCP_PROJECT_ID || credentials.project_id;

    if (!projectId) {
      throw new Error('GCP_PROJECT_ID not found in service account JSON or environment variable');
    }

    // Initialize Storage client
    storage = new Storage({
      projectId,
      credentials,
    });

    // Initialize Firestore client
    firestore = new Firestore({
      projectId,
      credentials,
    });

    isGcpEnabled = true;
    console.log(`GCP clients initialized successfully (project: ${projectId})`);
  } catch (error) {
    // Log error but don't crash server - graceful degradation
    console.error('Failed to initialize GCP clients:', error instanceof Error ? error.message : error);
    console.log('Server will continue without GCP features.');
    storage = null;
    firestore = null;
    isGcpEnabled = false;
  }
}

// Initialize clients on module load
initializeClients();

// Export clients and status flag
export { storage, firestore, isGcpEnabled };
