# v1.1 Video Interpretation Validation Checklist

Manual validation checklist for v1.1 Video Interpretation milestone features.

## Prerequisites Validation

### Google Cloud Setup

- [ ] **GCS Bucket Created**
  - Verify: `gsutil ls gs://your-bucket-name`
  - Should return bucket metadata without errors

- [ ] **Firestore Database Created**
  - Verify: Visit https://console.cloud.google.com/firestore
  - Should show Native mode database

- [ ] **Service Account Permissions**
  - Verify service account has roles:
    - Storage Object Creator
    - Storage Object Viewer
    - Cloud Datastore User
    - (Optional) Vertex AI User if using Vertex AI

- [ ] **Environment Variables Set**
  - `GOOGLE_SERVICE_ACCOUNT_JSON` (valid JSON)
  - `GCP_PROJECT_ID`
  - `GCS_BUCKET_NAME`
  - `GEMINI_API_KEY` OR Vertex AI variables

### Gemini AI Configuration

- [ ] **Option 1: API Key**
  - `GEMINI_API_KEY` set
  - Key valid (test at https://aistudio.google.com)

- [ ] **Option 2: Vertex AI**
  - `GEMINI_USE_VERTEX_AI=true`
  - `GEMINI_PROJECT_ID` set
  - `GEMINI_REGION` set
  - Vertex AI API enabled in GCP project

## Feature Validation

### 1. Video Analysis (analyze-video-creative tool)

**Test Case 1.1: Analyze video ad (cache miss)**

Steps:
1. Start MCP server: `npm run dev`
2. Use Claude Code to query: "Analyze the video creative for ad [VIDEO_AD_ID]"
3. Wait for analysis (~5-10 seconds)

Expected results:
- [ ] Response includes videoId
- [ ] Response includes analysis with:
  - [ ] scenes array (multiple scenes)
  - [ ] textOverlays array
  - [ ] emotionalTone (string)
  - [ ] creativeApproach (string)
  - [ ] keyMessages array
- [ ] cacheStatus: 'miss'
- [ ] metadata includes duration, thumbnailUrl, gcsPath
- [ ] Console logs show: "Cache MISS for video [VIDEO_ID]"
- [ ] Console logs show: "Cached analysis for video [VIDEO_ID]"

**Test Case 1.2: Analyze same video ad (cache hit)**

Steps:
1. Immediately re-query same ad: "Analyze the video creative for ad [SAME_AD_ID]"

Expected results:
- [ ] Response returns instantly (<1 second)
- [ ] Same analysis as Test 1.1
- [ ] cacheStatus: 'hit'
- [ ] metadata includes cachedAt timestamp
- [ ] metadata includes hitCount >= 1
- [ ] Console logs show: "Cache HIT for video [VIDEO_ID]"
- [ ] Console logs show savedCost value

**Test Case 1.3: Analyze non-video ad**

Steps:
1. Query: "Analyze the video creative for ad [IMAGE_AD_ID]"

Expected results:
- [ ] Response returns quickly
- [ ] videoId is null
- [ ] analysis is null
- [ ] message: "Ad is not a video ad or video metadata unavailable."
- [ ] No errors in console

### 2. Performance with Video Analysis (get-ad-performance enhancement)

**Test Case 2.1: Performance with video analysis (cache hit)**

Prerequisites: Run Test Case 1.1 first to cache a video

Steps:
1. Query: "Show performance for ad [VIDEO_AD_ID] last 7 days with video analysis"

Expected results:
- [ ] Response includes metrics (impressions, clicks, CTR, etc.)
- [ ] Response includes videoCreative object with:
  - [ ] videoId (string)
  - [ ] analysis (VideoAnalysis object)
  - [ ] cacheStatus: 'hit'
- [ ] No delay (instant response)

**Test Case 2.2: Performance with video analysis (cache miss)**

Steps:
1. Query: "Show performance for ad [UNCACHED_VIDEO_AD_ID] with video analysis"

Expected results:
- [ ] Response includes metrics
- [ ] Response includes videoCreative object with:
  - [ ] videoId (string)
  - [ ] analysis: null
  - [ ] cacheStatus: 'miss'
  - [ ] message: "Video not analyzed yet. Use analyze-video-creative tool to analyze first."
- [ ] No errors (graceful degradation)

**Test Case 2.3: Performance without video analysis (backward compatibility)**

Steps:
1. Query: "Show performance for ad [AD_ID] last 7 days" (no video analysis flag)

Expected results:
- [ ] Response includes only metrics
- [ ] No videoCreative field in response
- [ ] Response format unchanged from v1.0

### 3. Creative Correlation Analysis

**Test Case 3.1: Identify top emotional tones**

Prerequisites: Analyze 3+ video ads with different emotional tones

Steps:
1. Query: "Which emotional tone performs best for my video ads last 30 days?"

Expected results (Claude's response should include):
- [ ] List of emotional tones ranked by CTR
- [ ] Ad count per tone
- [ ] Average metrics per tone (CTR, CPC)
- [ ] Conversational recommendation

**Test Case 3.2: Identify top creative approaches**

Prerequisites: Same as 3.1

Steps:
1. Query: "Which creative approach drives the best performance?"

Expected results:
- [ ] List of creative approaches ranked by performance
- [ ] Ad count per approach
- [ ] Average metrics per approach
- [ ] Insights about top performers

**Test Case 3.3: Find similar high performers**

Prerequisites: Have at least 1 high-performing video ad analyzed

Steps:
1. Query: "Ad [HIGH_PERFORMING_AD_ID] has great CTR. Find similar ads."

Expected results:
- [ ] List of similar ads ranked by similarity + performance
- [ ] Similarity scores shown
- [ ] Common creative elements identified
- [ ] Recommendations for creative optimization

### 4. Caching Behavior

**Test Case 4.1: Cache expiration**

Steps:
1. Set FIRESTORE_CACHE_TTL_HOURS=0.001 (3.6 seconds)
2. Restart server
3. Analyze video ad (cache miss)
4. Wait 5 seconds
5. Re-query same ad

Expected results:
- [ ] First query: cacheStatus 'miss'
- [ ] Second query: cacheStatus 'miss' (cache expired)
- [ ] Console shows: "Cache MISS for video [VIDEO_ID]: reason: not found or expired"

**Test Case 4.2: Cache hit counter**

Steps:
1. Set FIRESTORE_CACHE_TTL_HOURS=24
2. Restart server
3. Analyze video ad (cache miss)
4. Query same ad 3 more times

Expected results:
- [ ] First query: hitCount undefined or 0
- [ ] Second query: hitCount 1
- [ ] Third query: hitCount 2
- [ ] Fourth query: hitCount 3
- [ ] Console logs show incrementing hitCount

### 5. Error Handling

**Test Case 5.1: Gemini not configured**

Steps:
1. Unset GEMINI_API_KEY and GEMINI_USE_VERTEX_AI
2. Restart server
3. Query: "Analyze video for ad [AD_ID]"

Expected results:
- [ ] Response includes message: "Gemini AI not configured..."
- [ ] cacheStatus: 'unavailable'
- [ ] No server crash
- [ ] Graceful error message

**Test Case 5.2: Invalid GCS configuration**

Steps:
1. Set GCS_BUCKET_NAME to non-existent bucket
2. Restart server
3. Query: "Analyze video for ad [AD_ID]"

Expected results:
- [ ] Response includes message about GCS configuration error
- [ ] Console shows helpful error
- [ ] No server crash
- [ ] Suggests configuration fix

**Test Case 5.3: Video URL expired**

Steps:
1. Analyze video ad
2. If receives "Video URL expired" error:

Expected results:
- [ ] Error message includes "expired" keyword
- [ ] Message suggests retry
- [ ] No server crash

## Cost Validation

### Test Case: Cost estimation

Steps:
1. Analyze video ads of various lengths
2. Check console logs for cost estimates

Expected results:
- [ ] 30-second video: ~$0.003 estimate
- [ ] 60-second video: ~$0.006 estimate
- [ ] Cost logged before analysis
- [ ] Saved cost logged on cache hits

### Test Case: Cost guardrail

Steps:
1. Set GEMINI_MAX_COST_PER_VIDEO=0.001 (very low)
2. Attempt to analyze 30-second video

Expected results:
- [ ] Analysis rejected
- [ ] Message: "Analysis cost too high: exceeds maximum cost limit"
- [ ] No Gemini API call made

## Integration Validation

### Test Case: Full workflow end-to-end

Steps:
1. Analyze 5 video ads from same campaign
2. Query performance for last 30 days with video analysis
3. Ask: "Which emotional tone performs best?"
4. Ask: "Find ads similar to [BEST_PERFORMING_AD_ID]"

Expected results:
- [ ] All 5 videos successfully analyzed and cached
- [ ] Performance query includes creative insights for all 5 ads
- [ ] Correlation analysis identifies patterns
- [ ] Similar ad finder returns relevant recommendations
- [ ] Entire workflow completes without errors
- [ ] Claude provides actionable insights conversationally

## Performance Validation

### Test Case: Cache performance

Measure:
- [ ] Cache miss query time: 5-15 seconds (download + analysis)
- [ ] Cache hit query time: <1 second (instant)
- [ ] get-ad-performance with cached analysis: <2 seconds
- [ ] Correlation analysis across 10 ads: <3 seconds

## Sign-Off

- [ ] All prerequisite validations pass
- [ ] All feature validations pass
- [ ] All error handling validations pass
- [ ] Cost controls working correctly
- [ ] Integration workflow completes successfully
- [ ] Performance meets expectations
- [ ] Documentation matches actual behavior

**Validated by:** _______________
**Date:** _______________
**Notes:** _______________
