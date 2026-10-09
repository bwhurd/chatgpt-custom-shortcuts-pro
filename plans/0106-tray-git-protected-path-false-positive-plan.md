# Goal

- [ ] Fix the tray Git push preflight rejecting tracked source and test-fixture paths that only contain sensitive-looking words.

# Findings

- [ ] `Assert-GitPushNoPrivateIndexPaths` checks every tracked path, so false positives block every push in this repository.
- [ ] Broad filename rules classify `netlify/functions/google-token.js` and `tests/fixtures/settings.json` as private even though their paths are source code and test data.

# Implementation

- [ ] Match private configuration by its actual repository locations and credential names by secret-data path or file type.
- [ ] Add an isolated integration case proving a clean push succeeds with both benign tracked paths present; keep existing private-path rejection coverage.

# Validation

- [ ] Run `Test-PowerShellFast.ps1 -Path` on changed PowerShell files with `-Analyze`.
- [ ] Run the tray Git sync integration tests and `npm run check`.

# Done when

- [ ] The reported paths no longer block tray pushes, while actual private paths still stop before commit or push.
