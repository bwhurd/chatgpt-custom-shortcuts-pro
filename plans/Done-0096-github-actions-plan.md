# Fast GitHub Actions validation

- [x] Add one cached Linux job for maintained-code PRs and main pushes: check, validator tests, and real settings wiring; cancel superseded runs.
- [x] Keep docs-only checks, Windows popup regressions, live ChatGPT checks, and release packaging local and scoped.
- [x] Align contributor, agent, and project guidance: reuse passing checks for the same revision; run local checks only for feedback or affected behavior.
- [x] Pass code/text checks, all 27 validator tests, settings wiring, and actionlint. Normalize the pre-existing blank-only DevScrapeNarrow.js module so Biome passes. Hosted execution remains pending until pushed.
