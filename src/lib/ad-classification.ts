/**
 * Ad Classification Utility
 *
 * Keyword-based categorization of ads into semantic groups:
 * - symptom: Ads mentioning health symptoms or conditions
 * - comparison: Ads comparing products or alternatives
 * - fsa_hsa: Ads mentioning FSA/HSA eligibility
 * - product_explainer: Ads explaining product features or science
 *
 * Uses case-insensitive substring matching on ad name and primary text.
 * Ads can match multiple categories.
 */

/**
 * Keyword definitions for each ad category
 */
export const AD_CATEGORY_KEYWORDS = {
  symptom: [
    'tired',
    'fatigue',
    'exhausted',
    'low energy',
    'brain fog',
    'foggy',
    'mental clarity',
    'heart health',
    'cardiovascular',
    'joint pain',
    'inflammation',
    'digestive',
    'immune',
    'sleep',
    'stress',
    'anxiety',
  ],
  comparison: [
    'vs',
    'versus',
    'compared to',
    'better than',
    'alternative to',
    'instead of',
    'why choose',
    'difference between',
  ],
  fsa_hsa: [
    'fsa',
    'hsa',
    'fsa eligible',
    'hsa eligible',
    'flexible spending',
    'health savings',
    'tax advantage',
    'pre-tax',
  ],
  product_explainer: [
    'how it works',
    'science behind',
    'ingredients',
    'formula',
    'clinical',
    'research',
    'study',
    'backed by science',
    'proven',
  ],
};

/**
 * Classify ad into one or more categories based on keyword matching
 *
 * Performs case-insensitive substring search on combined ad name and primary text.
 * Returns all matching categories (ads can belong to multiple categories).
 *
 * @param adName - Ad name from Meta API
 * @param primaryText - Primary text from ad creative
 * @returns Array of matching category names (empty if no matches)
 *
 * @example
 * ```typescript
 * classifyAd('Tired? Try Our Supplement', 'Feeling exhausted? Get energy back.')
 * // Returns: ['symptom']
 *
 * classifyAd('FSA Eligible - Heart Health Formula', 'Science-backed support for cardiovascular health')
 * // Returns: ['symptom', 'fsa_hsa', 'product_explainer']
 *
 * classifyAd('Summer Sale', 'Save 20% today')
 * // Returns: []
 * ```
 */
export function classifyAd(adName: string, primaryText: string): string[] {
  const combinedText = `${adName} ${primaryText}`.toLowerCase();
  const categories: string[] = [];

  for (const [category, keywords] of Object.entries(AD_CATEGORY_KEYWORDS)) {
    const matches = keywords.some((keyword) =>
      combinedText.includes(keyword.toLowerCase())
    );
    if (matches) {
      categories.push(category);
    }
  }

  return categories;
}
