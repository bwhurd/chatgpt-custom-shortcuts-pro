# Tray Git Sync Command Plan

## Goal

- [x] Add a DevScrape tray command that stages non-ignored local changes, commits them, pushes the current branch, and reports progress through tray toasts.

## Scope

- [x] Touch only the tray assets under `ahk-tray-tools/` plus this plan.
- [x] Keep Git logic in a PowerShell helper and keep the AutoHotkey tray script limited to dispatch, polling, and status display.
- [x] Store helper logs/status under ignored scratch space so a successful sync can leave the Git worktree clean.
- [x] Do not run the helper during validation, because it would commit and push current local work.

## Likely owning files

- [x] `ahk-tray-tools/DevScrapeValidatorTray.ahk`
- [x] `ahk-tray-tools/PushLocalToGit.ps1`

## Implementation plan

- [x] Add `PushLocalToGit.ps1` beside the tray script using normal Git commands, project-root anchoring, and explicit clean-tree verification.
- [x] Add a `Push local to git` tray menu item that launches the helper hidden, disables itself while running, polls the status file, and shows bottom-right progress toasts.
- [x] Reuse the tray skill's `STEP|OK|ERROR` status-file convention and AHK v1 toast helper.

## Validation

- [x] Run the local PowerShell syntax helper on the new or edited PowerShell script if available.
- [x] Run a focused static check of the AHK syntax and verify referenced helper paths are coherent.
- [x] Review the diff and avoid executing the Git sync helper unless explicitly requested.

## Done when

- [x] The tray menu exposes `Push local to git`.
- [x] The helper uses `git add -A -- .`, commits only when staged changes exist, pushes the current branch/upstream, and fails if the final worktree is not clean.
- [x] Progress and final status are visible through tray toasts.
