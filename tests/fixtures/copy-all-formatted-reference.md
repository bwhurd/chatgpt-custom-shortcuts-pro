# Copy-all reference

The HTML file contains four messages with headings, three-level bullet lists, nested numbered lists, an ordered list starting at 3, and a JavaScript code box. The expected text is written independently of the extension's copy implementation. Role labels are included; headings become plain text, list indentation uses four spaces per level, and code retains fences and indentation.

The controlled test repeats this four-message block six times to make a 24-message thread. Initially only the latest four messages are mounted. Scrolling to the top loads earlier messages in five batches. Copy all uses its real production preload waits and must produce six copies of the expected text in chronological order. One string comparison checks the complete result. A tolerant visual-anchor check verifies scroll restoration.

Run only the affected case:

```text
npm run test:shortcuts:fast -- --shortcut-action-id selectThenCopyAllMessages
```

- Reference: recorded fixture snapshot; personal conversation URL omitted.
