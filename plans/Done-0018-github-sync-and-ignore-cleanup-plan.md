# GitHub Sync And Ignore Cleanup Plan

- [x] Confirm the local repo remains attached to `origin` at `https://github.com/bwhurd/chatgpt-custom-shortcuts-pro.git` and treat the current local layout as the publishable source of truth.
- [x] Tighten `.gitignore` for local-only editor folders, Playwright logs, and scratch artifacts that should not be pushed while preserving the intentional `dist/*.zip` exception.
- [x] Update the public repo overview so GitHub reflects the current layout: `extension/` for the unpacked extension source, `dist/` for packaged releases, and `tests/` for validation helpers.
- [x] Rebuild or recheck the release artifact as needed, then stage the intended repo state, commit the sync pass, and push it to `origin/main`.
