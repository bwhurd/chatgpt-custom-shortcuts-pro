/* shared/model-picker-labels.js
   Single source of truth for model-picker labels and defaults.
   Safe in both popup (extension page) and content script isolated world.
*/
(() => {
  const MAX_SLOTS = 15;

  // Canonical mapping based on current HTML (use sparingly; prefer parsing testids)
  const TESTID_CANON = Object.freeze({
    // Stable non-GPT-5 ids
    'model-switcher-gpt-4o': '4o',
    'model-switcher-gpt-4-1': '4.1',
    'model-switcher-o3': 'o3',
    'model-switcher-o4-mini': 'o4-mini',
  });

// Main fallback order if testids vanish but order remains
  const MAIN_CANON_BY_INDEX = ['Auto', 'Instant', 'Thinking'];

  const normTid = (tid) => (tid || '').toLowerCase().trim();

  const capitalizeWord = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

  // Canonical labels from data-testid (language/format resilient).
  // This is intentionally conservative: return '' when unsure so callers can fall back to DOM text.
  const canonFromTid = (tid) => {
    const t = normTid(tid);
    if (!t) return '';

    // 1) Known stable ids first
    if (TESTID_CANON[t]) return TESTID_CANON[t];

    // 2) GPT-5 Auto slot (e.g., model-switcher-gpt-5-3)
    // ChatGPT uses the bare GPT-5.x tid for the "Auto" selector that decides how long to think.
    if (/^model-switcher-gpt-5-\d+$/.test(t)) return 'Auto';

    // 3) GPT-x.y Instant/Thinking (e.g., model-switcher-gpt-5-3-instant)
    let m = t.match(/^model-switcher-gpt-(\d+)-(\d+)-(instant|thinking)$/);
    if (m) return `GPT-${m[1]}.${m[2]} ${capitalizeWord(m[3])}`;

    // 4) GPT-x Instant/Thinking (e.g., model-switcher-gpt-5-thinking)
    m = t.match(/^model-switcher-gpt-(\d+)-(instant|thinking)$/);
    if (m) return `GPT-${m[1]} ${capitalizeWord(m[2])}`;

    // 5) GPT-x mini variants (legacy tid)
    m = t.match(/^model-switcher-gpt-(\d+)-t-mini$/);
    if (m) return `GPT-${m[1]} mini`;

    return '';
  };

  const isSubmenuTrigger = (el) =>
    !!el &&
    (el.hasAttribute('data-has-submenu') ||
      el.getAttribute('aria-haspopup') === 'menu' ||
      el.hasAttribute('aria-controls'));

  // Strip hints and tertiary text
  const textNoHint = (el) => {
    if (!el) return '';
    const primary =
      el.querySelector('.flex.items-center.gap-1') ||
      el.querySelector('.flex.items-center') ||
      el.querySelector('.flex.min-w-0.grow.items-center .truncate') ||
      el.querySelector('.truncate') ||
      el;

    const node = primary.cloneNode(true);
    node
      .querySelectorAll('.alt-hint, .text-xs, .not-group-data-disabled\\:text-token-text-tertiary')
      .forEach((n) => {
        n.remove();
      });

    const txt = (node.textContent || '').replace(/\s+/g, ' ').trim();
    return txt
      .replace(/\s*(?:Alt|Ctrl|Control|⌘|Cmd|Meta|Win|Option|Opt|Shift)\s*\+\s*\S+$/, '')
      .trim();
  };

  // Normalize submenu labels (language/format resilient)
  const mapSubmenuLabel = (s) => {
    const t = (s || '').normalize('NFKD');

    // “GPT-5 Thinking mini”, “GPT 5 mini”, etc. → “GPT-5 mini”
    if (/\bgpt[\s.-]*5(?:\.\d+)?\s+(?:thinking\s+)?mini\b/i.test(t)) return 'GPT-5 mini';

    // Other knowns
    if (/\bo4\s*-\s*mini\b/i.test(t) || /\bo4\s*mini\b/i.test(t) || /\bo4-?mini\b/i.test(t))
      return 'o4-mini';
    if (/\bo3\b/i.test(t)) return 'o3';
    if (/\b4\.?1\b/i.test(t)) return '4.1';
    if (/\b4o\b/i.test(t) || /\bgpt[-\s]?4o\b/i.test(t)) return '4o';
    return '';
  };

  // Best-guess defaults for initial UI (before scrape). Arrow is canonical “→”.
  const defaultNames = () => {
    const arr = [
      'Auto',
      'Instant',
      'Thinking',
      '→', // submenu trigger (not a model)
      'GPT-5.1 Instant',
      'GPT-5.1 Thinking',
      'GPT-5 mini',
      'o3',
    ];
    while (arr.length < MAX_SLOTS) arr.push('');
    return arr;
  };

  // Only for popup display aesthetics: replace bare “→” with “Legacy Models →”
  const prettifyForPopup = (names) => {
    const cap = Math.min(MAX_SLOTS, Array.isArray(names) ? names.length : 0);
    const out = (Array.isArray(names) ? names.slice(0, cap) : []).concat();
    const idx = out.indexOf('→');
    if (idx !== -1) out[idx] = 'Legacy Models →';
    while (out.length < MAX_SLOTS) out.push('');
    return out;
  };

  window.ModelLabels = Object.freeze({
    MAX_SLOTS,
    TESTID_CANON,
    MAIN_CANON_BY_INDEX,
    normTid,
    canonFromTid,
    isSubmenuTrigger,
    textNoHint,
    mapSubmenuLabel,
    defaultNames,
    prettifyForPopup,
  });
})();
