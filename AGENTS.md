# ChatGPT Custom Shortcuts Pro agent

- `AGENTS.md` routes work in this repo: startup reads, scope and edit boundaries, doc routing, key tool and skill triggers, and default validation.

Use:
- `PROJECT_SPEC.md` for repo-wide facts and shared rules: project identity, repo layout, architecture, shared wiring, validation, and subsystem ownership.
- `specs/*.md` for subsystem rules after routing: behavior, contracts, data flow, integrations, migrations, UI rules, and troubleshooting.
- `plans/*.md` for non-trivial workstream execution and status. Active plans have no prefix. `Done-`, `Deferred-`, and `Blocked-` in the filename define status.
- `_temp-files/` for ignored scratch files and copied reference material, not default startup reading.

## Scope and context discipline

- Apply this section and `<context_budget>` before discovery, reads, edits, or validation.
- If the user names specific files or folders, treat that as the active scope unless a direct dependency forces expansion.
- If the task needs a new file use `plans/`, `specs/`, and `_temp-files/` or the nearest folder that directly owns the change.
- Outside the active scope, read only the minimum routing docs or direct dependencies required. Do not modify outside the active scope unless the user expands it.
- Do not scan the full repo for ordinary tasks. Expand only when the task is ambiguous, blocked, or clearly cross-cutting.
- For validator, audit, or wiring-verification tasks, you may read the smallest authoritative cross-file surface needed to prove the contract end to end. Prefer source-of-truth files over exploratory reads, and stop once you have covered the files that define, render, persist, or consume the contract under test.

<context_budget>
- Treat context as scarce. Use the smallest context that still supports safe, correct execution.
- Before any tool call, decide the minimum set of files or resources needed for the next batch.
- Start with discovery, not broad reads: prefer `rg` and `rg --files`.
- Read only implicated content: matches before files; ranges, symbols, and diff hunks before whole files; targeted output before full logs.
- Expand stepwise: scan -> focused read -> exact slice -> act. Expand only when current evidence is insufficient or safety or correctness requires it.
- Keep output bounded: prefer concise summaries, diffs, head/tail, and targeted ranges over full-file or full-log dumps.
- Batch related searches and reads. Parallelize independent calls. Read one-by-one only when the next read depends on the previous result.
- Respect ignore boundaries. Do not use `--no-ignore` or inspect ignored, generated, vendor, dist, or build artifacts unless required.
- Do not reread unchanged content unless it changed, became newly relevant, or prior context was compacted away.
- Read enough context before editing, then batch logical edits and targeted checks. Avoid repeated micro-edits and reread/test loops.
- If the task shifts, discard stale assumptions and rescope. When enough context exists to proceed safely, stop searching and act.
</context_budget>

## Start here

- Read `AGENTS.md` first.
- Open `PROJECT_SPEC.md` only for project overview, cross-cutting rules, or area-specific validation/tooling.
- If the task matches an `active spec trigger` below, open only the mapped `specs/` file.
- Skip planning for simple, focused tasks.
- For changes across multiple files, create a $write-plan and implement it in one pass.
- When done, rename the plan file to Done-.
- If code and docs conflict, follow current code and file layout, then update `PROJECT_SPEC.md`, the relevant `specs/` file, or the owning `plans/` file.
- If an update requires multiple troubleshooting steps, add just enough detail to the existing or new spec for a smooth one-pass update next time.
- Only do repo-wide `git` commands, tree scans, package inventories, or environment sweeps if absolutely necessary.

## Active spec triggers

- Open `PROJECT_SPEC.md` for repo-wide behavior, shared conventions, or cross-system validation/tooling rules.
- Open `specs/0001-adding-new-settings-spec.md` for changes to storage-backed settings, popup controls, import/export, Drive sync, early bootstrap gates, or popup UI details (i18n keys, tooltips, shared labels).
- Open `specs/0002-lazy-fast-mode-spec.md` for Fast Mode bootstrap, page bridge, native expansion, or Fast Mode troubleshooting changes.
- Open `specs/0003-cloud-sync-and-settings-data-flow-spec.md` for Google login, Drive save/restore, or local settings import/export changes.
- Open `specs/0004-model-picker-and-shortcuts-spec.md` for shortcut normalization, deduplication, model picker rendering, Ctrl+/ overlay, shortcut safeguards, model routing, or direct DOM replacement of ChatGPT shortcuts (sidebar, new chat, search, composer focus).
- Open `specs/0005-popup-settings-validator-spec.md` for changes to `tests/validate-keys.js`, `tests/lib/settings-wiring-validator.js`, popup/settings wiring contract validation, or supplemental validator inventory rules.
- Open `specs/0006-runtime-scrape-selector-validator-spec.md` for dev-only inspector dump collection, popup `DevScrapeWide` / `Check-Scrape` controls, runtime selector presence audits, or the dev report page.
- If the right spec is unclear after routing, use `$spec-check`.
- If multiple triggers match, open each relevant spec.
- For non-trivial work, open the active plan; open `Deferred-`, `Blocked-`, or `Done-` plans only if named by the user or referenced by an active plan.

## Skills

- Use `$write-plan` when non-trivial work needs a new plan or changes to an active plan. Update the existing active plan if it covers the work; create a new one only if none does.
- Use `$spec-check` only after root routing identifies a deep-doc area but not the exact file, and opening multiple docs by default would waste context.
- Use `$search-everything-outside-project` when the needed file, tool, config, SDK, or log is likely outside this repo, or targeted in-repo search did not find it.
- Use `$find-robust-web-app-library` only for build-vs-buy or web-app library selection.
- Use another local skill only if it matches the task more specifically than the repo docs.

## Project guardrails

- Repo is an MV3 Chrome extension for `chatgpt.com`. Shipped source: `extension/`. If you add a shipped file or folder under `extension/`, update `scripts/build-zip.js` `includeItems`.
- Reuse existing helpers before adding new ones: `ShortcutUtils`, GSAP plugins, `CloudAuth`, `CloudStorage`, `ModelLabels`.
- Do not guess DOM targets from localized text or unstable selectors. If needed, ask for the smallest inspector slice.
- For DevScrape manual extension repair, launch standard Chrome/CDP with `CodexCleanProfile` and `chrome://extensions`; do not use `--load-extension` or `--disable-extensions-except` on that manual setup path.
- Do not do destructive git/filesystem actions, broad overwrites, or `extension/manifest.json` permission or host-access changes without explicit approval.

## Tools

- Open `C:\Users\bwhurd\tools\AGENTS.md` and the relevant section of `C:\Users\bwhurd\tools\PROJECT_SPEC.md` only when the task depends on machine-level tool behavior, command availability, or environment setup. This repo's docs and direct user instructions win.
- Open `C:\Users\bwhurd\tools\install-with-codex\Specs\0002-codex-tool-wiring-spec.md` when the task depends on tool choice, install or repair routing, command resolution, or outside-project lookup.
- If the task needs the same in-scope plain-text search or replacement across many files, open `C:\Users\bwhurd\tools\TEXT_SEARCH_REPLACE_SPEC.md` and use its preview-first workflow.
- Use `rg` or `fd` for discovery, previewed `rg` plus `sd` for broad plain-text replacement, `sg` for syntax-aware rewrites, `jq` or `yq` for structured data, `uv` for Python tooling, `difft` for noisy diffs, and `xh` for deliberate HTTP or API inspection.

## File boundaries

- Default surface: `AGENTS.md`, `PROJECT_SPEC.md`, `plans/*.md`, `specs/*.md`, `extension/**`, `scripts/build-zip.js`, `tests/**`, `package.json`, `package-lock.json`, `.gitignore`, `biome.json`, and `CHANGELOG.md`.
- High-yield surface: `extension/content.js`, `extension/lazy-fast-bootstrap.js`, `extension/lazy-fast-bridge.js`, `extension/options-storage.js`, `extension/settings-schema.js`, `extension/storage.js`, `extension/auth.js`, `extension/shared/model-picker-labels.js`, `extension/popup.html`, `extension/popup.js`, `extension/popup.css`, `extension/manifest.json`, `extension/background.js`, `tests/playwright/**`, `tests/fixtures/**`, `tests/validate-keys.js`, and `scripts/build-zip.js`.
- Do not read or edit `extension/vendor/**`, `extension/lib/*.min.js`, `dist/*.zip`, `tools/*.zip`, `node_modules/**`, `netlify/**`, or `.git/**` unless the task explicitly targets them.
- Do not read or search `_temp-files/` unless the user names a file or path there.
- If unsure whether a file is generated, archived, secret, or user-owned, ask before editing it.

## Validate narrowly

- For doc-only changes, reread the edited sections and verify routing targets, ownership, and stated scope.
- Run `biome check` on changed files, fix only clear behavior-safe issues, suppress style-only items, and write a plan for any risky or complex issues.

## Response format

- Return a concise summary with files changed, commands run, validation performed, and notable assumptions or risks.
- Return full file contents only when the user asks.
