# Spec: Lazy Fast Mode

## Removed Experiment

Lazy Fast Mode was an experimental lazy-loading / Fast Mode prototype for long ChatGPT conversations.

It shipped inert behind kill switches, then was removed from the codebase. There is no current:

- `lazyFastModeEnabled` setting
- popup toggle
- `document_start` bootstrap script
- page-world bridge script
- content-world Fast Mode controller
- manifest or release-zip packaging entry

Historical implementation notes remain only in archived plans such as `plans/Done-0015-codexplan-archive-2026-04-16.md`.

Do not reintroduce this feature or use the removed files as a template without a new explicit plan and current ChatGPT runtime investigation.
