# Contributing

I use this extension daily and keep fixing it as ChatGPT UI changes break things. Help maintaining it is welcome.

Bug fixes are the most useful, especially small, focused fixes that restore broken shortcuts or UI hooks.

## Workflow

1. Fork the repo
2. Create a clearly named branch
3. Make the smallest change needed
4. Open a pull request with a brief explanation

Code should follow [PROJECT_SPEC.md](PROJECT_SPEC.md) and the relevant subsystem specs, using simple, focused implementations that match existing conventions, work across UI languages, and add no mutation observers, polling, or performance overhead outside user-triggered events.

Before submitting, ask Codex to review your pull request with this prompt:

```text
Review this pull request against PROJECT_SPEC.md and the pertinent files in specs/, using AGENTS.md to identify which specs apply.
For maintained code or validation-tool changes, run npm run check and npm run test:validators; for documentation-only changes, run npm run check:text.
For changes to popup controls, settings defaults/schema, locale keys, or settings fixtures, run npm run validate:keys.
For popup changes, also run npm test; this checks appearance, normal scrolling, and one setting's save/reopen behavior, without claiming full shortcut coverage.
Report violations with file and line references, check results, and behavior the checks do not cover, without changing files or updating test baselines.
```

No CLA, no process overhead. I handle releases and direction. If you want to help long term, open an issue or reach out.
