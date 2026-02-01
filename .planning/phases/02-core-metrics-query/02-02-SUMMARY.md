---
phase: 02-core-metrics-query
plan: 02
subsystem: api
tags: [mcp-tools, meta-insights, campaign-performance]

# Dependency graph
requires:
  - phase: 02-01
    provides: MetricsService class, response parsers for ROAS and video metrics
provides:
  - get-campaign-performance MCP tool for querying campaign metrics via conversational interface
  - Date range preset support (last_7d, last_30d, last_90d, this_month)
  - Campaign filtering by ID
  - Flexible metric selection with pretty-printed JSON output
affects: [02-03, ad-set-tools, video-analytics, comparative-reports]

# Tech tracking
tech-stack:
  added: []
  patterns: [mcp-tool-definition, campaign-insights-query, metric-response-formatting]

key-files:
  created:
    - src/tools/get-campaign-performance.ts
  modified:
    - src/tools/index.ts
    - src/index.ts

key-decisions:
  - "Manual inputSchema definition instead of zodToJsonSchema (follows Phase 1 pattern, zod-to-json-schema not in dependencies)"
  - "Combined Task 1 and 2 implementation (validation and logic in single file naturally integrated)"
  - "Pretty-printed JSON output with null, 2 for Claude readability"

patterns-established:
  - "MCP tool pattern: Zod validation + manual inputSchema + implementation function + tool registry + handler switch case"
  - "Metric parsing: Convert string values to numbers, handle missing ROAS gracefully"
  - "Campaign filtering: Query all campaigns then filter client-side (simpler than SDK filtering)"

issues-created: []

# Metrics
duration: 8min
completed: 2026-02-01
---

# Phase 2 Plan 02: Campaign Performance MCP Tool Summary

**get-campaign-performance MCP tool exposing Meta Insights API for CTR, CPC, ROAS, and spend metrics through conversational interface**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-01T00:56:39Z
- **Completed:** 2026-02-01T01:04:39Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- get-campaign-performance MCP tool with Zod schema validation
- Date range preset support (last_7d, last_30d, last_90d, this_month)
- Optional campaign ID filtering for specific campaign queries
- Flexible metric selection from 7 available metrics
- Pretty-printed JSON responses optimized for Claude consumption
- Integration with MetricsService for insights queries
- ROAS parsing using parseRoas utility from lib/parsers.ts
- Complete error handling with user-friendly messages

## Task Commits

Each task was committed atomically:

1. **Task 1: Create get-campaign-performance tool definition and validation** - `230b796` (feat)
   - Note: Task 2 implementation completed in same commit (natural integration)
2. **Task 3: Register tool in MCP server** - `3252ef0` (feat)

**Plan metadata:** `7875a6b` (docs: complete plan)

## Files Created/Modified

- `src/tools/get-campaign-performance.ts` - MCP tool for querying campaign performance metrics with date range presets, optional campaign filtering, flexible metric selection, and pretty-printed JSON output
- `src/tools/index.ts` - Added getCampaignPerformanceTool to tools registry for MCP discovery
- `src/index.ts` - Added get-campaign-performance handler case in CallToolRequestSchema switch statement

## Decisions Made

**1. Manual inputSchema definition instead of zodToJsonSchema**
- Issue: zod-to-json-schema not in package.json dependencies
- Decision: Define inputSchema manually following get-account.ts pattern
- Rationale: Maintains consistency with Phase 1 patterns, avoids adding new dependency for single use case

**2. Combined Task 1 and 2 implementation**
- Decision: Implemented validation schema and query logic in single file
- Rationale: Zod schema and implementation function naturally belong together, artificial separation would reduce code clarity

**3. Pretty-printed JSON output**
- Decision: Use JSON.stringify(response, null, 2) for output formatting
- Rationale: Claude can parse JSON easily, pretty-printing makes conversational responses more readable in MCP inspector

**4. Client-side campaign filtering**
- Decision: Query all campaigns via level='campaign' then filter by campaignId in code
- Rationale: Meta SDK doesn't provide simple campaign ID filtering in params, client-side filter is straightforward

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed smoothly following established patterns from Phase 1 and Plan 02-01.

## Next Phase Readiness

Ready for 02-03-PLAN.md (Ad Set and Ad Level Queries).

The get-campaign-performance tool provides:
- Conversational access to campaign metrics
- Flexible date range and metric selection
- Clean JSON output for Claude analysis
- Foundation pattern for ad set and ad level tools

Phase 2 completion status: 2/3 plans complete (66%).

Recommendations for Plan 02-03:
- Follow same pattern for ad set and ad level tools
- Consider adding breakdown support for demographics (Phase 3 preview)
- May want unified query tool with level parameter (vs separate tools)

---
*Phase: 02-core-metrics-query*
*Completed: 2026-02-01*
