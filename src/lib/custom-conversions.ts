/**
 * Custom Conversion Mapping
 *
 * Maps friendly names to Meta action type IDs for custom conversion events.
 * Simplifies tool usage by allowing users to specify either friendly names
 * or full Meta action type IDs.
 *
 * Custom conversion IDs are account-specific and obtained from Meta Events Manager.
 *
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-events
 */

/**
 * Custom conversion friendly name to Meta action type ID mapping
 *
 * Format: offsite_conversion.custom.{pixel_id}
 */
export const CUSTOM_CONVERSION_MAP: Record<string, string> = {
  subscription_created: 'offsite_conversion.custom.797731396203109',
  registration_started: 'offsite_conversion.custom.1382332960167482',
};

/**
 * Resolve action type identifier
 *
 * Accepts either a friendly name (e.g., "subscription_created") or a full
 * Meta action type ID (e.g., "offsite_conversion.custom.797731396203109").
 *
 * @param friendlyNameOrId - Friendly name or full action type ID
 * @returns Full Meta action type ID
 *
 * @example
 * ```typescript
 * resolveActionType('subscription_created')
 * // Returns: 'offsite_conversion.custom.797731396203109'
 *
 * resolveActionType('offsite_conversion.custom.797731396203109')
 * // Returns: 'offsite_conversion.custom.797731396203109' (passthrough)
 * ```
 */
export function resolveActionType(friendlyNameOrId: string): string {
  return CUSTOM_CONVERSION_MAP[friendlyNameOrId] || friendlyNameOrId;
}
