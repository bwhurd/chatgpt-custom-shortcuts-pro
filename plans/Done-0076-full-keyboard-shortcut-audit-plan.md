# Plan 0076: Fast keyboard shortcut fixture and target catalogue

## Status

Completed on 2026-10-07. This is an evidence record, not an execution plan. Its earlier design checklists and preparation instructions are superseded by the results below and the later focused-coverage record in [Done-0090](Done-0090-shortcut-deferred-coverage-plan.md).

## Accepted fast-run evidence

- `npm run shortcuts:catalog` exited 0 with 95 rows in 73.76 ms total.
- The final `npm run test:shortcuts:fast` exited 0 in 4.789 seconds. It ran 25/25 executable cases and passed all 31 admitted rows (24 actions and 7 derived contracts). The 95-row report then contained 54 explicit deferrals (19 global actions, 5 fixed contracts, and 30 model slots) and 10 not-applicable rows. Twenty independent pages overlapped; five shared-state or popup cases ran after the parallel phase with the serial barrier true. These are results for the recorded source and fixture revision, not a live all-shortcuts pass.
- `node tests/shortcut-fast-acceptance-fixture.mjs` verified the saved source/case/fixture fingerprints, selected cases, target/dispatch/effect evidence, derived contracts, omission ownership, denominator, concurrency and barrier. The report fixture, module syntax and scoped Biome checks passed. `npm run check` passed across 92 maintained files.
- An initial aggregate run passed 24/25 because the Page takeover observer ran before the real bubble listener. The observer was attached after the listener; focused Page/focus/boundary checks passed 4/4, followed by the passing final aggregate. No shipped handler changed.
- The runner used in-memory settings, isolated pages and blocked network access. It did not change a user profile, settings, clipboard or permissions. The optional CDP attach to the prepared URLs was refused before navigation or key dispatch, so that run established no live ChatGPT behavior.

## Later coverage records

The subsequent [Done-0090 coverage work](Done-0090-shortcut-deferred-coverage-plan.md) resolved the 54 then-deferred catalogue rows through focused individual runs. It records 95 rows as 71 positive target/contract proofs, 12 unavailable/inert proofs and 12 not-applicable rows, across 73 executable cases. The user declined another combined run, so these results are not a single 73-case aggregate execution. Native clipboard permissions and payloads, audio, native upload completion, generation/branch/navigation lineage and current live ChatGPT virtualization remain external boundaries.

[Done-0098](Done-0098-retired-shortcut-cleanup-and-study-restore-plan.md) separately records current-source live Study activation and toggle-off with draft preservation. That action-specific proof does not establish all shortcuts as live-working.

## Earlier historical cautions

- The 2026-09-27 broad global run reported 5 semantic passes and 30 failed or unproven results across 35 executable globals; fixed contracts had 3/12 passes and 8 coverage gaps. Mixed setup/runtime outcomes were not all product defects, and the original exhaustive audit did not complete.
- On 2026-09-29, live sidebar toggles, Search opening/closing and an empty Dictation transition were observed. Empty recording did not prove transcript submission. AutoHotkey-contaminated observations were discarded.
- Clipboard recovery was partial and changed permission state; further clipboard/permission mutation was paused. Historical model pointer timeouts, absent response navigation and unavailable legacy menu states were not proof that those actions were retired.
- Historical captures and inventories do not prove today's browser attachment or loaded extension revision.

## Current command owner

Use `npm run test:shortcuts:fast` for the current controlled shortcut regression check. The command's setup, filters, report semantics and proof limits are owned by [spec 0006](../specs/0006-runtime-scrape-selector-validator-spec.md#canonical-fast-shortcut-check). Its fixture results do not prove current live ChatGPT selectors, browser-native activation, operating-system integrations or account outcomes. `npm run shortcuts:catalog` remains an optional browser-free listing.
