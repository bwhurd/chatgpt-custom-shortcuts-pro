# Copy Lowest (Alt + C)

Copies the lowest visible Copy target on screen. Pressing it again quickly walks upward through the other visible Copy buttons.

## Usage

| Key | Action |
| --- | --- |
| `Alt + C` (default) | Copy the lowest visible Copy target |
| `Alt + C` again within 1.5 s | Move one Copy button up (wraps back to the lowest after the top) |

Example: a reply with a code block and the message action row both on screen.

1. First press: copies the whole **message** (its Copy button is lowest).
2. Quick second press: copies the **code block**.
3. Pause, press again: the whole message again.

## Candidates

Only Copy controls fully inside the viewport count, sorted top to bottom, then left to right:

- Message Copy: `button[data-testid="copy-turn-action-button"]`, or the Copy icon inside `.turn-action-controls`.
- Code-block Copy: `button[data-testid="copy-code-button"]` inside a code block, or the native Copy icon inside `[data-markdown-copy="code-block"]`.

No type gets priority. Position alone decides.

## What gets copied

| Target | Behavior |
| --- | --- |
| Message Copy | Extension's formatted message copy (`copyMessageFromButton`), with the native click as fallback |
| Code-block Copy | Native click only, with no clipboard read or rewrite |

## Stable cycling during copy feedback

After a copy, both ChatGPT and the extension swap the icon to a checkmark for about 2 s. The candidate lookup matches icons, so the button that was just used would drop out of the list, and the next press would jump to a different button.

To prevent that, the last target (`window.__copyLowestState.el`) is always added back as a candidate while it is still in the page.

## Implementation

| Piece | Location |
| --- | --- |
| Candidate list | `extension/content.js`, `getVisibleCopyButtonsSorted()` |
| Target pick, cycling, click | `extension/content.js`, `copyFromLowestButton()` |
| Hotkey | `altShortcutActions.shortcutKeyCopyLowest` |
| Focused fixture | `tests/shortcut-target-live-selector-fixture.mjs` (code-block Copy section) |

## History

- Previously a visible code-block Copy always beat the message Copy. Combined with the checkmark swap, this made Alt+C flip between the two unpredictably. Now the lowest button wins every time.
