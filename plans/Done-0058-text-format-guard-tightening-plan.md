- [x] Goal
  - Tighten the existing repo-local LF/text-format guard so it remains bounded-output and backed by a local pre-commit hook.

- [x] Scope
  - Normalize `.gitattributes` to the conventional LF rule plus binary overrides.
  - Keep `.editorconfig` aligned with LF, final newline, and trailing-whitespace cleanup.
  - Bound `scripts/check-text-format.js` output so large repos do not print unbounded path lists.
  - Add and run a repo-local pre-commit hook installer only if it does not overwrite an existing hook.

- [x] Validation
  - Run `node --check scripts/check-text-format.js`.
  - Run `npm run check:text`.
  - Run `git diff --check`.
  - Confirm `.git/hooks/pre-commit` exists and delegates to `npm run check:text`.

- [x] Done when
  - Text-format checks stay repo-local, bounded-output, and conventional.
  - No global hooks or global Git behavior are changed.
