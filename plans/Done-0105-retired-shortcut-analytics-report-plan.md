# Retired Shortcut Analytics Report Cleanup

## Goal

- Keep retired Previous Thread and Next Thread shortcuts out of the historical analytics and settings report.

## Implementation

- Remove both retired IDs from analytics defaults and the navigation group.
- Extend the existing registered response-shortcut cleanup regression with stale sync values, usage counters, and retired-only days.
- Preserve the settings-schema cleanup references for existing stored assignments.
- Derive observed days from current shortcut counters; stale retired-only buckets and aggregate-only counters do not add observed days.
- Fix the regression clock and cover mixed current/retired usage, retired-only days, and aggregate-only days.

## Validation

- Run the existing response-shortcut regression.
- Run Biome on the changed JavaScript and regression.

## Done when

- The report omits both retired shortcut rows and excludes their counters from navigation totals, total/distinct usage, and observed days.
- Focused validation and Biome pass.
