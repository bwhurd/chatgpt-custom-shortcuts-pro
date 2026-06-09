# Privacy-First Usage Analytics Plan

## Goal

- [x] Add anonymous extension usage measurement that helps answer which shortcuts and settings are actually used, without collecting page content, prompts, URLs, selected text, raw key assignments, account data, or ChatGPT model names.
- [x] Keep the implementation simple, reviewable, and background-owned: no remote scripts, no polling loop, no frequent per-action network transfers, and no broad analytics abstraction.
- [x] Use one path only: a locally bundled Aptabase SDK, background-owned aggregation, no in-extension opt-out UI, and disclosure in `Privacy-Policy.md`.
- [x] Prefer zero new required Chrome API permissions and zero `host_permissions`; if a network endpoint cannot work without `host_permissions`, stop at a decision point before adding anything user-visible or reviewer-alarming.

## Completion Outcome

- Completed on 2026-06-09 with self-hosted Aptabase at `https://cgcsp.chordstash.com`, no new required Chrome API permission, and no `host_permissions`.
- Final manual-CDP validation used a normally launched browser with the user-loaded unpacked extension. The local report showed 16 shortcut activations across 7 distinct shortcut actions for the current 7-day bucket, and the analytics store contained no raw shortcut key values.
- Final forced flush sent exactly two events, `usage_summary_v1` and `settings_snapshot_v1`, to `/api/v0/events`; both returned HTTP 200, used array payloads required by self-hosted Aptabase, and had no property keys above Aptabase's 40-character limit.
- ClickHouse confirmed persisted events after the final run: `settings_snapshot_v1` count 1 and `usage_summary_v1` count 3. Aptabase logged `Flushed 2 events in 10ms.`
- The ship artifact from this pass is `dist/4.5.4.2-2.zip`.

## Research Findings

- [ ] The high-signal MV3 forum pattern is consistent: do not load analytics scripts in extension pages or content scripts; send a small message to the background service worker, then post from the background to the analytics endpoint.
  - [Reddit: GA Measurement Protocol for extension event tracking](https://www.reddit.com/r/chrome_extensions/comments/1kmhl7z/i_use_google_analytics_measurement_protocol_to/)
  - [Indie Hackers: GA with Manifest V3](https://www.indiehackers.com/post/how-to-add-google-analytics-with-manifest-v3-468f1750dc)
  - [Stack Overflow: GA in MV3 extension](https://stackoverflow.com/questions/70908984/add-google-analytics-into-a-chrome-extension-using-manifest-v3)
- [ ] Official Chrome docs now show GA4 Measurement Protocol for extension usage tracking, including a service-worker `fetch`, a stored `client_id`, and optional session data.
  - [Chrome Extensions: Use Google Analytics](https://developer.chrome.com/docs/extensions/how-to/integrate/google-analytics-4)
  - [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [ ] GA4 is the best-documented and most familiar option, but it is less privacy-clean for this request because it expects a persistent client id and exposes the Measurement Protocol API secret in extension code.
  - [Stack Overflow: GA4 api_secret in a Chrome extension](https://stackoverflow.com/questions/77255037/is-it-ok-to-store-ga4-api-secret-on-the-frontend)
- [ ] Aptabase is the best initial fit for this request if direct network delivery works without a scary manifest change:
  - Purpose-built browser-extension SDK.
  - Tiny package surface: `npm view @aptabase/browser` returned version `0.1.2`, MIT, unpacked size `36855`, with no listed dependencies.
  - No automatic event capture; event calls are explicit.
  - Privacy posture is closer to the stated requirement: no cookies, no device identifiers, no long-term user identification, and no user-level retention/MAU analytics.
  - Sources: [Aptabase Browser Extension SDK README](https://github.com/aptabase/aptabase-js/blob/main/packages/browser/README.md), [Aptabase browser-extension page](https://aptabase.com/for-browser-extensions)
- [ ] Aptabase's no-long-term-user-id tradeoff is acceptable for this feature if the extension sends one locally throttled daily summary per active install/day. That supports percentage-style adoption metrics while avoiding persistent analytics identifiers.
- [ ] PostHog is powerful and has official browser-extension docs, but it is too heavy and review-sensitive for this use case:
  - `npm view posthog-js` returned version `1.383.3`, unpacked size `38054655`, with several runtime dependencies.
  - PostHog's own docs require MV3-specific static imports and disabling external dependency loading.
  - Forum/GitHub discussions show Chrome Web Store rejection risk around remotely hosted or hard-to-review bundled code.
  - Sources: [PostHog browser-extension docs](https://posthog.com/docs/advanced/browser-extension), [Reddit PostHog rejection thread](https://www.reddit.com/r/chrome_extensions/comments/1nhusf8/chrome_web_store_rejected_my_extension_update_for/), [PostHog issue #1464](https://github.com/PostHog/posthog-js/issues/1464)
- [ ] Chrome's own policy examples distinguish anonymous UI usage stats from personal/sensitive user data, but the extension should still keep privacy policy and Chrome Web Store disclosures accurate because usage information and any persistent identifiers must be disclosed.
  - [Chrome Web Store User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [ ] Chrome's cross-origin request docs say extension service-worker fetches to remote servers require host permissions, while this repo currently has no `host_permissions` and only the required `storage` API permission. Validate the exact endpoint behavior before choosing direct Aptabase, GA4, or a relay.
  - [Chrome cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [ ] Chrome's remote-hosted-code policy is the hard line: fetched data is fine, fetched code is not. Do not add remote script tags, GTM, gtag.js, CDN SDK loading, remote config that executes, or library code that dynamically imports remote code.
  - [Chrome remote hosted code violations](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)

## Decision Posture

- [ ] Chosen provider path: Aptabase Browser SDK as local bundled code, with direct background delivery and no new required Chrome API permission or `host_permissions`.
- [ ] Production hosting posture: prefer self-hosted Aptabase at `https://cgcsp.chordstash.com` for 7,000-user scale unless hosted Aptabase pricing is explicitly accepted.
- [ ] Chosen implementation shape: one small background-owned analytics module plus tiny content/popup message helpers; no custom backend, no broad provider abstraction, no session replay, no autocapture, no feature flags, no user profiles.
- [ ] No fallback measurement path in this pass. If Aptabase direct delivery fails without a true host permission, stop and record the blocker instead of adding GA4, a relay, or a second provider.
- [ ] Rule out for this pass: PostHog, Mixpanel, Segment, Heap, GTM, remote GA script tags, and any analytics library that requires remote code, autocapture, session replay, DOM capture, or a large bundled client.

## Implementation Status

- [x] Bundled the local Aptabase browser SDK and wired background-owned aggregation, shortcut taps, popup opportunistic flush, privacy disclosure, hidden report page, and AHK tray menu entry.
- [x] Deployed self-hosted Aptabase on the existing Oracle VM as a separate Docker Compose app at `/opt/cgcsp-aptabase`, bound to `127.0.0.1:8003`.
- [x] Created the self-hosted Aptabase app `ChatGPT Custom Shortcuts Pro` with public client key `A-SH-7581694567` and configured the extension to use `https://cgcsp.chordstash.com`.
- [x] Validated local ingestion into ClickHouse with a `usage_summary_v1` test event.
- [x] Added `lastFlushAttemptAt` throttling so failed network attempts are daily-throttled and cannot retry on every shortcut while DNS/routing is unavailable.
- [x] Resolved the external publish blocker by adding the Cloudflare published application route for `cgcsp.chordstash.com` to `http://localhost:8003`.
- [x] Validated public Cloudflare ingestion into self-hosted Aptabase with a `usage_summary_v1` test event.
- [x] Patched the bundled SDK serialization for self-hosted Aptabase's array event body and shortened generated property keys to satisfy Aptabase's 40-character limit.
- [x] Validated the real extension flush through CDP and confirmed both final events persisted in ClickHouse.

## Permission And Privacy Requirements

- [ ] Do not add a new required Chrome API permission such as `alarms`, `tabs`, `identity`, `management`, `webRequest`, or `scripting`.
- [ ] Do not add broad host permissions such as `https://*/`, `https://*.google-analytics.com/*`, or `https://*.aptabase.com/*`.
- [ ] If direct analytics needs a manifest endpoint entry, prefer the narrowest possible `content_security_policy.extension_pages connect-src` addition for one exact HTTPS origin.
- [ ] If a true `host_permissions` entry is unavoidable, require an explicit decision before implementation; the only acceptable shape would be one exact HTTPS analytics origin, documented in the plan and privacy policy.
- [ ] Use `chrome.storage.local` for transient local counters and send-throttle state; do not sync usage counters through `chrome.storage.sync` or Google Drive.
- [ ] Do not add an in-extension analytics opt-out or analytics label in the popup. Keep collection transparent in code and disclose it simply in `Privacy-Policy.md`.
- [ ] Never collect:
  - prompt text, responses, conversation titles, URLs, domains beyond the extension's fixed endpoint, selected text, clipboard contents, raw `KeyboardEvent.code` values, custom shortcut key values, model names, email/profile data, Google Drive metadata, or account state.
- [ ] Only collect stable product metadata:
  - extension version, provider debug/release mode, metric schema version, action ids based on internal shortcut storage keys, boolean toggle states, assigned/default/custom/blank shortcut state, and local 7-day aggregate counts.

## Metric Shape

- [ ] Record shortcut usage locally on activation, not by listening globally:
  - `shortcutKeyScrollToTop` used count.
  - `shortcutKeyCopyLowest` used count.
  - Model picker slot action used count by stable slot/action id, not model label.
  - Effort shortcut used count by stable action id, not account-visible model text.
- [ ] Send one daily `usage_summary_v1` event per active install/day when a flush is due:
  - `schema_version`
  - `extension_version`
  - `days_observed_7d`
  - `distinct_shortcuts_used_7d`
  - `total_shortcut_uses_7d_bucket`
  - `used_model_picker_7d`
  - `used_copy_shortcuts_7d`
  - `used_scroll_shortcuts_7d`
  - `used_composer_shortcuts_7d`
  - `used_regenerate_shortcuts_7d`
- [ ] Send a daily `settings_snapshot_v1` event when a flush is due:
  - Boolean toggles as explicit booleans where the dashboard needs on/off percentages.
  - Shortcut assignment state by shortcut id as `blank`, `default`, or `custom`; never send the actual assigned key.
  - Counts such as `shortcut_blank_count`, `shortcut_default_count`, and `shortcut_custom_count`.
- [ ] If the chosen provider has event-property limits, reduce the snapshot into grouped summaries first and defer per-shortcut breakdowns rather than adding many network calls.
- [ ] Keep all event names and property names low-cardinality and versioned; do not derive event names from user data or dynamic ChatGPT labels.

## Likely Owning Files

- [ ] `extension/manifest.json`
  - Background CSP endpoint allowlist if required.
  - No broad host access.
  - Add a shipped analytics file only if the implementation uses one.
- [ ] `extension/background.js`
  - Own the provider initialization, event whitelist, local aggregation, and flush.
  - Reject unknown message types/properties.
- [ ] `extension/content.js`
  - Record shortcut action ids at the existing shortcut handler boundary.
  - Do not add a new global key listener.
- [ ] `extension/popup.js`
  - Trigger opportunistic flush and settings snapshot from popup open paths.
- [ ] `Privacy-Policy.md` and `README.md`
  - Keep public disclosure accurate and plain.
- [ ] `scripts/build-zip.js`
  - Update `includeItems` only if a new shipped file or folder is added under `extension/`.
- [ ] `tests/validate-keys.js` / `tests/lib/settings-wiring-validator.js`
  - Only needed if the new analytics setting exposes a popup-backed control that should participate in static validation.

## Execution Batches

- [ ] Batch 1: endpoint and permission spike.
  - Create an Aptabase test app key outside the repo or use a placeholder until credentials exist.
  - Verify whether a local, bundled Aptabase SDK call from `background.js` can send to `https://us.aptabase.com/api/v0/events` with only a narrow `connect-src` addition.
  - Compare before/after permission warnings with `chrome.management.getPermissionWarningsByManifest()` from an unpacked dev context; `getSelf()` and permission-warning helpers do not require adding the `management` permission.
  - If direct delivery needs true `host_permissions`, stop and record the exact warning before proceeding.
- [ ] Batch 2: provider wiring.
  - Vendor the smallest auditable SDK artifact or source-derived bundle under `extension/` with license notes; do not load from CDN.
  - Initialize the provider only in the background service worker.
  - Disable or avoid all autocapture/session-replay/error-replay features; use explicit `trackEvent` calls only.
  - Keep debug/development data separate from production data.
- [ ] Batch 3: local aggregation.
  - Add a small local store under `chrome.storage.local`, for example `csp_usage_analytics_v1`.
  - Keep daily buckets for the last 7 days.
  - Increment counters only from whitelisted shortcut/action ids.
  - Prune old buckets during ordinary record/flush calls.
  - Flush only opportunistically when the popup opens, content script initializes, or a shortcut is used and the last successful flush is older than 24 hours.
  - Do not use `chrome.alarms`, timers, intervals, polling, or background keepalive tricks.
- [ ] Batch 4: shortcut usage taps.
  - Add a single `recordShortcutUsage(storageKeyOrActionId)` helper near the existing shortcut dispatch path.
  - Call it only after a shortcut matches and before/after the existing handler runs; do not record unmatched keypresses.
  - For model picker actions, record stable slot/action ids from existing model-picker metadata, not rendered model labels.
  - Confirm failed/no-op handlers do not flood counters; either count only attempted activations or define a separate local-only failure metric and do not send it in v1.
- [ ] Batch 5: settings snapshot.
  - Derive toggle keys from the same popup/default/schema surfaces used by the validator where practical.
  - For shortcut settings, derive `blank/default/custom` by comparing stored values with `OPTIONS_DEFAULTS`/schema defaults and NBSP/empty semantics.
  - Do not send actual assigned keys.
  - Decide whether to include legacy/deprecated keys; default to excluding deprecated user-invisible shortcuts unless they still affect behavior.
- [ ] Batch 6: user-facing transparency.
  - Add or update privacy-policy/store-listing language before shipping collection.
  - Do not add popup text or an in-app opt-out; keep disclosure in privacy/store copy and code.

## Reporting Follow-Up

- [ ] Provide a meaningful way to view usage after events are flowing:
  - Prefer an Aptabase dashboard or report view that answers the original questions: shortcut action frequency, distinct shortcuts used over the last 7 days, toggle on/off percentages, and blank/default/custom shortcut assignment percentages including model-picker slots.
  - If Aptabase dashboards are not enough, add a small generated report from exported Aptabase data, but keep it outside the shipped extension and avoid adding a custom collection backend.
  - Keep the report source and URL/path documented in this plan so future releases can find the latest report without searching.
- [ ] Add a right-click tray menu item to the existing AHK tray workflow that opens the latest usage report:
  - Likely file: `ahk-tray-tools/DevScrapeValidatorTray.ahk` unless a newer CGCSP tray owner supersedes it.
  - Menu label: `Open Usage Report` or similarly plain.
  - Target the canonical Aptabase dashboard/report URL or generated local HTML/Markdown report path chosen above.
  - Before running a materially edited PowerShell helper from that workflow, validate with `C:\Users\bwhurd\tools\scripts\Test-PowerShellSyntax.ps1 -Path <script.ps1>` when applicable.

## Validation

- [ ] Run `node --check extension/background.js`.
- [ ] Run `node --check extension/content.js` if content shortcut taps are added.
- [ ] Run `node --check extension/popup.js` if popup snapshot or settings UI changes.
- [ ] Skip `npm run validate:keys` unless popup-backed settings are added or changed.
- [ ] Run `node scripts/build-zip.js` and inspect the packed extension for unexpected analytics/vendor files.
- [ ] Search the packed source for `http://` and `https://` and confirm every analytics URL is data-only, documented, and not executable remote code.
- [ ] Load the unpacked extension and confirm Chrome does not show new alarming permission warnings.
- [ ] In extension service-worker DevTools, confirm:
  - no network request fires for every shortcut activation;
  - a due flush sends only the expected summary event(s);
  - no prompt, response, page content, URL, raw shortcut key, account, or model-name data appears in request payloads.
- [ ] In the provider dashboard, verify the v1 events answer:
  - percentage of active install-days with each major shortcut group used;
  - distribution of distinct shortcuts used over the last 7 days;
  - percentage of active install-days with each tracked toggle on/off;
  - percentage of active install-days where each modifiable shortcut is blank/default/custom.

## Done When

- [x] The final provider choice is recorded with a specific permission decision: no `host_permissions`, exact host permission explicitly accepted, or no ship.
- [x] Analytics collection is transparent in code and privacy/store text, hidden from extension UI, and easy to remove.
- [x] The extension sends at most a small daily summary per active install/day, plus no per-keypress or polling traffic.
- [x] No content, URL, account, prompt, response, clipboard, raw shortcut key, or model-name data leaves the browser.
- [x] Validation proves the shipped zip contains only local analytics code and documented HTTPS data endpoints.
- [x] The reporting follow-up has a concrete report URL/path and a tray menu route to open it.

## Open Questions

- [x] Add the Cloudflare public hostname for `cgcsp.chordstash.com` on the existing `librechat-vm` tunnel, targeting `http://localhost:8003`, with no Cloudflare Access gate on the ingestion endpoint.
- [x] Verify public ingestion reaches the self-hosted Aptabase dashboard at `https://cgcsp.chordstash.com`.
- [x] Chrome did not require a true `host_permissions` entry for the Aptabase endpoint in the validated unpacked extension path.

## Related Specs

- [ ] `specs/0001-adding-new-settings-spec.md`
- [ ] `specs/0004-model-picker-and-shortcuts-spec.md`
- [ ] `specs/0005-popup-settings-validator-spec.md`
