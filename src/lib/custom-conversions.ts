/**
 * Custom Conversion Mapping
 *
 * Dynamically fetches custom conversions from the Meta API and caches them.
 * Falls back to a hardcoded map for known conversions.
 *
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-events
 */

import { AdAccount, FacebookAdsApi } from 'facebook-nodejs-business-sdk';
import { env } from '../config/env.js';

/**
 * Hardcoded fallback map for known custom conversions.
 * Used when dynamic fetch hasn't run or as a fallback.
 */
const FALLBACK_MAP: Record<string, string> = {
  subscription_created: 'offsite_conversion.custom.797731396203109',
  registration_started: 'offsite_conversion.custom.1382332960167482',
};

/** Cached dynamic map: friendly name → action type ID */
let dynamicMap: Record<string, string> | null = null;

/** Reverse map: action type ID → friendly name */
let reverseMap: Record<string, string> | null = null;

/** Full metadata cache for the list-custom-conversions tool */
let cachedConversions: CustomConversionInfo[] | null = null;

/** Timestamp of last fetch */
let lastFetchTime = 0;

/** Cache TTL: 1 hour */
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface CustomConversionInfo {
  id: string;
  name: string;
  actionType: string;
  customEventType?: string;
  description?: string;
  lastFiredTime?: string;
}

/**
 * Fetch custom conversions from Meta API and build the mapping.
 * Results are cached in memory for 1 hour.
 */
export async function fetchCustomConversions(): Promise<CustomConversionInfo[]> {
  const now = Date.now();
  if (cachedConversions && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedConversions;
  }

  if (!env.META_AD_ACCOUNT_ID) {
    throw new Error('META_AD_ACCOUNT_ID is required to fetch custom conversions');
  }

  // Ensure API is initialized
  FacebookAdsApi.init(env.META_ACCESS_TOKEN);

  const account = new AdAccount(env.META_AD_ACCOUNT_ID);
  const fields = ['id', 'name', 'custom_event_type', 'description', 'last_fired_time'];

  const cursor = await account.getCustomConversions(fields, { limit: 200 });

  const conversions: CustomConversionInfo[] = [];
  const newDynamicMap: Record<string, string> = {};
  const newReverseMap: Record<string, string> = {};

  for (const cc of cursor) {
    const id = cc.id;
    const name = cc.name || `custom_conversion_${id}`;
    const actionType = `offsite_conversion.custom.${id}`;
    const friendlyName = toFriendlyName(name);

    const info: CustomConversionInfo = {
      id,
      name,
      actionType,
      customEventType: cc.custom_event_type,
      description: cc.description,
      lastFiredTime: cc.last_fired_time,
    };

    conversions.push(info);
    newDynamicMap[friendlyName] = actionType;
    newReverseMap[actionType] = friendlyName;
  }

  dynamicMap = newDynamicMap;
  reverseMap = newReverseMap;
  cachedConversions = conversions;
  lastFetchTime = now;

  return conversions;
}

/**
 * Convert a display name to a friendly snake_case name.
 * e.g. "Subscription Created" → "subscription_created"
 */
function toFriendlyName(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Resolve action type identifier.
 *
 * Checks dynamic map first, then fallback map, then passes through raw IDs.
 */
export function resolveActionType(friendlyNameOrId: string): string {
  // Check dynamic map first
  if (dynamicMap && dynamicMap[friendlyNameOrId]) {
    return dynamicMap[friendlyNameOrId];
  }
  // Fall back to hardcoded map
  if (FALLBACK_MAP[friendlyNameOrId]) {
    return FALLBACK_MAP[friendlyNameOrId];
  }
  // Pass through raw action type IDs
  return friendlyNameOrId;
}

/**
 * Resolve a friendly name from an action type ID (reverse lookup).
 */
export function resolveActionName(actionTypeId: string): string | undefined {
  if (reverseMap) {
    return reverseMap[actionTypeId];
  }
  // Check fallback reverse
  for (const [name, id] of Object.entries(FALLBACK_MAP)) {
    if (id === actionTypeId) return name;
  }
  return undefined;
}

/**
 * Get all available custom conversion friendly names.
 * Triggers a fetch if cache is empty/expired.
 */
export async function getAvailableConversionNames(): Promise<string[]> {
  await fetchCustomConversions();
  return dynamicMap ? Object.keys(dynamicMap) : Object.keys(FALLBACK_MAP);
}
