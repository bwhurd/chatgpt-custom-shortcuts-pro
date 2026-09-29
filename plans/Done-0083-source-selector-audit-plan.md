# Source selector audit

- [x] Derive DOM lookup groups from the manifest's first-party content scripts with Acorn, retaining file/line references, fallback groups, and explicit unresolved expressions.
- [x] Add `npm run audit:selectors` using the existing Chrome/CDP connection and report-opening helpers. Its dedicated conversation tab inspects up to 12 safe menu openers without sending prompts or modifying settings.
- [x] Report matched, unmatched, invalid, and unresolved lookups separately; preserve missing-state evidence and never claim that absence proves a feature is broken.
- [x] Write compact JSON/HTML reports locally. Add no shipped instrumentation, polling, new permissions, or AI calls.
- [x] Document the command and limits. No validation, tests, or live audit were run, following the user's instruction; runtime execution remains unverified.
