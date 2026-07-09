# Anonymous Usage Analytics Spec

## Purpose

- Collect anonymous, low-cardinality usage summaries so feature work can be prioritized by real shortcut and settings usage.
- Keep collection local-first, background-owned, and easy to inspect or remove.
- Never collect chats, prompts, responses, page content, URLs, browsing history, account info, model names, clipboard contents, or actual shortcut key values.

## Current Status

- Usage analytics collection is temporarily disabled for the Chrome Web Store release path as of July 5, 2026.
- The shipped package must not include the Aptabase SDK, usage report page, `analytics.js`, or the `https://cgcsp.chordstash.com` CSP endpoint while the Web Store data practices are set back to no Location or User activity collection.
- `Privacy-Policy.md` should state the current no-analytics posture while this pause is active.

## Wiring

- Current no-analytics release wiring:
  - `extension/background.js` does not import the Aptabase SDK or `extension/analytics.js`.
  - `extension/content.js` keeps analytics helper calls as no-ops so shortcut behavior stays unchanged.
  - `extension/popup.js` does not request analytics flushes on open.
  - `scripts/build-zip.js` excludes `analytics.js`, `usage-report.*`, and `vendor/aptabase-browser/`.
- Historical analytics wiring, for reference if this is reintroduced:
- `extension/background.js` loads the local Aptabase SDK and `extension/analytics.js` with `importScripts`.
- `extension/analytics.js` owns the whitelist, local 7-day buckets, summary generation, Aptabase flush, and local report data.
- `extension/content.js` sends `csp.analytics.recordShortcut` only after an extension shortcut action matches; unmatched keypresses are not recorded.
- `extension/popup.js` sends `csp.analytics.flush` on popup open so a due daily summary can flush without polling.
- `extension/usage-report.html`, `usage-report.css`, and `usage-report.js` are a hidden extension report page. They request `csp.analytics.getReport` on load or refresh and do not poll.

## Storage And Network

- Current no-analytics releases must not write `chrome.storage.local` usage counters or send network requests to `cgcsp.chordstash.com`.
- Historical analytics details, for reference if collection is reintroduced:
- Local counters live only in `chrome.storage.local` under `csp_usage_analytics_v1`.
- Counters are daily buckets retained for 7 days and are not synced to Chrome Sync or Google Drive.
- `ANALYTICS_APP_KEY` in `extension/analytics.js` controls network delivery. The production self-hosted public client key is `A-SH-7581694567`.
- `ANALYTICS_HOST` is the self-host target for `A-SH-*` Aptabase keys and currently points at `https://cgcsp.chordstash.com`.
- When a valid Aptabase key is set, `usage_summary_v1` and `settings_snapshot_v1` flush at most once per 24 hours from ordinary startup, popup open, content startup, or shortcut-use opportunities.
- Failed network attempts are also throttled with `lastFlushAttemptAt` so a DNS outage or unreachable analytics host cannot create per-shortcut retry churn.
- The manifest must not add `host_permissions` or new required Chrome API permissions for analytics. The only analytics manifest allowance is the narrow `connect-src https://cgcsp.chordstash.com` CSP entry unless a future provider/region change is explicit.
- Aptabase event property keys must stay at or below 40 characters. Use compact prefixes for shipped events: `u_` for action used, `ub_` for action usage bucket, `t_` for toggle state, and `s_` for shortcut assignment state.

## Hosting Decision

- Aptabase Cloud is acceptable for a small trial, but 7,000 installed users can exceed a 20,000 event/month free allowance quickly even with daily summaries.
- Production uses self-hosted Aptabase on the existing LibreChat Oracle Always Free VM path.
- The main `chordstash.com` Firebase/static hosting path is not a good fit because Aptabase needs Docker/server/database services.
- The live VM deployment is `/opt/cgcsp-aptabase`, with a deployment bundle mirrored at `C:\Users\bwhurd\tools\librechat-web-deployment\oracle-poc\cgcsp-aptabase`.
- Aptabase binds locally on the VM at `127.0.0.1:8003` and is exposed through Cloudflare Tunnel as `https://cgcsp.chordstash.com`.
- The Aptabase app `ChatGPT Custom Shortcuts Pro` exists on the self-host instance.
- Local ingestion to `/api/v0/events` and public Cloudflare ingestion to `https://cgcsp.chordstash.com/api/v0/events` have both been validated.
- The public hostname route must remain a published application route on the existing `librechat-vm` tunnel, targeting `http://localhost:8003`, with no Cloudflare Access gate on the ingestion endpoint.
- No active Cloudflare API/Wrangler credential was found in the two project folders, and the existing cloudflared run token cannot authenticate to the Cloudflare REST API; the public hostname was added manually in the Cloudflare dashboard.
- The vendored Aptabase browser SDK is local code under `extension/vendor/aptabase-browser/`. Keep its request path simple: self-hosted Aptabase expects `/api/v0/events` payloads as an array, so the bundled SDK serializes one tracked event as `[payload]`.

## Report And Tray

- The local report page shows total shortcut uses, distinct shortcuts used, group usage, used action ids, toggle states, and shortcut assignment states as `blank`, `default`, or `custom`.
- The report never displays actual shortcut key values.
- The aggregate Aptabase dashboard is available at `https://cgcsp.chordstash.com`.
- `ahk-tray-tools/OpenAggregateUsageAnalyticsReport.ps1` queries the self-hosted ClickHouse store through `ssh librechat-vm`, generates `_temp-files/usage-analytics/latest-aggregate-report.html` and `latest-aggregate-report.json`, and opens the HTML report. The report starts with summary cards and uses three tabs: `Overview` for feature/shortcut adoption and bucket-based intensity estimates, `Settings changes` for every tracked item and the percentage changed from default plus toggle detail, shortcut default-vs-changed summary, and shortcut key assignment coverage, and `Data health` for stored event counts. The Aptabase dashboard link stays in the header.
- `ahk-tray-tools/OpenUsageAnalyticsReport.ps1` opens the report for the loaded unpacked extension when it can find that Chrome profile, otherwise it falls back to the store extension id.
- `ahk-tray-tools/DevScrapeValidatorTray.ahk` exposes these through the right-click menu items `Open Usage Report` and `Open Aggregate Usage Report`.

## Validation

- For the current no-analytics release path:
  - Run `node --check extension/background.js extension/content.js extension/popup.js scripts/build-zip.js`.
  - Run `npx biome check extension/background.js extension/content.js extension/popup.js scripts/build-zip.js`.
  - Run `node scripts/build-zip.js`, then inspect the generated zip and confirm it has no `analytics.js`, no `usage-report.*`, no `vendor/aptabase-browser/`, no `A-SH-7581694567`, and no `https://cgcsp.chordstash.com`.
  - Compare Chrome permission warnings for the old `4.5.4.1` manifest and the new manifest; they should remain identical.
  - In the Chrome Web Store privacy practices, remove Location and User activity only when the uploaded package and privacy policy match this no-analytics state. Keep Authentication information if Cloud Sync remains available because it uses Google tokens.
- Historical analytics validation, for reference if collection is reintroduced:
- Run `node --check` on touched extension JavaScript files.
- Run `npx biome check` on touched extension JavaScript and report files.
- Run `C:\Users\bwhurd\tools\scripts\Test-PowerShellSyntax.ps1 -Path ahk-tray-tools\OpenUsageAnalyticsReport.ps1` after editing the report opener.
- Run `C:\Users\bwhurd\tools\scripts\Test-PowerShellSyntax.ps1 -Path ahk-tray-tools\OpenAggregateUsageAnalyticsReport.ps1` and then `.\ahk-tray-tools\OpenAggregateUsageAnalyticsReport.ps1 -NoOpen` after editing the aggregate report helper.
- Build with `node scripts/build-zip.js` and confirm `analytics.js`, `usage-report.*`, and `vendor/aptabase-browser/*` are included.
- In a manually loaded dev Chrome profile, verify `csp.analytics.getReport` shows local counters, verify failed network attempts are daily-throttled if `cgcsp.chordstash.com` is not routable, and verify the manifest still has no analytics `host_permissions`.
