# Plan 0089: Restore Edit shortcut defaults

## Goal

- [x] Restore Edit Message to Alt+E and Send Edit to Alt+D as the shipped defaults.
- [x] Leave existing saved shortcut values intact so this default change does not overwrite user customizations.

## Implementation

- [x] Align storage, popup, and runtime defaults; remove migrations that rewrite E/D to other letters.
- [x] Update focused shortcut fixtures so they describe the restored defaults and preserve configured values.
- [x] Correct today's changelog entries and remove the obsolete Chrome-conflict rationale.

## Done when

- [x] Fresh defaults and the popup show Alt+E for Edit Message and Alt+D for Send Edit.
- [x] Stored E/D assignments are no longer remapped by these migrations.
- [x] Today's changelog accurately describes both defaults without duplicating yesterday's entries.
