# Alt+C plain-text clipboard

## Goal

- [x] Make Alt+C place only cleaned `text/plain` on the clipboard so paste targets cannot reconstruct bold and links from HTML.

## Implementation

- [x] Give Alt+C a plain-text clipboard write path; leave direct button clicks to ChatGPT.
- [x] Add a focused clipboard-format regression check.

## Validation

- [x] Run the Alt+C fixture, syntax check, Biome, and diff check.
- [x] Verify Chrome's plain-text clipboard API writes only `text/plain` and inspect the Windows clipboard output.
- [ ] Reload the unpacked extension and ChatGPT page, then confirm Alt+C paste and native button click behavior. Preserve the current unsent ChatGPT draft until the user decides to reload.
