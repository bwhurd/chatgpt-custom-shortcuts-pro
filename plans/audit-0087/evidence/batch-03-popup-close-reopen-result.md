# Batch 03 disposable popup lifecycle result

- Command: `node plans/audit-0087/evidence/batch-03-popup-close-reopen.mjs`.
- Environment: Playwright bundled Chromium, headed, fresh persistent profile under the OS temp root; only the unpacked project extension was loaded. No ChatGPT account, auth, Drive, or real settings were used.
- The extension worker opened its actual Chrome action popup with `chrome.action.openPopup()`. Chromium exposed the popup as a `page` CDP target rather than a Playwright `context.pages()` entry, so the harness found and attached to that target through browser-level CDP.
- The popup target reported a zero-sized layout box in this automation context; the harness activated the popup checkbox with `HTMLInputElement.click()` inside that real popup page. The extension's normal change handler wrote the temporary setting to sync storage.
- The harness closed the popup target, reopened it, and confirmed the changed setting was rehydrated. It compared the isolated value before restoration, restored the original sync-storage state (including absence when originally unset), reopened the popup, and verified the original UI and storage values.
- Result: extension loaded, native popup opened, close/reopen succeeded, temporary setting persisted, original setting restored and verified, and the disposable profile was removed. All result flags were `true`.
- This proves the popup's native lifecycle and one local setting persistence path in the isolated profile. It does not exercise Drive/auth or physical mouse input.
