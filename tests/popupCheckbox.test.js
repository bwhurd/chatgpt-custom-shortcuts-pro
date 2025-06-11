const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const popupHtml = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');

function getInputIds() {
    const dom = new JSDOM(popupHtml);
    const { document } = dom.window;
    return [...document.querySelectorAll('input[type="checkbox"], input[type="radio"]')]
        .map(el => el.id)
        .filter(Boolean);
}

function loadPopup(storage) {
    const dom = new JSDOM(popupHtml, { runScripts: 'outside-only' });
    const { window } = dom;

    window.chrome = {
        storage: {
            sync: {
                get(keys, cb) {
                    const res = {};
                    if (typeof keys === 'string') res[keys] = storage[keys];
                    else if (Array.isArray(keys)) keys.forEach(k => { res[k] = storage[k]; });
                    else if (keys) Object.keys(keys).forEach(k => { res[k] = storage[k]; });
                    cb(res);
                },
                set(obj, cb) {
                    Object.assign(storage, obj);
                    if (cb) cb();
                }
            }
        },
        runtime: {},
        i18n: { getMessage: () => '' }
    };

    window.eval(popupJs);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

    return { window, storage };
}

const ids = getInputIds();
const defaults = {
    hideArrowButtonsCheckbox: false,
    removeMarkdownOnCopyCheckbox: true,
    moveTopBarToBottomCheckbox: false,
    pageUpDownTakeover: true,
    disableCopyAfterSelectCheckbox: false,
    enableSendWithControlEnterCheckbox: true,
    enableStopWithControlBackspaceCheckbox: true,
    useAltForModelSwitcherRadio: true,
    useControlForModelSwitcherRadio: false,
    rememberSidebarScrollPositionCheckbox: false
};

ids.forEach(id => {
    // Default when storage is empty
    let state = {};
    let result = loadPopup(state);
    assert.strictEqual(result.window.document.getElementById(id).checked, defaults[id]);

    // Explicit true value
    state = { [id]: true };
    result = loadPopup(state);
    assert.strictEqual(result.window.document.getElementById(id).checked, true);

    // Explicit false value
    state = { [id]: false };
    result = loadPopup(state);
    assert.strictEqual(result.window.document.getElementById(id).checked, false);
});

console.log('Popup checkbox and radio state tests passed.');
