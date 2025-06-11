const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const popupHtml = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');

function parseDefaults() {
    const match = popupJs.match(/const defaults = {([\s\S]*?)^\s*};/m);
    if (!match) throw new Error('Defaults object not found in popup.js');
    const body = match[1];
    const defaults = {};
    body.split(/\n/).forEach(line => {
        const m = line.match(/(\w+):[^?]*\?[^:]*:\s*(true|false)/);
        if (m) defaults[m[1]] = m[2] === 'true';
    });
    return defaults;
}

function getInputIds() {
    const dom = new JSDOM(popupHtml);
    const { document } = dom.window;
    return [...document.querySelectorAll('input[type="checkbox"], input[type="radio"]')]
        .map(el => el.id)
        .filter(Boolean);
}

function loadPopup(storage) {
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM(popupHtml, { runScripts: 'outside-only', virtualConsole });
    const { window } = dom;

    window.chrome = {
        storage: {
            sync: {
    assert.ok(
        Object.prototype.hasOwnProperty.call(defaults, id),
        `Missing default for checkbox ID: ${id}`
    );
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

Object.keys(defaults).forEach(key => {
    assert.ok(
        ids.includes(key),
        `Default defined but no checkbox with ID: ${key}`
    );
});

    return { window, storage };
}

const ids = getInputIds();
const defaults = parseDefaults();

// Ensure every checkbox/radio has a default value defined
ids.forEach(id => {

    if (!Object.prototype.hasOwnProperty.call(defaults, id)) {
        throw new Error(`Missing default for checkbox ID: ${id}`);
    }
    // Default when storage is empty
    let state = {};
    let result = loadPopup(state);
    assert.strictEqual(result.window.document.getElementById(id).checked, defaults[id]);


const originalLog = console.log;
console.log = () => {};

try {
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
} finally {
    console.log = originalLog;
}

console.log('Popup checkbox and radio state tests passed.');
