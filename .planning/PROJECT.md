# Meta Ads MCP Server

## What This Is

A remote MCP server that enables small teams (2-5 people) to analyze Meta video ad performance, generate insights, and manage budgets through Claude Code. Provides conversational access to Meta Marketing API with role-based permissions and audit trails.

## Core Value

Deep video ad analysis and reporting — understanding which creative performs best, for whom, and why.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Query Meta ad performance metrics (CTR, CPC, ROAS, video completion rates)
- [ ] Analyze video ad performance including demographics and video length
- [ ] Generate comparative reports (week over week, campaign vs campaign)
- [ ] Detect and surface performance anomalies
- [ ] Adjust campaign and ad set budgets programmatically
- [ ] Team authentication with role-based access (read-only vs budget adjustment)
- [ ] Audit trail for all budget modifications
- [ ] Fast query performance for ad-hoc analysis

### Out of Scope

- Campaign/ad creation — v1 is analysis + budget management, not creative production
- Advanced automation (scheduled rules, auto-optimization) — manual Claude-driven actions only
- Multi-account support — single Meta ad account for v1
- Custom dashboards or UI — everything through Claude Code conversational interface

## Context

Small team managing video ad campaigns on Meta (Facebook/Instagram). Daily usage pattern with need for quick insights and budget adjustments. Team members have different permission levels - some can only view, others can modify budgets.

Video ads are the primary focus, with emphasis on understanding creative performance across different audience segments.

## Constraints

- **API**: Must use official Meta Marketing API — no scraping or unofficial methods
- **Security**: Team authentication and comprehensive audit trail required for compliance
- **Performance**: Report queries must return quickly to support conversational workflow in Claude Code
- **Architecture**: Need to determine optimal deployment model (centralized remote server vs distributed local servers)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Video ad analysis as primary focus | Core business need is understanding creative performance | — Pending |
| Single account, role-based access | Team shares one Meta ad account but needs permission controls | — Pending |
| Remote MCP architecture (TBD) | Team collaboration requires shared access, but architecture needs design | — Pending |

---
*Last updated: 2026-01-31 after initialization*
