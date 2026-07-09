# Temporary No-Analytics Old-CSP Release Plan

## Goal

- [x] Make the next Chrome Web Store package usage-analytics-free with the analytics CSP endpoint removed, versioned as `4.6.0.1`, so the upload has the pre-analytics data-practice posture while preserving normal shortcut behavior.

## Investigation findings

- [x] `extension/manifest.json` still has required `"permissions": ["storage"]`, optional `"identity"`, no `host_permissions`, and the same `content_scripts.matches` host as before analytics.
- [x] The analytics-era manifest permission-like diff from `4.5.4.1` to the analytics build was the `connect-src https://cgcsp.chordstash.com` CSP addition; `content-gated-ui-features.js` was also added to the existing ChatGPT content script list without changing match patterns.
- [x] The analytics build imported `vendor/aptabase-browser/index.global.js` and `analytics.js` from `extension/background.js`, then delegated analytics messages through `globalThis.CSPUsageAnalytics`.
- [x] `extension/content.js` and `extension/popup.js` sent analytics messages opportunistically; those call sites are now no-ops/removals.
- [x] `scripts/build-zip.js` previously packaged `vendor`, `analytics.js`, and `usage-report.*` unconditionally; the temporary release now excludes `analytics.js`, `usage-report.*`, and `vendor/aptabase-browser/`.
- [x] The Aptabase store only contains analytics data from June 9, 2026 onward, so it cannot prove a June 5 or earlier active-user baseline.
- [x] The current public Web Store page shows 946 users for version `4.5.4.18`, but the aggregate analytics report is daily event/report data, not a direct Chrome Web Store active-user count.
- [x] Chrome's own `chrome.management.getPermissionWarningsByManifest` reports the same warning for `4.5.4.1` and the current manifest: `Read and change your data on all chatgpt.com sites`.
- [x] The user-visible Web Store data-practice changes are real: analytics introduced Location and User activity handling even though the Chrome manifest warning did not change.

## Scope

- [x] Make the default source build no-analytics until the user explicitly chooses to reintroduce collection.
- [x] Do not add Chrome permissions, `host_permissions`, new content script match patterns, or broader CSP entries.
- [x] Do not remove Google login/Drive sync behavior or the existing optional `identity` permission.
- [x] Keep the no-analytics release to source/package removals plus the smallest runtime no-op needed to avoid noisy missing-handler behavior.

## Likely owning files

- [x] `scripts/build-zip.js`
- [x] `extension/background.js`
- [x] `extension/content.js`
- [x] `extension/popup.js`
- [x] `extension/manifest.json`
- [x] `specs/0007-anonymous-usage-analytics-spec.md`
- [x] `Privacy-Policy.md` and Chrome Web Store data-practice notes if the no-analytics release is actually uploaded.

## Implementation plan

- [x] Remove `https://cgcsp.chordstash.com` from `content_security_policy.extension_pages`.
- [x] Remove analytics startup from `extension/background.js`.
- [x] Convert content and popup analytics sends to no-ops/removals so no shortcut usage messages are emitted.
- [x] Exclude `analytics.js`, `usage-report.*`, and `vendor/aptabase-browser/` from `scripts/build-zip.js`.
- [x] Update `Privacy-Policy.md` back to no analytics, no tracking, and no default data leaving the device.
- [x] Update `specs/0007-anonymous-usage-analytics-spec.md` with the temporary no-analytics release path.
- [x] Increase `extension/manifest.json` to version `4.6.0.1`.
- [x] Add a short release checklist note for the Chrome Web Store dashboard:
  - Update data-practice disclosures before upload if the no-analytics build is intended to stop all user-activity/location analytics collection.
  - Confirm the public listing text no longer says anonymous usage stats are collected for the temporary release.

## Validation

- [x] Run the no-analytics build and inspect the zip contents:
  - `manifest.json` has no `https://cgcsp.chordstash.com`.
  - No Aptabase app key or analytics host appears anywhere in the zip.
  - `analytics.js`, `vendor/aptabase-browser/`, and `usage-report.*` are absent.
  - Required permissions remain exactly `["storage"]`; optional permissions remain exactly `["identity"]`; no `host_permissions` exists.
- [x] Run `node --check` on touched JavaScript files.
- [x] Run `npx biome check` on touched JavaScript files.
- [x] Build with `node scripts/build-zip.js`; output is `dist/4.6.0.1.zip`.
- [x] Test the generated unpacked no-analytics source directory in Chrome:
  - Extension service worker starts.
  - Popup opens without page or console errors.
  - Opening the popup does not send network requests to `cgcsp.chordstash.com`.
  - `chrome.storage.local` does not contain `csp_usage_analytics_v1`, `usage_summary_v1`, or `settings_snapshot_v1` after popup open.
- [x] Use Chrome's permission-warning test path to compare the old `4.5.4.1` manifest and the `4.6.0.1` manifest before upload; both report only `Read and change your data on all chatgpt.com sites`.

## Done when

- [x] The repo can produce the temporary no-analytics release zip intentionally.
- [x] The no-analytics zip has the pre-analytics CSP endpoint posture and no usage collection code path capable of storing or sending analytics.
- [x] The validation output gives a clear yes/no answer on whether the flagged package would present any new Chrome permission warning compared with the old manifest.
- [x] Upload-facing notes clearly distinguish manifest permissions from Chrome Web Store data-practice disclosures.

## Open questions

- [ ] If the 7,000-user baseline came from a Chrome Web Store or Chrome-Stats export, capture that CSV/screenshot separately; the Aptabase store cannot reconstruct a pre-June-9 baseline.
- [ ] Before upload, remove public marketing/listing references to anonymous usage stats in the Chrome Web Store description and hosted changelog if present.

## Related specs

- [x] `specs/0007-anonymous-usage-analytics-spec.md`
