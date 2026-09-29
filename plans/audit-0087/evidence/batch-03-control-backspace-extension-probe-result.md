# Batch 03 current-checkout Ctrl+Backspace runtime probe

- Command: `node plans/audit-0087/evidence/batch-03-control-backspace-extension-probe.mjs`.
- Environment: Playwright bundled Chromium, headed, fresh persistent profile under the OS temp root; unpacked project extension loaded; unauthenticated `chatgpt.com` page. No message was sent and no live generation was stopped.
- The real extension used its fresh-profile defaults. The probe inserted a visible synthetic button with the currently supported `data-testid="stop-button"` marker and a focused textarea, then pressed `Control+Backspace` through Playwright's browser keyboard API. It then changed only the disposable profile's stop gate to `false` and repeated the keypress.
- Enabled case: the actual injected content script clicked the synthetic Stop control exactly once; the keydown reached the ChatGPT-origin page with `ctrlKey: true`; the textarea value remained `native word deletion sentinel`.
- Disabled case: no second Stop click occurred, and native Ctrl+Backspace changed the textarea to `native word deletion `.
- The page-world `defaultPrevented` property stayed false for both events, so the result relies on the observed click and draft-edit behavior, not that cross-world flag.
- Result: command passed; the disposable profile was closed and removed.
- Limitation: this validates extension loading, fresh-default settings, routing, and the existing selector against a synthetic target on the permitted host. It does not verify that the live ChatGPT Stop button during generation has either currently supported test ID. That actual target remains unverified pending its live markup.
