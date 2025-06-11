# ChatGPT Custom Shortcuts Pro

[📦 Chrome Web Store](https://chromewebstore.google.com/detail/chatgpt-custom-shortcuts/figoaoelbmlhipinligdgmopdakcdkcf) · [📜 Changelog](CHANGELOG.md) · [🤝 Contributing](CONTRIBUTING.md)

Featured Chrome extension — custom shortcuts for ChatGPT. Easy setup, zero ads, no data tracking.

**Quick Install**
1. Clone or [download](https://github.com/bwhurd/chatgpt-custom-shortcuts-pro) this repository.
2. Open Chrome → `chrome://extensions` → enable "Developer mode".
3. Click **Load unpacked**, select the cloned repo, done.

**Questions or Issues?**
Use [GitHub Issues](https://github.com/bwhurd/chatgpt-custom-shortcuts-pro/issues) or the Chrome Web Store support link.

**License:** [Mozilla Public License 2.0](LICENSE). Extension name/icons © Brian Hurd.

## Testing

Run the following command from the repository root:

```bash
npm ci && npm test
```

This installs the dev dependencies and executes the Node-based tests. The
`tests/popupCheckbox.test.js` file relies on `jsdom` to emulate the popup UI
environment.
