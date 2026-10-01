# GitHub Published-Data Hygiene Plan

## Goal

- [x] Remove confirmed local machine paths and generated shortcut metadata from the current GitHub tree.

## Findings

- [x] The pushed tree contains a local Windows shortcut, one historical ZIP with a hard-coded profile path, and a retired Tampermonkey scraper folder explicitly marked as historical.
- [x] Tracked instructions, plans, and specs contain absolute checkout and tools-repository paths.
- [x] The full-file scan found no credential-like values; remaining keyword matches are runtime identifiers, library attribution, or test examples.
- [x] The worktree scan found local profile paths in new planning notes and a synthetic API-key-shaped test value; both were sanitized before they are pushed.

## Implementation

- [x] Remove the shortcut, affected ZIP, and retired scraper files from the Git index, preserve local copies, and add exact ignore rules.
- [x] Replace absolute checkout paths with repository-relative references and external machine paths with generic local-root labels.
- [x] Replace profile paths in the unpushed planning notes and construct the synthetic test key at runtime so it cannot be mistaken for a live credential.
- [x] Leave runtime environment lookups and public third-party attribution unchanged.

## Validation

- [x] Rescan the pushed snapshot and worktree changes, including embedded text in release ZIPs and image metadata.
- [x] Confirm only intended files are staged, ignored local copies remain present, and `git diff --check` passes.
- [x] Commit and push only the audit cleanup to `main`.

## Done When

- [x] No confirmed secret or machine-specific local path remains in the current pushed tree.
