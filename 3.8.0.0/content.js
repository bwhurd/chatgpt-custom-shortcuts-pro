/* 
ChatGPT Custom Shortcuts Pro
- Full Changelog: https://bwhurd.github.io/chatgpt-custom-shortcuts-pro/CHANGELOG.html
- Privacy Statement: This extension does not collect, monitor, or track user activity.
*/

// To do: 
// 1. add feedback flash for next/previous thread
// 2. fix next thread accidentally selecting > next to thought for 5 more seconds
// 3. add shortcuts to move up or down to previous or next conversation

// =====================================
// @note Global Functions
// =====================================

// Verify GSAP libraries before registration
function checkGSAP() {
    if (
        typeof window.gsap !== 'undefined' &&
        typeof window.ScrollToPlugin !== 'undefined' &&
        typeof window.Observer !== 'undefined' &&
        typeof window.Flip !== 'undefined'

    ) {
        window.gsap.registerPlugin(
            window.ScrollToPlugin,
            window.Observer,
            window.Flip

        );
        window.ScrollToPlugin.config({ autoKill: true });
        console.log('GSAP and plugins registered successfully.');
    } else {
        console.warn('GSAP is not loaded yet. Retrying in 100ms...');
        setTimeout(checkGSAP, 100);
    }
}


checkGSAP();

// Shared scroll state object
const ScrollState = {
    scrollContainer: null,
    isAnimating: false,
    finalScrollPosition: 0,
    userInterrupted: false,
};

// Utility functions for scrolling
function resetScrollState() {
    if (ScrollState.isAnimating) {
        ScrollState.isAnimating = false;
        ScrollState.userInterrupted = true; // Mark animation as interrupted
    }
    ScrollState.scrollContainer = getScrollableContainer();
    if (ScrollState.scrollContainer) {
        ScrollState.finalScrollPosition = ScrollState.scrollContainer.scrollTop;
    }
}

function getScrollableContainer() {
    const firstMessage = document.querySelector('[data-testid^="conversation-turn-"]');
    if (!firstMessage) return null;

    let container = firstMessage.parentElement;
    while (container && container !== document.body) {
        const style = getComputedStyle(container);
        if (container.scrollHeight > container.clientHeight &&
            style.overflowY !== 'visible' && style.overflowY !== 'hidden') {
            return container;
        }
        container = container.parentElement;
    }
    return document.scrollingElement || document.documentElement;
}

// =======================
// Centralized MutationObserver
// =======================

let chatContainerObserver = null;

function observeConversationContainer(callback) {
    // Find the smallest stable ancestor of all [data-testid^="conversation-turn-"] nodes.
    const target = getScrollableContainer();
    if (!target) return; // Don't attach to body/doc ever!

    if (chatContainerObserver) chatContainerObserver.disconnect();

    chatContainerObserver = new MutationObserver(mutations => {
        // Batch/delay heavy work:
        if (mutations.length) {
            if (!window._chatObserverFlushScheduled) {
                window._chatObserverFlushScheduled = true;
                requestIdleCallback(() => {
                    window._chatObserverFlushScheduled = false;
                    callback(mutations);
                }, { timeout: 200 });
            }
        }
    });

    chatContainerObserver.observe(target, {
        childList: true,
        subtree: false // Only watch direct children, not entire subtree!
    });
}

// Usage example: Call this ONCE after DOM is ready
observeConversationContainer(mutations => {
    // Only act if relevant children were added/removed
    for (const mutation of mutations) {
        if (mutation.type === "childList") {
            // Example: run updateChatUI or refresh shortcut mapping
            // updateChatUI();
        }
    }
});




// Utility function: findButton tries aria-label, data-testid, then SVG path fallback
// Purpose: Allows all button lookups to use a single resilient API.
// Finds ALL matching buttons, prioritizing testId, then SVG path, then aria-label (best for multi-language)
function findAllButtons({ testId, svgPaths = [], ariaLabel }) {
    let matches = [];
    if (testId) {
        matches = Array.from(document.querySelectorAll(`button[data-testid="${testId}"]`));
        if (matches.length) return matches;
    }
    for (const pathD of svgPaths) {
        const svgPathsFound = Array.from(document.querySelectorAll(`button svg path[d^="${pathD}"]`));
        const btns = svgPathsFound.map(svgPath => svgPath.closest('button')).filter(Boolean);
        if (btns.length) return btns;
    }
    if (ariaLabel) {
        matches = Array.from(document.querySelectorAll(`button[aria-label="${ariaLabel}"]`));
        if (matches.length) return matches;
    }
    return [];
}

// Finds the LAST matching button (lowest in DOM) using same selector priority
function findButton(args) {
    const btns = findAllButtons(args);
    return btns.length ? btns[btns.length - 1] : null;
}

// Global helper to toggle visibility and expose setting values
function applyVisibilitySettings(data) {
    // Key: global window property
    // Value: [defaultIfUndefined, defaultIfMissing]
    const settingsMap = {
        moveTopBarToBottomCheckbox: false,
        pageUpDownTakeover: true,
        hideArrowButtonsCheckbox: true,
        removeMarkdownOnCopyCheckbox: true,
        selectMessagesSentByUserOrChatGptCheckbox: true,
        onlySelectUserCheckbox: false,
        onlySelectAssistantCheckbox: false,
        disableCopyAfterSelectCheckbox: false,
        enableSendWithControlEnterCheckbox: true,
        enableStopWithControlBackspaceCheckbox: true,
        useAltForModelSwitcherRadio: true,
        useControlForModelSwitcherRadio: false,
        rememberSidebarScrollPositionCheckbox: false,
    };

    for (const key in settingsMap) {
        // If present in data, use its boolean value, otherwise fallback to default.
        window[key] = data.hasOwnProperty(key)
            ? Boolean(data[key])
            : settingsMap[key];
    }
}

// Expose globally for use in other scripts/IIFEs
window.applyVisibilitySettings = applyVisibilitySettings;


// helper for slim sidebar bugs with sidebar toggle shortcut
// These helpers only set styles directly, no timers, no recursion
window.hideSlimSidebarBarInstant = function () {
    const bar = document.getElementById('stage-sidebar-tiny-bar');
    if (!bar) return;
    bar.style.setProperty('transition', 'none', 'important');
    bar.style.setProperty('opacity', '0', 'important');
    void bar.offsetWidth;
    setTimeout(() => {
        if (bar) bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
    }, 0);
};

window.flashSlimSidebarBar = function (dur = 2500) {
    // Use the canonical timer in the main IIFE if present
    if (typeof window._flashSlimSidebarBar === "function") {
        window._flashSlimSidebarBar(dur);
        return;
    }
    // Fallback for standalone: just snap to 1, fade to idle after dur
    const bar = document.getElementById('stage-sidebar-tiny-bar');
    if (!bar) return;
    bar.style.setProperty('transition', 'none', 'important');
    bar.style.setProperty('opacity', '1', 'important');
    void bar.offsetWidth;
    bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
    setTimeout(() => window.fadeSlimSidebarBarToIdle(), dur);
};

window.fadeSlimSidebarBarToIdle = function () {
    const bar = document.getElementById('stage-sidebar-tiny-bar');
    if (!bar) return;
    bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
    bar.style.setProperty('opacity', (window._slimBarIdleOpacity ?? 0.6).toString(), 'important');
};


// Mac Cross-Compatibility Helper
function isMacPlatform() {
    const ua = navigator.userAgent || '';
    const plat = navigator.platform || '';
    const uaDataPlat = (navigator.userAgentData && navigator.userAgentData.platform) || '';
    return /Mac/i.test(plat) || /Mac/i.test(ua) || /mac/i.test(uaDataPlat);
}

// --- compat helpers to support both legacy chars and new codes ---
function charToCode(ch) {
    if (!ch) return '';
    const raw = ch.trim();
    const upper = raw.toUpperCase();
    if (/^[A-Z]$/.test(upper)) return `Key${upper}`;
    if (/^[0-9]$/.test(raw)) return `Digit${raw}`;
    switch (raw) {
        case '-': return 'Minus';
        case '=': return 'Equal';
        case '[': return 'BracketLeft';
        case ']': return 'BracketRight';
        case '\\': return 'Backslash';
        case ';': return 'Semicolon';
        case "'": return 'Quote';
        case ',': return 'Comma';
        case '.': return 'Period';
        case '/': return 'Slash';
        case '`': return 'Backquote';
        case ' ': return 'Space';
        default: return '';
    }
}

function codeEquals(a, b) {
    if (a === b) return true;
    const A = a && a.match(/^(Digit|Numpad)([0-9])$/);
    const B = b && b.match(/^(Digit|Numpad)([0-9])$/);
    return !!(A && B && A[2] === B[2]);
}

/** Accepts either a legacy single char ('w') or a code ('KeyW') in storage. */
function normalizeStoredToCode(stored) {
    if (!stored) return '';
    // New format already looks like a code
    if (/^[A-Z][a-z]+/.test(stored)) return stored;
    // Legacy single-character value
    if (stored.length === 1) return charToCode(stored);
    return '';
}

/** Returns true if the pressed key matches the stored shortcut key. */
function matchesStoredKey(storedValue, e) {
    const want = normalizeStoredToCode(storedValue);
    if (!want) return false;
    return codeEquals(want, e.code);
}


// =====================================
// @note Sync Chrome Storage + UI State + Expose Global Variables
// =====================================

(function () {
    'use strict';

    // Fetch initial values from Chrome storage
    chrome.storage.sync.get([
        'hideArrowButtonsCheckbox',
        'moveTopBarToBottomCheckbox',
        'pageUpDownTakeover',
        'removeMarkdownOnCopyCheckbox',
        'selectMessagesSentByUserOrChatGptCheckbox',
        'onlySelectUserCheckbox',
        'onlySelectAssistantCheckbox',
        'disableCopyAfterSelectCheckbox',
        'enableSendWithControlEnterCheckbox',
        'enableStopWithControlBackspaceCheckbox',
        'popupBottomBarOpacityValue',
        'useAltForModelSwitcherRadio',
        'useControlForModelSwitcherRadio',
        'rememberSidebarScrollPositionCheckbox',
        'FadeSlimSidebarCheckbox',           // (checkbox state: true/false)
        'popupSlimSidebarOpacityValue'       // (slider value: number)
    ], (data) => {
        applyVisibilitySettings(data);
    });

    // Listen for changes in Chrome storage and dynamically apply settings
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') {
            const updatedData = {};
            for (const key in changes) {
                updatedData[key] = changes[key].newValue;
            }
            applyVisibilitySettings(updatedData);
        }
    });

})();



// =============================
// @note Main IIFE
// =============================

(function () {
    'use strict';

    // appendWithFragment: Appends multiple elements to a parent element using a document fragment to improve performance.


    function appendWithFragment(parent, ...elements) {
        const fragment = document.createDocumentFragment();
        elements
            .filter(el => el !== null && el !== undefined)
            .forEach(el => fragment.appendChild(el));
        parent.appendChild(fragment);
    }


    function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = "position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); padding: 16px; background-color: #333; color: #FFF; border-radius: 4px; max-width: 90%; text-align: center; z-index: 1000; font-size: 14px; opacity: 1; transition: opacity 0.5s ease; box-shadow: 0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12);";
        toast.innerText = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
        }, 3000);
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 3500);
    }

    function ensureForceHoverStyle() {
        if (!document.getElementById('force-hover-style')) {
            const style = document.createElement('style');
            style.id = 'force-hover-style';
            style.textContent = `
        .force-hover,
        .force-hover * {
            pointer-events: auto !important;
            opacity: 1 !important;
            mask-position: 0 0 !important;
        }`;
            document.head.appendChild(style);
        }
    }

    function copyAll() {
        const proseElements = document.querySelectorAll('.prose');
        if (proseElements.length === 0) {
            showToast('No prose elements found');
            return;
        }

        chrome.storage.sync.get(['copyAll-userSeparator', 'copyCode-userSeparator'], function (data) {
            let copyAllSeparator = data['copyAll-userSeparator'] ? parseSeparator(data['copyAll-userSeparator']) : " \n  \n --- --- --- \n \n";

            let formattedText = '';
            for (const proseElement of proseElements) {
                formattedText += getFormattedText(proseElement);
                formattedText += copyAllSeparator; // n the separator from storage
            }

            // If there is no user defined separator, remove the last "\n\n"
            if (!data['copyAll-userSeparator']) {
                formattedText = formattedText.slice(0, -2);
            }

            if (formattedText) {
                navigator.clipboard.writeText(formattedText)
                    .then(function () {
                        showToast('All responses copied to clipboard!');
                    })
                    .catch(function (err) {
                        showToast('Error copying content to clipboard!');
                    });
            } else {
                showToast('No content found in the prose elements');
            }
        });
    }

    function getFormattedText(proseElement) {
        let result = '';
        for (const child of proseElement.childNodes) {
            switch (child.nodeType) {
                case Node.TEXT_NODE: {
                    result += child.textContent;
                    break;
                }
                case Node.ELEMENT_NODE: {
                    switch (child.tagName) {
                        case 'BR': {
                            result += '\n';
                            break;
                        }
                        case 'P': {
                            result += getFormattedText(child) + '\n\n';
                            break;
                        }
                        case 'PRE': {
                            result += processCodeBlock(child.textContent) + '\n\n';
                            break;
                        }
                        case 'OL':
                        case 'UL': {
                            let items = Array.from(child.querySelectorAll('li'));
                            if (child.tagName === 'OL') {
                                items = items.map((item, index) => `${index + 1}. ${getFormattedText(item)}\n`);
                            } else {
                                items = items.map(item => `- ${getFormattedText(item)}\n`);
                            }
                            result += items.join('') + '\n';
                            break;
                        }
                        default: {
                            result += getFormattedText(child);
                        }
                    }
                    break;
                }
            }
        }
        return result;
    }

    function processCodeBlock(codeBlockText) {
        let lines = codeBlockText.split('\n').filter(line => line.trim() !== ''); // Remove empty lines
        if (lines.length === 0) return ''; // Skip empty blocks
        return lines.join('\n'); // Return raw code content without backticks
    }

    function copyCode() {
        const codeBoxes = document.querySelectorAll('pre'); // Get all code boxes
        if (codeBoxes.length === 0) {
            showToast('No code boxes found');
            return;
        }

        chrome.storage.sync.get('copyCode-userSeparator', function (data) {
            let copyCodeSeparator = data['copyCode-userSeparator']
                ? parseSeparator(data['copyCode-userSeparator'])
                : " \n  \n --- --- --- \n \n"; // Default to single line break

            let formattedBlocks = [];
            for (const codeBox of codeBoxes) {
                const codeElements = codeBox.querySelectorAll('code');
                for (const codeElement of codeElements) {
                    let block = codeElement.textContent.trim(); // Ensure we capture the code content only
                    if (block) {
                        formattedBlocks.push(block); // Add block directly
                    }
                }
            }

            // Join the code blocks with the specified separator
            const output = formattedBlocks.join(copyCodeSeparator);

            if (output.trim()) {
                navigator.clipboard.writeText(output)
                    .then(() => showToast('All code boxes copied to clipboard!'))
                    .catch(() => showToast('Error copying code content to clipboard!'));
            } else {
                showToast('No content found in the code boxes');
            }
        });
    }

    function parseSeparator(separator) {
        // Parse literal `\n` and similar into real line breaks
        return separator.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
    }

    function goUpOneMessage(feedbackTarget = null) {
        resetScrollState(); // Reset the shared scroll state

        const messages = document.querySelectorAll('[data-testid^="conversation-turn-"]');
        let targetMessage = null;

        // Offset values based on checkbox state
        const isBottom = window.moveTopBarToBottomCheckbox;
        const messageThreshold = isBottom ? -48 : -30;
        const scrollOffset = isBottom ? 43 : 25;

        for (let i = messages.length - 1; i >= 0; i--) {
            const messageTop = messages[i].getBoundingClientRect().top;
            if (messageTop < messageThreshold) {
                targetMessage = messages[i];
                break;
            }
        }

        const scrollContainer = getScrollableContainer();
        if (!scrollContainer) return;

        if (targetMessage) {
            gsap.to(scrollContainer, {
                duration: .6,
                scrollTo: {
                    y: targetMessage.offsetTop - scrollOffset
                },
                ease: "power4.out"
            });
        } else {
            gsap.to(scrollContainer, {
                duration: .6,
                scrollTo: {
                    y: 0
                },
                ease: "power4.out"
            });
        }

        if (feedbackTarget) feedbackAnimation(feedbackTarget);
    }

    function createScrollUpButton() {
        // Gate button creation based on window.hideArrowButtonsCheckbox
        if (window.hideArrowButtonsCheckbox) return;

        if (!window.gsap || !window.ScrollToPlugin) {
            console.error("GSAP or ScrollToPlugin is missing.");
            return;
        }

        const upButton = document.createElement('button');
        upButton.classList.add(
            'chatGPT-scroll-btn', 'cursor-pointer', 'absolute', 'right-6', 'z-10',
            'rounded-full', 'border', 'border-gray-200', 'bg-gray-50', 'text-gray-600',
            'dark:border-white/10', 'dark:bg-white/10', 'dark:text-gray-200'
        );
        upButton.style.cssText = "display: flex; align-items: center; justify-content: center; background-color: var(--main-surface-tertiary); color: var(--text-primary); opacity: 0.8; width: 25.33px; height: 25.33px; border-radius: 50%; position: fixed; top: 196px; right: 26px; z-index: 10000; transition: opacity 1s;";
        upButton.id = 'upButton';

        upButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-2xl" style="transform: scale(0.75);">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M15.1918 8.90615C15.6381 8.45983 16.3618 8.45983 16.8081 8.90615L21.9509 14.049C22.3972 14.4953 22.3972 15.2189 21.9509 15.6652C21.5046 16.1116 20.781 16.1116 20.3347 15.6652L17.1428 12.4734V22.2857C17.1428 22.9169 16.6311 23.4286 15.9999 23.4286C15.3688 23.4286 14.8571 22.9169 14.8571 22.2857V12.4734L11.6652 15.6652C11.2189 16.1116 10.4953 16.1116 10.049 15.6652C9.60265 15.2189 9.60265 14.4953 10.049 14.049L15.1918 8.90615Z" fill="currentColor"></path>
            </svg>
        `;

        upButton.onclick = function () {
            goUpOneMessage(upButton);
        };

        upButton.addEventListener('mouseover', () => {
            upButton.style.opacity = "1";
        });

        upButton.addEventListener('mouseleave', () => {
            upButton.style.transition = "opacity 1s";
            upButton.style.opacity = "0.2";
        });

        setTimeout(() => {
            upButton.style.transition = "opacity 1s";
            upButton.style.opacity = "0.2";
        }, 3500);

        return upButton;
    }


    function goDownOneMessage(feedbackTarget = null) {
        resetScrollState();

        const messages = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'));
        const scrollContainer = getScrollableContainer();
        if (!scrollContainer || !messages.length) return;

        gsap.set(scrollContainer, { scrollTo: '+=0' });
        gsap.killTweensOf(scrollContainer);

        const currentScrollTop = scrollContainer.scrollTop;

        // Offset values based on checkbox state
        const isBottom = window.moveTopBarToBottomCheckbox;
        const messageThreshold = isBottom ? 48 : 30;
        const scrollOffset = isBottom ? 43 : 25;

        let targetMessage = null;
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].offsetTop > currentScrollTop + messageThreshold) {
                targetMessage = messages[i];
                break;
            }
        }

        if (targetMessage) {
            gsap.to(scrollContainer, {
                duration: 0.6,
                scrollTo: { y: targetMessage.offsetTop - scrollOffset },
                ease: "power4.out"
            });
        } else {
            gsap.to(scrollContainer, {
                duration: 0.6,
                scrollTo: { y: scrollContainer.scrollHeight - scrollContainer.clientHeight },
                ease: "power4.out"
            });
        }

        if (feedbackTarget) feedbackAnimation(feedbackTarget);
    }

    function createScrollDownButton() {
        // Gate button creation based on window.hideArrowButtonsCheckbox
        if (window.hideArrowButtonsCheckbox) return;

        if (!window.gsap || !window.ScrollToPlugin) {
            console.error("GSAP or ScrollToPlugin is missing.");
            return;
        }

        const downButton = document.createElement('button');
        downButton.classList.add(
            'chatGPT-scroll-btn', 'cursor-pointer', 'absolute', 'right-6', 'z-10',
            'rounded-full', 'border', 'border-gray-200', 'bg-gray-50', 'text-gray-600',
            'dark:border-white/10', 'dark:bg-white/10', 'dark:text-gray-200'
        );
        downButton.style.cssText = "display: flex; align-items: center; justify-content: center; background-color: var(--main-surface-tertiary); color: var(--text-primary); opacity: 0.8; width: 25.33px; height: 25.33px; border-radius: 50%; position: fixed; top: 228px; right: 26px; z-index: 10000; transition: opacity 1s;";
        downButton.id = 'downButton';

        downButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-2xl" style="transform: scale(0.75);">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M16.8081 23.0938C16.3618 23.5402 15.6381 23.5402 15.1918 23.0938L10.049 17.951C9.60265 17.5047 9.60265 16.7811 10.049 16.3348C10.4953 15.8884 11.219 15.8884 11.6653 16.3348L14.8571 19.5266V9.71429C14.8571 9.0831 15.3688 8.57143 15.9999 8.57143C16.6311 8.57143 17.1428 9.0831 17.1428 9.71429V19.5266L20.3347 16.3348C20.781 15.8884 21.5046 15.8884 21.9509 16.3348C22.3972 16.7811 22.3972 17.5047 21.9509 17.951L16.8081 23.0938Z" fill="currentColor"></path>
            </svg>
        `;

        downButton.onclick = function () {
            goDownOneMessage(downButton);
        };

        downButton.addEventListener('mouseover', () => {
            downButton.style.opacity = "1";
        });

        downButton.addEventListener('mouseleave', () => {
            downButton.style.transition = "opacity 1s";
            downButton.style.opacity = "0.2";
        });

        setTimeout(() => {
            downButton.style.transition = "opacity 1s";
            downButton.style.opacity = "0.2";
        }, 3500);

        return downButton;
    }


    function feedbackAnimation(button) {
        // Reset any ongoing transitions to ensure a clean start
        button.style.transition = "none";
        button.style.opacity = "1"; // Full opacity immediately
        button.style.transform = "scale(0.8)"; // Shrink for feedback effect

        // Delay to allow the scale and opacity changes to settle
        setTimeout(() => {
            button.style.transition = "transform 0.2s, opacity 2s"; // Add transitions
            button.style.transform = "scale(1)"; // Restore size
            button.style.opacity = "0.2"; // Gradually fade to low opacity
        }, 100); // Start fading and scaling after a brief delay
    }

    chrome.storage.sync.get(null, function (data) {
        applyVisibilitySettings(data);
        const upButton = createScrollUpButton();
        const downButton = createScrollDownButton();
        appendWithFragment(document.body, upButton, downButton);
    });



    // ======================================================
    // ==== @note Click Buried Button Shared helpers ========

    const DELAYS = {
        afterPlusClick: 50,
        beforeSubmenuInteract: 50,
        betweenKeyAttempts: 15,
        afterSubmenuOpen: 50,
        beforeFinalClick: 300
    };

    const PLUS_BTN_SEL = '[data-testid="composer-plus-btn"]';

    // "More" submenu trigger (match by icon path, not text)
    const MORE_ICON_PATH_PREFIX = 'M15.498 8.50159';
    const MORE_TRIGGER_SEL =
        `div[role="menuitem"][aria-haspopup="menu"] svg path[d^="${MORE_ICON_PATH_PREFIX}"]`;
    
    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    const flashBorder = (el) => {
        const tertiary = getComputedStyle(document.documentElement)
            .getPropertyValue('--main-surface-tertiary').trim() || '#888';
        const row = el.closest('div[class*="group-hover/turn-messages"]') || el.parentElement;
        row?.classList.add('force-full-opacity');
        if (window.gsap) {
            gsap.timeline({
                onComplete: () => {
                    gsap.set(el, { clearProps: 'boxShadow,scale' });
                    row?.classList.remove('force-full-opacity');
                }
            })
                .fromTo(
                    el,
                    { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1 },
                    { boxShadow: `0 0 0 3px ${tertiary}`, scale: .95, duration: 0.25, ease: 'power2.out' }
                )
                .to(
                    el,
                    { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1, duration: 0.30, ease: 'power2.in' }
                );
        }
    };

    const smartClick = (el) => {
        if (!el) return;
        try {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dispatch = (type, Ctor) => {
                try {
                    el.dispatchEvent(new Ctor(type, {
                        bubbles: true, cancelable: true, composed: true, clientX: cx, clientY: cy
                    }));
                } catch { /* ignore */ }
            };
            if ('PointerEvent' in window) {
                dispatch('pointerover', PointerEvent);
                dispatch('pointerenter', PointerEvent);
                dispatch('pointerdown', PointerEvent);
            }
            dispatch('mouseover', MouseEvent);
            dispatch('mouseenter', MouseEvent);
            dispatch('mousedown', MouseEvent);
            el.click();
            dispatch('mouseup', MouseEvent);
            if ('PointerEvent' in window) {
                dispatch('pointerup', PointerEvent);
                dispatch('pointerout', PointerEvent);
                dispatch('pointerleave', PointerEvent);
            }
        } catch {
            try { el.click(); } catch { /* ignore */ }
        }
    };

    const sendKey = (el, key, code = key, keyCode = 0) => {
        const opts = {
            key, code, keyCode, which: keyCode || undefined,
            bubbles: true, cancelable: true, composed: true
        };
        try { el.dispatchEvent(new KeyboardEvent('keydown', opts)); } catch { }
        try { el.dispatchEvent(new KeyboardEvent('keyup', opts)); } catch { }
    };

    const waitFor = async (getter, { timeout = 3000, interval = 50 } = {}) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const res = getter();
            if (res) return res;
            await sleep(interval);
        }
        return null;
    };

    // Return ALL open Radix menus (main + any submenu), sorted left->right (LTR) / top->bottom fallback
    const getOpenMenus = () => {
        const menus = Array.from(document.querySelectorAll('[role="menu"][data-radix-menu-content][data-state="open"]'));
        return menus.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            // Prefer horizontal ordering (submenu is usually to the right)
            if (Math.abs(ra.left - rb.left) > 4) return ra.left - rb.left;
            return ra.top - rb.top;
        });
    };

    const openSubmenu = async (triggerEl, delays = DELAYS) => {
        if (!triggerEl) return null;

        const ariaControls = triggerEl.getAttribute('aria-controls') || '';
        const submenuId = ariaControls ? ariaControls : null;

        flashBorder(triggerEl);
        await sleep(delays.beforeSubmenuInteract);

        try { triggerEl.focus({ preventScroll: true }); } catch { }

        const hover = (type, Ctor) => {
            try {
                const rect = triggerEl.getBoundingClientRect();
                triggerEl.dispatchEvent(new Ctor(type, {
                    bubbles: true, cancelable: true, composed: true,
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2
                }));
            } catch { /* ignore */ }
        };
        if ('PointerEvent' in window) {
            hover('pointerover', PointerEvent);
            hover('pointerenter', PointerEvent);
            hover('pointermove', PointerEvent);
        }
        hover('mouseover', MouseEvent);
        hover('mouseenter', MouseEvent);
        hover('mousemove', MouseEvent);

        sendKey(triggerEl, 'ArrowRight', 'ArrowRight', 39);

        await sleep(delays.betweenKeyAttempts);
        if (triggerEl.getAttribute('aria-expanded') !== 'true') {
            sendKey(triggerEl, 'Enter', 'Enter', 13);
            await sleep(delays.betweenKeyAttempts);
        }
        if (triggerEl.getAttribute('aria-expanded') !== 'true') {
            sendKey(triggerEl, ' ', 'Space', 32);
            await sleep(delays.betweenKeyAttempts);
        }

        if (triggerEl.getAttribute('aria-expanded') !== 'true') {
            smartClick(triggerEl);
        }

        const submenuEl = await waitFor(() => {
            if (submenuId) {
                const el = document.getElementById(submenuId);
                if (el && el.getAttribute('data-state') === 'open') return el;
            }
            const open = getOpenMenus();
            return open.length ? open[open.length - 1] : null;
        }, { timeout: 2000 });

        return submenuEl;
    };

    const openComposerMenuAndMore = async (delays = DELAYS) => {
        const composer = document.querySelector('form[data-type="unified-composer"]');
        const plusBtn =
            (composer && composer.querySelector(PLUS_BTN_SEL)) ||
            document.querySelector(PLUS_BTN_SEL);

        if (!plusBtn) return false;

        flashBorder(plusBtn);
        smartClick(plusBtn);

        await waitFor(() => getOpenMenus().length > 0, { timeout: 1500 });
        await sleep(delays.afterPlusClick);

        let menus = getOpenMenus();
        let topMenu = menus[menus.length - 1];

        const moreTrigger = await waitFor(() => {
            menus = getOpenMenus();
            topMenu = menus[menus.length - 1];
            if (!topMenu) return null;
            const path = topMenu.querySelector(MORE_TRIGGER_SEL);
            if (path) return path.closest('div[role="menuitem"][aria-haspopup="menu"]');
            return topMenu.querySelector('div[role="menuitem"][aria-haspopup="menu"]');
        }, { timeout: 2000 });

        if (moreTrigger) {
            await openSubmenu(moreTrigger, delays);
            await sleep(delays.afterSubmenuOpen);
        }

        return true;
    };

    const findMenuItemByPath = (iconPathPrefix) => {
        // Match both menuitem and menuitemradio for maximum compatibility
        const sel = `div[role="menuitem"], div[role="menuitemradio"]`;
        for (const menu of getOpenMenus()) {
            // Find all possible menu items
            const items = Array.from(menu.querySelectorAll(sel));
            // For each item, check if its icon matches the prefix
            for (const item of items) {
                const path = item.querySelector(`svg path[d^="${iconPathPrefix}"]`);
                if (path) return item;
            }
        }
        return null;
    };


    const runActionByIcon = async (iconPathPrefix, delays = DELAYS) => {
        const opened = await openComposerMenuAndMore(delays);
        if (!opened) return;
        const item = await waitFor(() => findMenuItemByPath(iconPathPrefix), { timeout: 2500 });
        if (!item) return;
        flashBorder(item);
        await sleep(delays.beforeFinalClick);
        smartClick(item);
    };

    // ==== End Buried Button Shared helpers ================
    // ======================================================


    // ======================================================
    // ==== Exposed Button Click Shared helpers ============
    // Click a directly-visible button by SVG icon path prefix (no menus involved)
    // Click a directly-visible button by SVG icon path prefix (no menus involved)
    const clickExposedIconButton = async (
        iconPathPrefix,
        {
            timeout = 2000,
            interval = 50,
            delays = DELAYS,
            root = document,
            pick = (paths) => paths[0] // customize if multiple matches
        } = {}
    ) => {
        const pathSelector = `svg path[d^="${iconPathPrefix}"]`;

        const getClickableAncestor = (node) => {
            const isClickable = (el) =>
                el &&
                (typeof el.click === 'function') &&
                (
                    el.tagName === 'BUTTON' ||
                    el.tagName === 'A' ||
                    el.getAttribute('role') === 'button' ||
                    el.tabIndex >= 0
                );
            let el = node;
            for (let i = 0; i < 8 && el; i++) {
                if (isClickable(el)) return el;
                el = el.parentElement;
            }
            return null;
        };

        const ensureVisible = (el) => {
            try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch { }
        };

        const target = await waitFor(() => {
            const paths = Array.from(root.querySelectorAll(pathSelector));
            if (!paths.length) return null;
            const chosenPath = pick(paths) || paths[0];
            return getClickableAncestor(chosenPath);
        }, { timeout, interval });

        if (!target) return;

        ensureVisible(target);
        flashBorder(target);
        await sleep(delays.beforeFinalClick);
        smartClick(target);
    };



    // ==== End Exposed Button Click Shared helpers =========
    // ======================================================

    



    // @note Keyboard shortcut defaults
    chrome.storage.sync.get(['shortcutKeyScrollUpOneMessage', 'shortcutKeyScrollDownOneMessage', 'shortcutKeyCopyLowest', 'shortcutKeyEdit', 'shortcutKeySendEdit', 'shortcutKeyCopyAllResponses', 'shortcutKeyCopyAllCodeBlocks', 'shortcutKeyClickNativeScrollToBottom', 'shortcutKeyScrollToTop', 'shortcutKeyNewConversation', 'shortcutKeySearchConversationHistory', 'shortcutKeyToggleSidebar', 'shortcutKeyActivateInput', 'shortcutKeySearchWeb', 'shortcutKeyPreviousThread', 'shortcutKeyNextThread', 'selectThenCopy', 'shortcutKeyToggleSidebarFoldersButton', 'shortcutKeyClickSendButton', 'shortcutKeyClickStopButton', 'shortcutKeyToggleModelSelector', 'shortcutKeyRegenerate', 'altPageUp', 'altPageDown', 'shortcutKeyTemporaryChat', 'shortcutKeyStudy', 'shortcutKeyCreateImage', 'shortcutKeyToggleCanvas', 'shortcutKeyToggleDictate', 'shortcutKeyCancelDictation', 'shortcutKeyShare', 'shortcutKeyThinkLonger', 'shortcutKeyAddPhotosFiles'], (data) => {
        const shortcutDefaults = {
            shortcutKeyScrollUpOneMessage: 'a',
            shortcutKeyScrollDownOneMessage: 'f',
            shortcutKeyCopyLowest: 'c',
            shortcutKeyEdit: 'e',
            shortcutKeySendEdit: 'd',
            shortcutKeyCopyAllResponses: '[',
            shortcutKeyCopyAllCodeBlocks: ']',
            shortcutKeyClickNativeScrollToBottom: 'z',
            shortcutKeyScrollToTop: 't',
            shortcutKeyNewConversation: 'n',
            shortcutKeySearchConversationHistory: 'k',
            shortcutKeyToggleSidebar: 's',
            shortcutKeyActivateInput: 'w',
            shortcutKeySearchWeb: 'q',
            shortcutKeyPreviousThread: 'j',
            shortcutKeyNextThread: ';',
            selectThenCopy: 'x',
            shortcutKeyToggleSidebarFoldersButton: '',
            shortcutKeyClickSendButton: 'Enter',
            shortcutKeyClickStopButton: 'Backspace',
            shortcutKeyToggleModelSelector: '/',
            shortcutKeyRegenerate: 'r',
            altPageUp: 'PageUp',
            altPageDown: 'PageDown',
            shortcutKeyTemporaryChat: 'p',
            shortcutKeyStudy: '',
            shortcutKeyCreateImage: '',
            shortcutKeyToggleCanvas: '',
            shortcutKeyToggleDictate: '',
            shortcutKeyCancelDictation: '',
            shortcutKeyShare: '',
            shortcutKeyThinkLonger: '',
            shortcutKeyAddPhotosFiles: '',
        };

        const shortcuts = {};
        for (const key in shortcutDefaults) {
            shortcuts[key] = data[key] || shortcutDefaults[key];
        }

        const modelToggleKey = shortcuts.shortcutKeyToggleModelSelector.toLowerCase();

        const isMac = isMacPlatform();

        function splitByCodeFences(text) {
            const lines = text.split(/\r?\n/);
            const fences = [];
            for (let i = 0; i < lines.length; ++i) {
                // Accept up to 3 spaces before the fence
                const m = lines[i].match(/^ {0,3}([`~]{3,})([^\n]*)$/);
                if (m) {
                    fences.push({ line: i, char: m[1][0], len: m[1].length, raw: m[1], info: m[2] });
                }
            }

            let regions = [];
            let lastLine = 0;
            let i = 0;
            while (i < fences.length) {
                const open = fences[i];
                let closeIdx = -1;
                for (let j = i + 1; j < fences.length; ++j) {
                    if (
                        fences[j].char === open.char &&
                        fences[j].len === open.len
                    ) {
                        closeIdx = j;
                        break;
                    }
                }
                if (closeIdx > -1) {
                    if (open.line > lastLine) {
                        regions.push({
                            text: lines.slice(lastLine, open.line).join('\n') + '\n',
                            isCode: false
                        });
                    }
                    regions.push({
                        text: lines.slice(open.line, fences[closeIdx].line + 1).join('\n') + '\n',
                        isCode: true
                    });
                    lastLine = fences[closeIdx].line + 1;
                    i = closeIdx + 1;
                } else {
                    break;
                }
            }
            if (lastLine < lines.length) {
                regions.push({
                    text: lines.slice(lastLine).join('\n'),
                    isCode: false
                });
            }
            return regions;
        }

        function stripMarkdownOutsideCodeblocks(text) {
            return splitByCodeFences(text)
                .map(seg => seg.isCode ? seg.text : removeMarkdown(seg.text))
                .join('');
        }
        function removeMarkdown(text) {
            return text
                // ── BACKTICKS FIXES ─────────────────────────────────────────────────────────────

                // 0) Backticks at end of non-empty line → move to new line
                .replace(/([^\n`]+?)\s*`{3,}(\s*\S*)?$/gm, "$1\n```$2")

                // 1) 3+ backticks anywhere after text → break before them
                .replace(/([^\n])\s*`{3,}/g, "$1\n```")

                // 2) Line with 3+ backticks only (plus optional space) → normalize to ```
                .replace(/^[ \t]*`{3,}\s*$/gm, "```")

                // 3) 3+ backticks at start with trailing content → isolate backticks
                .replace(/^[ \t]*`{3,}\s*(\S.*)$/gm, "```\n$1")

                // ── REMAINDER (unchanged) ────────────────────────────────────────────────────────

                .replace(/([^\n~]+?)\s*(~{4,})(\s*)$/gm, "$1\n$2")
                .replace(/^(\s*)[\*\-\+]\s+/gm, "$1- ")
                .replace(/(\*\*|__)(.*?)\1/g, "$2")
                .replace(/(\*|_)(.*?)\1/g, "$2")
                .replace(/^#{1,6}\s+(.*)/gm, "$1")
                .replace(/^(\s*)(\d+)\.\s+(.*)/gm, "$1$2. $3")
                .replace(/\n{3,}/g, "\n\n")
                .replace(/\\(?=~)/g, "")
                .replace(/\(\[.*?\]\[(.*?)\]\)/g, "[$1]")
                .replace(/^(\[1\]: http.*)$/m, "\n---\nSources:\n$1")
                .replace(/\\(?=&)/g, "")
                .replace(/\[[^\]]+?\]\[(\d{1,2})\]/g, "[$1]")
                .replace(/\]\s*,\s*\[/g, "] [")
                .trim();
        }


        // Define the mappings for Ctrl+Key shortcuts dynamically
        const keyFunctionMappingCtrl = {
            Enter: () => {
                try {
                    document.querySelector('button[data-testid="send-button"]')?.click();
                } catch (e) {
                    console.error('Enter handler failed:', e);
                }
            },
            Backspace: () => {
                try {
                    document.querySelector('button[data-testid="stop-button"]')?.click();
                } catch (e) {
                    console.error('Backspace handler failed:', e);
                }
            }
        };

        let dictateInProgress = false;



        // @note Alt Key Function Maps
        const keyFunctionMappingAlt = {
            [shortcuts.shortcutKeyScrollUpOneMessage]: () => {
                const upButton = document.getElementById('upButton');
                if (upButton) {
                    upButton.click();
                    // feedbackAnimation is already called inside the click handler, so this is redundant.
                } else {
                    goUpOneMessage(); // Call the scroll function directly, no feedback since no button.
                }
            },
            [shortcuts.shortcutKeyScrollDownOneMessage]: () => {
                const downButton = document.getElementById('downButton');
                if (downButton) {
                    downButton.click(); // feedback is triggered in the click handler
                } else {
                    goDownOneMessage(); // function is available even when button is hidden
                }
            },
            [shortcuts.shortcutKeyCopyAllResponses]: copyAll,
            [shortcuts.shortcutKeyCopyAllCodeBlocks]: copyCode,
            [shortcuts.shortcutKeyCopyLowest]: () => {
                const copyPath = 'M12.668 10.667C12.668';

                const flashBorder = el => {
                    const tertiary = getComputedStyle(document.documentElement)
                        .getPropertyValue('--main-surface-tertiary').trim() || '#888';

                    const row = el.closest('div[class*="group-hover/turn-messages"]');
                    row?.classList.add('force-full-opacity');

                    gsap.timeline({
                        onComplete: () => {
                            gsap.set(el, { clearProps: 'boxShadow,scale' });
                            row?.classList.remove('force-full-opacity');
                        }
                    })
                        .fromTo(
                            el,
                            { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1 },
                            { boxShadow: `0 0 0 3px ${tertiary}`, scale: 0.95, duration: 0.25, ease: 'power2.out' }
                        )
                        .to(
                            el,
                            { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1, duration: 0.30, ease: 'power2.in' }
                        );
                };

                // Find the correct button
                const visibleButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                    if (!btn.querySelector(`svg path[d^="${copyPath}"]`)) return false;
                    const r = btn.getBoundingClientRect();
                    return (
                        r.top >= 0 && r.left >= 0 &&
                        r.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                        r.right <= (window.innerWidth || document.documentElement.clientWidth)
                    );
                });
                if (!visibleButtons.length) return;

                const btn = visibleButtons.at(-1); // actually assign btn!
                const isMsgCopy = btn.getAttribute('data-testid') === 'copy-turn-action-button';

                if (window.gsap) flashBorder(btn);

                setTimeout(() => {
                    btn.click();
                    setTimeout(() => {
                        if (!navigator.clipboard) return;
                        navigator.clipboard.readText()
                            .then(text => {
                                const trimmed = text.trim();
                                if (/^```[\s\S]*```$/.test(trimmed)) return navigator.clipboard.writeText(text);
                                if (isMsgCopy && typeof window.removeMarkdownOnCopyCheckbox !== 'undefined' && window.removeMarkdownOnCopyCheckbox && typeof stripMarkdownOutsideCodeblocks === 'function') {
                                    const cleaned = stripMarkdownOutsideCodeblocks(text);
                                    return navigator.clipboard.writeText(cleaned);
                                }
                                return navigator.clipboard.writeText(text);
                            })
                            .catch(() => {/* silent */ });
                    }, 350); // <-- 350ms after click, for robustness
                }, 350); // <-- This is your GSAP animation duration

                // Remove duplicate setTimeout at 100ms!
            },
            // @note Edit Shortucut
            [shortcuts.shortcutKeyEdit]: () => {
                const flashBorder = el => {
                    const tertiary = getComputedStyle(document.documentElement)
                        .getPropertyValue('--main-surface-tertiary').trim() || '#888';
                    const row = el.closest('div[class*="group-hover/turn-messages"]') || el.parentElement;
                    row?.classList.add('force-full-opacity');
                    if (window.gsap) {
                        gsap.timeline({
                            onComplete: () => {
                                gsap.set(el, { clearProps: 'boxShadow,scale' });
                                row?.classList.remove('force-full-opacity');
                            }
                        })
                            .fromTo(
                                el,
                                { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1 },
                                { boxShadow: `0 0 0 3px ${tertiary}`, scale: 0.95, duration: 0.15, ease: 'power2.out' }
                            )
                            .to(
                                el,
                                { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1, duration: 0.2, ease: 'power2.in' }
                            );
                    }
                };

                // always scroll to center if possible, clamp if not
                const gsapScrollToCenterAndClick = (button) => {
                    if (!button) return;
                    const container = (typeof getScrollableContainer === 'function') ? getScrollableContainer() : window;

                    // Compute target center scroll position
                    const rect = button.getBoundingClientRect();
                    const contRect = (container === window)
                        ? { top: 0, height: window.innerHeight }
                        : { top: container.getBoundingClientRect().top, height: container.clientHeight };

                    const offsetCenter = contRect.height / 2 - rect.height / 2;
                    let targetY = (container === window)
                        ? window.scrollY + rect.top - offsetCenter
                        : container.scrollTop + (rect.top - contRect.top) - offsetCenter;

                    // Clamp scroll position to valid scroll range
                    const maxScroll = (container === window)
                        ? document.documentElement.scrollHeight - window.innerHeight
                        : container.scrollHeight - container.clientHeight;
                    targetY = Math.max(0, Math.min(targetY, maxScroll));

                    const scrollAndAnimate = () => {
                        if (!window.gsap) {
                            // fallback: instant scroll + click
                            if (container === window) {
                                window.scrollTo(0, targetY);
                            } else {
                                container.scrollTop = targetY;
                            }
                            setTimeout(() => button.click(), 150);
                            return;
                        }
                        gsap.to(container, {
                            duration: 0.6,
                            scrollTo: { y: targetY, autoKill: true },
                            ease: "power4.out",
                            onComplete: () => {
                                flashBorder(button);
                                setTimeout(() => button.click(), 250);
                            }
                        });
                    };

                    scrollAndAnimate();
                };

                setTimeout(() => {
                    try {
                        // --- Find all edit buttons as in 111 ---
                        const allButtons = Array.from(
                            document.querySelectorAll('button svg path[d^="M11.3312 3.56837C12.7488"]')
                        ).map(svgPath => svgPath.closest('button'));

                        const composerBackground = document.getElementById('composer-background');
                        const composerRect = composerBackground ? composerBackground.getBoundingClientRect() : null;

                        // Collect button + rect details, filter out any null/undefined
                        const buttonsData = allButtons
                            .filter(btn => btn !== null)
                            .map(btn => {
                                const rect = btn.getBoundingClientRect();
                                return { btn, rect };
                            });

                        // Exclude buttons that overlap the composer (if composerRect exists)
                        const filteredButtonsData = buttonsData.filter(({ rect }) => {
                            if (!composerRect) return true;
                            const overlapsComposer = (
                                rect.bottom > composerRect.top &&
                                rect.top < composerRect.bottom &&
                                rect.right > composerRect.left &&
                                rect.left < composerRect.right
                            );
                            return !overlapsComposer;
                        });

                        // Sort by rect.top ascending (top-most first, bottom-most last)
                        filteredButtonsData.sort((a, b) => a.rect.top - b.rect.top);

                        // Check which buttons are fully or partially in the current viewport
                        const inViewport = filteredButtonsData.filter(({ rect }) => (
                            rect.bottom > 0 &&
                            rect.right > 0 &&
                            rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
                            rect.left < (window.innerWidth || document.documentElement.clientWidth)
                        ));

                        let targetButton = null;
                        if (inViewport.length > 0) {
                            // If there's at least one button in the viewport, pick the bottom-most one
                            const target = inViewport.reduce((bottomMost, current) =>
                                current.rect.top > bottomMost.rect.top ? current : bottomMost
                            );
                            targetButton = target.btn;
                        } else {
                            // No button in viewport: scroll up to and center the next higher button
                            // (highest button that is still above the viewport)
                            const aboveViewport = filteredButtonsData.filter(({ rect }) => rect.bottom < 0);

                            if (aboveViewport.length > 0) {
                                // Among those above the viewport, pick the one closest to the viewport
                                // i.e. the one with the largest rect.bottom
                                const target = aboveViewport.reduce((closest, current) =>
                                    current.rect.bottom > closest.rect.bottom ? current : closest
                                );
                                targetButton = target.btn;
                            }
                            // If there's none above the viewport, we've likely hit the top; do nothing
                        }

                        if (targetButton) {
                            gsapScrollToCenterAndClick(targetButton);
                        }
                    } catch (e) {
                        // Silent fail
                    }
                }, 50);
            },

            [shortcuts.shortcutKeySendEdit]: () => {
                const flashBorder = el => {
                    const tertiary = getComputedStyle(document.documentElement)
                        .getPropertyValue('--main-surface-tertiary').trim() || '#888';
                    const row = el.closest('div[class*="group-hover/turn-messages"]') || el.parentElement;
                    row?.classList.add('force-full-opacity');
                    if (window.gsap) {
                        gsap.timeline({
                            onComplete: () => {
                                gsap.set(el, { clearProps: 'boxShadow,scale' });
                                row?.classList.remove('force-full-opacity');
                            }
                        })
                            .fromTo(
                                el,
                                { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1 },
                                { boxShadow: `0 0 0 3px ${tertiary}`, scale: 0.95, duration: 0.25, ease: 'power2.out' }
                            )
                            .to(
                                el,
                                { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1, duration: 0.30, ease: 'power2.in' }
                            );
                    }
                };

                try {
                    // Find all possible send buttons (second button in each container)
                    const sendButtons = Array.from(
                        document.querySelectorAll('div.flex.justify-end.gap-2')
                    ).map(container => {
                        const buttons = container.querySelectorAll('button');
                        return buttons.length >= 2 ? buttons[1] : null;
                    }).filter(Boolean);

                    // Only those visible in the viewport
                    const visibleSendButtons = sendButtons.filter(btn => {
                        const rect = btn.getBoundingClientRect();
                        return (
                            rect.top >= 0 &&
                            rect.left >= 0 &&
                            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                        );
                    });

                    if (!visibleSendButtons.length) return;

                    // The lowest visible one (last in DOM order)
                    const btn = visibleSendButtons.at(-1);

                    if (window.gsap) flashBorder(btn);
                    setTimeout(() => {
                        btn.click();
                    }, 500);
                } catch (e) {
                    // Fail silently
                }
            },
            [shortcuts.shortcutKeyNewConversation]: function newConversation() {
                // 1) Fire the native “New Chat” shortcut first (Ctrl/Cmd + Shift + O)
                const isMac = isMacPlatform();
                const eventInit = {
                    key: 'o',
                    code: 'KeyO',
                    keyCode: 79,
                    which: 79,
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    shiftKey: true,
                    ctrlKey: !isMac,
                    metaKey: isMac
                };
                document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
                document.dispatchEvent(new KeyboardEvent('keyup', eventInit));

                // 2) If that worked, we’re done.
                return;

                // 3) —never reached— legacy fallbacks for super‑old UIs:
                //    click a test‑ID if present, else SVG‑path match.
                const direct = document.querySelector('button[data-testid="new-chat-button"]');
                if (direct?.offsetParent !== null) {
                    direct.click();
                    return;
                }

                const selectors = [
                    'button:has(svg > path[d^="M15.6729 3.91287C16.8918"])',
                    'button:has(svg > path[d^="M15.673 3.913a3.121 3.121 0 1 1 4.414 4.414"])'
                ];
                for (const sel of selectors) {
                    const btn = document.querySelector(sel);
                    if (btn?.offsetParent !== null) {
                        btn.click();
                        return;
                    }
                }
            },
            [shortcuts.shortcutKeySearchConversationHistory]: () => {
                // 1) Fire the native “Search Conversation History” shortcut first (Ctrl/Cmd + K)
                const isMac = isMacPlatform();
                const eventInit = {
                    key: 'k',
                    code: 'KeyK',
                    keyCode: 75,
                    which: 75,
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    shiftKey: false,
                    ctrlKey: !isMac,
                    metaKey: isMac,
                    altKey: false
                };
                document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
                document.dispatchEvent(new KeyboardEvent('keyup', eventInit));

                // 2) Done—ChatGPT’s handler will have opened the search UI
                return;

                // 3a) Direct click on test‑ID button
                const direct = document.querySelector('button[data-testid="search-conversation-button"]');
                if (direct?.offsetParent !== null) {
                    direct.click();
                    return;
                }

                // 3b) SVG‑path hack for really old versions
                const path = document.querySelector('button svg path[d^="M10.75 4.25C7.16015"]');
                const btn = path?.closest('button');
                if (btn?.offsetParent !== null) {
                    const orig = btn.style.cssText;
                    btn.style.cssText += 'visibility: visible; display: block; position: absolute; top: 0; left: 0;';
                    btn.click();
                    btn.style.cssText = orig;
                    return;
                }
            },
            [shortcuts.shortcutKeyClickNativeScrollToBottom]: () => { // native scroll to bottom
                const el = getScrollableContainer();
                if (!el) return;

                gsap.to(el, {
                    duration: 0.6,
                    scrollTo: { y: "max" },
                    ease: "power4.out"
                });
            },
            [shortcuts.shortcutKeyScrollToTop]: () => { // native scroll to top
                const el = getScrollableContainer();
                if (!el) return;

                gsap.to(el, {
                    duration: 0.6,
                    scrollTo: { y: 0 },
                    ease: "power4.out"
                });
            },
            // @note Toggle Sidebar Function
            [shortcuts.shortcutKeyToggleSidebar]: function toggleSidebar() {
                // —— Directional snap logic ——
                const slimBarEl = document.getElementById('stage-sidebar-tiny-bar');
                const largeSidebarEl = document.querySelector('aside#stage-sidebar:not([inert]):not(.pointer-events-none)');
                if (window._fadeSlimSidebarEnabled && slimBarEl && !largeSidebarEl) {
                    window.hideSlimSidebarBarInstant();
                } else if (window._fadeSlimSidebarEnabled && slimBarEl && largeSidebarEl) {
                    window.flashSlimSidebarBar();
                }


                // —— Existing toggle logic ——
                const isMac = isMacPlatform();
                const eventInit = {
                    key: 's',
                    code: 'KeyS',
                    keyCode: 83,
                    which: 83,
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    shiftKey: true,
                    ctrlKey: !isMac,
                    metaKey: isMac
                };

                // 1) Try native keyboard toggle
                document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
                document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
                if (document.querySelector('button[data-testid="close-sidebar-button"]')?.offsetParent !== null) {
                    setTimeout(() => { }, 30);
                    return;
                }

                // 2) Fallback: direct open/close button
                const direct = document.querySelector(
                    'button[data-testid="open-sidebar-button"], button[data-testid="close-sidebar-button"]'
                );
                if (direct?.offsetParent !== null) {
                    direct.click();
                    setTimeout(() => { }, 30);
                    return;
                }

                // 3) Final fallback: legacy SVG-path selectors
                const selectors = [
                    '#bottomBarContainer button:has(svg > path[d^="M8.85719 3H15.1428C16.2266 2.99999"])',
                    '#bottomBarContainer button:has(svg > path[d^="M8.85719 3L13.5"])',
                    '#bottomBarContainer button:has(svg > path[d^="M8.85720 3H15.1428C16.2266"])',
                    '#sidebar-header button:has(svg > path[d^="M8.85719 3H15.1428C16.2266 2.99999"])',
                    '#conversation-header-actions button:has(svg > path[d^="M8.85719 3H15.1428C16.2266"])',
                    '#sidebar-header button:has(svg > path[d^="M8.85719 3L13.5"])',
                    'div.draggable.h-header-height button[data-testid="open-sidebar-button"]',
                    'div.draggable.h-header-height button:has(svg > path[d^="M3 8C3 7.44772 3.44772"])',
                    'button:has(svg > path[d^="M3 8C3 7.44772 3.44772"])',
                    'button[data-testid="close-sidebar-button"]',
                    'button[data-testid="open-sidebar-button"]',
                    'button svg path[d^="M13.0187 7C13.0061"]',
                    'button svg path[d^="M8.85719 3L13.5"]',
                    'button svg path[d^="M3 8C3 7.44772"]',
                    'button svg path[d^="M8.85719 3H15.1428C16.2266"]',
                    'button svg path[d^="M3 6h18M3 12h18M3 18h18"]',
                    'button svg path[d^="M6 6h12M6 12h12M6 18h12"]'
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    const btn = el?.closest('button');
                    if (btn?.offsetParent !== null) {
                        btn.click();
                        setTimeout(() => { }, 30);
                        return;
                    }
                }

                // 4) If still nothing, just exit
                setTimeout(() => { }, 30);
            },
            [shortcuts.shortcutKeyActivateInput]: function activateInput() {
                const selectors = [
                    '#prompt-textarea[contenteditable="true"]',
                    'div[contenteditable="true"][id="prompt-textarea"]',
                    'div.ProseMirror[contenteditable="true"]'
                ];

                for (const selector of selectors) {
                    const inputField = document.querySelector(selector);
                    if (inputField) {
                        inputField.focus();
                        return;
                    }
                }

                // Fallback: trigger the page’s native shortcut (Shift + Escape)
                const eventInit = {
                    key: 'Escape',
                    code: 'Escape',
                    keyCode: 27,
                    which: 27,
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    shiftKey: true,
                    ctrlKey: false,
                    metaKey: false
                };
                document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
                document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
            },
            [shortcuts.shortcutKeySearchWeb]: async () => {
                // Unique config for this action
                const ICON_PATH_PREFIX = 'M10 2.125C14.3492'; // globe icon prefix
                await runActionByIcon(ICON_PATH_PREFIX);
            },
            [shortcuts.shortcutKeyPreviousThread]: (opts = {}) => {
                const SCROLL_ANCHOR_PCT = (typeof window.SCROLL_ANCHOR_PCT === 'number') ? window.SCROLL_ANCHOR_PCT : 80;
                const POST_CLICK_DELAY = 350;

                const getScrollableContainer = (typeof window.getScrollableContainer === 'function')
                    ? window.getScrollableContainer
                    : () => window;

                const composerRect = () => {
                    const el = document.getElementById('composer-background');
                    return el ? el.getBoundingClientRect() : null;
                };

                const scrollToAnchor = (container, target, onComplete) => {
                    if (!window.gsap || !target) return onComplete?.();

                    const rect = target.getBoundingClientRect();
                    const contRect = (container === window)
                        ? { top: 0, height: window.innerHeight }
                        : { top: container.getBoundingClientRect().top, height: container.clientHeight };

                    const anchorPx = (contRect.height * SCROLL_ANCHOR_PCT / 100) - rect.height / 2;
                    const current = (container === window) ? window.scrollY : container.scrollTop;
                    let targetY = (container === window)
                        ? current + rect.top - anchorPx
                        : container.scrollTop + (rect.top - contRect.top) - anchorPx;

                    const maxScroll = (container === window)
                        ? (document.scrollingElement || document.documentElement).scrollHeight - window.innerHeight
                        : container.scrollHeight - container.clientHeight;
                    targetY = Math.max(0, Math.min(targetY, maxScroll));

                    gsap.to(container, {
                        duration: 0.6,
                        scrollTo: { y: targetY, autoKill: false },
                        ease: 'power4.out',
                        onComplete
                    });
                };

                // Check if a button is already at the intended anchor position
                function isButtonCentered(container, btn) {
                    if (!window.gsap || !btn) return false;
                    const rect = btn.getBoundingClientRect();
                    const contRect = (container === window)
                        ? { top: 0, height: window.innerHeight }
                        : { top: container.getBoundingClientRect().top, height: container.clientHeight };

                    const anchorPx = (contRect.height * SCROLL_ANCHOR_PCT / 100) - rect.height / 2;
                    const currentScroll = (container === window) ? window.scrollY : container.scrollTop;
                    const btnTop = (container === window) ? rect.top + window.scrollY : rect.top - contRect.top + container.scrollTop;
                    const targetY = btnTop - anchorPx;
                    const delta = Math.abs(currentScroll - targetY);
                    // 2px threshold for "centered"
                    return delta < 2;
                }

                const flashBorder = el => {
                    if (!el || !window.gsap) return;
                    const tertiary = getComputedStyle(document.documentElement)
                        .getPropertyValue('--main-surface-tertiary').trim() || '#888';
                    const row = el.closest('div[class*="group-hover/turn-messages"]') || el.parentElement;
                    row?.classList.add('force-full-opacity');
                    gsap.timeline({
                        onComplete: () => {
                            gsap.set(el, { clearProps: 'boxShadow,scale' });
                            row?.classList.remove('force-full-opacity');
                        }
                    })
                        .fromTo(el, { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1 },
                            { boxShadow: `0 0 0 3px ${tertiary}`, scale: 0.95, duration: 0.25, ease: 'power2.out' })
                        .to(el, { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1, duration: 0.30, ease: 'power2.in' });
                };

                const getMsgId = btn => btn.closest('[data-message-id]')?.getAttribute('data-message-id');

                const relaunchHover = wrapper => {
                    if (!wrapper) return;
                    wrapper.classList.add('force-hover');
                    ['pointerover', 'pointerenter', 'mouseover']
                        .forEach(evt => wrapper.dispatchEvent(new MouseEvent(evt, { bubbles: true })));
                };

                /* -------- Candidate collection & priority logic -------- */
                const collectCandidates = () => {
                    const divBtns = Array.from(document.querySelectorAll('div.tabular-nums'))
                        .map(el => el.previousElementSibling)
                        .filter(el => el?.tagName === 'BUTTON');
                    const pathBtns = Array.from(document.querySelectorAll('button svg path[d^="M11.5292 3.7793"]'))
                        .map(p => p.closest('button'));
                    return [...divBtns, ...pathBtns].filter(Boolean);
                };

                const isOverlapComposer = rect => {
                    const comp = composerRect();
                    return comp ? !(rect.bottom < comp.top || rect.top > comp.bottom || rect.right < comp.left || rect.left > comp.right) : false;
                };

                // Previous candidate logic
                const chooseTarget = (buttons) => {
                    const scrollY = window.scrollY;
                    const viewH = window.innerHeight;

                    const BOTTOM_BUFFER = 85; // px buffer for occlusion by composer or bottom UI

                    const withMeta = buttons.map(btn => {
                        const rect = btn.getBoundingClientRect();
                        return {
                            btn,
                            rect,
                            absBottom: rect.bottom + scrollY,
                            fullyVisible: rect.top >= 0 && rect.bottom <= (viewH - BOTTOM_BUFFER) && !isOverlapComposer(rect)
                        };
                    });

                    // a) lowest fully visible
                    const fully = withMeta.filter(m => m.fullyVisible);
                    if (fully.length) {
                        return fully.reduce((a, b) => (a.rect.bottom > b.rect.bottom ? a : b)).btn;
                    }

                    // b) just above viewport
                    const above = withMeta.filter(m => m.rect.bottom <= 0);
                    if (above.length) {
                        return above.reduce((a, b) => (a.rect.bottom > b.rect.bottom ? a : b)).btn;
                    }

                    // c) lowest overall
                    return withMeta.reduce((a, b) => (a.absBottom > b.absBottom ? a : b)).btn;
                };

                const recenter = (msgId) => {
                    if (!msgId) return;
                    const container = getScrollableContainer();
                    const target = document.querySelector(`[data-message-id="${msgId}"] button`);
                    if (!target) return;
                    scrollToAnchor(container, target);
                };

                setTimeout(() => {
                    try {
                        const all = collectCandidates();
                        if (!all.length) return;

                        let target = chooseTarget(all);
                        const container = getScrollableContainer();

                        // Only in preview mode: skip already-centered candidate
                        if (opts.previewOnly && target && isButtonCentered(container, target)) {
                            const idx = all.indexOf(target);
                            let found = false;
                            for (let i = idx - 1; i >= 0; --i) {
                                if (!isButtonCentered(container, all[i])) {
                                    target = all[i];
                                    found = true;
                                    break;
                                }
                            }
                            // If not found and at the very top, wrap to the last candidate
                            if (!found && all.length > 1) {
                                target = all[all.length - 1];
                            }
                        }

                        if (!target) return;
                        const msgId = getMsgId(target);

                        scrollToAnchor(container, target, () => {
                            flashBorder(target);
                            relaunchHover(target.closest('[class*="group-hover"]'));

                            if (!opts.previewOnly) {
                                setTimeout(() => {
                                    target.click();
                                    setTimeout(() => recenter(msgId), POST_CLICK_DELAY);
                                }, POST_CLICK_DELAY);
                            }
                        });
                    } catch (_) { /* silent */ }
                }, 50);
            },
            /*──────────────────────────────────────────────────────────────────────────────
             *  NEXT‑THREAD shortcut – tracks ONE specific button through re‑render
             *────────────────────────────────────────────────────────────────────────────*/
            /* Thread‑Navigation “next” shortcut – full drop‑in replacement */
            // Updated "Thread Navigation" shortcut implementation
            // Fulfils mandatory sequence: select‑scroll‑highlight‑click‑pause‑recenter

            // Export / attach to your shortcuts map
            [shortcuts.shortcutKeyNextThread]: (opts = {}) => {
                const SCROLL_ANCHOR_PCT = (typeof window.SCROLL_ANCHOR_PCT === 'number') ? window.SCROLL_ANCHOR_PCT : 80;
                const POST_CLICK_DELAY = 350;

                const getScrollableContainer = (typeof window.getScrollableContainer === 'function')
                    ? window.getScrollableContainer
                    : () => window;

                const composerRect = () => {
                    const el = document.getElementById('composer-background');
                    return el ? el.getBoundingClientRect() : null;
                };

                const scrollToAnchor = (container, target, onComplete) => {
                    if (!window.gsap || !target) return onComplete?.();

                    const rect = target.getBoundingClientRect();
                    const contRect = (container === window)
                        ? { top: 0, height: window.innerHeight }
                        : { top: container.getBoundingClientRect().top, height: container.clientHeight };

                    const anchorPx = (contRect.height * SCROLL_ANCHOR_PCT / 100) - rect.height / 2;
                    const current = (container === window) ? window.scrollY : container.scrollTop;
                    let targetY = (container === window)
                        ? current + rect.top - anchorPx
                        : container.scrollTop + (rect.top - contRect.top) - anchorPx;

                    const maxScroll = (container === window)
                        ? (document.scrollingElement || document.documentElement).scrollHeight - window.innerHeight
                        : container.scrollHeight - container.clientHeight;
                    targetY = Math.max(0, Math.min(targetY, maxScroll));

                    gsap.to(container, {
                        duration: 0.6,
                        scrollTo: { y: targetY, autoKill: false },
                        ease: 'power4.out',
                        onComplete
                    });
                };

                // Check if a button is already at the intended anchor position
                function isButtonCentered(container, btn) {
                    if (!window.gsap || !btn) return false;
                    const rect = btn.getBoundingClientRect();
                    const contRect = (container === window)
                        ? { top: 0, height: window.innerHeight }
                        : { top: container.getBoundingClientRect().top, height: container.clientHeight };

                    const anchorPx = (contRect.height * SCROLL_ANCHOR_PCT / 100) - rect.height / 2;
                    const currentScroll = (container === window) ? window.scrollY : container.scrollTop;
                    const btnTop = (container === window) ? rect.top + window.scrollY : rect.top - contRect.top + container.scrollTop;
                    const targetY = btnTop - anchorPx;
                    const delta = Math.abs(currentScroll - targetY);
                    // 2px threshold for "centered"
                    return delta < 2;
                }

                const flashBorder = el => {
                    if (!el || !window.gsap) return;
                    const tertiary = getComputedStyle(document.documentElement)
                        .getPropertyValue('--main-surface-tertiary').trim() || '#888';
                    const row = el.closest('div[class*="group-hover/turn-messages"]') || el.parentElement;
                    row?.classList.add('force-full-opacity');
                    gsap.timeline({
                        onComplete: () => {
                            gsap.set(el, { clearProps: 'boxShadow,scale' });
                            row?.classList.remove('force-full-opacity');
                        }
                    })
                        .fromTo(el, { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1 },
                            { boxShadow: `0 0 0 3px ${tertiary}`, scale: 0.95, duration: 0.25, ease: 'power2.out' })
                        .to(el, { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1, duration: 0.30, ease: 'power2.in' });
                };

                const getMsgId = btn => btn.closest('[data-message-id]')?.getAttribute('data-message-id');

                const relaunchHover = wrapper => {
                    if (!wrapper) return;
                    wrapper.classList.add('force-hover');
                    ['pointerover', 'pointerenter', 'mouseover']
                        .forEach(evt => wrapper.dispatchEvent(new MouseEvent(evt, { bubbles: true })));
                };

                /* -------- Candidate collection & priority logic -------- */
                const collectCandidates = () => {
                    const divBtns = Array.from(document.querySelectorAll('div.tabular-nums'))
                        .map(el => el.previousElementSibling)
                        .filter(el => el?.tagName === 'BUTTON');
                    const pathBtns = Array.from(document.querySelectorAll('button svg path[d^="M7.52925 3.7793"]'))
                        .map(p => p.closest('button'));

                    // Exclude "Thought for" buttons
                    const isExcluded = btn => {
                        const span = btn.querySelector('span');
                        if (!span) return false;
                        return /^Thought for\b/.test(span.textContent.trim());
                    };

                    return [...divBtns, ...pathBtns]
                        .filter(Boolean)
                        .filter(btn => !isExcluded(btn));
                };

                const isOverlapComposer = rect => {
                    const comp = composerRect();
                    return comp ? !(rect.bottom < comp.top || rect.top > comp.bottom || rect.right < comp.left || rect.left > comp.right) : false;
                };

                // Previous candidate logic
                const chooseTarget = (buttons) => {
                    const scrollY = window.scrollY;
                    const viewH = window.innerHeight;

                    const BOTTOM_BUFFER = 85; // px buffer for occlusion by composer or bottom UI

                    const withMeta = buttons.map(btn => {
                        const rect = btn.getBoundingClientRect();
                        return {
                            btn,
                            rect,
                            absBottom: rect.bottom + scrollY,
                            fullyVisible: rect.top >= 0 && rect.bottom <= (viewH - BOTTOM_BUFFER) && !isOverlapComposer(rect)
                        };
                    });

                    // a) lowest fully visible
                    const fully = withMeta.filter(m => m.fullyVisible);
                    if (fully.length) {
                        return fully.reduce((a, b) => (a.rect.bottom > b.rect.bottom ? a : b)).btn;
                    }

                    // b) just above viewport
                    const above = withMeta.filter(m => m.rect.bottom <= 0);
                    if (above.length) {
                        return above.reduce((a, b) => (a.rect.bottom > b.rect.bottom ? a : b)).btn;
                    }

                    // c) lowest overall
                    return withMeta.reduce((a, b) => (a.absBottom > b.absBottom ? a : b)).btn;
                };

                const recenter = (msgId) => {
                    if (!msgId) return;
                    const container = getScrollableContainer();
                    const target = document.querySelector(`[data-message-id="${msgId}"] button`);
                    if (!target) return;
                    scrollToAnchor(container, target);
                };

                setTimeout(() => {
                    try {
                        const all = collectCandidates();
                        if (!all.length) return;

                        let target = chooseTarget(all);
                        const container = getScrollableContainer();

                        // Only in preview mode: skip already-centered candidate
                        if (opts.previewOnly && target && isButtonCentered(container, target)) {
                            // Find previous candidate that is not centered (just before target)
                            const idx = all.indexOf(target);
                            for (let i = idx - 1; i >= 0; --i) {
                                if (!isButtonCentered(container, all[i])) {
                                    target = all[i];
                                    break;
                                }
                            }
                        }

                        if (!target) return;
                        const msgId = getMsgId(target);

                        scrollToAnchor(container, target, () => {
                            flashBorder(target);
                            relaunchHover(target.closest('[class*="group-hover"]'));

                            if (!opts.previewOnly) {
                                setTimeout(() => {
                                    target.click();
                                    setTimeout(() => recenter(msgId), POST_CLICK_DELAY);
                                }, POST_CLICK_DELAY);
                            }
                        });
                    } catch (_) { /* silent */ }
                }, 50);
            },
            [shortcuts.selectThenCopy]: (() => {
                window.selectThenCopyState = window.selectThenCopyState || {
                    lastSelectedIndex: -1
                };

                const DEBUG = false;

                // === Smart copy helpers (insert once after `const DEBUG = false;`) ===
                function rangeToHTMLAndText(range) {
                    const frag = range.cloneContents();
                    const div = document.createElement('div');
                    div.appendChild(frag);
                    return { html: div.innerHTML, text: div.innerText || div.textContent || '' };
                }

                function fragmentHasSemanticList(html) {
                    const div = document.createElement('div');
                    div.innerHTML = html;
                    // True semantic lists (native or ARIA)
                    return !!div.querySelector('ol, ul, [role="list"], [role="listitem"]');
                }

                async function smartCopyFromRange(range) {
                    const { html, text } = rangeToHTMLAndText(range);
                    const keepHtml = fragmentHasSemanticList(html);

                    if (navigator.clipboard && window.ClipboardItem) {
                        const items = keepHtml
                            ? {
                                'text/html': new Blob([html], { type: 'text/html' }),
                                'text/plain': new Blob([text], { type: 'text/plain' })
                            }
                            : {
                                'text/plain': new Blob([text], { type: 'text/plain' })
                            };
                        try {
                            await navigator.clipboard.write([new ClipboardItem(items)]);
                            return;
                        } catch (_) { /* fall through to fallback */ }
                    }

                    document.addEventListener('copy', (e) => {
                        if (keepHtml) e.clipboardData.setData('text/html', html);
                        e.clipboardData.setData('text/plain', text);
                        e.preventDefault();
                    }, { once: true });

                    document.execCommand('copy');
                }
                // === End smart copy helpers ===


                // Finds the specific message container for the clicked button
                function getTurnFromClick(target) {
                    // 1) Start from button; climb to the nearest [data-message-author-role] container
                    const roleContainer = target.closest('[data-message-author-role]');
                    if (roleContainer) return roleContainer;

                    // 2) Otherwise, fall back to the nearest article and then find a role container inside
                    const article = target.closest('article[data-turn], article[data-testid^="conversation-turn-"]');
                    if (article) {
                        return article.querySelector('[data-message-author-role="assistant"], [data-message-author-role="user"]') || article;
                    }

                    // 3) Last resort: just use the nearest element with role markers
                    return target.closest('[data-message-author-role]') || null;
                }

                // Helper: build a selection bounded by first/last visible text nodes (matches manual drag)
                function doSelectAndCopy(el) {
                    try {
                        const selection = window.getSelection();
                        if (!selection) return;
                        selection.removeAllRanges();

                        const makeTextWalker = (root) =>
                            document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                                acceptNode(node) {
                                    return node.nodeValue && node.nodeValue.trim().length
                                        ? NodeFilter.FILTER_ACCEPT
                                        : NodeFilter.FILTER_SKIP;
                                },
                            });

                        const startWalker = makeTextWalker(el);
                        const startNode = startWalker.nextNode();

                        let endNode = null;
                        if (startNode) {
                            const endWalker = makeTextWalker(el);
                            let n = endWalker.nextNode();
                            while (n) { endNode = n; n = endWalker.nextNode(); }
                        }

                        const range = document.createRange();
                        if (startNode && endNode) {
                            range.setStart(startNode, 0);
                            range.setEnd(endNode, endNode.nodeValue.length);
                        } else {
                            range.selectNodeContents(el);
                        }
                        selection.addRange(range);

                        // Smart copy: only include HTML if the fragment truly contains a semantic list
                        void smartCopyFromRange(range);
                    } catch (err) {
                        if (typeof DEBUG !== 'undefined' && DEBUG) console.debug('doSelectAndCopy failed:', err);
                    }
                }


                // Helper: find the innermost visible text container for a given role container
                function findContentElForTurn(roleContainer) {
                    const isUser = roleContainer.getAttribute('data-message-author-role') === 'user';
                    if (isUser) {
                        return (
                            roleContainer.querySelector('[data-message-author-role="user"] .whitespace-pre-wrap') ||
                            roleContainer.querySelector('[data-message-author-role="user"] .prose, [data-message-author-role="user"] .markdown, [data-message-author-role="user"] .markdown-new-styling') ||
                            roleContainer.querySelector('[data-message-author-role="user"]')
                        );
                    } else {
                        return (
                            roleContainer.querySelector('[data-message-author-role="assistant"] .whitespace-pre-wrap') ||
                            roleContainer.querySelector('[data-message-author-role="assistant"] .prose, [data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"] .markdown-new-styling') ||
                            roleContainer.querySelector('.prose, .markdown, .markdown-new-styling') ||
                            roleContainer.querySelector('[data-message-author-role="assistant"]')
                        );
                    }
                }

                // Attach the click handler once
                if (!window.__selectThenCopyCopyHandlerAttached) {
                    document.addEventListener('click', (e) => {
                        const btn = e.target.closest('[data-testid="copy-turn-action-button"]');
                        if (!btn) return;

                        const roleContainer =
                            btn.closest('[data-message-author-role]') ||
                            (btn.closest('article[data-turn], article[data-testid^="conversation-turn-"]')?.querySelector('[data-message-author-role="assistant"], [data-message-author-role="user"]'));

                        if (!roleContainer) return;

                        const contentEl = findContentElForTurn(roleContainer);
                        if (contentEl && (contentEl.innerText || contentEl.textContent || '').trim()) {
                            doSelectAndCopy(contentEl);
                        }
                    });
                    window.__selectThenCopyCopyHandlerAttached = true;
                }

                return () => {
                    setTimeout(() => {
                        try {
                            const onlySelectAssistant = window.onlySelectAssistantCheckbox || false;
                            const onlySelectUser = window.onlySelectUserCheckbox || false;
                            const disableCopyAfterSelect = window.disableCopyAfterSelectCheckbox || false;

                            const allConversationTurns = Array.from(
                                document.querySelectorAll('article[data-turn], article[data-testid^="conversation-turn-"]')
                            );

                            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

                            const composerRect = (() => {
                                const composer = document.getElementById('composer-background');
                                return composer ? composer.getBoundingClientRect() : null;
                            })();

                            const visibleTurns = allConversationTurns.filter(el => {
                                const rect = el.getBoundingClientRect();
                                const horizontallyVisible = rect.right > 0 && rect.left < viewportWidth;
                                const verticallyVisible = rect.bottom > 0 && rect.top < viewportHeight;
                                if (!(horizontallyVisible && verticallyVisible)) return false;

                                if (composerRect && rect.top >= composerRect.top) return false;

                                return true;
                            });

                            const filteredVisibleTurns = visibleTurns.filter(el => {
                                if (onlySelectAssistant && !el.querySelector('[data-message-author-role="assistant"]')) return false;
                                if (onlySelectUser && !el.querySelector('[data-message-author-role="user"]')) return false;
                                return true;
                            });

                            if (!filteredVisibleTurns.length) return;

                            filteredVisibleTurns.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);

                            const { lastSelectedIndex } = window.selectThenCopyState;
                            const nextIndex = (lastSelectedIndex + 1) % filteredVisibleTurns.length;
                            const selectedTurn = filteredVisibleTurns[nextIndex];
                            if (!selectedTurn) return;

                            selectAndCopyMessage(selectedTurn);
                            window.selectThenCopyState.lastSelectedIndex = nextIndex;

                            function selectAndCopyMessage(turn) {
                                try {
                                    const isUser = !!turn.querySelector('[data-message-author-role="user"]');
                                    const isAssistant = !!turn.querySelector('[data-message-author-role="assistant"]');

                                    if (onlySelectUser && !isUser) return;
                                    if (onlySelectAssistant && !isAssistant) return;

                                    let contentEl = null;

                                    // NEW: prefer the innermost visible text container for the specific turn
                                    if (isUser) {
                                        contentEl =
                                            // 1) Plain text bubbles
                                            turn.querySelector('[data-message-author-role="user"] .whitespace-pre-wrap') ||
                                            // 2) Markdown/prose bubbles
                                            turn.querySelector('[data-message-author-role="user"] .prose, [data-message-author-role="user"] .markdown, [data-message-author-role="user"] .markdown-new-styling') ||
                                            // 3) As a last resort, the role container itself (still much tighter than the whole article)
                                            turn.querySelector('[data-message-author-role="user"]');
                                    } else {
                                        contentEl =
                                            // 1) Plain text bubbles
                                            turn.querySelector('[data-message-author-role="assistant"] .whitespace-pre-wrap') ||
                                            // 2) Markdown/prose bubbles
                                            turn.querySelector('[data-message-author-role="assistant"] .prose, [data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"] .markdown-new-styling') ||
                                            // 3) As a last resort, common prose wrappers inside the turn (but still not the whole article)
                                            turn.querySelector('.prose, .markdown, .markdown-new-styling') ||
                                            // 4) Fallback to the role container
                                            turn.querySelector('[data-message-author-role="assistant"]');
                                    }

                                    if (!contentEl || !contentEl.innerText.trim()) return;

                                    doSelectAndCopy(contentEl);
                                } catch (err) {
                                    if (DEBUG) console.debug('selectAndCopyMessage failed:', err);
                                }
                            }

                            function doSelectAndCopy(el) {
                                try {
                                    const selection = window.getSelection();
                                    if (!selection) return;
                                    selection.removeAllRanges();

                                    // Build a selection bounded by first/last visible text nodes
                                    const makeTextWalker = (root) =>
                                        document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                                            acceptNode(node) {
                                                return node.nodeValue && node.nodeValue.trim().length
                                                    ? NodeFilter.FILTER_ACCEPT
                                                    : NodeFilter.FILTER_SKIP;
                                            },
                                        });

                                    const startWalker = makeTextWalker(el);
                                    const startNode = startWalker.nextNode();

                                    let endNode = null;
                                    if (startNode) {
                                        const endWalker = makeTextWalker(el);
                                        let n = endWalker.nextNode();
                                        while (n) { endNode = n; n = endWalker.nextNode(); }
                                    }

                                    const range = document.createRange();
                                    if (startNode && endNode) {
                                        range.setStart(startNode, 0);
                                        range.setEnd(endNode, endNode.nodeValue.length);
                                    } else {
                                        range.selectNodeContents(el);
                                    }

                                    selection.addRange(range);

                                    // Smart copy: only include HTML if the fragment truly contains a semantic list
                                    void smartCopyFromRange(range);
                                } catch (err) {
                                    if (typeof DEBUG !== 'undefined' && DEBUG) console.debug('doSelectAndCopy failed:', err);
                                }
                            }


                        } catch (err) {
                            if (DEBUG) console.debug('outer selectThenCopy failure:', err);
                        }
                    }, 50);
                };
            })(),
            [shortcuts.shortcutKeyToggleSidebarFoldersButton]: () => {
                try {
                    const btn = window.toggleSidebarFoldersButton;

                    if (
                        btn &&
                        btn.offsetParent !== null // ensures it's visible (not display:none or hidden)
                    ) {
                        btn.click();
                    }
                } catch (error) {
                    // Catch errors silently
                }
            },
            [shortcuts.shortcutKeyToggleModelSelector]: () => {
                window.toggleModelSelector();
            },
            [shortcuts.shortcutKeyRegenerate]: () => {
                const REGEN_BTN_PATH = 'M3.502 16.6663V13.3333C3.502';
                const MENU_BTN_SELECTOR = `button[id^="radix-"] svg path[d^="${REGEN_BTN_PATH}"]`;
                const MENUITEM_SELECTOR = `div[role="menuitem"] svg path[d^="${REGEN_BTN_PATH}"]`;

                const flashBorder = el => {
                    const tertiary = getComputedStyle(document.documentElement)
                        .getPropertyValue('--main-surface-tertiary').trim() || '#888';
                    const row = el.closest('div[class*="group-hover/turn-messages"]') || el.parentElement;
                    row?.classList.add('force-full-opacity');
                    if (window.gsap) {
                        gsap.timeline({
                            onComplete: () => {
                                gsap.set(el, { clearProps: 'boxShadow,scale' });
                                row?.classList.remove('force-full-opacity');
                            }
                        })
                            .fromTo(
                                el,
                                { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1 },
                                { boxShadow: `0 0 0 3px ${tertiary}`, scale: .95, duration: 0.25, ease: 'power2.out' }
                            )
                            .to(
                                el,
                                { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1, duration: 0.30, ease: 'power2.in' }
                            );
                    }
                };

                function isVisible(el) {
                    const r = el.getBoundingClientRect();
                    return (
                        r.top >= 0 &&
                        r.left >= 0 &&
                        r.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                        r.right <= (window.innerWidth || document.documentElement.clientWidth)
                    );
                }

                // Step 1: Find all visible matching menu buttons, pick the lowest one
                const regenBtnPaths = Array.from(document.querySelectorAll(MENU_BTN_SELECTOR));
                const visibleBtns = regenBtnPaths
                    .map(path => path.closest('button'))
                    .filter(btn => btn && isVisible(btn));
                if (!visibleBtns.length) return;
                const lowestMenuBtn = visibleBtns[visibleBtns.length - 1];

                if (window.gsap) flashBorder(lowestMenuBtn);

                // Step 1b: Open menu if not open
                if (lowestMenuBtn.getAttribute('aria-expanded') !== 'true') {
                    lowestMenuBtn.focus();
                    ['keydown', 'keyup'].forEach(type =>
                        lowestMenuBtn.dispatchEvent(
                            new KeyboardEvent(type, {
                                key: ' ',
                                code: 'Space',
                                keyCode: 32,
                                charCode: 32,
                                bubbles: true,
                                cancelable: true,
                                composed: true
                            })
                        )
                    );
                }

                function clickLowestMenuItem(attempt = 0) {
                    const menuItemPaths = Array.from(document.querySelectorAll(MENUITEM_SELECTOR));
                    const visibleMenuItems = menuItemPaths
                        .map(path => path.closest('div[role="menuitem"]'))
                        .filter(item => item && isVisible(item));
                    if (visibleMenuItems.length) {
                        const lowestMenuItem = visibleMenuItems[visibleMenuItems.length - 1];
                        if (window.gsap) flashBorder(lowestMenuItem);
                        setTimeout(() => {
                            lowestMenuItem.click();
                        }, 750);
                        return;
                    }
                    // Retry for up to ~500ms if not found
                    if (attempt < 10) setTimeout(() => clickLowestMenuItem(attempt + 1), 50);
                }

                setTimeout(() => clickLowestMenuItem(), lowestMenuBtn.getAttribute('aria-expanded') === 'true' ? 500 : 700);
            },
            [shortcuts.shortcutKeyTemporaryChat]: () => {
                const sel =
                    '#conversation-header-actions button:has(svg path[d*="4.521"][d*="15.166"]),\
     #conversation-header-actions button:has(svg path[d*="15.799"][d*="14.536"])';
                document.querySelector(sel)?.click();
            },
            [shortcuts.shortcutKeyStudy]: async () => {
                // Unique config for this action
                const ICON_PATH_PREFIX = 'M16.3965 5.01128C16.3963'; // book icon prefix
                await runActionByIcon(ICON_PATH_PREFIX);
            },
            [shortcuts.shortcutKeyCreateImage]: async () => {
                // Unique config for this action
                const ICON_PATH_PREFIX = 'M9.38759 8.53403C10.0712'; // image icon prefix
                await runActionByIcon(ICON_PATH_PREFIX);
            },
            [shortcuts.shortcutKeyToggleCanvas]: async () => {
                // Unique config for this action
                const ICON_PATH_PREFIX = 'M12.0303 4.11328C13.4406'; // canvas icon prefix
                await runActionByIcon(ICON_PATH_PREFIX);
            },
            [shortcuts.shortcutKeyAddPhotosFiles]: async () => {
                const ICON_PATH_PREFIX = 'M4.33496 12.5V7.5C4.33496'; // Add Photos & Files icon path prefix
                await runActionByIcon(ICON_PATH_PREFIX);
            },
            [shortcuts.shortcutKeyToggleDictate]: () => {
                if (dictateInProgress) return;
                dictateInProgress = true;
                setTimeout(() => { dictateInProgress = false; }, 300);

                // Try fallback first (submit dictation)
                const FALLBACK_ICON_PATH_PREFIX = 'M15.4835 4.14551C15.6794';
                const fallbackPath = document.querySelector(`svg path[d^="${FALLBACK_ICON_PATH_PREFIX}"]`);
                if (fallbackPath) {
                    let el = fallbackPath;
                    for (let i = 0; i < 8 && el; i++) {
                        if (
                            el.tagName === 'BUTTON' ||
                            el.tagName === 'A' ||
                            el.getAttribute('role') === 'button' ||
                            el.tabIndex >= 0
                        ) {
                            el.click();
                            return;
                        }
                        el = el.parentElement;
                    }
                    return;
                }

                // Try primary (start dictation)
                const PRIMARY_ICON_PATH_PREFIX = 'M15.7806 10.1963C16.1326';
                const primaryPath = document.querySelector(`svg path[d^="${PRIMARY_ICON_PATH_PREFIX}"]`);
                if (primaryPath) {
                    let el = primaryPath;
                    for (let i = 0; i < 8 && el; i++) {
                        if (
                            el.tagName === 'BUTTON' ||
                            el.tagName === 'A' ||
                            el.getAttribute('role') === 'button' ||
                            el.tabIndex >= 0
                        ) {
                            el.click();
                            return;
                        }
                        el = el.parentElement;
                    }
                }
            },
            [shortcuts.shortcutKeyCancelDictation]: async () => {
                const ICON_PATH_PREFIX = 'M14.2548 4.75488C14.5282'; // cancel dictation icon prefix
                await clickExposedIconButton(ICON_PATH_PREFIX);
            },
            // content.js function (uses exposed-button helper)
            [shortcuts.shortcutKeyShare]: async () => {
                const ICON_PATH_PREFIX = 'M2.66821 12.6663V12.5003C2.66821'; // share icon prefix
                await clickExposedIconButton(ICON_PATH_PREFIX);
            },
            [shortcuts.shortcutKeyThinkLonger]: async () => {
                const ICON_PATH_PREFIX = 'M14.3352 10.0257C14.3352'; // think longer icon prefix
                await clickExposedIconButton(ICON_PATH_PREFIX);
            },
        }; // Close keyFunctionMapping object @note Bottom of keyFunctionMapping

        // Assign the functions to the window object for global access
        window.toggleSidebar = keyFunctionMappingAlt[shortcuts.shortcutKeyToggleSidebar];
        window.newConversation = keyFunctionMappingAlt[shortcuts.shortcutKeyNewConversation];
        window.globalScrollToBottom = keyFunctionMappingAlt[shortcuts.shortcutKeyClickNativeScrollToBottom];


        // Robust helper for all shortcut styles, including number keys!
        function matchesShortcutKey(setting, event) {
            if (!setting || setting === '\u00A0') return false;

            // If it's a single digit, match against key and code for both top-row and numpad
            if (/^\d$/.test(setting)) {
                return event.key === setting ||
                    event.code === `Digit${setting}` ||
                    event.code === `Numpad${setting}`;
            }

            // If the stored value is KeyboardEvent.code style
            const isCodeStyle = /^(Key|Digit|Numpad|Arrow|F\d{1,2}|Backspace|Enter|Escape|Tab|Space|Slash|Minus|Equal|Bracket|Semicolon|Quote|Comma|Period|Backslash)/i.test(setting);
            if (isCodeStyle) {
                // Special handling for numbers saved as "Digit1", "Numpad1"
                if (/^Digit(\d)$/.test(setting) || /^Numpad(\d)$/.test(setting)) {
                    const num = setting.match(/\d/)[0];
                    return event.code === setting || event.key === num;
                }
                // All other codes
                return event.code === setting;
            }

            // Fallback: check event.key, case-insensitive
            return event.key && event.key.toLowerCase() === setting.toLowerCase();
        }

        document.addEventListener('keydown', (event) => {
            if (
                event.isComposing ||                  // IME active (Hindi, Japanese)
                event.keyCode === 229 ||              // Generic composition keyCode
                ["Control", "Meta", "Alt", "AltGraph"].includes(event.key) ||  // Modifier keys
                event.getModifierState?.("AltGraph") ||                        // AltGr pressed (ES, EU)
                ["Henkan", "Muhenkan", "KanaMode"].includes(event.key)         // JIS IME-specific keys
            ) {
                return;
            }

            const isCtrlPressed = isMac ? event.metaKey : event.ctrlKey;
            const isAltPressed = event.altKey;

            // Canonical key: use layout-aware key for text, keep exact for special keys
            let keyIdentifier = event.key.length === 1
                ? event.key.toLowerCase()
                : event.key;

            // Handle Alt+Key and Alt+Ctrl+Key (for preview mode in previousThread)
            if (isAltPressed) {
                // Always open menu for Alt+W (or whatever your toggle key is)
                if (!isCtrlPressed && (keyIdentifier === modelToggleKey || event.code === modelToggleKey)) {
                    event.preventDefault();
                    window.toggleModelSelector();
                    return;
                }

                // If this is a digit (1-9 or 0), decide whether to intercept for model switching.
                if (/^\d$/.test(keyIdentifier)) {
                    const digit = keyIdentifier; // '0'..'9'

                    // Get model codes cache safely (may be provided by ShortcutUtils)
                    const modelCodes = (window.ShortcutUtils && typeof window.ShortcutUtils.getModelPickerCodesCache === 'function')
                        ? window.ShortcutUtils.getModelPickerCodesCache()
                        : [];

                    // Find a model slot assigned to that digit (normalizes Digit/Numpad via codeEquals)
                    const modelAssignedIndex = (window.ShortcutUtils && typeof window.ShortcutUtils.codeEquals === 'function')
                        ? modelCodes.findIndex(c => window.ShortcutUtils.codeEquals(c, `Digit${digit}`))
                        : -1;

                    if (modelAssignedIndex !== -1) {
                        // There is a model assigned to this digit.
                        // Intercept it only if the model picker is configured to use Alt.
                        if (window.useAltForModelSwitcherRadio === true) {
                            // Intercept only when Alt is the chosen modifier for model switching.
                            event.preventDefault();
                            // Prefer an existing switch function; otherwise dispatch a custom event that other code can listen to.
                            if (typeof window.switchModelByIndex === 'function') {
                                window.switchModelByIndex(modelAssignedIndex);
                            } else {
                                document.dispatchEvent(new CustomEvent('modelPickerNumber', { detail: { index: modelAssignedIndex, event } }));
                            }
                            return;
                        }
                        // If model picker uses Control, DO NOT intercept Alt+digit: let Alt mappings handle it.
                    } else {
                        // No model assigned to this digit: do NOT intercept — let Alt+digit fall through to other Alt handlers.
                    }
                }

                // Special handling: Alt+Ctrl+Key for previewOnly on shortcutKeyPreviousThread
                if (
                    isCtrlPressed &&
                    matchesShortcutKey(shortcuts.shortcutKeyPreviousThread, event) &&
                    keyFunctionMappingAlt[shortcuts.shortcutKeyPreviousThread]
                ) {
                    event.preventDefault();
                    keyFunctionMappingAlt[shortcuts.shortcutKeyPreviousThread]({ previewOnly: true, event });
                    return;
                }

                // Special handling: Alt+Ctrl+Key for previewOnly on shortcutKeyNextThread
                if (
                    isCtrlPressed &&
                    matchesShortcutKey(shortcuts.shortcutKeyNextThread, event) &&
                    keyFunctionMappingAlt[shortcuts.shortcutKeyNextThread]
                ) {
                    event.preventDefault();
                    keyFunctionMappingAlt[shortcuts.shortcutKeyNextThread]({ previewOnly: true, event });
                    return;
                }

                // Normal Alt+Key shortcut: handle mapped Alt shortcuts.
                // Note: digit keys that *were assigned to models* above were already handled and returned;
                // digit keys not assigned to models are allowed here and will be handled by keyFunctionMappingAlt.
                let matchedAltKey = Object.keys(keyFunctionMappingAlt).find(
                    k => matchesShortcutKey(k, event)
                );
                if (matchedAltKey) {
                    event.preventDefault();
                    keyFunctionMappingAlt[matchedAltKey]({ previewOnly: false, event });
                    return;
                }
            }


            // Handle Ctrl/Command‑based shortcuts (model‑menu **toggle** only)
            // Number‑key selection is left to the IIFE so we don’t duplicate logic.
            if (isCtrlPressed && !isAltPressed) {

                // If user chose Ctrl/Cmd for the model switcher, only intercept the toggle key (e.g. Ctrl + W).
                if (window.useControlForModelSwitcherRadio === true && (keyIdentifier === modelToggleKey || event.code === modelToggleKey)) {
                    event.preventDefault();
                    window.toggleModelSelector();   // open / close the menu
                    return;                         // allow Ctrl/Cmd + 1‑5 to fall through to the IIFE
                }

                // … everything else (Ctrl + Enter, Ctrl + Backspace, etc.) stays the same ↓
                // Try both keyIdentifier and event.code for lookup
                const ctrlShortcut =
                    keyFunctionMappingCtrl[keyIdentifier] ||
                    keyFunctionMappingCtrl[event.code];
                if (ctrlShortcut) {
                    if (isCtrlShortcutEnabled(keyIdentifier) || isCtrlShortcutEnabled(event.code)) {
                        event.preventDefault();
                        ctrlShortcut();
                    }
                }
            }

        });

        // Function to check if the specific Ctrl/Command + Key shortcut is enabled
        function isCtrlShortcutEnabled(key) {
            if (key === shortcuts.shortcutKeyClickSendButton) {
                return window.enableSendWithControlEnterCheckbox === true;
            }
            if (key === shortcuts.shortcutKeyClickStopButton) {
                return window.enableStopWithControlBackspaceCheckbox === true;
            }
            return false;
        }

    });

})();



// ====================================
// @note UI Styling & Header Scaling 
// ====================================

(function () {
    function applyInitialTransitions() {

        // Animate sticky topbar
        const sticky = document.querySelector('.sticky.top-0');


        // Profile button
        const profileBtn = document.querySelector('button[data-testid="profile-button"]');
        if (profileBtn) {
            profileBtn.style.padding = '0';
            profileBtn.style.overflow = 'visible';
            const img = profileBtn.querySelector('img');
            if (img) {
                gsap.to(img, {
                    scale: 0.85,
                    transformOrigin: 'center',
                    borderRadius: '50%',
                    duration: 0.2,
                    ease: 'power1.out'
                });
            }
            const rounded = profileBtn.querySelector('.rounded-full');
            if (rounded) {
                rounded.style.borderRadius = '50%';
                rounded.style.overflow = 'visible';
            }
        }

        // Conversation edit buttons hover behavior
        document.querySelectorAll('.group\\/conversation-turn').forEach(el => {
            el.style.display = 'flex';
            el.style.opacity = '0.1';
            el.style.transition = 'opacity 0.2s ease-in-out';
            const parent = el.closest('.group\\/conversation-turn');
            if (parent) {
                parent.addEventListener('mouseenter', () => gsap.to(el, { opacity: 1, duration: 0.2 }));
                parent.addEventListener('mouseleave', () => gsap.to(el, { opacity: 0.1, duration: 0.2 }));
            }
        });

        // Disclaimer text color match
        document.querySelectorAll('.items-center.justify-center.p-2.text-center.text-xs').forEach(el => {
            gsap.to(el, {
                color: getComputedStyle(document.body).getPropertyValue('--main-surface-primary'),
                duration: 0.1,
                ease: 'power1.out'
            });
        });

        // Sidebar labels truncation
        document.querySelectorAll('nav .relative.grow.overflow-hidden.whitespace-nowrap').forEach(el => {
            el.style.whiteSpace = 'nowrap';
            el.style.overflow = 'hidden';
            el.style.textOverflow = 'ellipsis';
            el.style.fontSize = '0.9em';
        });

        // Sidebar headers
        document.querySelectorAll('nav h3.px-2.text-xs.font-semibold').forEach(el => {
            el.style.display = 'block';
            el.style.backgroundColor = 'var(--sidebar-surface-primary)';
            el.style.width = '100%';
        });

        // Kill sidebar scrollbar
        const main = document.querySelector('#main.transition-width');
        if (main) {
            main.style.overflowY = '';
        }
    }

    // Initial pass after layout is stable
    const ready = () => {
        applyInitialTransitions();

        // Observer for dynamic nodes
        const mo = new MutationObserver(muts => {
            for (const m of muts) {
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;

                    // Late-loaded conversation edit buttons
                    if (n.matches('.group\\/conversation-turn')) {
                        gsap.set(n, { opacity: 0.1 });
                        const parent = n.closest('.group\\/conversation-turn');
                        if (parent) {
                            parent.addEventListener('mouseenter', () => gsap.to(n, { opacity: 1, duration: 0.2 }));
                            parent.addEventListener('mouseleave', () => gsap.to(n, { opacity: 0.1, duration: 0.2 }));
                        }
                    }

                    // Delayed header fade (originally timeout-based)
                    if (n.matches('.flex.h-\\[44px\\].items-center.justify-between')) {
                        gsap.to(n, {
                            opacity: 0.3,
                            duration: .2,
                            ease: 'sine.out'
                        });
                    }

                    // Shrink header height if `.md\:h-header-height` appears
                    if (n.matches('.md\\:h-header-height')) {
                        n.style.height = 'fit-content';
                    }

                    // Hide late anchor buttons
                    if (n.matches('a.group.flex.gap-2')) {
                        gsap.set(n, {
                            opacity: 0,
                            pointerEvents: 'none',
                            width: 0,
                            height: 0,
                            overflow: 'hidden'
                        });
                    }
                }
            }
        });

        mo.observe(document.documentElement, { childList: true, subtree: true });
    };

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ready);
    } else {
        ready();
    }
})();



// =========================================
// @note PageUp/PageDown Key Takeover Logic
// =========================================

(() => {
    'use strict';

    // Handle PageUp & PageDown scrolling with GSAP
    function handleKeyDown(event) {
        if (event.key === 'PageUp' || event.key === 'PageDown') {
            resetScrollState(); // Reset shared state

            event.stopPropagation();
            event.preventDefault();

            const scrollContainer = getScrollableContainer();
            if (!scrollContainer) return;

            const viewportHeight = window.innerHeight * 0.8; // Keep the native PageUp/PageDown feel
            const direction = (event.key === 'PageUp') ? -1 : 1;
            let targetScrollPosition = scrollContainer.scrollTop + direction * viewportHeight;

            // Ensure we don't scroll past the natural top/bottom limits
            const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
            targetScrollPosition = Math.max(0, Math.min(targetScrollPosition, maxScroll));

            // Use GSAP for smooth scrolling with slow end effect
            gsap.to(scrollContainer, {
                duration: .6, // Slightly longer for smoother motion
                scrollTo: {
                    y: targetScrollPosition
                },
                ease: "power4.out" // Ensures gradual deceleration at the end
            });
        }
    }

    // Stop animation on user interaction (wheel/touch)
    function handleUserInteraction() {
        resetScrollState(); // Interrupt animation and reset state
    }

    // Attach or detach the event listener
    function toggleEventListener(enabled) {
        if (enabled) {
            document.addEventListener('keydown', handleKeyDown);
            document.addEventListener('wheel', handleUserInteraction, { passive: true });
            document.addEventListener('touchstart', handleUserInteraction, { passive: true });
        } else {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('wheel', handleUserInteraction);
            document.removeEventListener('touchstart', handleUserInteraction);
        }
    }

    // Initialize PageUp/PageDown takeover
    function initializePageUpDownTakeover() {
        chrome.storage.sync.get(['pageUpDownTakeover'], (data) => {
            const enabled = data.pageUpDownTakeover !== false;
            toggleEventListener(enabled);
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes.pageUpDownTakeover) {
                const enabled = changes.pageUpDownTakeover.newValue !== false;
                toggleEventListener(enabled);
            }
        });
    }

    initializePageUpDownTakeover();
})();



// ==================================================
// @note expose edit buttons with simulated mouse hover
// ==================================================
(function injectAlwaysVisibleStyle() {
    const style = document.createElement('style');
    style.textContent = `

/* Ensure parents can receive hover events */
div.flex.justify-start,
div.flex.justify-end {
    pointer-events: auto !important;
}

/* Force group-hover/turn-messages always visible, pointer-events always on */
div[class*="group-hover/turn-messages"] {
    opacity: 0.2 !important;
    pointer-events: auto !important;
    transition: opacity 0.5s !important;
}

/* Dark mode override for opacity */
.dark div[class*="group-hover/turn-messages"] {
    opacity: 0.08 !important;
}

/* Hover or JS-forced state: fully visible */
div[class*="group-hover/turn-messages"]:hover,
div[class*="group-hover/turn-messages"].force-full-opacity {
    opacity: 1 !important;
}

/* Make sure we also override any tailwind transitions that might re-add pointer-events */
div[class*="group-hover/turn-messages"] * {
    pointer-events: auto !important;
}

/* Hide warning by ID */
div[data-id="hide-this-warning"] {
    color: var(--main-surface-primary);
}

/* Pointer events and mask for custom group-hover utilities */
.group-hover\\/turn-messages\\:pointer-events-auto,
.group-hover\\/turn-messages\\:\\[mask-position\\:0_0\\] {
    pointer-events: auto !important;
    mask-position: 0% 0% !important;
}

/* Hide upgrade button in sidebar Robust selector. Hide upgrade ad but not profile menu. Reference 101 */
/* Hide the first .__menu-item with data-fill, but not the profile menu */


/* Make the sidebar header shorter */
div.bg-token-bg-elevated-secondary.sticky.top-0 {
    padding-top: 2px !important;
    padding-bottom: 2px !important;
    margin-top: 2px !important;
    margin-bottom: 2px !important;
    min-height: 44px !important;
}

/* Reduce height of the inner header container */
#sidebar-header {
    min-height: 40px !important;
    height: 40px !important;
}

/* Reduce padding of bottom sticky sidebar (user settings button container) */
/* ReferenceLocation 101 = location for the logic to hide the user settings button when the moveTop bar to bottom enable is enabled */
.bg-token-bg-elevated-secondary.sticky.bottom-0 {
    padding-top: 2px !important;
    padding-bottom: 2px !important;
}

/* Hide the upgrade ad in sidebar */

/* accounts-profile-button to make it smaller */
div[data-testid="accounts-profile-button"] {
    padding-top: 2px !important;
    padding-bottom: 2px !important;
}

div[data-testid="accounts-profile-button"] div.truncate {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    max-width: 100% !important;
}

/* Fix sidebar showing horizontal scroll bars  */
nav.group\\/scrollport {
overflow-x: hidden !important;
}

// Remove horizontal scrolling from sidebar
nav.group\/scrollport.relative.flex.h-full.w-full.flex-1.flex-col.overflow-y-auto.transition-opacity.duration-500 {
overflow-x:hidden!important;
}

aside {
    padding-top: 0 !important;
    top: 40px;
    padding-bottom: 11px;
}

// fix some issue some people have where they can't scroll while in a project

.composer-parent.flex.flex-col.overflow-hidden.focus-visible\:outline-0.h-full {
    overflow: auto;
}

button.btn.btn-secondary.shadow-long.flex.rounded-xl.border-none.active\:opacity-1 {
  opacity: 1 !important;
}


`;
    document.head.appendChild(style);

    // Decide how faded the buttons are in light/dark mode
    function getFadeOpacity() {
        if (
            document.documentElement.classList.contains('dark') ||
            document.body.classList.contains('dark') ||
            window.matchMedia('(prefers-color-scheme: dark)').matches
        ) {
            return 0.08;
        }
        return 0.2;
    }

    // Attach to all .flex.justify-start OR .flex.justify-end
    document.querySelectorAll('div.flex.justify-start, div.flex.justify-end').forEach(parent => {
        // Find the child that contains "group-hover/turn-messages"
        // (Does not need to be a direct child if you prefer querySelector)
        const child = parent.querySelector('div[class*="group-hover/turn-messages"]');
        if (!child) return;

        let fadeTimeout = null;

        // Show the child immediately on hover
        parent.addEventListener('mouseenter', () => {
            clearTimeout(fadeTimeout);
            child.classList.add('force-full-opacity');
            child.style.opacity = '1';
        });

        // Fade the child out 2s after mouse leaves
        parent.addEventListener('mouseleave', () => {
            fadeTimeout = setTimeout(() => {
                child.classList.remove('force-full-opacity');
                child.style.opacity = getFadeOpacity();
            }, 2000);
        });

        // Set initial opacity according to current mode
        child.style.opacity = getFadeOpacity();
    });
})();


// ==================================================
// @note TopBarToBottom Feature
// ==================================================

(function () {
    chrome.storage.sync.get(
        { moveTopBarToBottomCheckbox: false },
        ({ moveTopBarToBottomCheckbox: enabled }) => {
            if (!enabled) return;

            // Blacklist logic for specific paths/hostnames
            const hostname = location.hostname.replace(/^www\./, '');
            const pathname = location.pathname;

            // Matches "*://chatgpt.com/gpts*"
            const isGpts = hostname === 'chatgpt.com' && pathname.startsWith('/gpts');
            // Matches "*://chatgpt.com/codex*"
            const isCodex = hostname === 'chatgpt.com' && pathname.startsWith('/codex');
            // Matches "*://chatgpt.com/g/*"
            const isG = hostname === 'chatgpt.com' && pathname.startsWith('/g/');
            // Matches "*://sora.chatgpt.com/*"
            const isSora = hostname === 'sora.chatgpt.com';
            // Matches "*://chatgpt.com/library/*"
            const isLibrary = hostname === 'chatgpt.com' && pathname.startsWith('/library/');

            if (isGpts || isCodex || isG || isSora || isLibrary) return;

            // --- Early gate ---
            (async function main() {
                async function gateIfLoginButtonPresent() {
                    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
                    let header, flexChildren, tries = 0;
                    while (tries++ < 25) {
                        header = document.querySelector("#page-header");
                        if (header) {
                            flexChildren = header.querySelectorAll(":scope > .flex.items-center");
                            if (flexChildren.length > 0) break;
                        }
                        await sleep(200);
                    }
                    if (!header || !flexChildren || flexChildren.length === 0) return false;
                    for (let seg of [flexChildren[0], flexChildren[flexChildren.length - 1]]) {
                        if (seg && seg.querySelector('button[data-testid="login-button"]')) {
                            return true;
                        }
                    }
                    return false;
                }
                if (await gateIfLoginButtonPresent()) return; // GATE: do nothing!

                setTimeout(function injectBottomBarStyles() {

                    // -------------------- Section 1. Utilities --------------------
                    function debounce(fn, wait = 80) {
                        let timeout;
                        return function (...args) {
                            clearTimeout(timeout);
                            timeout = setTimeout(() => fn.apply(this, args), wait);
                        };
                    }

                    async function waitForElement(selector, timeout = 12000, poll = 200) {
                        const start = Date.now();
                        let el;
                        while (!(el = document.querySelector(selector)) && (Date.now() - start < timeout)) {
                            await new Promise(r => setTimeout(r, poll));
                        }
                        return el;
                    }

                    async function waitForElements(selectors, timeout = 12000, poll = 200) {
                        const start = Date.now();
                        let results;
                        while (
                            !(results = selectors.map(sel => document.querySelector(sel))).every(Boolean) &&
                            (Date.now() - start < timeout)
                        ) {
                            await new Promise(r => setTimeout(r, poll));
                        }
                        return results;
                    }

                    // ------------------------------------------------------------------------
                    // (A) One-time storage fetch approach:
                    //     Only fetch once from chrome.storage.sync to avoid repeated calls,
                    //     and keep the resolved value in a single Promise.
                    // ------------------------------------------------------------------------
                    let opacityValuePromise;
                    function ensureOpacityValueReady() {
                        // Return the already-fetched value if we have it
                        if (opacityValuePromise) return opacityValuePromise;

                        // Otherwise, build the one-time promise that fetches from storage
                        opacityValuePromise = new Promise((resolve) => {
                            // If chrome.storage.sync is missing/invalid, fallback silently to 0.6
                            if (!chrome?.storage?.sync) {
                                window.popupBottomBarOpacityValue = 0.6;
                                return resolve(window.popupBottomBarOpacityValue);
                            }

                            try {
                                chrome.storage.sync.get({ popupBottomBarOpacityValue: 0.6 }, (res) => {
                                    if (chrome.runtime.lastError) {
                                        // console.error("Error:", chrome.runtime.lastError); // comment out if you want silence
                                        window.popupBottomBarOpacityValue = 0.6;
                                    } else {
                                        window.popupBottomBarOpacityValue =
                                            typeof res.popupBottomBarOpacityValue === 'number'
                                                ? res.popupBottomBarOpacityValue
                                                : 0.6;
                                    }
                                    resolve(window.popupBottomBarOpacityValue);
                                });
                            } catch (e) {
                                // console.error("Failed chrome.storage.sync.get:", e); // comment out if you want silence
                                window.popupBottomBarOpacityValue = 0.6;
                                resolve(window.popupBottomBarOpacityValue);
                            }
                        });

                        return opacityValuePromise;
                    }

                    function snapToBottom() {
                        const sc = typeof getScrollableContainer === 'function' && getScrollableContainer();
                        if (sc) sc.scrollTop = sc.scrollHeight; // native, one-line, zero-ms
                    }

                    // -------------------- Section 2. Main Logic & Reinject --------------------
                    setTimeout(() => {
                        (function () {
                            runMoveTopBarLogic();
                            // Stay alive if DOM changes (mutation-observe, auto re-inject)
                            let reinjectTimeout;
                            new MutationObserver(() => {
                                clearTimeout(reinjectTimeout);
                                reinjectTimeout = setTimeout(runMoveTopBarLogic, 350);
                            }).observe(document.body, { childList: true, subtree: true });

                            async function runMoveTopBarLogic() {
                                await ensureOpacityValueReady(); // Wait for storage fetch
                                // Wait for target UI pieces
                                async function getTopBarSegments() {
                                    const header = await waitForElement("#page-header", 12000, 200);
                                    if (!header) return [null, null];
                                    const flexChildren = Array.from(header.querySelectorAll(":scope > .flex.items-center"));
                                    if (!flexChildren.length) return [null, null];
                                    if (flexChildren.length === 1) return [flexChildren[0], flexChildren[0]];
                                    return [flexChildren[0], flexChildren[flexChildren.length - 1]];
                                }

                                const [topBarLeft, topBarRight] = await getTopBarSegments();
                                const composerForm = await waitForElement("form[data-type='unified-composer']", 12000, 200);

                                if (!topBarLeft || !topBarRight || !composerForm) return;
                                const composerContainer = composerForm.querySelector(".border-token-border-default") || composerForm;

                                injectBottomBar(topBarLeft, topBarRight, composerContainer);


                                // Grayscale Profile Button
                                waitForElement('button[data-testid="profile-button"]').then(profileButton => {
                                    if (profileButton) {
                                        applyInitialGrayscale(profileButton);
                                        observeProfileButton(profileButton);
                                    }
                                });
                            }


                            // ---------- Section 3 • Bottom Bar Creation ----------
                            /* one global debounce helper — defined ONCE in the IIFE ------------------ */
                            if (!window.__bbDebounce) {
                                window.__bbDebounce = function (fn, wait = 80) {
                                    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), wait); };
                                };
                            }
                            const debounce = window.__bbDebounce;

                            /* ----------------------------------------------------------------------- */
                            function injectBottomBar(topBarLeft, topBarRight, composerContainer) {
                                /* prevent double‑injection ------------------------------------------ */
                                let bottomBar = document.getElementById('bottomBarContainer');
                                if (!bottomBar) {
                                    /* create bar ----------------------------------------------------- */
                                    bottomBar = document.createElement('div');
                                    bottomBar.id = 'bottomBarContainer';
                                    Object.assign(bottomBar.style, {
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '0 12px',
                                        margin: '0',
                                        minHeight: 'unset',
                                        lineHeight: '1',
                                        gap: '8px',
                                        fontSize: '12px',
                                        boxSizing: 'border-box',
                                        opacity: '1',
                                        transition: 'opacity 0.5s'
                                    });

                                    /* ----------------------------------------------------------------
                                       width + scale logic
                                    ------------------------------------------------------------------ */
                                    function setWidth() {
                                        bottomBar.style.width = window.getComputedStyle(composerContainer).width;
                                    }
                                    function scaleOnce() {
                                        const avail = composerContainer.clientWidth;
                                        const content = bottomBar.scrollWidth;
                                        const s = Math.min(1, avail / content);
                                        bottomBar.style.transform = `scale(${s})`;
                                        bottomBar.style.transformOrigin = 'left center';
                                        return s;
                                    }
                                    function scaleUntilStable() {
                                        let prev;
                                        const loop = () => {
                                            setWidth();
                                            const curr = scaleOnce();
                                            if (curr !== prev) {
                                                prev = curr;
                                                requestAnimationFrame(loop);    // keep looping until stable
                                            }
                                        };
                                        loop();
                                    }
                                    const debouncedStable = debounce(scaleUntilStable, 60);

                                    /* observe container resize + window resize ---------------------- */
                                    new ResizeObserver(debouncedStable).observe(composerContainer);
                                    window.addEventListener('resize', debouncedStable);

                                    /* fade / opacity handlers --------------------------------------- */
                                    const idleOpacity = () =>
                                        bottomBar.style.opacity = (typeof window.popupBottomBarOpacityValue === 'number'
                                            ? window.popupBottomBarOpacityValue : 0.6).toString();

                                    let fadeT;
                                    setTimeout(idleOpacity, 2500);
                                    bottomBar.addEventListener('mouseover', () => {
                                        clearTimeout(fadeT); bottomBar.style.opacity = '1';
                                        if (typeof setGrayscale === 'function') setGrayscale(false);
                                    });
                                    bottomBar.addEventListener('mouseout', () => {
                                        fadeT = setTimeout(() => {
                                            idleOpacity();
                                            if (typeof setGrayscale === 'function') setGrayscale(true);
                                        }, 2500);
                                    });

                                    /* capture scroll, insert, restore ------------------------------- */
                                    const sc = typeof getScrollableContainer === 'function' && getScrollableContainer();
                                    const prevScrollBot = sc ? sc.scrollHeight - sc.scrollTop : 0;
                                    (composerContainer.closest('form') || composerContainer)
                                        .insertAdjacentElement('afterend', bottomBar);
                                    if (sc) sc.scrollTop += sc.scrollHeight - prevScrollBot;

                                    /* run first stable scale pass after insertion ------------------- */
                                    requestAnimationFrame(scaleUntilStable);
                                    setTimeout(() => scaleUntilStable(), 1500);

                                    /* gsap intro ---------------------------------------------------- */
                                    gsap.set(bottomBar, { opacity: 0, y: 10, display: 'flex' });
                                    gsap.to(bottomBar, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' });
                                }

                                /* ----- left / right containers ------------------------------------ */
                                let left = document.getElementById('bottomBarLeft');
                                let right = document.getElementById('bottomBarRight');
                                if (!left) { left = document.createElement('div'); left.id = 'bottomBarLeft'; left.style.display = 'flex'; left.style.alignItems = 'center'; left.style.gap = '2px'; bottomBar.appendChild(left); }
                                if (!right) { right = document.createElement('div'); right.id = 'bottomBarRight'; right.style.display = 'flex'; right.style.alignItems = 'center'; right.style.gap = '2px'; right.style.marginLeft = 'auto'; bottomBar.appendChild(right); }

                                [...left.children].forEach(c => {
                                    const keep = ['static-sidebar-btn', 'static-newchat-btn'];
                                    if (!keep.includes(c.dataset.id) && c !== topBarLeft) c.remove();
                                });

                                if (!left.contains(topBarLeft)) left.appendChild(topBarLeft);
                                if (!right.contains(topBarRight)) right.appendChild(topBarRight);

                                injectStaticButtons(left);
                                adjustBottomBarTextScaling(bottomBar);
                                debounce(() => {
                                    /* re‑scale once text truncation done */
                                    scaleUntilStable();
                                }, 50)();

                                /* hide stale disclaimer ------------------------------------------- */
                                const old = document.querySelector(
                                    'div.text-token-text-secondary.relative.mt-auto.flex.min-h-8.w-full.items-center.justify-center.p-2.text-center.text-xs'
                                );
                                if (old) gsap.to(old, { opacity: 0, duration: 0.4, ease: 'sine.out', onComplete: () => (old.style.display = 'none') });
                            }


                            // -------------------- Section 4. Static Buttons --------------------
                            function injectStaticButtons(leftContainer) {
                                // ---- 4.1  Static Toggle‑Sidebar Button ----
                                let btnSidebar = leftContainer.querySelector('button[data-id="static-sidebar-btn"]');
                                if (!btnSidebar) {
                                    btnSidebar = createStaticButton({
                                        label: 'Static Toggle Sidebar',
                                        svg: '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M8.85720 3H15.1428C16.2266 2.99999 17.1007 2.99998 17.8086 3.05782C18.5375 3.11737 19.1777 3.24318 19.77 3.54497C20.7108 4.02433 21.4757 4.78924 21.955 5.73005C22.2568 6.32234 22.3826 6.96253 22.4422 7.69138C22.5 8.39925 22.5 9.27339 22.5 10.3572V13.6428C22.5 14.7266 22.5 15.6008 22.4422 16.3086C22.3826 17.0375 22.2568 17.6777 21.955 18.27C21.4757 19.2108 20.7108 19.9757 19.77 20.455C19.1777 20.7568 18.5375 20.8826 17.8086 20.9422C17.1008 21 16.2266 21 15.1428 21H8.85717C7.77339 21 6.89925 21 6.19138 20.9422C5.46253 20.8826 4.82234 20.7568 4.23005 20.455C3.28924 19.9757 2.52433 19.2108 2.04497 18.27C1.74318 17.6777 1.61737 17.0375 1.55782 16.3086C1.49998 15.6007 1.49999 14.7266 1.5 13.6428V10.3572C1.49999 9.27341 1.49998 8.39926 1.55782 7.69138C1.61737 6.96253 1.74318 6.32234 2.04497 5.73005C2.52433 4.78924 3.28924 4.02433 4.23005 3.54497C4.82234 3.24318 5.46253 3.11737 6.19138 3.05782C6.89926 2.99998 7.77341 2.99999 8.85719 3ZM6.35424 5.05118C5.74907 5.10062 5.40138 5.19279 5.13803 5.32698C4.57354 5.6146 4.1146 6.07354 3.82698 6.63803C3.69279 6.90138 3.60062 7.24907 3.55118 7.85424C3.50078 8.47108 3.5 9.26339 3.5 10.4V13.6C3.5 14.7366 3.50078 15.5289 3.55118 16.1458C3.60062 16.7509 3.69279 17.0986 3.82698 17.362C4.1146 17.9265 4.57354 18.3854 5.13803 18.673C5.40138 18.8072 5.74907 18.8994 6.35424 18.9488C6.97108 18.9992 7.76339 19 8.9 19H9.5V5H8.9C7.76339 5 6.97108 5.00078 6.35424 5.05118ZM11.5 5V19H15.1C16.2366 19 17.0289 18.9992 17.6458 18.9488C18.2509 18.8994 18.5986 18.8072 18.862 18.673C19.4265 18.3854 19.8854 17.9265 20.173 17.362C20.3072 17.0986 20.3994 16.7509 20.4488 16.1458C20.4992 15.5289 20.5 14.7366 20.5 13.6V10.4C20.5 9.26339 20.4992 8.47108 20.4488 7.85424C20.3994 7.24907 20.3072 6.90138 20.173 6.63803C19.8854 6.07354 19.4265 5.6146 18.862 5.32698C18.5986 5.19279 18.2509 5.10062 17.6458 5.05118C17.0289 5.00078 16.2366 5 15.1 5H11.5ZM5 8.5C5 7.94772 5.44772 7.5 6 7.5H7C7.55229 7.5 8 7.94772 8 8.5C8 9.05229 7.55229 9.5 7 9.5H6C5.44772 9.5 5 9.05229 5 8.5ZM5 12C5 11.4477 5.44772 11 6 11H7C7.55229 11 8 11.4477 8 12C8 12.5523 7.55229 13 7 13H6C5.44772 13 5 12.5523 5 12Z"/></svg>',
                                        proxySelector: 'button[data-testid="open-sidebar-button"],button[data-testid="close-sidebar-button"]',
                                        fallbackShortcut: { ctrl: true, shift: true, key: 's', code: 'KeyS' }
                                    });
                                    leftContainer.insertBefore(btnSidebar, leftContainer.firstChild);
                                }

                                // ---- 4.2  Static New‑Chat Button ----
                                let btnNewChat = leftContainer.querySelector('button[data-id="static-newchat-btn"]');
                                if (!btnNewChat) {
                                    btnNewChat = createStaticButton({
                                        label: 'Static New Chat',
                                        svg: '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M15.6730 3.91287C16.8918 2.69392 18.8682 2.69392 20.0871 3.91287C21.3061 5.13182 21.3061 7.10813 20.0871 8.32708L14.1499 14.2643C13.3849 15.0293 12.3925 15.5255 11.3215 15.6785L9.14142 15.9899C8.82983 16.0344 8.51546 15.9297 8.29289 15.7071C8.07033 15.4845 7.96554 15.1701 8.01005 14.8586L8.32149 12.6785C8.47449 11.6075 8.97072 10.615 9.7357 9.85006L15.6729 3.91287ZM18.6729 5.32708C18.235 4.88918 17.525 4.88918 17.0871 5.32708L11.1499 11.2643C10.6909 11.7233 10.3932 12.3187 10.3014 12.9613L10.1785 13.8215L11.0386 13.6986C11.6812 13.6068 12.2767 13.3091 12.7357 12.8501L18.6729 6.91287C19.1108 6.47497 19.1108 5.76499 18.6729 5.32708ZM11 3.99929C11.0004 4.55157 10.5531 4.99963 10.0008 5.00007C9.00227 5.00084 8.29769 5.00827 7.74651 5.06064C7.20685 5.11191 6.88488 5.20117 6.63803 5.32695C6.07354 5.61457 5.6146 6.07351 5.32698 6.63799C5.19279 6.90135 5.10062 7.24904 5.05118 7.8542C5.00078 8.47105 5 9.26336 5 10.4V13.6C5 14.7366 5.00078 15.5289 5.05118 16.1457C5.10062 16.7509 5.19279 17.0986 5.32698 17.3619C5.6146 17.9264 6.07354 18.3854 6.63803 18.673C6.90138 18.8072 7.24907 18.8993 7.85424 18.9488C8.47108 18.9992 9.26339 19 10.4 19H13.6C14.7366 19 15.5289 18.9992 16.1458 18.9488C16.7509 18.8993 17.0986 18.8072 17.362 18.673C17.9265 18.3854 18.3854 17.9264 18.673 17.3619C18.7988 17.1151 18.8881 16.7931 18.9393 16.2535C18.9917 15.7023 18.9991 14.9977 18.9999 13.9992C19.0003 13.4469 19.4484 12.9995 20.0007 13C20.553 13.0004 21.0003 13.4485 20.9999 14.0007C20.9991 14.9789 20.9932 15.7808 20.9304 16.4426C20.8664 17.116 20.7385 17.7136 20.455 18.2699C19.9757 19.2107 19.2108 19.9756 18.27 20.455C17.6777 20.7568 17.0375 20.8826 16.3086 20.9421C15.6008 21 14.7266 21 13.6428 21H10.3572C9.27339 21 8.39925 21 7.69138 20.9421C6.96253 20.8826 6.32234 20.7568 5.73005 20.455C4.78924 19.9756 4.02433 19.2107 3.54497 18.2699C3.24318 17.6776 3.11737 17.0374 3.05782 16.3086C2.99998 15.6007 2.99999 14.7266 3 13.6428V10.3572C2.99999 9.27337 2.99998 8.39922 3.05782 7.69134C3.11737 6.96249 3.24318 6.3223 3.54497 5.73001C4.02433 4.7892 4.78924 4.0243 5.73005 3.54493C6.28633 3.26149 6.88399 3.13358 7.55735 3.06961C8.21919 3.00673 9.02103 3.00083 9.99922 3.00007C10.5515 2.99964 10.9996 3.447 11 3.99929Z"/></svg>',
                                        proxySelector: 'button[data-testid="new-chat-button"]',
                                        fallbackShortcut: { ctrl: true, shift: true, key: 'o', code: 'KeyO' }
                                    });
                                    leftContainer.insertBefore(btnNewChat, btnSidebar.nextSibling);
                                }
                            }

                            /* ---------- shared helper ---------- */
                            function createStaticButton({ label, svg, proxySelector, fallbackShortcut }) {
                                const btn = document.createElement('button');
                                btn.setAttribute('aria-label', label);
                                btn.setAttribute(
                                    'data-id',
                                    label.toLowerCase().includes('sidebar') ? 'static-sidebar-btn' : 'static-newchat-btn'
                                );

                                // ---- visual styling (unchanged) ----
                                btn.innerHTML = svg;
                                btn.className =
                                    'text-token-text-secondary focus-visible:bg-token-surface-hover ' +
                                    'enabled:hover:bg-token-surface-hover disabled:text-token-text-quaternary ' +
                                    'h-10 rounded-lg px-2 focus-visible:outline-0';
                                Object.assign(btn.style, {
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '36px',
                                    padding: '8px'
                                });

                                /* ---- behaviour ---- */
                                btn.onclick = (e) => {
                                    e.preventDefault();
                                    e.stopImmediatePropagation();

                                    // Attempt shortcut first (if defined)…
                                    if (fallbackShortcut) {
                                        const { key, code, ctrl, shift, alt = false, meta = false } = fallbackShortcut;
                                        const isMac = isMacPlatform();

                                        const evtInit = {
                                            key: key.toUpperCase(),
                                            code,
                                            keyCode: key.toUpperCase().charCodeAt(0),
                                            which: key.toUpperCase().charCodeAt(0),
                                            bubbles: true,
                                            cancelable: true,
                                            composed: true,
                                            shiftKey: !!shift,
                                            ctrlKey: !!ctrl && !isMac,
                                            metaKey: !!meta || (isMac && !!ctrl),
                                            altKey: !!alt
                                        };

                                        // `dispatchEvent` returns FALSE if preventDefault was called → means the page handled our shortcut
                                        const shortcutUnhandled = document.dispatchEvent(new KeyboardEvent('keydown', evtInit));
                                        document.dispatchEvent(new KeyboardEvent('keyup', evtInit));

                                        // …fallback to click only when the shortcut was NOT handled
                                        if (shortcutUnhandled) {
                                            const target = document.querySelector(proxySelector);
                                            if (target?.offsetParent !== null) target.click();
                                        }
                                    } else {
                                        // No shortcut defined → always click
                                        const target = document.querySelector(proxySelector);
                                        if (target?.offsetParent !== null) target.click();
                                    }
                                };

                                return btn;
                            }



                            // -------------------- Section 5. Grayscale Profile Button --------------------
                            let profileBtnRef;
                            function applyInitialGrayscale(btn) {
                                if (!btn) return;
                                profileBtnRef = btn;
                                btn.style.setProperty('filter', 'grayscale(100%)', 'important');
                                btn.style.setProperty('transition', 'filter 0.4s ease', 'important');
                            }
                            function setGrayscale(state) {
                                if (!profileBtnRef) return;
                                profileBtnRef.style.setProperty('filter', state ? 'grayscale(100%)' : 'grayscale(0%)', 'important');
                            }
                            function observeProfileButton(btn) {
                                const parent = btn.parentElement || document.body;
                                const observer = new MutationObserver(() => {
                                    const newBtn = document.querySelector('button[data-testid="profile-button"]');
                                    if (newBtn && newBtn !== profileBtnRef) {
                                        applyInitialGrayscale(newBtn);
                                    }
                                });
                                observer.observe(parent, { childList: true, subtree: false });
                            }

                            // ---------- Section 6 • Text Truncation ----------

                            function applyOneLineEllipsis(el) {
                                el.style.setProperty('white-space', 'nowrap', 'important');
                                el.style.setProperty('overflow', 'hidden', 'important');
                                el.style.setProperty('text-overflow', 'ellipsis', 'important');
                                // keep the current font‑size; no shrinking logic
                            }

                            function adjustBottomBarTextScaling(bar) {
                                bar.querySelectorAll('.truncate').forEach(el => {
                                    if (el.closest('button[data-id="static-sidebar-btn"],button[data-id="static-newchat-btn"]')) return;
                                    applyOneLineEllipsis(el);
                                });
                            }

                            function initAdjustBottomBarTextScaling() {
                                const bar = document.querySelector('#bottomBarContainer, .bottom-bar');
                                if (!bar) return;

                                const run = () => adjustBottomBarTextScaling(bar);
                                const deb = debounce(run, 100);

                                run();                          // initial pass
                                window.addEventListener('resize', deb);
                                new ResizeObserver(deb).observe(bar); // re‑apply on layout changes
                            }

                            document.addEventListener('DOMContentLoaded', initAdjustBottomBarTextScaling);







                        })();

                    }, 500);

                    // -------------------- Section 7. Style Injection ("global") --------------------

                    (function injectBottomBarStyles() {
                        const style = document.createElement('style');
                        style.textContent = `
                    .draggable.sticky.top-0 {
                        opacity: 0 !important; pointer-events: none !important;
                        position: absolute !important; width: 1px !important; height: 1px !important; overflow: hidden !important;
                    }
                    #bottomBarContainer { padding-top:0!important; padding-bottom:0!important; margin-top:2px!important; margin-bottom:2px!important; overflow-anchor:none!important;}
                    #bottomBarContainer button:hover {filter:brightness(1.1)!important;}
                    div[data-id="hide-this-warning"] {
                        opacity:0!important; pointer-events:none!important; position:absolute!important;
                        width:1px!important; height:1px!important; overflow:hidden!important;
                    }
                    div#bottomBarLeft { scale: 0.9; }
                    div#bottomBarRight { scale: 0.85; padding-right: 0em;}
                    #thread-bottom-container {margin-bottom:0em;}

                    #bottomBarContainer button:has(svg > path[d^="M8.85719 3H15.1428C16.2266 2.99999"]),
                    #bottomBarContainer button:has(svg > path[d^="M6.83496"]),
                    #bottomBarContainer button:has(svg > path[d^="M2.6687"]),
                    #bottomBarContainer a:has(svg > path[d^="M2.6687"]),
                    #bottomBarContainer a:has(svg > path[d^="M8.85719 3H15.1428C16.2266 2.99999"]),
                    #bottomBarContainer button:has(svg > path[d^="M15.6729 3.91287C16.8918"]),
                    #bottomBarContainer button:has(svg > path[d^="M9.65723 2.66504C9.47346"]),
                    #bottomBarContainer a:has(svg > path[d^="M9.65723 2.66504C9.47346"]),
                    #bottomBarContainer a:has(svg > path[d^="M15.6729 3.91287C16.8918"]),
                    #bottomBarContainer button:has(svg > path[d^="M8.85719 3L13.5"]) {
                    visibility: hidden !important;
                    position: absolute !important;
                    width: 1px !important;
                    height: 1px !important;
                    overflow: hidden !important;
                    }

                    /* one‑line truncation for bottom‑bar text */
                    #bottomBarContainer .truncate,
                    #bottomBarLeft      .truncate,
                    #bottomBarRight     .truncate {
                    
                    white-space: nowrap !important;   /* single line */
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    word-break: break-word !important;
                    /* removed: -webkit-line-clamp, -webkit-box-orient, font‑size, line‑height, max‑height */
                    }


                    /* ReferenceLocation 101 hide the user setting button in sidebar, but ONLY when moveTopBarToBottomCheckbox feature is enabled */



                `;
                        document.head.appendChild(style);
                    })();


                    // -------------------- Section 7.1. Bottom Bar Mutation Observer for Duplicate Buttons --------------------
                    (function () {
                        const PATH_PREFIXES = ['M15.6729', 'M8.85719'];
                        const SELECTOR = [
                            'button',
                            'a'
                        ].map(
                            tag => PATH_PREFIXES.map(
                                prefix => `${tag} svg > path[d^="${prefix}"]`
                            ).join(',')
                        ).join(',');

                        function hideMatchedElements(container) {
                            if (!container) return;
                            // Find all matching paths in the container
                            const paths = container.querySelectorAll(SELECTOR);
                            paths.forEach(path => {
                                let el = path.closest('button,a');
                                if (el) {
                                    el.style.setProperty('visibility', 'hidden', 'important');
                                    el.style.setProperty('position', 'absolute', 'important');
                                    el.style.setProperty('width', '1px', 'important');
                                    el.style.setProperty('height', '1px', 'important');
                                    el.style.setProperty('overflow', 'hidden', 'important');
                                    // Optional: add a data attribute so you can track which elements were hidden
                                    el.setAttribute('data-ext-hidden', 'true');
                                }
                            });
                        }

                        // Setup mutation observer
                        function observeBottomBar() {
                            const container = document.querySelector('#bottomBarContainer');
                            if (!container) {
                                // Try again soon if the container isn't present yet
                                setTimeout(observeBottomBar, 500);
                                return;
                            }
                            // Initial hide
                            hideMatchedElements(container);
                            // Create the observer
                            const observer = new MutationObserver((mutationsList) => {
                                mutationsList.forEach((mutation) => {
                                    // If children added/removed or subtree changed, re-hide
                                    if (mutation.addedNodes.length > 0 || mutation.type === 'childList') {
                                        hideMatchedElements(container);
                                    }
                                });
                            });
                            observer.observe(container, {
                                childList: true,
                                subtree: true
                            });
                        }

                        // Run
                        observeBottomBar();

                    })();



                    // -------------------- Section 8. Hide Disclaimers (live observation) --------------------
                    setTimeout(() => {
                        (function () {
                            const observer = new MutationObserver(() => {
                                document.querySelectorAll('div.text-token-text-secondary').forEach(el => {
                                    const txt = el.textContent.trim().replace(/\s+/g, ' ');
                                    if (txt.includes("Check important info")) {
                                        el.setAttribute('data-id', 'hide-this-warning');
                                    }
                                });
                            });
                            observer.observe(document.body, { childList: true, subtree: true });
                        })();
                    }, 100);

                    // -------------------- Section 9. Remove Composer Button Labels (lang-agnostic) --------------------
                    (function stripComposerLabels() {
                        const ACTION_WRAPPER = '[style*="--vt-composer-search-action"],[style*="--vt-composer-research-action"]';
                        const IMAGE_BUTTON = 'button[data-testid="composer-button-create-image"]';

                        const stripLabel = btn => {
                            btn.querySelectorAll('span, div').forEach(node => {
                                if (!node.querySelector('svg') && !node.dataset.labelStripped) {
                                    node.dataset.labelStripped = 'true';
                                    gsap.to(node, {
                                        opacity: 0,
                                        duration: 0.15,
                                        ease: 'sine.out',
                                        onComplete: () => node.remove()
                                    });
                                }
                            });
                        };

                        const scan = root => {
                            root.querySelectorAll(ACTION_WRAPPER).forEach(wrp => {
                                const btn = wrp.querySelector('button');
                                if (btn) stripLabel(btn);
                            });
                            root.querySelectorAll(IMAGE_BUTTON).forEach(btn => stripLabel(btn));
                        };

                        // Initial label removal
                        scan(document);

                        // Watch for new buttons
                        new MutationObserver(mutations => {
                            for (const { addedNodes } of mutations) {
                                for (const node of addedNodes) {
                                    if (node.nodeType !== 1) continue;
                                    scan(node); // always scan deeply
                                }
                            }
                        }).observe(document.body, { childList: true, subtree: true });

                    })();

                }); // closes setTimeout(function injectBottomBarStyles() { ... });

            })(); // closes async function main()

        } // closes chrome.storage.sync.get callback
    ); // closes chrome.storage.sync.get

})(); // closes the outer IIFE



// ==================================================
// @note styles when there is no bottombar (unchecked)
// ==================================================

(function () {
    chrome.storage.sync.get(
        { moveTopBarToBottomCheckbox: false },
        ({ moveTopBarToBottomCheckbox: enabled }) => {
            if (enabled) return;  // Feature runs ONLY if NOT enabled

            (function () {
                setTimeout(function injectNoBottomBarStyles() {
                    const style = document.createElement('style');
                    style.textContent = `
                        form.w-full[data-type="unified-composer"] {
                            margin-bottom: -1em;
                        }

.bg-token-bg-elevated-secondary.sticky.bottom-0
  .group.__menu-item:not([data-testid]) .truncate:contains("View plans") {
    display: none !important;
}

/* Optionally, hide the whole promo block (not just the text): */
.bg-token-bg-elevated-secondary.sticky.bottom-0
  .group.__menu-item:not([data-testid]) {
    display: none !important;
}


                    `;
                    document.head.appendChild(style);

                    (function () {
                        const observer = new MutationObserver(() => {
                            document.querySelectorAll('div.text-token-text-secondary').forEach(el => {
                                const txt = el.textContent.trim().replace(/\s+/g, ' ');
                                if (txt.includes("Check important info")) {
                                    el.setAttribute('data-id', 'hide-this-warning');
                                }
                            });
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    })();

                }, 100);
            })();
        }
    );
})();



// ==============================================================
// @note Auto-click 'try again' after 'Something went wrong'
// ==============================================================

// Auto-click "try again" when "Something went wrong" appears after switching from a foldered to non-foldered chat.
// Batch checks during browser idle time to avoid main-thread contention. Wrap click logic in an idle callback and schedule it once per mutation burst.

(function () {
    "use strict";

    chrome.storage.sync.get({ rememberSidebarScrollPositionCheckbox: false }, ({ rememberSidebarScrollPositionCheckbox: enabled }) => {
        if (!enabled) return;

        /* ——— constants ——— */
        const SELECTOR = 'nav[aria-label="Chat history"]';
        const BASE_KEY = '__chat_sidebar_scroll__';
        const SAVE_THROTTLE = 60;
        const FLICK_DELAY = 30; // ms between flicks
        const STALL_TIMEOUT = 400; // ms w/o growth before wiggle
        const MAX_RESTORE_TIME = 8000; // 8 seconds max

        /* ——— per‑tab ID ——— */
        const TAB_ID_KEY = '__chat_sidebar_tab_id__';
        let tabId;
        try { tabId = sessionStorage.getItem(TAB_ID_KEY); } catch { }
        if (!tabId) {
            tabId = typeof crypto?.randomUUID === 'function'
                ? crypto.randomUUID()
                : Date.now().toString(36) + Math.random().toString(36).slice(2);
            try { sessionStorage.setItem(TAB_ID_KEY, tabId); } catch { }
        }
        const STORAGE_KEY = `${BASE_KEY}_${tabId}`;

        /* ——— storage helpers ——— */
        const getPos = () => new Promise(res => {
            try {
                const s = sessionStorage.getItem(STORAGE_KEY);
                if (s !== null) return res(Number(s) || 0);
            } catch { }
            try { chrome.storage.local.get([STORAGE_KEY], r => res(Number(r[STORAGE_KEY]) || 0)); } catch { res(0); }
        });

        const setPos = v => {
            try { sessionStorage.setItem(STORAGE_KEY, v); } catch { }
            try { chrome.storage.local.set({ [STORAGE_KEY]: v }); } catch { }
        };

        /* ——— tiny helpers ——— */
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const throttle = (fn, ms) => {
            let last = 0, id = 0;
            return (...a) => {
                const now = Date.now();
                const call = () => fn(...a);
                if (now - last > ms) { last = now; call(); }
                else if (!id) id = setTimeout(() => { id = 0; last = Date.now(); call(); }, ms - (now - last));
            };
        };

        // ——— restore with time-based persistence ———
        async function restore(container, wanted) {
            if (!wanted) return;
            if (container.__restoring) return;
            container.__restoring = true;

            let abort = false;
            const stop = () => { abort = true; };
            container.addEventListener('wheel', stop, { passive: true });
            container.addEventListener('touchstart', stop, { passive: true });

            await sleep(80);

            const startTime = performance.now();
            let lastH = container.scrollHeight;
            let lastGrowth = performance.now();
            let cyclesAtBottom = 0;

            while (!abort && (performance.now() - startTime) < MAX_RESTORE_TIME) {
                const maxReach = container.scrollHeight - container.clientHeight;

                // If we can reach the wanted position, do so and break
                if (maxReach >= wanted) {
                    container.scrollTo({ top: wanted, behavior: 'smooth' });
                    await sleep(200);
                    break;
                }

                // Flick hard to bottom (overshooting by 2k px, in case lazy loader only triggers at the very bottom)
                container.scrollTo({ top: container.scrollHeight + 2000, behavior: 'auto' });

                await sleep(FLICK_DELAY);

                const now = performance.now();
                if (container.scrollHeight !== lastH) {
                    lastH = container.scrollHeight;
                    lastGrowth = now;
                    cyclesAtBottom = 0;
                } else if (now - lastGrowth > STALL_TIMEOUT) {
                    // Try "wiggle" once or twice at the bottom to trigger loader in edge cases
                    if (cyclesAtBottom < 2) {
                        cyclesAtBottom++;
                        container.scrollTo({ top: container.scrollHeight - 100, behavior: 'auto' });
                        await sleep(FLICK_DELAY);
                        container.scrollTo({ top: container.scrollHeight + 2000, behavior: 'auto' });
                        await sleep(FLICK_DELAY);
                        continue;
                    }
                    // After wiggle, just keep trying until MAX_RESTORE_TIME is reached
                    lastGrowth = performance.now(); // reset growth timer after wiggle
                }
            }

            container.removeEventListener('wheel', stop);
            container.removeEventListener('touchstart', stop);
            container.__restoring = false;
        }

        /* ——— attach to one sidebar ——— */
        function attach(container) {
            if (container.__scrollSyncAttached) return;
            container.__scrollSyncAttached = true;

            getPos().then(pos => {
                restore(container, pos);
                // Second attempt after UI transitions
                setTimeout(() => restore(container, pos), 350);
            });

            container.addEventListener('scroll', throttle(() => {
                if (!container.__restoring) setPos(container.scrollTop);
            }, SAVE_THROTTLE), { passive: true });
        }

        /* ——— watch DOM for sidebars ——— */
        function init() {
            const el = document.querySelector(SELECTOR);
            if (el) attach(el);
        }

        new MutationObserver(muts => {
            for (const m of muts) {
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    if (n.matches?.(SELECTOR)) attach(n);
                    else {
                        const el = n.querySelector?.(SELECTOR);
                        if (el) attach(el);
                    }
                }
            }
        }).observe(document.documentElement, { childList: true, subtree: true });

        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', init, { once: true });
        else
            init();
    });
})();



// ==============================================================
// @note Auto-click "Open link" in warning dialogs
// Efficient, minimal observer, only targets added nodes.
// ==============================================================

(function () {
    'use strict';

    // --- Parameters ---
    const BUTTON_TEXT = "Open link";

    /**
     * Checks if a node or its descendants have an <a> with the target text
     * and performs the click if found.
     */
    function tryClickOpenLink(node) {
        // Only Element nodes
        if (node.nodeType !== 1) return;

        // Helper for quick text check
        function findButton(root) {
            // Check for <a> with child div containing our BUTTON_TEXT
            // We assume (as in your HTML) structure:
            //    <a ...><div>Open link</div></a>
            const anchors = root.querySelectorAll('a.btn-primary');
            for (const a of anchors) {
                if (
                    a.textContent.trim() === BUTTON_TEXT ||
                    // Flexible: match if BUTTON_TEXT appears in a child div
                    Array.from(a.childNodes).some(n =>
                        n.nodeType === 1 && // ELEMENT_NODE
                        n.textContent.trim() === BUTTON_TEXT
                    )
                ) {
                    return a;
                }
            }
            return null;
        }

        // Check self, then descendants. This is cheap for typical small dialog nodes.
        let btn = null;
        if (
            node.matches &&
            (node.matches('a.btn-primary') || node.matches('a[rel][target]')) &&
            node.textContent.trim() === BUTTON_TEXT
        ) {
            btn = node;
        } else {
            btn = findButton(node);
        }
        if (btn && !btn.__autoClicked) {
            btn.__autoClicked = true; // Mark so we don't double-click
            // Slight delay: ensure UI is ready (optional)
            setTimeout(() => btn.click(), 0);
        }
    }

    // --- Observe only child additions (very cheap) ---
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                tryClickOpenLink(n);
            }
        }
    });

    // Start observer on DOMContentLoaded, or immediately if DOM is ready
    function start() {
        observer.observe(document.body, { childList: true, subtree: true });
        // If dialog is already on the page (edge case), activate once at start
        tryClickOpenLink(document.body);
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', start, { once: true });
    else
        start();

})();


// ===============================
// @note Alt+1,2,3 (main), Alt+4 (submenu), Alt+5+ (submenu items); supports legacy submenu, always with gsap feedback & delay
// ===============================
(() => {
    chrome.storage.sync.get(['useControlForModelSwitcherRadio', 'modelPickerKeyCodes'], ({ useControlForModelSwitcherRadio, modelPickerKeyCodes }) => {
        const DEFAULT_MODEL_PICKER_KEY_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
        let KEY_CODES = Array.isArray(modelPickerKeyCodes) && modelPickerKeyCodes.length === 10
            ? modelPickerKeyCodes.slice(0, 10)
            : DEFAULT_MODEL_PICKER_KEY_CODES.slice();
        const IS_MAC = /Mac|iPad|iPhone|iPod/.test(navigator.platform);
        const USE_CTRL = !!useControlForModelSwitcherRadio;
        const MOD_KEY_TEXT = USE_CTRL ? (IS_MAC ? 'Command' : 'Ctrl') : (IS_MAC ? 'Option' : 'Alt');
        const MENU_BTN = 'button[data-testid="model-switcher-dropdown-button"]';

        // Helper: Alt/Option or Ctrl/Command
        const modPressed = e => USE_CTRL ? (IS_MAC ? e.metaKey : e.ctrlKey) : e.altKey;
        const synthClick = el => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        const flashMenuItem = el => {
            if (!el || !window.gsap) return;
            const tertiary = getComputedStyle(document.documentElement).getPropertyValue('--main-surface-tertiary').trim() || '#888';
            window.gsap.timeline({
                onComplete: () => window.gsap.set(el, { clearProps: 'boxShadow,scale' })
            })
                .fromTo(el, { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1 },
                    { boxShadow: `0 0 0 3px ${tertiary}`, scale: 0.95, duration: 0.22, ease: 'power2.out' })
                .to(el, { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1, duration: 0.15, ease: 'power2.in' });
        };

        const flashBottomBar = () => {
            const bb = document.getElementById('bottomBarContainer');
            if (!bb) return;
            clearTimeout(bb._flashTimer);
            clearTimeout(bb._fadeT);
            bb.style.opacity = '1';
            const idle = () =>
                bb.style.opacity = (
                    typeof window.popupBottomBarOpacityValue === 'number'
                        ? window.popupBottomBarOpacityValue
                        : 0.6
                ).toString();
            bb._flashTimer = setTimeout(idle, 4000);
        };

        const ensureMainMenuOpen = () => {
            const btn = document.querySelector(MENU_BTN);
            if (!btn) return false;
            if (btn.getAttribute('aria-expanded') === 'true') return true;
            btn.focus();
            ['keydown', 'keyup'].forEach(type =>
                btn.dispatchEvent(new KeyboardEvent(type, {
                    key: ' ', code: 'Space', keyCode: 32, charCode: 32,
                    bubbles: true, cancelable: true, composed: true
                }))
            );
            return false;
        };

        // Return ALL open Radix menus (main + submenu), sorted left->right (fallback top->bottom)
        const getOpenMenus = () => {
            const menus = Array.from(
                document.querySelectorAll('[role="menu"][data-radix-menu-content][data-state="open"]')
            );
            return menus.sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                if (Math.abs(ra.left - rb.left) > 4) return ra.left - rb.left;
                return ra.top - rb.top;
            });
        };

        // Back-compat alias where existing code expects a single menu (the first/leftmost)
        const getOpenMenu = () => getOpenMenus()[0] || null;

        // Style for shortcut labels
        (() => {
            if (document.getElementById('__altHintStyle')) return;
            const style = document.createElement('style');
            style.id = '__altHintStyle';
            style.textContent = `
                .alt-hint {
                    font-size: 10px;
                    opacity: .55;
                    margin-left: 6px;
                    user-select: none;
                    pointer-events: none;
                }`;
            document.head.appendChild(style);
        })();

        const removeAllLabels = () => document.querySelectorAll('.alt-hint').forEach(el => el.remove());
        const addLabel = (el, labelText) => {
            if (!el || el.querySelector('.alt-hint')) return;
            // If label is empty, do not display a hint at all
            if (!labelText || labelText === '—') return;
            let target = el.querySelector('.flex.items-center') || el.querySelector('.flex') || el;
            const span = document.createElement('span');
            span.className = 'alt-hint';
            span.textContent = `${MOD_KEY_TEXT}+${labelText}`;
            (target || el).appendChild(span);
        };

        // Get all menu items (main menu + open submenu) in order, capped at 10
        // Collect items from the *first* open menu (level 1) and, if present, the *second* open menu (level 2).
        // Cap at 10 items total so the existing key mapping remains stable.
        function getOrderedMenuItems() {
            const openMenus = getOpenMenus();
            if (!openMenus.length) return [];

            const first = openMenus[0];
            const second = openMenus[1] || null;

            // Use direct-children to avoid grabbing nested/hidden templates
            const firstItems = Array.from(first.querySelectorAll(':scope > [role="menuitem"][data-radix-collection-item]'));
            const result = firstItems.map((el, i) => ({ el, menu: 'main', idx: i }));

            if (second) {
                const secondItems = Array.from(second.querySelectorAll(':scope > [role="menuitem"][data-radix-collection-item]'));
                secondItems.forEach((el, j) => result.push({ el, menu: 'submenu', idx: j }));
            }
            return result.slice(0, 10);
        }


        function displayFromCode(code) {
            // Handle "cleared" shortcuts: anything falsy, empty string, or nbsp
            if (!code || code === '' || code === '\u00A0') return '—';
            if (/^Key([A-Z])$/.test(code)) return code.slice(-1);
            if (/^Digit([0-9])$/.test(code)) return code.slice(-1);
            if (/^Numpad([0-9])$/.test(code)) return code.slice(-1);
            if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
            switch (code) {
                case 'Minus': return '-';
                case 'Equal': return '=';
                case 'BracketLeft': return '[';
                case 'BracketRight': return ']';
                case 'Backslash': return '\\';
                case 'Semicolon': return ';';
                case 'Quote': return "'";
                case 'Comma': return ',';
                case 'Period': return '.';
                case 'Slash': return '/';
                case 'Backquote': return '`';
                case 'Space': return 'Space';
                case 'Enter': return 'Enter';
                case 'Escape': return 'Esc';
                case 'Tab': return 'Tab';
                case 'Backspace': return 'Bksp';
                case 'Delete': return 'Del';
                case 'ArrowLeft': return '←';
                case 'ArrowRight': return '→';
                case 'ArrowUp': return '↑';
                case 'ArrowDown': return '↓';
                default: return code;
            }
        }

        function codeEquals(a, b) {
            if (a === b) return true;
            const A = a && a.match(/^(Digit|Numpad)([0-9])$/);
            const B = b && b.match(/^(Digit|Numpad)([0-9])$/);
            return !!(A && B && A[2] === B[2]); // treat DigitX and NumpadX as equivalent
        }

        function indexFromEvent(e) {
            for (let i = 0; i < KEY_CODES.length; i++) {
                if (codeEquals(e.code, KEY_CODES[i])) return i;
            }
            return -1;
        }


        const applyHints = () => {
            removeAllLabels();
            const items = getOrderedMenuItems();
            for (let i = 0; i < items.length && i < KEY_CODES.length; ++i) {
                addLabel(items[i].el, displayFromCode(KEY_CODES[i]));
            }
        };
        const scheduleHints = () => requestAnimationFrame(applyHints);

        // --- KEY HANDLING ---
        window.addEventListener('keydown', e => {
            if (!modPressed(e)) return;

            const idx = indexFromEvent(e);
            if (idx === -1) return;

            e.preventDefault();
            e.stopPropagation();

            const alreadyOpen = ensureMainMenuOpen();

            // Helper: simulate pointerenter/hover on a node
            const hover = (el) => {
                if (!el) return;
                el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
                el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                el.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
                el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
            };

            // Try to force-open submenu by "hovering" each likely trigger until a second menu appears
            const forceOpenSubmenu = (done) => {
                const menus = getOpenMenus();
                if (!menus.length) return done();
                if (menus.length > 1) return done(); // submenu already present

                const scope = menus[0];
                const candidates = Array.from(scope.querySelectorAll(
                    ':scope > [role="menuitem"][data-has-submenu], ' +
                    ':scope > [role="menuitem"][aria-haspopup="menu"], ' +
                    ':scope > [role="menuitem"][aria-controls]'
                ));

                if (!candidates.length) return done(); // no submenu on this menu

                let i = 0, attempts = 0;
                const tick = () => {
                    if (getOpenMenus().length > 1) return done();
                    if (i < candidates.length) {
                        const el = candidates[i++];
                        hover(el);
                        // Some Radix builds require a click as well; try a safe click
                        synthClick(el);
                        attempts = 0;
                    } else if (attempts++ > 20) {
                        return done();
                    }
                    setTimeout(tick, 50);
                };
                tick();
            };

            setTimeout(() => {
                const mainMenu = getOpenMenu();
                if (!mainMenu) return;

                forceOpenSubmenu(() => {
                    // After submenu (maybe) appeared, label and activate the target
                    const items = getOrderedMenuItems();
                    applyHints();

                    if (items.length <= idx) return;
                    const target = items[idx];
                    if (!target) return;
                    if (window.gsap) flashMenuItem(target.el);
                    setTimeout(() => {
                        synthClick(target.el);
                        flashBottomBar();
                    }, 750);
                });
            }, alreadyOpen ? 0 : 60);
        }, true);


        // Keep click-to-open labels, but also observe DOM so labels appear *when* submenu mounts
        document.addEventListener('click', e => {
            if (e.composedPath().some(n => n instanceof Element && n.matches(MENU_BTN))) {
                setTimeout(applyHints, 60);
            }
            const t = e.target instanceof Element ? e.target : null;
            const submenuTriggerClicked = t && t.closest(
                '[role="menuitem"][data-has-submenu], ' +
                '[role="menuitem"][aria-haspopup="menu"], ' +
                '[role="menuitem"][aria-controls]'
            );
            if (submenuTriggerClicked) {
                setTimeout(applyHints, 90);
            }
        });

        // Observe for open Radix menus; when the count of open menus changes, refresh labels
        (() => {
            let lastCount = 0;
            const obs = new MutationObserver(() => {
                const count = getOpenMenus().length;
                if (count !== lastCount) {
                    lastCount = count;
                    // debounce a hair to let layout settle
                    setTimeout(applyHints, 50);
                }
            });
            obs.observe(document.documentElement, {
                childList: true,
                subtree: true,
            });
        })();


        if (document.querySelector(MENU_BTN)?.getAttribute('aria-expanded') === 'true') {
            scheduleHints();
        }
    });

    // Alt+/ opens the menu and *forces* the submenu to be visible (self-contained)
    window.toggleModelSelector = function () {
        const MENU_BTN = 'button[data-testid="model-switcher-dropdown-button"]';
        const btn = document.querySelector(MENU_BTN);
        if (!btn) return;

        // Local helpers so we don't depend on closure-scoped functions
        const pressSpace = (el) => {
            ['keydown', 'keyup'].forEach(type =>
                el.dispatchEvent(new KeyboardEvent(type, {
                    key: ' ', code: 'Space', keyCode: 32, charCode: 32,
                    bubbles: true, cancelable: true, composed: true
                }))
            );
        };
        const hover = (el) => {
            if (!el) return;
            el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
            el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
        };
        const safeClick = (el) => {
            if (!el) return;
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        };
        const getOpenMenusLocal = () => {
            const menus = Array.from(
                document.querySelectorAll('[role="menu"][data-radix-menu-content][data-state="open"]')
            );
            return menus.sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                if (Math.abs(ra.left - rb.left) > 4) return ra.left - rb.left;
                return ra.top - rb.top;
            });
        };

        // Try to find submenu triggers by ARIA *or* visible text (e.g. "Legacy models")
        const findTriggers = (menu) => {
            const ariaMatches = Array.from(menu.querySelectorAll(
                ':scope > [role="menuitem"][data-has-submenu], ' +
                ':scope > [role="menuitem"][aria-haspopup="menu"], ' +
                ':scope > [role="menuitem"][aria-controls]'
            ));
            const textMatches = Array.from(menu.querySelectorAll(':scope > [role="menuitem"]'))
                .filter(el => /legacy|more|advanced|older|models/i.test(el.textContent || ''));
            // De-dupe while preserving order
            const set = new Set([...ariaMatches, ...textMatches]);
            return Array.from(set);
        };

        const forceOpenSubmenu = (done) => {
            const menus = getOpenMenusLocal();
            if (!menus.length) return done();
            if (menus.length > 1) return done(); // already open
            const triggers = findTriggers(menus[0]);
            if (!triggers.length) return done();

            let i = 0, polls = 0;
            const tick = () => {
                if (getOpenMenusLocal().length > 1) return done();
                if (i < triggers.length) {
                    const el = triggers[i++];
                    hover(el);          // covers hover-based submenus
                    safeClick(el);      // covers click-based submenus
                } else if (polls++ > 20) {
                    return done();
                }
                setTimeout(tick, 50);
            };
            tick();
        };

        const openMain = (cb) => {
            if (btn.getAttribute('aria-expanded') === 'true') return cb();
            btn.focus();
            pressSpace(btn);
            setTimeout(cb, 120);
        };

        openMain(() => {
            // Give Radix a beat to mount the first popper, then force open the second
            setTimeout(() => {
                forceOpenSubmenu(() => {
                    // Labels will be applied by your MutationObserver once the submenu mounts.
                });
            }, 60);
        });
    };




    // Listen for modelPickerKeyCodes changes and update in real-time
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        if (changes.modelPickerKeyCodes) {
            const val = changes.modelPickerKeyCodes.newValue;
            if (Array.isArray(val) && val.length === 10) {
                KEY_CODES = val.slice(0, 10);
                // If menu is open, refresh labels to reflect new keys
                if (document.querySelector('button[data-testid="model-switcher-dropdown-button"]')?.getAttribute('aria-expanded') === 'true') {
                    setTimeout(() => {
                        const menu = getOpenMenu();
                        if (menu) applyHints();
                    }, 50);
                }
            }
        }
    });


})();



// ====================================
// @note rememberSidebarScrollPositionCheckbox
//  Chat-sidebar scroll-restore (w/ proper scroll container targeting, 2024)
// ====================================

setTimeout(() => {
    (function () {
        'use strict';

        chrome.storage.sync.get(
            { rememberSidebarScrollPositionCheckbox: false },
            async ({ rememberSidebarScrollPositionCheckbox: enabled }) => {
                if (!enabled) return;

                // *** Tip: use per-path key to avoid wrong restores after page navs ***
                const STORAGE_KEY = '__chat_sidebar_scrollTop__::' + location.pathname;
                const SAVE_DEBOUNCE_MS = 150;    // ms after user stops scrolling → save
                const IDLE_WAIT_MS = 1000;   // ms of no growth before restore starts
                const POLL_INTERVAL_MS = 100;   // ms between lazy-load nudges
                const MAX_WAIT_MS = 5000;   // total ms to keep nudging
                const FINAL_DELAY_MS = 2000;   // ms after init for final jump

                const sleep = ms => new Promise(r => setTimeout(r, ms));
                let container, saveTimer;

                // ===== Manual-scroll override =====
                let userScrolled = false; // global flag

                function cancelAutoOnUserScroll(el) {
                    // Mouse wheel / touch / keyboard / mouse
                    ['wheel', 'touchstart', 'keydown', 'mousedown', 'mouseenter', 'focusin']
                        .forEach(evt => el.addEventListener(evt, () => { userScrolled = true; }, { passive: true }));
                }

                // 1️⃣ Find the *real* sidebar scrollable container!
                // Updated: direct, robust targeting of nav by aria-label/class
                async function findContainer() {
                    while (true) {
                        // Wait for nav to appear, as ChatGPT is SPA and may need time
                        const nav = document.querySelector('nav.group\\/scrollport[aria-label="Chat history"]');
                        if (nav && nav.scrollHeight > nav.clientHeight) {
                            return nav;
                        }
                        await sleep(100);
                    }
                }

                // 2️⃣ wait until the container stops growing for IDLE_WAIT_MS
                async function waitForInitialIdle(container) {
                    let lastH = container.scrollHeight;
                    let lastChange = Date.now();
                    while (Date.now() - lastChange < IDLE_WAIT_MS) {
                        await sleep(200);
                        const h = container.scrollHeight;
                        if (h !== lastH) {
                            lastH = h;
                            lastChange = Date.now();
                        }
                    }
                }

                // 3️⃣ restore: nudge to bottom every POLL_INTERVAL until scrollTop is valid
                async function restoreScroll(container) {
                    const raw = sessionStorage.getItem(STORAGE_KEY);
                    if (raw === null) return;
                    const desired = parseInt(raw, 10);
                    if (isNaN(desired)) return;

                    const start = Date.now();
                    while (Date.now() - start < MAX_WAIT_MS) {
                        if (userScrolled) return; // abort on manual scroll

                        const maxScroll = container.scrollHeight - container.clientHeight;
                        container.scrollTop = maxScroll; // nudge loader

                        if (userScrolled) return;

                        if (maxScroll >= desired) {
                            container.scrollTop = desired;
                            return;
                        }
                        await sleep(POLL_INTERVAL_MS);
                    }
                }

                // 4️⃣ attach saver: only on user-driven scrolls
                function attachSaver(container) {
                    const commit = (pos) => {
                        sessionStorage.setItem(STORAGE_KEY, String(pos));
                    };
                    container.addEventListener('scroll', e => {
                        if (!e.isTrusted) return;
                        clearTimeout(saveTimer);
                        saveTimer = setTimeout(() => commit(container.scrollTop), SAVE_DEBOUNCE_MS);
                    }, { passive: true });
                    window.addEventListener('beforeunload', () => commit(container.scrollTop));
                }

                // 5️⃣ init sequence
                container = await findContainer();
                cancelAutoOnUserScroll(container); // <--- Insert after container found
                await waitForInitialIdle(container);
                await restoreScroll(container);
                attachSaver(container);

                // 6️⃣ final safeguard jump after delay
                setTimeout(() => {
                    if (userScrolled) return; // respect manual intervention
                    const raw = sessionStorage.getItem(STORAGE_KEY);
                    const desired = raw !== null ? parseInt(raw, 10) : NaN;
                    if (!isNaN(desired)) {
                        container.scrollTop = desired;
                    }
                }, FINAL_DELAY_MS);
            }
        );
    })();
}, 500);

// ==================================================
// @note Slim-bar opacity / fade logic (robust, overlay-aware, single IIFE)
// ==================================================
(function () {
    chrome.storage.sync.get({ fadeSlimSidebarEnabled: false }, ({ fadeSlimSidebarEnabled: enabled }) => {
        window._fadeSlimSidebarEnabled = enabled;
        if (!enabled) {
            const barEl = document.getElementById('stage-sidebar-tiny-bar');
            if (barEl) {
                barEl.style.removeProperty('transition');
                barEl.style.removeProperty('opacity');
                barEl.style.removeProperty('pointer-events');
            }
            return;
        }

        let bar = null;
        let hover = false;
        let idleTimer = null;
        let idleTimerVersion = 0;
        let classObserver = null;

        // -- NEW: Helper to check if large sidebar is open --
        function isLargeSidebarOpen() {
            // Replace '#stage-sidebar' with your actual sidebar element ID/class if needed!
            const largeSidebar = document.getElementById('stage-sidebar');
            if (!largeSidebar) return false;
            const style = window.getComputedStyle(largeSidebar);
            // Consider it open if it's visible and not display:none/hidden
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }

        function getIdleOpacity() {
            return window._slimBarIdleOpacity ?? 0.6;
        }
        function ensureOpacityLoaded() {
            if (window._slimBarOpacityPromise) return window._slimBarOpacityPromise;
            window._slimBarOpacityPromise = new Promise(res => {
                chrome.storage.sync.get({ popupSlimSidebarOpacityValue: 0.6 }, (data) => {
                    window._slimBarIdleOpacity =
                        typeof data.popupSlimSidebarOpacityValue === 'number'
                            ? data.popupSlimSidebarOpacityValue
                            : 0.6;
                    res();
                });
            });
            return window._slimBarOpacityPromise;
        }

        function detachCurrentBar() {
            if (!bar) return;
            bar.removeEventListener('mouseenter', onEnter, true);
            bar.removeEventListener('mouseleave', onLeave, true);
            if (classObserver) classObserver.disconnect();
            clearTimeout(idleTimer);
            idleTimerVersion++;
            bar = null;
        }

        // Overlay detection unchanged
        function overlayIsOpen() {
            const selectors = [
                '[id^="radix-"][data-state="open"]',
                '.modal, .slideover, .overlay, .DialogOverlay, .MenuOverlay',
                '[data-state="open"]',
                '[data-overlay="true"]'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && isVisible(el)) return true;
            }
            // Heuristic fallback: look for large, fixed overlays with high z-index
            const candidates = Array.from(document.body.querySelectorAll('*'));
            return candidates.some(elem => {
                if (!(elem instanceof HTMLElement)) return false;
                const style = window.getComputedStyle(elem);
                if (
                    (style.position === "fixed" || style.position === "absolute") &&
                    (parseInt(style.zIndex, 10) || 0) > 1000 &&
                    elem.offsetWidth >= window.innerWidth * 0.75 &&
                    elem.offsetHeight >= window.innerHeight * 0.5
                ) {
                    // Don't match alerts/toasts, only major overlays
                    return isVisible(elem);
                }
                return false;
            });
        }
        function isVisible(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }

        function setOpacity(value) {
            if (!bar) return;
            if (overlayIsOpen()) {
                bar.style.setProperty('opacity', '0', 'important');
                bar.style.pointerEvents = 'none';
                return;
            }
            // Don't block pointer-events unless you actually want to!
            bar.style.setProperty('opacity', value, 'important');
            bar.style.pointerEvents = '';
        }

        function fadeToIdle() {
            if (!bar) return;
            if (overlayIsOpen()) {
                setOpacity('0');
                return;
            }
            if (hover) return;
            // If large sidebar is open, instantly set opacity 0
            if (isLargeSidebarOpen()) {
                bar.style.setProperty('transition', 'none', 'important');
                setOpacity('0');
                void bar.offsetWidth;
                setTimeout(() => {
                    if (bar) bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
                }, 0);
                return;
            }
            setOpacity(getIdleOpacity().toString());
        }

        function onEnter() {
            hover = true;
            clearTimeout(idleTimer);
            setOpacity('1');
        }
        function onLeave() {
            hover = false;
            clearTimeout(idleTimer);
            idleTimerVersion++;
            const thisVersion = idleTimerVersion;
            idleTimer = setTimeout(() => {
                if (idleTimerVersion === thisVersion) fadeToIdle();
            }, 2500);
        }

        async function attachToBar(el) {
            detachCurrentBar();
            await ensureOpacityLoaded();

            bar = el;
            // Show instantly, then restore the fade
            bar.style.setProperty('transition', 'none', 'important');
            setOpacity('1');
            void bar.offsetWidth;
            bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');

            bar.addEventListener('mouseenter', onEnter, true);
            bar.addEventListener('mouseleave', onLeave, true);

            bar.addEventListener('click', function onClick() {
                if (!bar) return;
                // Disable fade transition instantly for this click
                bar.style.setProperty('transition', 'none', 'important');
                setOpacity('0');
                hover = false;
                clearTimeout(idleTimer);
                idleTimerVersion++;
                void bar.offsetWidth;
                setTimeout(() => {
                    if (bar) bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
                }, 0);
            }, true);

            classObserver = new MutationObserver(() => {
                // Sidebar just closed or opened; handle transition instantly
                if (isLargeSidebarOpen()) {
                    bar.style.setProperty('transition', 'none', 'important');
                    setOpacity('0');
                    hover = false;
                    clearTimeout(idleTimer);
                    idleTimerVersion++;
                    void bar.offsetWidth;
                    setTimeout(() => {
                        if (bar) bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
                    }, 0);
                } else {
                    bar.style.setProperty('transition', 'none', 'important');
                    setOpacity('1');
                    void bar.offsetWidth;
                    setTimeout(() => {
                        if (bar) bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
                        clearTimeout(idleTimer);
                        idleTimerVersion++;
                        const thisVersion = idleTimerVersion;
                        idleTimer = setTimeout(() => {
                            if (idleTimerVersion === thisVersion) fadeToIdle();
                        }, 2500);
                    }, 0);
                }
            });

            // We want to observe changes on the large sidebar, not the slimbar
            const largeSidebar = document.getElementById('stage-sidebar');
            if (largeSidebar) {
                classObserver.observe(largeSidebar, { attributes: true, attributeFilter: ['class', 'style'] });
            }

            setOpacity('1');
            clearTimeout(idleTimer);
            idleTimerVersion++;
            const thisVersion = idleTimerVersion;
            idleTimer = setTimeout(() => {
                if (idleTimerVersion === thisVersion) fadeToIdle();
            }, 2500);
        }

        // DOM observer to attach/detach
        const domObserver = new MutationObserver(() => {
            const el = document.getElementById('stage-sidebar-tiny-bar');
            if (el !== bar) {
                if (el) {
                    attachToBar(el);
                    window.flashSlimSidebarBar?.();
                } else {
                    detachCurrentBar();
                }
            } else {
                fadeToIdle();
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });

        // Also observe overlay-relevant changes (class/style on body/overlays)
        const overlayObserver = new MutationObserver(fadeToIdle);
        overlayObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

        // (Removed setInterval: fadeToIdle() is now handled only by user idle, DOM mutation, or overlayObserver events.)

        // startup
        function startup() {
            const first = document.getElementById('stage-sidebar-tiny-bar');
            if (first) attachToBar(first);
        }
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", startup);
        } else {
            startup();
        }

        chrome.storage.onChanged.addListener((chg, area) => {
            if (area !== 'sync') return;

            if ('popupSlimSidebarOpacityValue' in chg) {
                window._slimBarIdleOpacity =
                    typeof chg.popupSlimSidebarOpacityValue.newValue === 'number'
                        ? chg.popupSlimSidebarOpacityValue.newValue
                        : 0.6;
                fadeToIdle();
            }

            if ('fadeSlimSidebarEnabled' in chg) {
                window._fadeSlimSidebarEnabled = chg.fadeSlimSidebarEnabled.newValue;
                const nowOn = chg.fadeSlimSidebarEnabled.newValue;
                if (!nowOn) {
                    detachCurrentBar();
                    const barEl = document.getElementById('stage-sidebar-tiny-bar');
                    if (barEl) {
                        barEl.style.removeProperty('transition');
                        barEl.style.removeProperty('opacity');
                        barEl.style.removeProperty('pointer-events');
                    }
                } else {
                    const barEl = document.getElementById('stage-sidebar-tiny-bar');
                    if (barEl) attachToBar(barEl);
                }
            }
        });

        window.flashSlimSidebarBar = (dur = 2500) => {
            if (!bar) return;
            if (overlayIsOpen()) {
                setOpacity('0');
                hover = false;
                return;
            }
            clearTimeout(idleTimer);
            idleTimerVersion++;
            setOpacity('1');
            const thisVersion = idleTimerVersion;
            idleTimer = setTimeout(() => {
                if (idleTimerVersion === thisVersion) {
                    hover = false;
                    fadeToIdle();
                }
            }, dur);
        };
    });
})();