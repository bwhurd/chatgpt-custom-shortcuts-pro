import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const logPath = process.argv[2];
function write(entry) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

(async () => {
  write({ type: 'start' });
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333', { timeout: 120000 });
  const seen = new WeakSet();
  async function watchPage(page) {
    if (seen.has(page)) return;
    seen.add(page);
    page.on('console', (msg) => write({ type: 'console', url: page.url(), level: msg.type(), text: msg.text() }));
    page.on('pageerror', (err) => write({ type: 'pageerror', url: page.url(), text: String(err && err.stack || err) }));
  }
  const pages = () => browser.contexts().flatMap((c) => c.pages());
  for (const context of browser.contexts()) {
    context.on('page', async (page) => { write({ type: 'page-open', url: page.url() }); await watchPage(page); });
  }
  for (const page of pages()) await watchPage(page);
  const started = Date.now();
  while (Date.now() - started < 20 * 60 * 1000) {
    for (const page of pages()) {
      if (!/^chrome-extension:\/\/.+\/popup\.html/i.test(page.url())) continue;
      await watchPage(page);
      try {
        const state = await page.evaluate(() => {
          const params = new URLSearchParams(location.search);
          const refreshButton = Array.from(document.querySelectorAll('button')).find((el) => /refresh models/i.test((el.textContent || '').trim()));
          const toasts = Array.from(document.querySelectorAll('#toast-container .toast')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
          return {
            href: location.href,
            sourceTabId: params.get('sourceTabId') || '',
            actionWindow: params.get('actionWindow') || '',
            scrapeState: String(window.__modelCatalogScrapeState || 'idle'),
            refreshButton: refreshButton ? { text: (refreshButton.textContent || '').replace(/\s+/g, ' ').trim(), disabled: !!refreshButton.disabled } : null,
            toasts,
          };
        });
        write({ type: 'popup-state', ...state });
      } catch (error) {
        write({ type: 'popup-state-error', url: page.url(), text: String(error && error.message || error) });
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  write({ type: 'end' });
  await browser.close();
})().catch((error) => {
  write({ type: 'fatal', text: String(error && error.stack || error) });
  process.exit(1);
});
