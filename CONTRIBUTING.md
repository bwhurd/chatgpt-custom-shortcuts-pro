# Contributing

I use this extension daily and keep fixing it as ChatGPT UI changes break things. Help maintaining it is welcome.

Bug fixes are the most useful, especially small, focused fixes that restore broken shortcuts or UI hooks.

## Workflow

1. Fork the repo
2. Create a clearly named branch
3. Make the smallest change needed
4. Open a pull request with a brief explanation

Code should follow [PROJECT_SPEC.md](PROJECT_SPEC.md) and the relevant subsystem specs, using simple, focused implementations that match existing conventions, work across UI languages, and add no mutation observers, polling, or performance overhead outside user-triggered events.

With Node 24 and npm installed, run `npm run checks` for code and fixture regressions. It installs missing or changed locked project dependencies, ensures Chromium is installed, then runs code/text, validator, settings, shortcut report/inventory and controlled keyboard checks. These prepared pages cannot establish whether today's ChatGPT targets work. For explicit setup use `npm ci --no-audit --no-fund` and `npm run playwright:install`; Linux system dependencies are installed with `npm run playwright:install -- --with-deps`.

To check the current authenticated ChatGPT page locally, open standard Chrome's signed-in `CodexCleanProfile` on CDP port 9333 using the tray **Setup Extension Profile** action, then run `npm run checks:live`. This includes the code/fixture checks and a fresh live capture of the configured conversation, with target matching against the newly rendered page. `npm run check:current-page` reruns only that live stage after setup. No earlier capture is substituted. Reports go to ignored `test-results/shortcuts-live/`; authenticated captures remain local.

The default live command checks target presence and reports activations as unverified. Add `-- --probe-shortcuts` to either local command for activation probes; some send prompts in disposable conversations. A complete fresh live pass exits 0, an observed failure exits 1, and partial or unavailable evidence exits 2. The report identifies which targets or activations failed and which remain unverified. It records the checked page, time, CDP endpoint and configured profile; it does not identify the signed-in account or prove another Chrome profile. Use [spec 0006](specs/0006-runtime-scrape-selector-validator-spec.md#current-page-validation) for the evidence contract.

For shortcut or runtime behavior changes, run `npm run test:shortcuts:fast`. During development, select affected cases with `npm run test:shortcuts:fast -- --shortcut-action-id shortcutKeyEdit` or `npm run test:shortcuts:fast -- --type scroll-message`. `npm run shortcuts:catalog` is an optional browser-free listing. The controlled check needs no login, extension reload, manual key assignments, saved URLs, or private reports. Its final warnings identify missing and external coverage; warning-only results succeed with partial coverage. See [the canonical shortcut-check guidance](specs/0006-runtime-scrape-selector-validator-spec.md#canonical-fast-shortcut-check) for proof boundaries and failure handling.

Before submitting, ask Codex to review your pull request with this prompt:

```text
Review this pull request against PROJECT_SPEC.md and the pertinent files in specs/, using AGENTS.md to identify which specs apply.
Use passing Fast validation Actions results for the reviewed revision: code/text, validator regression, settings wiring, shortcut report/inventory/scheduling contracts, and shortcut assertions on prepared fixture pages. Current authenticated ChatGPT targets require separate fresh local evidence. Do not rerun unchanged code/fixture checks solely for review. Inspect the published report and retain its coverage warnings.
If Actions has not run, is unavailable, or the reviewed files changed afterward, run only relevant local checks: npm run check for maintained code/tool changes, npm run test:validators for validator/text-checker implementation or fixture changes, npm run validate:keys for popup controls, settings defaults/schema, locale keys, or settings fixtures. For documentation-only changes, run npm run check:text.
For popup changes, also run npm test; this checks appearance, normal scrolling, and one setting's save/reopen behavior, without claiming full shortcut coverage.
For shortcut/runtime behavior changes, run or reuse npm run test:shortcuts:fast evidence for unchanged relevant inputs, following spec 0006. Use affected-action/type filters during repair; preserve the recorded scope of filtered results. Summarize final warnings and unexercised rows; do not treat missing coverage as a pass or intentionally unselected cases as missing coverage. Do not rerun unchanged keyboard checks solely for review.
Report violations with file and line references, check results, and behavior the checks do not cover, without changing files or updating test baselines.
```

Fast validation runs `npm run checks -- --ci` on relevant pull requests and pushes to main, caches npm downloads, and cancels superseded runs. It installs Chromium and Linux dependencies, then runs code and prepared-page regressions. Its report explicitly marks current ChatGPT validation unverified. Check results and actionable fixture failures appear in the Actions summary; the HTML/JSON report is uploaded even after failure and retained for seven days. Coverage omissions/native boundaries warn; structural and exercised failures fail the job. Documentation-only changes do not trigger it automatically; manual dispatch remains available. Authenticated checks require local Chrome and are rejected in CI; their separate report directory is excluded from uploads. Windows popup screenshots and release ZIPs have separate scopes. Reuse passing results for unchanged inputs. Path-filtered Actions checks should not be required for every PR.

The current visual report is written to ignored `test-results/shortcuts-fast/report.html`, with `report.md`, `report.json` and aggregate `checks.md` alongside it. Failed actions show their recorded chord, target and source owner; warnings retain their actual proof boundary. Use filtered runs for repairs and retain their scope. Catalogue-only listing leaves the last keyboard report intact. Ask Codex to use `$run-checks-for-chatgpt-custom-shortcuts-pro` for the check and a visual findings table in chat.

No CLA, no process overhead. I handle releases and direction. If you want to help long term, open an issue or reach out.
