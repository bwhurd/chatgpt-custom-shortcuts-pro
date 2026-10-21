// Shared key semantics only. Storage, modifiers and conflict ownership stay with consumers.
(function initShortcutBindings(root, factory) {
  const bindings = factory();
  if (typeof module === 'object' && module.exports) module.exports = bindings;
  root.CSPShortcutBindings = bindings;
  if (root.window && root.window !== root) root.window.CSPShortcutBindings = bindings;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const NBSP = '\u00a0';
  const punctuation = Object.freeze({
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
  });
  const labels = Object.freeze({
    ...punctuation,
    Space: 'Space',
    Enter: 'Enter',
    Escape: 'Esc',
    Tab: 'Tab',
    Backspace: 'Bksp',
    Delete: 'Del',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    IntlBackslash: '\\',
    IntlYen: '¥',
    IntlRo: 'ro',
    Lang1: 'lang1',
    Lang2: 'lang2',
    Lang3: 'lang3',
    Lang4: 'lang4',
    Lang5: 'lang5',
    VolumeMute: 'Mute',
    VolumeDown: 'Vol–',
    VolumeUp: 'Vol+',
    AudioVolumeMute: 'Mute',
    AudioVolumeDown: 'Vol–',
    AudioVolumeUp: 'Vol+',
    MediaPlayPause: 'Play/Pause',
    MediaTrackNext: 'Next',
    MediaTrackPrevious: 'Prev',
  });
  const modifierLabels = Object.freeze({
    MetaLeft: 'Win',
    MetaRight: 'Win',
    AltLeft: 'Alt',
    AltRight: 'Alt',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    Fn: 'Fn',
  });
  const macModifierLabels = Object.freeze({
    ...modifierLabels,
    MetaLeft: '⌘',
    MetaRight: '⌘',
    AltLeft: '⌥',
    AltRight: '⌥',
    ShiftLeft: '⇧',
    ShiftRight: '⇧',
    Fn: 'fn',
  });
  const codes = Object.freeze([
    ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
    ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
    ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
    ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
    ...Object.keys(labels),
    'Insert',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'CapsLock',
    'NumLock',
    'ScrollLock',
    'PrintScreen',
    'Pause',
    'ContextMenu',
    'NumpadDivide',
    'NumpadMultiply',
    'NumpadSubtract',
    'NumpadAdd',
    'NumpadDecimal',
    'NumpadEnter',
    'NumpadEqual',
    ...Object.keys(modifierLabels),
  ]);
  const codeSet = new Set(codes);
  const characters = Object.freeze({
    ...Object.fromEntries(Object.entries(punctuation).map(([code, label]) => [label, code])),
    '↑': 'ArrowUp',
    '↓': 'ArrowDown',
    '←': 'ArrowLeft',
    '→': 'ArrowRight',
  });
  const aliases = Object.freeze({
    OSLeft: 'MetaLeft',
    OSRight: 'MetaRight',
    Spacebar: 'Space',
    Left: 'ArrowLeft',
    Right: 'ArrowRight',
    Up: 'ArrowUp',
    Down: 'ArrowDown',
    Del: 'Delete',
  });

  function charToCode(value) {
    if (typeof value !== 'string') return '';
    const text = value.trim();
    if (/^[a-z]$/i.test(text)) return `Key${text.toUpperCase()}`;
    if (/^[0-9]$/.test(text)) return `Digit${text}`;
    return Object.hasOwn(characters, text) ? characters[text] : '';
  }

  function normalize(value, { empty = '' } = {}) {
    if (typeof value !== 'string') return empty;
    const text = value.trim();
    if (!text) return empty;
    if (codeSet.has(text)) return text;
    if (Object.hasOwn(aliases, text)) return aliases[text];
    return charToCode(text) || empty;
  }

  function collisionCode(value) {
    const code = normalize(value);
    return /^Numpad[0-9]$/.test(code) ? `Digit${code.slice(-1)}` : code;
  }

  function equals(a, b) {
    const first = collisionCode(a);
    return !!first && first === collisionCode(b);
  }

  function matches(value, event) {
    const code = normalize(value);
    if (!code || !event) return false;
    // A usable physical code takes precedence over layout-dependent event.key.
    const eventCode = event.code;
    if (typeof eventCode === 'string' && eventCode && eventCode !== 'Unidentified')
      return equals(code, eventCode);
    return equals(code, fromLabel(event.key));
  }

  function display(value, { isMac = false, empty = NBSP } = {}) {
    const code = normalize(value);
    if (!code) return empty;
    if (/^Key[A-Z]$/.test(code)) return code.slice(-1).toLowerCase();
    if (/^(Digit|Numpad)[0-9]$/.test(code)) return code.slice(-1);
    if (Object.hasOwn(labels, code)) return labels[code];
    const modifiers = isMac ? macModifierLabels : modifierLabels;
    if (Object.hasOwn(modifiers, code)) return modifiers[code];
    return code.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  function labelMaps({ isMac = false } = {}) {
    const exact = Object.create(null);
    const lower = Object.create(null);
    const synonyms = {
      Bksp: 'Backspace',
      Del: 'Delete',
      Esc: 'Escape',
      '⎋': 'Escape',
      '↩': 'Enter',
      Return: 'Enter',
      '⇥': 'Tab',
      PgUp: 'PageUp',
      PgDn: 'PageDown',
      'Page Up': 'PageUp',
      'Page Down': 'PageDown',
      'Vol-': 'VolumeDown',
      Win: 'MetaLeft',
      '⌘': 'MetaLeft',
      Command: 'MetaLeft',
      Ctrl: 'ControlLeft',
      Control: 'ControlLeft',
      '⌥': 'AltLeft',
      Alt: 'AltLeft',
      '⇧': 'ShiftLeft',
      Shift: 'ShiftLeft',
      Fn: 'Fn',
      ':': 'Semicolon',
      '"': 'Quote',
      _: 'Minus',
      '+': 'Equal',
      ...aliases,
    };
    const add = (label, code) => {
      exact[label] ||= code;
      lower[label.toLowerCase()] ||= code;
    };
    for (const [label, code] of Object.entries(synonyms)) add(label, code);
    for (const code of codes) add(display(code, { isMac }), code);
    for (const code of codes) add(code, code);
    return { exact, lower, set: new Set(codes) };
  }

  function fromLabel(value, options) {
    if (typeof value !== 'string') return '';
    if (value === ' ') return 'Space';
    const code = normalize(value);
    if (code) return code;
    const text = value.trim();
    const { exact, lower } = labelMaps(options);
    return exact[text] || lower[text.toLowerCase()] || '';
  }

  return Object.freeze({
    NBSP,
    codes,
    charToCode,
    normalize,
    collisionCode,
    equals,
    matches,
    display,
    labelMaps,
    fromLabel,
  });
});
