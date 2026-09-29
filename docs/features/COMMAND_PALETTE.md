# Command Palette

Searchable list of every shortcut action. Open it, type part of a name, and press Enter to run the action. This works even for actions that have no key assigned.

## Usage

| Key | Action |
| --- | --- |
| `Alt + P` (default) | Open the palette |
| Type | Filter actions by name (case-insensitive substring) |
| `↑` / `↓` | Move the selection |
| `Enter` or click | Run the selected action |
| `Esc` or click outside | Close |

Each row shows the action's current key, if it has one.

The opener is a normal Alt shortcut. You can rebind it in the popup under **Model Picker → Command Palette**, and duplicate-key detection applies like any other shortcut. Setting it to blank disables it.

## Default key change: Temporary Chat

The palette took `Alt + P`, so **Toggle Temporary Chat now defaults to `Alt + I`**.

Existing installs get a one-time move the first time the content script or the popup loads:

1. If Temporary Chat is still on `P` and nothing else uses `I`, Temporary Chat moves to `I`.
2. If `P` is then free, the palette gets `P`. Otherwise the palette starts unassigned.

After that first run, stored values are never touched again. Someone who deliberately chose `Alt + P` for Temporary Chat also gets moved, because that choice can't be told apart from the old default.

## What is listed

- Every entry in `altShortcutActions` (`extension/content.js`) that has a label in `settings-schema.js` `shortcuts.labelI18nByKey`.
- Inert legacy keys (Study, Canvas, Think Longer, Thinking Standard/Extended) have no label, so they are hidden.
- Palette-only rows (no shortcut key): **Go to Previous Chat** / **Go to Next Chat** open the sidebar history entry above/below the current chat (`goToAdjacentChat` in `content.js`). They need the sidebar history rendered, and do nothing at the list ends or when the sidebar is collapsed.
- Not listed: the palette itself, the shortcut overlay (`Alt + .`), model-picker slots, and the Ctrl send/stop keys.

## Implementation

| Piece | Location |
| --- | --- |
| Dialog UI and filtering | `extension/content.js`, `openCommandPalette()` (native `<dialog id="csp-command-palette">`) |
| Hotkey dispatch | `altShortcutActions.shortcutKeyCommandPalette` via the regular Alt handler |
| Running an action | `runAltShortcutAction(key, event)`, the same path as a key press, so usage analytics still records it. Palette-only rows carry their own `run` function instead |
| Previous / Next Chat | `goToAdjacentChat(step)`: collects `nav a[href*="/c/"]` in sidebar order and clicks the entry one step away from the current chat |
| One-time default move | `settings-schema.js` `shortcuts.migrateCommandPaletteDefault(stored)`, called from the `content.js` shortcut load and the `popup.js` first-run seeder |
| Defaults | `content.js` `shortcutDefaults`, `popup.js` preset map, `options-storage.js` `OPTIONS_DEFAULTS`, `analytics.js` |
| Popup row | `popup.html`, below Show Shortcut Overlay |
| Labels | `_locales/*/messages.json`: `label_commandPalette`, `tt_commandPalette_plain`, `palette_placeholder` |
| Validator metadata | `shared/shortcut-action-metadata.js`, `notApplicable` row (extension-owned UI, no ChatGPT DOM target) |

The palette runs the action one animation frame after the dialog closes, so page focus is restored first. Copy, scroll, and composer actions depend on that.

The current chat is matched to its sidebar entry by conversation ID, the path segment after `/c/`, not by the full path. A project chat's URL carries a project slug (`/g/g-p-<id>-code-nukem/c/<chat>`) that its sidebar link lacks (`/g/g-p-<id>/c/<chat>`), so full-path matching never finds it.

"Next" means the older chat below, because the sidebar lists newest first. On a page without a chat ID (new chat), Next opens the top entry and Previous does nothing.

The migration does not live in `options-storage.js` because the vendored `OptionsSync` is a stub that never runs its `migrations` array.

## Known limits

- The search is a plain substring match, with no fuzzy ranking.
- Model-picker slots and the Ctrl send/stop keys cannot be run from the palette.

See also: `specs/0004-model-picker-and-shortcuts-spec.md` → *Command palette*.
