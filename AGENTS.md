# ChatGPT Custom Shortcuts Pro agent

This file is the root routing and policy doc for Codex work in this repo. Keep it operational. Put durable project overview and broad architecture in `PROJECT_SPEC.md`, deep subsystem detail in `SPECS/`, non-trivial active/deferred work in `PLANS/`, scratch or copied reference artifacts in `_temp-files/`, and keep `CodexPlan.md` as a legacy archive pointer only.

## Scope and context discipline

- Treat this section and `<context_budget>` as first-principle instructions for every pass.
- Use the smallest context needed to complete the task safely.
- Work inside the repo by default. Read outside the repo only when the task explicitly depends on shared workstation docs, external artifacts, or outside-project lookup.
- If the user names specific files or folders, treat that as the full scope unless a direct dependency forces expansion.
- If the task needs new files and the user did not name a location, choose the smallest sensible folder that cleanly owns the work.
- Outside the active scope, read only the minimum routing docs or direct dependencies required. Do not modify outside the active scope unless the user expands it.
- Do not scan the full repo for ordinary tasks. Expand scope only if the task is ambiguous, blocked, clearly cross-cutting, or the user asked for broader work.

<context_budget>
- Treat context as scarce. Use the smallest context that still supports safe, correct execution.
- Before any tool call, decide the minimum set of files/resources needed for the next batch.
- Start with discovery, not broad reads: prefer `rg`, `rg --files`
- Read only implicated content: matches before files; ranges, symbols, and diff hunks before whole files; targeted output before full logs.
- Expand stepwise: scan -> focused read -> exact slice -> act. Expand only when current evidence is insufficient or safety/correctness requires it.
- Keep output bounded: prefer concise summaries, diffs, head/tail, and targeted ranges over full-file or full-log dumps.
- Batch related searches and reads. Parallelize independent calls. Read one-by-one only when the next read depends on the previous result.
- Respect ignore boundaries. Do not use `--no-ignore` or inspect ignored/generated/vendor/dist/build artifacts unless required.
- Do not reread unchanged content unless it changed, became newly relevant, or prior context was compacted away.
- Read enough context before editing, then batch logical edits and targeted checks. Avoid repeated micro-edits and reread/test loops.
- If the task shifts, discard stale assumptions and rescope. When enough context exists to proceed safely, stop searching and act.
</context_budget>

## Start here

- Start from `AGENTS.md` as the routing source.
- Then read only the task-relevant sections of `PROJECT_SPEC.md`, the relevant `SPECS/` file or files, and the relevant active plan file or files under `PLANS/`.
- Open `SPECS/README.md` only when the right spec is unclear or when deciding where new durable detail belongs.
- Treat `CodexPlan.md` as a legacy archive pointer, not as the live backlog or default startup payload.
- Treat `README.md`, `Done-*` plans, `_temp-files/`, audits, and history notes as helpers, not mandatory startup docs.
- Trust current code and file layout over stale docs, then update the doc that owns the truth if reality changed.
- Do not default to repo-wide `git status`, `git diff`, `git log`, exhaustive tree scans, package inventories, or environment sweeps unless the user asked, the task is broad enough that wider context materially changes the answer, or validation of your own edits depends on it.

## Active spec references

- Open `PROJECT_SPEC.md` when the task touches durable project constraints, architecture, stable conventions, or cross-cutting assumptions that should survive across threads.
- Open `SPECS/SPEC_ADDING_NEW_SETTINGS.md` when changing storage-backed settings, popup wiring, import/export, Drive sync, or early bootstrap gates.
- Open `SPECS/SPEC_LAZY_FAST_MODE.md` when touching Fast Mode bootstrap, the page bridge, native expansion behavior, or Fast Mode troubleshooting.
- Open `SPECS/SPEC_CLOUD_SYNC_AND_SETTINGS_DATA_FLOW.md` when changing Google login, Drive save or restore, or local settings export or import.
- Open `SPECS/SPEC_MODEL_PICKER_AND_SHORTCUTS.md` when changing shortcut normalization, duplicate detection, model picker rendering, Ctrl+/ overlay behavior, or model-routing automation.
- Open the relevant active numbered file under `PLANS/` before continuing non-trivial in-progress work. Open `Deferred-*`, `Blocked-*`, or `Done-*` plans only when resuming that workstream or when a current plan or user request points to them.

## Documentation roles

- `AGENTS.md` owns routing, scope, editing discipline, brief tool notes, brief skill notes, repo-default validation posture, and stop-and-ask boundaries.
- `PROJECT_SPEC.md` owns durable project identity, broad architecture shape, and tricky stable conventions that should remain true across tasks.
- `SPECS/` owns deep durable subsystem detail, invariants, migration notes, and repair references.
- `PLANS/` owns non-trivial active work, deferred or blocked work, completed plan archives, and workstream-specific sequencing. It should contain plan markdown, not copied inspector captures or reference scripts.
- `_temp-files/` owns ignored scratch artifacts, copied inspector captures, reference scripts, and temporary support notes. Do not read or search it unless the current user request explicitly names a file or path there.
- `CodexPlan.md` is a compatibility pointer to archived material that used to live at the root. Do not move live work back into it.
- When reality changes, update only the doc that owns that information instead of duplicating it across multiple root docs.

## Project guardrails

- This repo is an MV3 Chrome extension for `chatgpt.com`. The unpacked extension source lives under `extension/`; the repo root is for project docs, tooling, validation, release output, and support services. Ship the smallest correct change that preserves existing shortcut semantics, popup behavior, and extension wiring unless the user explicitly asks for a larger change.
- Keep `chrome.storage.sync` as the single source of truth for settings. New settings must flow through `options-storage.js`, popup wiring, and any relevant content/bootstrap path.
- Treat the popup authoring experience as high priority: respect i18n keys, tooltip balance, shared label behavior, and duplicate-shortcut safeguards.
- Use the existing helpers and shared modules (`ShortcutUtils`, GSAP plugins, `CloudAuth`, `CloudStorage`, `ModelLabels`) instead of reimplementing similar logic.
- If required DOM details are missing, stop and ask the user for the smallest useful inspector slice instead of guessing from localized or unstable selectors.
- If you add new shipped files or folders under `extension/`, update `build-zip.js` `includeItems` so the release zip stays complete.
- If a version bump or zip build is part of the task, include the generated `dist/*.zip` archive in commits and pushes unless the user explicitly says not to.
- Respect existing permissions and host matches. Do not add new extension permissions or broader host access without explicit approval.

## Skills

- Start from this root-doc set, not from a routing skill.
- Use `$write-plan` when non-trivial work needs a new or updated plan file under `PLANS/`.
- Use `$spec-check` when the coarse routing is known but the exact deeper spec or support doc is still unclear.
- Use `$search-everything-outside-project` when a needed file, tool, config, SDK, or log is likely outside this repo root, or when in-repo search already failed.
- Use `$find-robust-web-app-library` when the task is build-vs-buy or choosing a web-app library.
- Use any additional local skill only when it has a narrow trigger and a clearer outcome than direct work from the repo docs.

## Tools

- When a task may benefit from verified shared machine-level tools on this workstation, optionally consult `C:\Users\bwhurd\tools\AGENTS.md` and the relevant section of `C:\Users\bwhurd\tools\PROJECT_SPEC.md`. This repo's docs and direct user instructions win.
- Open the shared tool-wiring spec for tool choice, install or repair routing, command-resolution checks, or outside-project lookup: `C:\Users\bwhurd\tools\install-with-codex\Specs\0002-codex-tool-wiring-spec.md`
- When a task needs broad in-scope text search or replacement across many files, consult `C:\Users\bwhurd\tools\TEXT_SEARCH_REPLACE_SPEC.md` and prefer its preview-first `rg` / `sd` workflow over broad file reads or unpreviewed replacements.
- Use shared tools only when they are the obvious fit: `rg` / `fd` for discovery, previewed `rg` + `sd` for broad plain-text replacement, `sg` for syntax-aware rewrites, `jq` / `yq` for structured data or config work, `uv` for Python tool or venv work, `difft` for noisy structural diffs, and `xh` for deliberate HTTP or API inspection.

## File boundaries

- Read, edit, and consider only the files relevant to the active task and within this repo surface unless the user explicitly expands scope:
- Root docs and planning:
  - `AGENTS.md`
  - `PROJECT_SPEC.md`
  - `CodexPlan.md`
  - `PLANS/*.md`
  - `SPECS/**`
- Core runtime and shared logic:
  - `extension/content.js`
  - `extension/lazy-fast-bootstrap.js`
  - `extension/lazy-fast-bridge.js`
  - `extension/options-storage.js`
  - `extension/settings-schema.js`
  - `extension/storage.js`
  - `extension/auth.js`
  - `extension/shared/model-picker-labels.js`
- Popup and extension shell:
  - `extension/popup.html`
  - `extension/popup.js`
  - `extension/popup.css`
  - `extension/manifest.json`
  - `extension/background.js`
- Config, localization, assets, and release files:
  - `extension/_locales/**/messages.json`
  - `extension/icon16.png`
  - `extension/icon32.png`
  - `extension/icon48.png`
  - `extension/icon128.png`
  - `CHANGELOG.md`
  - `dist/*.zip`
- Tooling and preview helpers:
  - `.gitignore`
  - `package.json`
  - `package-lock.json`
  - `build-zip.js`
  - `tests/fixtures/**`
  - `tests/playwright/**`
  - `tests/validate-keys.js`
- Read-only third-party or archive material:
  - `extension/vendor/webext-options-sync.js`
  - `extension/lib/*.min.js`
  - `tools/*.zip`
- Scratch and copied support artifacts:
  - `_temp-files/README.md`
  - `_temp-files/**` only when the user explicitly references a file or path there
- Ignore everything else unless the user explicitly directs otherwise.
- Explicitly exclude `node_modules`, `netlify`, `css-cleanup`, `_temp-files` contents unless explicitly referenced, and `.git`.

## Planning posture

- Skip formal planning only for trivial work.
- Put non-trivial active work in `PLANS/`, not in root docs.
- Use `PLANS/0001-short-description-plan.md` for active work, `PLANS/Deferred-0001-short-description-plan.md` for deferred work, `PLANS/Blocked-0001-short-description-plan.md` for blocked work, and `PLANS/Done-0001-short-description-plan.md` for completed or archived plans.
- Keep durable subsystem detail in `SPECS/`, not in plan files.
- Keep copied inspector captures, reference scripts, and temporary support files in `_temp-files/`, not in `PLANS/`.
- Treat deferred and done plans as lookup material only. Open them only when a current plan or user request points to them.

## Validation posture

- Validate the changed area with the smallest useful check.
- For popup, overlay, tooltip, layout, animation, or other user-facing UI work, prefer the Playwright extension workflow instead of static file inspection alone.
- After any shipped extension file changes (`extension/content.js`, `extension/popup.*`, `extension/background.js`, `extension/manifest.json`, storage or schema wiring, or other extension-loaded assets), manually reload the unpacked extension from `extension/` in `chrome://extensions` before any Playwright confirmation.
- Use:
  - `npm run playwright:install` once per machine to install Chromium
  - `npm run preview:popup` to inspect the real popup with extension APIs available
  - `npm run screenshot:popup` to capture `test-results/playwright/popup-preview.png`
  - `npm run test:popup-visual` for popup visual regression checks
  - `npm run test:popup-visual:update` only when an intentional UI change should become the new baseline
  - `npm run playwright:chatgpt:*` and `npm run playwright:chatgpt:benchmark` when a task needs live ChatGPT extension validation
- For code changes, prefer the smallest relevant test or script first. `npm test` is the default merge gate for shipped behavior changes.
- For doc-only work, re-read the changed sections and confirm routing, ownership, and scope boundaries still make sense.

## Outcome over suggested path

- Follow explicit user goals and hard constraints.
- Treat stale plans, old status notes, and previous implementation paths as disposable.
- If a simpler or safer path clearly reaches the same goal, take it and say so.
- If a task stalls, a step fails hard, or a better path appears, update the relevant plan and continue on the better path instead of grinding through the old one.
- In a normal implementation pass, keep doc and process maintenance to the minimum needed for continuity. Expand doc work only when docs are the task or stale docs are blocking correct work.

## Stop and ask

- Stop instead of guessing when:
  - a fix requires HTML structure, network behavior, or other ChatGPT page detail that is not available from current repo docs or the current prompt
  - unexpected local changes or a dirty worktree appear and proceeding safely would require deciding whether to preserve, work around, or discard them
  - a fix would require destructive git or file-system actions such as hard reset, checkout or revert of existing changes, force clean, bulk deletion, or overwriting user-authored work
  - a change would materially expand scope or restructure the repo
  - multiple plausible homes or structures would affect future work
  - a task would delete, rename, move, or overwrite significant user data
  - a dependency, runtime, integration, or external service would materially change repo expectations
  - credentials, paid services, external accounts, or machine-specific integrations are involved
  - docs, runbooks, and current repo reality conflict in a way that needs a real project decision

## Response format

- Return a concise summary grouped by file path when useful.
- Include commands run, validation performed, and any notable risks or assumptions.
- Return full file contents only when the user asks.
