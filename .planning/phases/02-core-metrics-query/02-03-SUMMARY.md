---
phase: 02-core-metrics-query
plan: 03
subsystem: api
tags: [mcp-tools, meta-insights, adset-performance, ad-performance, performance-metrics]

# Dependency graph
requires:
  - phase: 02-01
    provides: MetricsService class, response parsers for ROAS and video metrics
  - phase: 02-02
    provides: Campaign performance tool pattern, manual inputSchema approach
provides:
  - get-adset-performance MCP tool for querying ad set (targeting/budget group) metrics
  - get-ad-performance MCP tool for querying individual ad creative metrics
  - Complete coverage of all Meta aggregation levels (account, campaign, adset, ad)
affects: [03-video-analytics, comparative-reports, budget-management]

# Tech tracking
tech-stack:
  added: []
  patterns: [adset-insights-query, ad-insights-query, graceful-missing-field-handling]

key-files:
  created:
    - src/tools/get-adset-performance.ts
    - src/tools/get-ad-performance.ts
  modified:
    - src/tools/index.ts
    - src/index.ts

key-decisions:
  - "Followed exact pattern from 02-02 for consistency across all performance tools"
  - "Graceful handling of missing ad_name field (fallback to ad ID) for ad-level queries"
  - "Same metric set across all aggregation levels (impressions, clicks, spend, ctr, cpc, cpm, purchase_roas)"

patterns-established:
  - "Ad set level queries: level='adset' parameter, adsetId filtering, adset_id/adset_name fields"
  - "Ad level queries: level='ad' parameter, adId filtering, ad_id/ad_name fields with fallback"
  - "Consistent tool structure: Zod schema → manual inputSchema → implementation → registry → handler"

issues-created: []

# Metrics
duration: 13min
completed: 2026-02-01
---

# Phase 2 Plan 03: Ad Set and Ad Level Queries Summary

**get-adset-performance and get-ad-performance MCP tools completing Phase 2 with all four Meta aggregation levels queryable through conversational interface**

## Performance

- **Duration:** 13 min
- **Started:** 2026-02-01T01:06:18Z
- **Completed:** 2026-02-01T01:19:18Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- get-adset-performance MCP tool for targeting/budget group metrics
- get-ad-performance MCP tool for individual creative performance
- Complete Phase 2 coverage: All 4 aggregation levels now queryable (account, campaign, adset, ad)
- Consistent tool pattern across all performance queries
- Graceful handling of missing ad_name field at ad level
- All tools registered in MCP server with build verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Create get-adset-performance MCP tool** - `9c29b31` (feat)
2. **Task 2: Create get-ad-performance MCP tool** - `db90a48` (feat)
3. **Task 3: Register both tools in MCP server** - `fd8df19` (feat)

**Plan metadata:** `ebe0a6b` (docs: complete plan)

## Files Created/Modified

- `src/tools/get-adset-performance.ts` - MCP tool for querying ad set performance with date range presets, optional adsetId filtering, flexible metric selection, and pretty-printed JSON output
- `src/tools/get-ad-performance.ts` - MCP tool for querying individual ad creative performance with graceful handling of missing ad_name field (fallback to ad ID)
- `src/tools/index.ts` - Added getAdsetPerformanceTool and getAdPerformanceTool to tools registry (now 4 tools total)
- `src/index.ts` - Added get-adset-performance and get-ad-performance handler cases in CallToolRequestSchema switch statement

## Decisions Made

**1. Followed exact pattern from 02-02**
- Decision: Replicate campaign performance tool structure for ad set and ad level tools
- Rationale: Consistency makes codebase maintainable, reduces cognitive load, establishes predictable patterns

**2. Graceful handling of missing ad_name field**
- Decision: Fallback to `Ad ${insight.ad_id || 'Unknown'}` when ad_name is undefined
- Rationale: Individual ads may not have names in Meta API, fallback ensures readable output for Claude

**3. Same metric set across all aggregation levels**
- Decision: Use identical metric enum for all performance tools
- Rationale: DISCOVERY.md confirms same metrics available at all levels, consistent interface simplifies usage

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed smoothly following established patterns from 02-02.

## Next Phase Readiness

**Phase 2 Complete!** Ready for Phase 3: Video Analytics.

All four aggregation levels (account, campaign, adset, ad) now queryable through MCP. Core metrics foundation enables conversational ad performance analysis at any granularity:
- Account: Overall performance across all campaigns
- Campaign: High-level campaign comparison
- Ad Set: Targeting/budget group analysis
- Ad: Individual creative performance

Next phase will add video-specific metrics with demographic breakdowns, building on this foundation.

## Verification Checklist

- [x] npm run build succeeds with no TypeScript errors
- [x] npm run dev starts server without crashes (env validation expected)
- [x] Tools registry shows 4 tools (get-account, get-campaign-performance, get-adset-performance, get-ad-performance)
- [x] All tools follow consistent pattern and response format

---
*Phase: 02-core-metrics-query*
*Completed: 2026-02-01*
