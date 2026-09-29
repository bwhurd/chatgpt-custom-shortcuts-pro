# Audit 0087 — Findings register

## Batch 01 checkpoint

No finding has been finalized or assigned an ID in Batch 01. This means the architecture baseline did not attempt to conclude product health; later batches own the API, security, packaging, runtime and UI proof needed to classify the questions recorded in coverage.md.

This checkpoint describes Batch 01 only: no earlier finding was finalized or assigned an ID. The register was initialized for stable IDs CSP-AUD-001 onward. Batch 02 adds the findings below and records dismissed leads separately; risks without established user impact retain explicit proof limits.

## Batch 02 findings

### CSP-AUD-001 — Cloud Sync has no declared host access for its remote requests

- Priority: P2. Confidence: high for the manifest/API contract; browser failure was not observed.
- Evidence: extension/background.js:10, 55–63 fetches the Netlify token endpoint. extension/storage.js:4–5, 59–127 directly fetches Google Drive list, upload, update, and download endpoints from the popup extension page. extension/manifest.json:22–24 declares storage and optional identity only, with no host_permissions or optional_host_permissions. extension/popup.js:6387–6400 requests identity only. The extension-pages/service-worker fetch API requires host access; connect-src in the extension CSP allows the endpoints but does not grant that access.
- Impact: the advertised sign-in token exchange, refresh, and Drive save/restore paths lack the host permissions required by Chrome. No live auth/network request was used to capture the resulting error.
- Recommended repair: declare narrowly scoped optional host access for the Netlify token endpoint host and www.googleapis.com, then request it from the Cloud Sync user gesture as appropriate. Do not add broader hosts. Manifest changes were not made in this audit.
- Verification boundary: static defect confirmed from the current manifest and reachable call sites; actual user-visible error remains unverified.

### CSP-AUD-002 — The ChatGPT shortcut overlay references popup.css without exposing it to the page

- Priority: P3. Confidence: high that the page-origin stylesheet request is blocked; effect size remains unverified.
- Evidence: extension/content.js:17276–17278 inserts chrome.runtime.getURL('popup.css') as a stylesheet in a shadow root attached to the ChatGPT page; showShortcutOverlay is called from the active shortcut handler near line 17699. The manifest has no web_accessible_resources declaration. scripts/build-zip.js includes popup.css, but package inclusion does not make it web-accessible.
- Impact: Chrome blocks extension assets requested from a web page unless declared web-accessible. The overlay also embeds substantial styling inline, so whether the blocked stylesheet causes a material visual defect must be checked live.
- Recommended repair: first confirm which popup.css assets the active overlay needs; if required, expose only those resources to the ChatGPT match patterns, or remove the page-origin reference when the inline copy is sufficient. No manifest/resource change was made.
- Verification boundary: official Chrome docs establish the access rule; the live request and resulting overlay appearance are assigned to Batch 04.

### CSP-AUD-003 — The local privacy statement lacks the required Limited Use affirmation and under-describes token refresh

- Priority: P2. Confidence: high for the local source; the published page and store listing were not checked.
- Evidence: Privacy-Policy.md:5–10 and 15–20 describes the Google sign-in helper as exchanging a one-time code and says tokens are not stored there; the file has no affirmative Chrome Web Store Limited Use compliance statement. However, extension/auth.js:40–48 sends a stored refresh token to the same Netlify endpoint on interactive refresh, and background.js:55–63 posts the grant there. Chrome Web Store's current policy FAQ says extensions requesting user data must show a Limited Use disclosure on their homepage or privacy policy; the Limited Use page requires an affirmative statement covering Google API data.
- Impact: the repository's policy source does not fully describe a reachable token-refresh transfer and does not contain the specific required Limited Use affirmation. The deployed policy and Chrome Web Store dashboard declarations remain unknown.
- Recommended repair: update the public privacy statement with the refresh-token exchange and its handling, add an affirmative Limited Use statement, and verify that the published page and store data disclosures match. No policy or listing was changed.
- Verification boundary: source-document gap confirmed; external publication and backend retention behavior were not inspected.

### CSP-AUD-004 — Cloud-restored shortcut codes can enter overlay HTML without value validation or attribute escaping

- Priority: P3. Confidence: high for the static data path; exploitability and browser impact were not tested.
- Evidence: extension/storage.js:179–215 returns Drive JSON through pickOptions. extension/popup.js:6546–6570 passes restored profile arrays to ModelLabels.normalizeProfileKeyCodes and writes them to sync storage. That helper in extension/shared/model-picker-labels.js:614–654 deduplicates strings but does not validate KeyboardEvent.code. extension/content.js:17616–17623 copies synced arrays without normalization; 16742–16745 can return an unknown code as display text; 16907–16913 interpolates the value into an input attribute; and 17241 parses generated HTML. Ordinary file import uses normalizeShortcutVal at extension/popup.js:4273–4291, but Cloud restore does not.
- Impact: a malformed value in restored settings can alter generated overlay markup in the ChatGPT page. The current manifest lacks the host access needed for Cloud restore, and appDataFolder is user-scoped, so this is a conditional malformed-backup path rather than a demonstrated remote exploit.
- Recommended repair: validate restored profile codes against the same canonical KeyboardEvent.code allowlist as file import and HTML-escape the final attribute value. Resolve before enabling Cloud restore with additional host access.
- Verification boundary: no crafted settings were written or restored; no payload was executed. Batch 03 owns restore validation, and Batch 04 owns overlay DOM proof.

### Batch 02 leads not promoted to findings

- chrome.action.onClicked is not dispatched when action.default_popup is set, per Chrome's action API. The separate action-window helper is therefore not reached by the toolbar action in this manifest. No user-visible loss was established because the declared popup remains the active toolbar behavior.
- chrome.system.display.getInfo requires system.display, which is not declared, but the call is caught and returns an empty display list. The same alternate action-window path is suppressed by default_popup, so no current user-facing defect was established.
- URL-filtered tabs.query calls remain in fallback paths. Chrome ignores URL filters without tabs permission or host access for the page. The declared ChatGPT content-script match grants page access for ChatGPT; no tabs permission is declared. No live tab query was performed and no defect was promoted.
- CSPUsageAnalytics is referenced only through optional global lookups in background.js. analytics.js, usage-report files, and the Aptabase vendor directory are absent from the build inclusion set or explicitly excluded. The shipped no-analytics claim is supported by source/build rules only; the ZIP was not inspected.

### CSP-AUD-005 — Cloud Save can report success after Drive rejects the retried update

- Classification: confirmed conditional reliability defect. Priority: P2. Confidence: high for the source path; no live Drive response was observed. Owning batch: 03.
- Evidence: extension/storage.js:104–113 maps HTTP 401/403 to an unauthorized marker. At 147–161, saveSyncedSettings retries updateFile, then checks only notFound; a second unauthorized result takes the success return after caching the file ID. extension/popup.js:6473–6478 treats function return as success and displays Saved to cloud. The retry can reuse the same unexpired broker token: extension/auth.js:13–24 stores that token in chrome.storage.session and :35–38 returns it while its local expiry is still in the future. extension/storage.js:47–50 instead passes it to chrome.identity.removeCachedAuthToken. The [Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity) documents that this removes a token from the Identity API token cache; the extension's source obtains its token from its own broker and stores it separately.
- Trigger/reproduction: with a known Drive file ID, cause updateFile to return 401 or 403 on both the first attempt and retry. Static control flow shows saveSyncedSettings returns without throwing; no network request was performed.
- Expected/observed: expected an explicit failed-save result after the retry is unauthorized. The source returns normally, so the popup displays Saved to cloud even though Drive rejected the update.
- User impact: a user can believe a backup was refreshed when the remote copy was not updated.
- Recommended repair: propagate the second unauthorized result as a failure and refresh/invalidate the broker-owned session token through CloudAuth rather than relying on Chrome Identity's independent token cache.
- Verification: static source trace plus Chrome Identity API documentation; no auth, network, or Drive mutation. Fingerprints FP-004, FP-009, FP-015, and FP-016 match the batch 01 snapshot.

### CSP-AUD-006 — Cloud Restore can misreport an authorization failure as no backup

- Classification: confirmed conditional reliability defect. Priority: P3. Confidence: high for the source path; no live Drive response was observed. Owning batch: 03.
- Evidence: extension/storage.js:185–196 retries an unauthorized download for a cached ID, then returns pickOptions(dl?.obj || {}) for every result except notFound. A second unauthorized result has no obj and becomes an empty object. The fallback path at :199–216 can also return an empty object when listing fails after the retry. extension/popup.js:6622–6625 reports an empty object as No backup found.
- Trigger/reproduction: with a cached Drive file ID, cause downloadFile to return 401 or 403 on the initial request and retry. Static control flow returns an empty settings object; no network request was performed.
- Expected/observed: expected an authorization/restore error after the retry is still unauthorized. The popup instead reports No backup found, concealing the access failure. The local settings write is skipped for the empty result.
- User impact: users may conclude their backup is missing and fail to repair permissions or authentication.
- Recommended repair: preserve and surface unauthorized markers after retries; reserve an empty object for a successful list that finds no backup.
- Verification: static source trace only. Fingerprints FP-009, FP-015, and FP-016 match the batch 01 snapshot.

### CSP-AUD-007 — Send Edit's shortcut migration has no exhausted-candidate fallback

- Classification: confirmed configuration-dependent migration defect. Priority: P3. Confidence: high for the static edge case; no migration fixture exercises a saturated assignment set. Owning batch: 03.
- Evidence: extension/options-storage.js:304–344 remaps an old shortcutKeySendEdit value of d by searching only g, h, b, v, m, i, k, l, o, and u. If all ten are already assigned across the recognized shortcut fields and model-picker profiles, replacement is undefined and the migration leaves the old d value unchanged. The later Edit migration at :346–409 changes shortcutKeyEdit only. New defaults are g/m at :22–23. [Google Chrome Help](https://support.google.com/chrome/answer/157179?hl=en-HK) currently lists Alt+D as a desktop shortcut to focus the address bar; see evidence/batch-03-official-docs.md.
- Trigger/reproduction: an existing installation has Send Edit on d and every candidate in the migration's ten-letter list is already assigned to another recognized shortcut/profile. Source control flow leaves d in storage.
- Expected/observed: expected a free replacement or a cleared placeholder, as migration 2.9 does when its broader candidate list is exhausted. The Send Edit value remains d, which Chrome owns on the target platform and the extension cannot reliably receive.
- User impact: highly customized installations can retain a nonfunctional Send Edit shortcut after upgrade.
- Recommended repair: use a sufficiently broad deterministic candidate set and an explicit blank fallback when no free key exists.
- Verification: static migration review. Fingerprint FP-010 matches the batch 01 snapshot.

### CSP-AUD-008 — Cloud Save and Restore can overlap without a shared operation guard

- Classification: potential concurrency risk, not live-reproduced. Priority: P3. Confidence: medium. Owning batch: 03.
- Evidence: extension/popup.js:6455–6487 and :6491–6639 register separate Save and Restore handlers; each calls busy with only its own button. The shared helper at :6672–6719 disables only the supplied button. The handlers use the same status element and extension/storage.js exposes operations that read/write the same Drive file and sync settings. No shared in-flight lock or operation sequence check was found in these handlers.
- Trigger/reproduction: start Save and click Restore, or the reverse, before the first operation settles. Source shows the other button remains enabled; race ordering and visible status have not been observed in a browser.
- Expected/observed: a single ordered cloud operation with status tied to the active operation. Source permits overlapping reads/writes and shared-status updates; the exact user-visible final state remains a hypothesis.
- User impact: if network timings interleave, the saved cloud snapshot and locally restored snapshot can represent different points in time, while status may be overwritten by the other operation.
- Recommended repair: use one shared in-flight guard for both controls or serialize cloud operations and associate status with the active operation.
- Verification: source-only risk review; no browser interaction or Drive call. Fingerprints FP-009 and FP-016 match the batch 01 snapshot.
