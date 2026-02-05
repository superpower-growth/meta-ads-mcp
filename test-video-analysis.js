/**
 * Test script for video creative analysis
 */

import { analyzeVideoCreative } from './build/tools/analyze-video-creative.js';

const adId = process.argv[2] || '120238211712390172';

console.log(`Testing video analysis for ad ID: ${adId}`);
console.log('This may take 20-40 seconds...\n');

try {
  const result = await analyzeVideoCreative({ adId });
  console.log(result);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
