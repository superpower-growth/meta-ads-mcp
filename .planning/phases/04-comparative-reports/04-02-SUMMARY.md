---
phase: 04-comparative-reports
plan: 02
subsystem: comparative-analytics
tags: [entity-comparison, ranking, competitive-analysis, percentiles, stats, mcp-tool]

# Dependency graph
requires:
  - phase: 02-core-metrics-query
    provides: MetricsService, parseRoas, response parsers
  - phase: 04-comparative-reports
    plan: 01
    provides: comparison utilities
affects: [05-anomaly-detection]

# Tech tracking
tech-stack:
  added: []
  patterns: [ranking-algorithm, percentile-calculation, statistical-analysis, multi-metric-comparison]

key-files:
  created:
    - src/lib/ranking.ts
    - src/tools/compare-entities.ts
  modified:
    - src/tools/index.ts
    - src/index.ts

key-decisions:
  - "Tie handling: Same metric value = same rank number"
  - "Percentile calculation: 0-100 scale for relative positioning"
  - "Top/bottom performers: 3 entities per metric for multi-metric analysis"
  - "Statistical metrics: min, max, mean, median, stdDev for benchmarking"
  - "Lower-is-better metrics: CPC, CPM automatically ranked in ascending order"
  - "Video metrics optional: includeVideoMetrics flag adds completion rates"
  - "Entity filtering: Optional entityIds array for targeted comparisons"

patterns-established:
  - "Ranking utility separates algorithm logic from API integration"
  - "Percentile provides quick relative positioning without full ranking"
  - "Multi-metric comparison shows different top performers per metric"
  - "Statistical benchmarks contextualize individual entity performance"
  - "Automatic direction detection for lower-is-better metrics"

issues-created: []

# Metrics
duration: 11min
completed: 2026-02-01T02:41:22Z
epoch: 1769913682
started: 2026-02-01T02:30:22Z
start_epoch: 1769913022
---

# Phase 4 Plan 02: Entity Comparison and Ranking Summary

**Cross-entity competitive analysis with multi-metric ranking, percentiles, statistical benchmarks, and automatic top/bottom performer identification**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-01T02:30:22Z (epoch 1769913022)
- **Completed:** 2026-02-01T02:41:22Z (epoch 1769913682)
- **Tasks:** 3
- **Files created:** 2
- **Files modified:** 2

## Accomplishments

- Created ranking.ts utility module with 5 core functions (rankByMetric, calculatePercentiles, identifyBestPerformers, identifyWorstPerformers, calculateMetricStats)
- Implemented tie handling for entities with identical metric values
- Built percentile calculation for relative positioning (0-100 scale)
- Established top 3/bottom 3 identification per metric for multi-metric analysis
- Created comprehensive statistical analysis (min, max, mean, median, standard deviation)
- Implemented compare-entities MCP tool with flexible entity selection
- Support for campaign/adset/ad level comparisons with optional filtering
- Automatic ranking direction detection (lower-is-better for CPC/CPM)
- Optional video metrics inclusion with completion rate calculations
- Registered comparison tool in MCP server (9 tools total now operational)
- **Phase 4 complete**: Full comparative reporting suite delivered

## Task Commits

Each task was committed atomically:

1. **Task 1: Create entity ranking utility** - `9313790` (feat)
2. **Task 2: Create compare-entities MCP tool** - `d94c9bf` (feat)
3. **Task 3: Register comparison tool and complete Phase 4** - `82cdf2d` (feat)

**Plan metadata:** `[next commit]` (docs: complete plan)

## Files Created/Modified

- `src/lib/ranking.ts` - Ranking utility module with sorting algorithm (tie handling), percentile calculation (0-100 positioning), best/worst performer identification (top 3/bottom 3), and statistical analysis (min/max/mean/median/stdDev). Comprehensive TypeScript interfaces and JSDoc examples.
- `src/tools/compare-entities.ts` - MCP tool for entity comparison with Zod schema validation, MetricsService integration, ranking utility integration, percentile mapping, statistical benchmark calculation, and formatted JSON response with rankings, percentiles, stats, and top/bottom performers.
- `src/tools/index.ts` - Added compareEntitiesTool import and registration (9 tools total)
- `src/index.ts` - Added compare-entities case handler in CallToolRequestSchema

## Decisions Made

**1. Tie handling in ranking**
- Decision: Entities with identical metric values receive the same rank number
- Rationale: Honest representation of performance; avoids arbitrary ordering when values are equal

**2. Percentile calculation method**
- Decision: 0-100 scale where percentile = (position / (total - 1)) * 100
- Rationale: Industry-standard approach; 0th percentile = lowest, 100th percentile = highest

**3. Top/bottom performer count**
- Decision: Show top 3 and bottom 3 for each metric
- Rationale: Balances insight (enough to see patterns) with conciseness (not overwhelming)

**4. Statistical metrics selection**
- Decision: Calculate min, max, mean, median, and standard deviation
- Rationale: Standard statistical toolkit; provides benchmarks for interpreting individual performance

**5. Lower-is-better metric handling**
- Decision: Automatically detect and rank cost metrics (CPC, CPM) in ascending order
- Rationale: User-friendly; lower CPC is better, so rank 1 should be lowest CPC

**6. Video metrics inclusion pattern**
- Decision: Optional includeVideoMetrics flag adds completion rates
- Rationale: Reuses established pattern from time period comparison; keeps response concise by default

**7. Entity filtering approach**
- Decision: Optional entityIds array for targeted comparisons
- Rationale: Flexibility to compare all entities or focus on specific subset; supports both discovery and deep-dive analysis

## Issues Encountered

None - implementation proceeded exactly as planned.

## Deviations from Plan

None - implemented exactly as specified in 04-02-PLAN.md.

## Next Phase Readiness

**Phase 4 COMPLETE!** Ready for Phase 5: Anomaly Detection.

Comparative reporting suite fully delivered:
- Time period comparison (04-01): Week-over-week and custom period analysis with delta calculation
- Entity comparison (04-02): Cross-campaign/adset/ad competitive analysis with ranking

Established foundation for Phase 5:
- Comparison utilities provide delta calculation and classification
- Ranking utilities provide percentile and statistical analysis
- Both tools demonstrate pattern for multi-metric analysis
- Statistical methods (mean, median, stdDev) ready for anomaly detection thresholds

Phase 5 will build on these utilities to automatically detect performance anomalies, surfacing significant deviations from baselines and trends without manual querying.

## Phase 4 Completion Notes

**Total deliverables:**
- 2 MCP tools: compare-time-periods, compare-entities
- 2 utility modules: comparison.ts, ranking.ts
- 9 total MCP tools operational
- ROADMAP.md goal "Generate week-over-week and campaign comparison reports" fully achieved

**Key capabilities enabled:**
- Week-over-week performance tracking
- Custom period comparisons
- Multi-entity competitive analysis
- Performance ranking and percentile positioning
- Statistical benchmarking
- Top/bottom performer identification
- Multi-metric comparison (different winners per metric)

## Verification Checklist

- [x] npm run build succeeds with no TypeScript errors
- [x] Ranking utility sorts correctly
- [x] Percentile calculations accurate
- [x] Top/bottom performers identified correctly
- [x] Stats calculations (mean, median, stdDev) mathematically correct
- [x] Tie handling works as expected
- [x] 9 MCP tools total registered and discoverable
- [x] Phase 4 goals fully achieved

---
*Phase: 04-comparative-reports*
*Plan: 02 of 02*
*Phase Status: COMPLETE*
*Completed: 2026-02-01T02:41:22Z*
