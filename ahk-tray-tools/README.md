# Developer tray Git push

The `DevScrapeValidatorTray.ahk` tray menu adds **Git push settings...**, **Push local to git**, and **Push with change note...**. Settings and push actions are disabled while a push worker is active. Reload Tray is also disabled during that worker.

## Settings and API key

Open **Git push settings...** to enable or disable AI commit subjects, save a key, or remove it. A blank key field keeps the saved key. Changes take effect only after Save; Cancel discards edits. **Test message generation** sends a synthetic example, not repository changes.

Settings live under `%LOCALAPPDATA%\CGCSP\tray-git-sync`. The key is protected with Windows DPAPI for the current user and repository-specific entropy. The key file is outside the repository. Keep access to the same Windows account and repository path to decrypt it. Do not copy the key into repository files, scripts, logs, or environment variables.

When AI subjects are enabled and a key is available, the helper sends a bounded staged-change summary and representative patch context to the OpenAI Responses API using `gpt-5.6-terra` with high reasoning effort. Requests disable API storage. The optional note adds context but does not override the staged evidence. The response is accepted only as one printable ASCII line of at most 52 characters. If AI generation is disabled, unavailable, or rejected, the helper uses a deterministic file-summary subject when it can do so safely; otherwise it stops before creating a commit.

## Push behavior and safety

**Push local to git** stages non-ignored local changes in the repository, performs text-format repair, captures a fixed staged snapshot, creates and verifies a one-line commit, then pushes that exact commit without force. It targets the configured upstream, or the current branch on `origin` when no upstream is configured. Review `git status` first: this action may include all eligible local changes.

**Push with change note...** asks for optional context before repository changes. Canceling the note prompt ends the operation before staging or committing. A shared process lock prevents duplicate workers. Protected credential/config paths, detached or unmerged states, branch or index drift, failed hooks, and unsafe subjects stop the operation. A rejected push leaves a verified local commit in place for recovery.

The helper records progress and safe outcomes under `_temp-files/tray-git-sync/`:

- `git-sync-status.txt` contains the current or final status.
- `git-sync.log` contains workflow steps, the final subject, source, and bounded counts/categories. It does not contain the API key, request headers, prompt, diff, or raw API response.

If a run fails, read the status and log, then inspect `git status` and the current branch before retrying. If the log says a commit was preserved after a rejected push, repair the remote/authentication issue and push the existing commit; do not force-push. For a busy status, wait for the active tray worker to finish. API/network failures can fall back to a file-summary subject; invalid or protected inputs stop before commit.

The test harness uses only unique temporary repositories, synthetic keys, mocked API responses, and local bare remotes. It refuses the production repository and non-local remotes. Do not test this workflow by pushing scratch commits to GitHub.
