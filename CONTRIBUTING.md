# Contributing

I use this extension daily and keep fixing it as ChatGPT UI changes break things. Help maintaining it is welcome.

Bug fixes are the most useful, especially small, focused fixes that restore broken shortcuts or UI hooks.

## Workflow

1. Fork the repo
2. Create a clearly named branch
3. Make the smallest change needed
4. Open a pull request with a brief explanation

Code should follow [PROJECT_SPEC.md](PROJECT_SPEC.md) and the relevant subsystem specs, using simple, focused implementations that match existing conventions, work across UI languages, and add no mutation observers, polling, or performance overhead outside user-triggered events.

## Checks

- Code changes: run `npm run checks` with Node 24 and npm installed.
- Docs only: run `npm run check:text`.

Reuse passing checks for unchanged inputs and include the results in your pull request. See [validation guidance](PROJECT_SPEC.md#validation-and-tooling-posture) for focused checks.

No CLA, no process overhead. I handle releases and direction. If you want to help long term, open an issue or reach out.
