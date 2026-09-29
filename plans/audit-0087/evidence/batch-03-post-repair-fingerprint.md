# Batch 03 authorized source fingerprint delta

- The Batch 01 fingerprint map is preserved as the original baseline.
- Its FP-005 entry for `extension/content.js` was `25EA8C8A1703A8021DB8DDBDC4252E77BFEE62B94C34580ECBC3287B57E43167`.
- After the user's requested Ctrl+Enter / Ctrl+Backspace repairs, the current SHA-256 is `BA814D4313DFD8256B635B7C5EC2CADC149B0324199DD95CE61D7C3B976DCC93`.
- A read-only recheck recomputed the other 41 source entries from `evidence/batch-01-source-fingerprints.sha256`; all 41 still match and no unrelated source fingerprint changed.
- The difference is an authorized post-baseline edit, not unexplained source drift. Shortcut-specific behavioral evidence is in `evidence/batch-03-control-backspace-extension-probe-result.md`; the Ctrl+Enter isolated browser-keyboard proof is in `tests/control-enter-send-fixture.mjs` output.
