# Batch 01 fingerprint-map validation

- Command: PowerShell parser over evidence/batch-01-source-fingerprints.sha256; recompute each listed file with Get-FileHash -Algorithm SHA256 and compare to the recorded digest.
- First attempt: exit 1. The parser caught a malformed copied digest in FP-021 before comparison; no source file was changed.
- Correction: replaced FP-021 with the digest returned by Get-FileHash for extension/dev-scrape/report.html.
- Final attempt: exit 0. Verified 42 SHA-256 fingerprints against current source.
- This check validates the audit fingerprint artifact only; it is not a product test.
