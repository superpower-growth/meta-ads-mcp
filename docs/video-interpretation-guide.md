# Video Interpretation Guide

Complete guide to using AI-powered video creative analysis in Meta Ads MCP Server.

## Overview

The v1.1 Video Interpretation milestone adds AI-powered video analysis capabilities using Gemini AI. Analyze video ad creative content (scenes, text overlays, emotional tone) and correlate insights with performance metrics.

**Key capabilities:**
- Analyze video ad creative content using Gemini AI
- Cache analysis results in Firestore (avoid redundant API calls)
- Optionally include video insights in performance queries
- Correlate creative elements with performance metrics
- Identify top-performing creative patterns

## Prerequisites

### Required Environment Variables

```bash
# Google Cloud configuration
GOOGLE_SERVICE_ACCOUNT_JSON=<service account key JSON>
GCP_PROJECT_ID=<your-gcp-project-id>
GCS_BUCKET_NAME=<your-gcs-bucket-name>

# Gemini AI configuration (choose ONE option)
GEMINI_API_KEY=<your-gemini-api-key>  # Option 1: API key
# OR
GEMINI_USE_VERTEX_AI=true              # Option 2: Vertex AI
GEMINI_PROJECT_ID=<gcp-project-id>
GEMINI_REGION=<region>

# Firestore caching (optional)
FIRESTORE_CACHE_TTL_HOURS=24  # Default: 24 hours

# Cost guardrails
GEMINI_MAX_COST_PER_VIDEO=0.10  # Default: $0.10
```

### Google Cloud Setup

1. **Create GCS bucket** for video storage:
   ```bash
   gsutil mb -c STANDARD -l us-central1 gs://your-bucket-name
   ```

2. **Create Firestore database** (Native mode):
   ```bash
   gcloud firestore databases create --region=us-central1
   ```

3. **Enable APIs:**
   ```bash
   gcloud services enable storage-api.googleapis.com
   gcloud services enable firestore.googleapis.com
   gcloud services enable generativelanguage.googleapis.com  # For Gemini API
   # OR
   gcloud services enable aiplatform.googleapis.com  # For Vertex AI
   ```

4. **Create service account** with permissions:
   - Storage Object Creator (write to GCS)
   - Storage Object Viewer (read from GCS)
   - Cloud Datastore User (Firestore read/write)
   - Vertex AI User (if using Vertex AI)

## Usage Workflows

### Workflow 1: Analyze Single Video Ad

**Use case:** Deep dive into creative elements of a specific video ad.

```
User: "Analyze the video creative for ad 123456789"

Claude: [Calls analyze-video-creative tool]
Result:
- Video ID: 9876543210
- Emotional tone: Aspirational
- Creative approach: Lifestyle showcase
- Scenes: 4 scenes analyzed
- Text overlays: 3 CTAs detected
- Key messages: ["Premium quality", "30-day guarantee"]
```

**Behind the scenes:**
1. Get video metadata from Meta API
2. Check Firestore cache (cache hit = instant response)
3. If cache miss: download video → upload to GCS → analyze with Gemini → cache result
4. Return structured VideoAnalysis response

**Cost:** ~$0.003 per 30-second video (cache miss only, cache hits are free)

### Workflow 2: Performance + Creative Insights

**Use case:** Get performance metrics and creative insights in single query.

```
User: "Show me ad performance for last 30 days with video analysis"

Claude: [Calls get-ad-performance with includeVideoAnalysis=true]
Result:
- Ad 123: CTR 2.5%, emotional tone "urgent", approach "problem-solution"
- Ad 456: CTR 3.2%, emotional tone "aspirational", approach "lifestyle"
- Ad 789: CTR 1.8%, emotional tone "humorous", approach "testimonial"
```

**Behind the scenes:**
1. Query Meta Insights API for performance metrics
2. For each ad, check if video analysis cached
3. Cache hit: include analysis in response
4. Cache miss: return message directing to analyze-video-creative tool
5. Return enriched response with metrics + creative insights

**Key note:** This workflow only returns CACHED analyses (fast). To analyze new videos, use Workflow 1 first.

### Workflow 3: Creative Performance Correlation

**Use case:** Understand which creative elements drive better performance.

```
User: "Which emotional tone performs best for my video ads?"

Claude process:
1. Call get-ad-performance with includeVideoAnalysis=true
2. Build EnrichedAd[] from response (only ads with cached analysis)
3. Call identifyTopCreativePatterns() from creative-correlation.ts
4. Present findings conversationally

Result:
"Based on 15 video ads with analysis:

Top emotional tones by CTR:
1. Aspirational - 3.2% CTR (6 ads, $0.45 CPC)
2. Urgent - 2.8% CTR (5 ads, $0.52 CPC)
3. Educational - 2.1% CTR (4 ads, $0.38 CPC)

Recommendation: Continue using aspirational tone for highest CTR."
```

**Behind the scenes:**
1. Query performance data with cached video analyses
2. Use creative-correlation utilities to aggregate by dimension
3. Generate insights based on statistical correlation
4. Present findings conversationally

**Key note:** This workflow requires ads to be analyzed first (Workflow 1). Minimum 2 ads per pattern for statistical validity.

### Workflow 4: Find Similar High Performers

**Use case:** Given a high-performing ad, find similar ads that also perform well.

```
User: "Ad 123456789 has great CTR. Find similar high-performing ads."

Claude process:
1. Get target ad details with video analysis
2. Call findSimilarHighPerformers() from creative-correlation.ts
3. Return ranked list of similar ads sorted by similarity + performance

Result:
"Found 4 ads similar to ad 123456789 (aspirational + lifestyle approach):

1. Ad 987654321 - 95% similar, 3.5% CTR (same tone + approach)
2. Ad 456789123 - 90% similar, 3.1% CTR (same tone, different approach)
3. Ad 321654987 - 85% similar, 2.9% CTR (different tone, same approach)

Common elements: Aspirational tone, lifestyle visuals, strong guarantees"
```

**Similarity scoring:**
- 40% weight: Creative approach match
- 30% weight: Emotional tone match
- 30% weight: Call to action match

## Caching Strategy

### How Caching Works

**Cache key:** Video ID (not ad ID - same video may be used in multiple ads)
**Cache duration:** 24 hours (configurable via FIRESTORE_CACHE_TTL_HOURS)
**Cache location:** Firestore collection `video_analysis_cache`

### Cache Benefits

- **Cost savings:** Skip $0.003 Gemini API call per cached video
- **Speed:** Cache hits return instantly (no download, no analysis)
- **Bandwidth:** Skip video download from Meta API on cache hits

### Cache Hit vs Miss

**Cache hit (instant response):**
- Video previously analyzed
- Within TTL (default 24 hours)
- Returns analysis + metadata (cachedAt, hitCount)

**Cache miss (full pipeline):**
- Video never analyzed OR cache expired
- Downloads video (5-15 MB typical)
- Uploads to GCS
- Analyzes with Gemini (~5-10 seconds)
- Caches result for future queries
- Returns fresh analysis

### Monitoring Cache Effectiveness

Check logs for cache performance:
```
Cache HIT for video 9876543210: hitCount: 3, age: 120 minutes, savedCost: $0.0030
Cache MISS for video 1234567890: reason: not found or expired
```

## Cost Management

### Per-Video Analysis Cost

- **30-second video:** ~$0.003 (3 cents per 10 videos)
- **60-second video:** ~$0.006
- **90-second video:** ~$0.009

**Cost formula:** duration_seconds × 0.0001

### Cost Guardrails

**Maximum cost per video:** Configurable via GEMINI_MAX_COST_PER_VIDEO (default: $0.10)

Videos exceeding cost limit are rejected:
```
Analysis cost too high: Video duration 150s exceeds maximum cost limit of $0.10
```

### Reducing Costs

1. **Use caching effectively:** Analyze videos once, query cached results many times
2. **Batch analysis:** Analyze all campaign videos upfront, then query cached results
3. **Adjust TTL:** Increase FIRESTORE_CACHE_TTL_HOURS for longer cache validity
4. **Monitor logs:** Check savedCost in cache hit logs to track savings

## Troubleshooting

### "Gemini AI not configured"

**Cause:** GEMINI_API_KEY not set or Vertex AI not configured

**Fix:**
```bash
# Option 1: Use Gemini API key
export GEMINI_API_KEY=your-api-key

# Option 2: Use Vertex AI
export GEMINI_USE_VERTEX_AI=true
export GEMINI_PROJECT_ID=your-project
export GEMINI_REGION=us-central1
```

### "Video URL expired"

**Cause:** Meta video URLs are temporary (typically 24 hours)

**Fix:** Retry the request - Meta API will return fresh URL

### "GCS configuration error"

**Cause:** Service account missing permissions or bucket doesn't exist

**Fix:**
1. Verify bucket exists: `gsutil ls gs://your-bucket-name`
2. Check service account permissions (Storage Object Creator + Viewer)
3. Verify GOOGLE_SERVICE_ACCOUNT_JSON is valid JSON

### "Cache MISS for video not analyzed yet"

**Cause:** Performance query with includeVideoAnalysis=true but video not cached

**Fix:** Use analyze-video-creative tool to analyze video first, then query performance

### "Rate limit reached"

**Cause:** Gemini API rate limit hit (free tier: 15 requests/minute)

**Fix:**
1. Slow down request rate
2. Upgrade to paid Gemini API tier
3. Use Vertex AI (higher rate limits)

## API Reference

### analyze-video-creative Tool

**Parameters:**
- `adId` (string, required): Meta Ad ID to analyze
- `includeMetadata` (boolean, default: true): Include video metadata in response

**Response:**
```typescript
{
  adId: string;
  videoId: string | null;
  analysis: VideoAnalysis | null;
  cacheStatus: 'hit' | 'miss' | 'unavailable';
  metadata?: {
    duration: number;
    thumbnailUrl: string;
    gcsPath: string;
    cachedAt?: Date;
    hitCount?: number;
  };
  message?: string; // For errors or non-video ads
}
```

### get-ad-performance with Video Analysis

**New parameter:**
- `includeVideoAnalysis` (boolean, default: false): Include cached video analysis

**Enhanced response:**
```typescript
{
  dateRange: string;
  ads: Array<{
    id: string;
    name: string;
    metrics: Record<string, number>;
    videoCreative?: {  // NEW
      videoId: string | null;
      analysis: VideoAnalysis | null;
      cacheStatus: 'hit' | 'miss' | 'unavailable';
      message?: string;
    };
  }>;
}
```

## Best Practices

1. **Analyze videos upfront:** Use analyze-video-creative on all campaign videos before running performance queries
2. **Monitor cache hits:** Check logs to ensure caching is working effectively
3. **Batch workflows:** Analyze multiple videos in sequence, then run correlation analysis
4. **Respect rate limits:** Space out requests to avoid hitting Gemini API rate limits
5. **Use appropriate TTL:** Balance cache freshness vs cost savings based on your workflow
6. **Understand cost model:** Know analysis costs before analyzing long videos

## Next Steps

- Explore correlation analysis: "Which creative approach drives best ROAS?"
- Find winning patterns: "What do my top-performing video ads have in common?"
- Optimize creative: "Find ads similar to my best performer"
