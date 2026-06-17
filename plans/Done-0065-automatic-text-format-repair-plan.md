- [x] Goal
  - Add an automatic, local pre-commit repair path for line-ending and trailing-whitespace text-format issues so ordinary commits and tray syncs do not fail when a staged text file only needs safe normalization.

- [x] Scope
  - Keep `npm run check:text` as the strict whole-repo check.
  - Add a safer staged-file repair script for the local Git hook.
  - Replace the ignored PowerShell-only hook installer path with a tracked Node installer that calls the repair script.
  - Do not commit, push, or change Git remotes.

- [x] Implementation plan
  - Add a Node script that normalizes staged tracked text files and re-stages only those files.
  - Refuse automatic repair for partially staged files that also have unstaged edits, so unrelated work is not accidentally staged.
  - Wire the script into `package.json` and a tracked `scripts/install-text-format-hook.js` installer.
  - Reinstall the managed hook locally after installer validation.

- [x] Validation
  - Run `node --check` on the new script.
  - Run `node --check` and Biome on the new hook installer.
  - Run `npm run repair:text:staged`.
  - Run `npm run check:text`.
  - Confirm `.git/hooks/pre-commit` delegates to the repair script.
