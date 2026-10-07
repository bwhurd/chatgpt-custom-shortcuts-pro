# Contributing

I use this extension daily and keep fixing it as ChatGPT UI changes break things. Help maintaining it is welcome.

Bug fixes are the most useful, especially small, focused fixes that restore broken shortcuts or UI hooks.

## Workflow

1. Fork the repo
2. Create a clearly named branch
3. Make the smallest change needed
4. Open a pull request with a brief explanation

Code should follow [PROJECT_SPEC.md](PROJECT_SPEC.md) and the relevant subsystem specs, using simple, focused implementations that match existing conventions, work across UI languages, and add no mutation observers, polling, or performance overhead outside user-triggered events.

For a fresh clone, run `npm ci`, then `npm run playwright:install` once to install Chromium. On Linux, use `npm run playwright:install -- --with-deps` when browser system dependencies are needed.

For shortcut or runtime behavior changes, run `npm run test:shortcuts:fast`. During development, select affected cases with `npm run test:shortcuts:fast -- --shortcut-action-id shortcutKeyEdit` or `npm run test:shortcuts:fast -- --type scroll-message`. `npm run shortcuts:catalog` is an optional browser-free listing. The controlled check needs no login, extension reload, manual key assignments, saved URLs, or private reports. Its final warnings identify missing and external coverage; warning-only results succeed with partial coverage. See [the canonical shortcut-check guidance](specs/0006-runtime-scrape-selector-validator-spec.md#canonical-fast-shortcut-check) for proof boundaries and failure handling.

Before submitting, ask Codex to review your pull request with this prompt:

```text
Review this pull request against PROJECT_SPEC.md and the pertinent files in specs/, using AGENTS.md to identify which specs apply.
Use passing Fast validation Actions results for the reviewed revision: npm run check, npm run test:validators, and npm run validate:keys. Do not rerun those checks solely for review if that revision already passed.
If Actions has not run, is unavailable, or the reviewed files changed afterward, run only relevant local checks: npm run check for maintained code/tool changes, npm run test:validators for validator/text-checker implementation or fixture changes, npm run validate:keys for popup controls, settings defaults/schema, locale keys, or settings fixtures. For documentation-only changes, run npm run check:text.
For popup changes, also run npm test; this checks appearance, normal scrolling, and one setting's save/reopen behavior, without claiming full shortcut coverage.
For shortcut/runtime behavior changes, run or reuse npm run test:shortcuts:fast evidence for unchanged relevant inputs, following spec 0006. Use affected-action/type filters during repair; preserve the recorded scope of filtered results. Summarize final warnings and unexercised rows; do not treat missing coverage as a pass or intentionally unselected cases as missing coverage. Do not rerun unchanged keyboard checks solely for review.
Report violations with file and line references, check results, and behavior the checks do not cover, without changing files or updating test baselines.
```

Fast validation runs on relevant pull requests and pushes to main, caches npm downloads, and cancels superseded runs. Documentation-only changes do not trigger it automatically; manual dispatch remains available. It does not install browsers, run popup screenshots or live ChatGPT checks, or build release ZIPs. Run local checks early when useful for feedback; reuse their passing results while the relevant files stay unchanged. Path-filtered Actions checks should not be required for every PR, because documentation-only PRs skip them.

No CLA, no process overhead. I handle releases and direction. If you want to help long term, open an issue or reach out.
