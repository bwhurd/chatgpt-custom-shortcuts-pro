/* 
ChatGPT Custom Shortcuts Pro
- Full Changelog: https://bwhurd.github.io/chatgpt-custom-shortcuts-pro/CHANGELOG.html
- Privacy Statement: This extension does not collect, monitor, or track user activity.
*/

// =====================================
// @note Global Functions
// =====================================

// Verify GSAP libraries before registration
function checkGSAP() {
    if (typeof window.gsap !== 'undefined' &&
        typeof window.ScrollToPlugin !== 'undefined' &&
        typeof window.Observer !== 'undefined' &&
        typeof window.Flip !== 'undefined') {
        window.gsap.registerPlugin(window.ScrollToPlugin, window.Observer, window.Flip);
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
                duration: .4,
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
                duration: 0.4,
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


    // @note Keyboard shortcut defaults 
    chrome.storage.sync.get(['shortcutKeyScrollUpOneMessage', 'shortcutKeyScrollDownOneMessage', 'shortcutKeyCopyLowest', 'shortcutKeyEdit', 'shortcutKeySendEdit', 'shortcutKeyCopyAllResponses', 'shortcutKeyCopyAllCodeBlocks', 'shortcutKeyClickNativeScrollToBottom', 'shortcutKeyScrollToTop', 'shortcutKeyNewConversation', 'shortcutKeySearchConversationHistory', 'shortcutKeyToggleSidebar', 'shortcutKeyActivateInput', 'shortcutKeySearchWeb', 'shortcutKeyPreviousThread', 'shortcutKeyNextThread', 'selectThenCopy', 'shortcutKeyToggleSidebarFoldersButton', 'shortcutKeyClickSendButton', 'shortcutKeyClickStopButton', 'shortcutKeyToggleModelSelector', 'shortcutKeyRegenerate'], (data) => {
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
            shortcutKeyRegenerate: 'r'
        };

        const shortcuts = {};
        for (const key in shortcutDefaults) {
            shortcuts[key] = data[key] || shortcutDefaults[key];
        }

        const modelToggleKey = shortcuts.shortcutKeyToggleModelSelector.toLowerCase();

        const isMac = /(Mac|iPhone|iPad|iPod)/i.test(navigator.userAgent);


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
                // Move 4+ backticks appearing after text to their own line
                .replace(/([^\n`]+?)\s*(`{4,})(\s*)$/gm, "$1\n$2")
                // Move 4+ tildes appearing after text to their own line
                .replace(/([^\n~]+?)\s*(~{4,})(\s*)$/gm, "$1\n$2")
                // Replace leading * or + or - with "- ", even if followed by spaces or markdown
                .replace(/^(\s*)[\*\-\+]\s+/gm, "$1- ")
                // Remove bold/italics
                .replace(/(\*\*|__)(.*?)\1/g, "$2")
                .replace(/(\*|_)(.*?)\1/g, "$2")
                // Remove leading '#' from headers
                .replace(/^#{1,6}\s+(.*)/gm, "$1")
                // Preserve indentation for ordered list items
                .replace(/^(\s*)(\d+)\.\s+(.*)/gm, "$1$2. $3")
                // Ensure four backticks at line start get their own line
                .replace(/^````([^\n\S]*)([^\n`].*)$/gm, "````\n$2")
                // Remove or comment out if you want to preserve triple+ line breaks exactly
                .replace(/\n{3,}/g, "\n\n")
                // Remove markdown escape for ~
                .replace(/\\(?=~)/g, "")
                // Simplify Link References
                .replace(/\(\[.*?\]\[(.*?)\]\)/g, "[$1]")
                //  Add two line breaks and Sources:
                .replace(/^(\[1\]: http.*)$/m, "\n---\nSources:\n$1")
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


        // Alt Key Function Maps
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

                // Find all visible copy buttons (by SVG path)
                const visibleButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                    if (!btn.querySelector(`svg path[d^="${copyPath}"]`)) return false;
                    const r = btn.getBoundingClientRect();
                    return (
                        r.top >= 0 &&
                        r.left >= 0 &&
                        r.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                        r.right <= (window.innerWidth || document.documentElement.clientWidth)
                    );
                });

                if (!visibleButtons.length) return;

                // Click the lowest visible button
                const btn = visibleButtons[visibleButtons.length - 1];
                btn.click();

                // Only strip for message copy button with checkbox enabled
                const isMsgCopy = btn.getAttribute('data-testid') === 'copy-turn-action-button';

                setTimeout(() => {
                    if (!navigator.clipboard) return;

                    navigator.clipboard.readText()
                        .then(text => {
                            const trimmed = text.trim();
                            // Never strip if clipboard content is ONLY code-fenced (for safety)
                            if (/^```[\s\S]*```$/.test(trimmed)) {
                                return navigator.clipboard.writeText(text);
                            }
                            // For full messages containing code, strip only outside codeblocks
                            if (isMsgCopy && window.removeMarkdownOnCopyCheckbox) {
                                const cleaned = stripMarkdownOutsideCodeblocks(text);
                                return navigator.clipboard.writeText(cleaned);
                            }
                            // Otherwise, write as-is
                            return navigator.clipboard.writeText(text);
                        })
                        .catch(() => {/* silent fail */ });
                }, 100);
            },
            [shortcuts.shortcutKeyEdit]: () => {
                setTimeout(() => {
                    try {
                        const allButtons = Array.from(
                            document.querySelectorAll('button svg path[d^="M11.3312 3.56837C12.7488"]')
                        ).map(svgPath => svgPath.closest('button'));

                        const composerBackground = document.getElementById('composer-background');
                        const composerRect = composerBackground ? composerBackground.getBoundingClientRect() : null;

                        const visibleButtons = allButtons.filter(button => {
                            if (!button) return false;
                            const rect = button.getBoundingClientRect();

                            const isVisible = (
                                rect.bottom > 0 &&
                                rect.right > 0 &&
                                rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
                                rect.left < (window.innerWidth || document.documentElement.clientWidth)
                            );

                            const doesNotOverlapComposer = composerRect
                                ? !(rect.bottom > composerRect.top && rect.top < composerRect.bottom &&
                                    rect.right > composerRect.left && rect.left < composerRect.right)
                                : true;

                            return isVisible && doesNotOverlapComposer;
                        });

                        if (visibleButtons.length > 0) {
                            const buttonsAwayFromBottom = visibleButtons.filter(button => {
                                const rect = button.getBoundingClientRect();
                                return rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) - 100;
                            });

                            const targetButton = (buttonsAwayFromBottom.length > 0)
                                ? buttonsAwayFromBottom.reduce((lowest, button) => {
                                    const buttonBottom = button.getBoundingClientRect().bottom;
                                    return buttonBottom > lowest.getBoundingClientRect().bottom ? button : lowest;
                                }, buttonsAwayFromBottom[0])
                                : null;

                            targetButton?.click();
                        }
                    } catch (e) {
                        // Silent fail
                    }
                }, 50);
            },
            [shortcuts.shortcutKeySendEdit]: () => {
                try {
                    const containers = document.querySelectorAll('div.flex.justify-end.gap-2');

                    for (const container of containers) {
                        const buttons = container.querySelectorAll('button');
                        if (buttons.length >= 2) {
                            const sendButton = buttons[1];

                            const rect = sendButton.getBoundingClientRect();
                            const isVisible = (
                                rect.top >= 0 &&
                                rect.left >= 0 &&
                                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                            );

                            if (isVisible) {
                                sendButton.click();
                                break;
                            }
                        }
                    }
                } catch (e) {
                    // Fail silently
                }
            },
            [shortcuts.shortcutKeyNewConversation]: function newConversation() {
                // 1) Fire the native “New Chat” shortcut first (Ctrl/Cmd + Shift + O)
                const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
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
                const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
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
            [shortcuts.shortcutKeyClickNativeScrollToBottom]: () => {      // @note // native scroll to bottom
                const scrollContainer = getScrollableContainer();

                if (!scrollContainer) return;

                const scrollHeight = scrollContainer.scrollHeight;
                const clientHeight = scrollContainer.clientHeight;
                const currentScroll = scrollContainer.scrollTop;

                const remainingScroll = scrollHeight - clientHeight - currentScroll;
                const viewportsBelow = remainingScroll / clientHeight;
                const duration = (0.2 + Math.floor(viewportsBelow) * 0.5) * 0.02;

                gsap.to(scrollContainer, {
                    duration,
                    scrollTo: { y: "max" },
                    ease: "sine.out"
                });
            },
            [shortcuts.shortcutKeyScrollToTop]: () => {
                const scrollContainer = getScrollableContainer();

                if (!scrollContainer) return;

                const currentScroll = scrollContainer.scrollTop;
                const viewportHeight = scrollContainer.clientHeight;

                const viewportsAbove = currentScroll / viewportHeight;
                const duration = (0.2 + Math.floor(viewportsAbove) * 0.5) * 0.02;  //  .001, .01, .1, .5, .75, 1, 5, 10, 15, 20     0.001 is instant, .01 is default, .1 is slower, 1 is slow, 5 is crawl, 10, 15, 20 

                gsap.to(scrollContainer, {
                    duration,
                    scrollTo: { y: 0 },
                    ease: "sine.out"
                });
            },
            [shortcuts.shortcutKeyToggleSidebar]: function toggleSidebar() {
                // 1) fire native Ctrl+Shift+S (or Cmd+Shift+S on macOS)
                const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
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
                document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
                document.dispatchEvent(new KeyboardEvent('keyup', eventInit));

                // 2) if native toggle succeeded, stop
                if (document.querySelector('button[data-testid="close-sidebar-button"]')?.offsetParent !== null) {
                    if (typeof window.flashSlimSidebarBar === "function") window.flashSlimSidebarBar();
                    return;
                }

                // 3) fallback: direct click on test‑ID buttons
                const direct = document.querySelector(
                    'button[data-testid="open-sidebar-button"], button[data-testid="close-sidebar-button"]'
                );
                if (direct?.offsetParent !== null) {
                    direct.click();
                    if (typeof window.flashSlimSidebarBar === "function") window.flashSlimSidebarBar();
                    return;
                }

                // 4) final fallback: legacy SVG‑path selectors
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
                        if (typeof window.flashSlimSidebarBar === "function") window.flashSlimSidebarBar();
                        return;
                    }
                }

                // 5) If nothing worked, still try to flash (may be visible already)
                if (typeof window.flashSlimSidebarBar === "function") window.flashSlimSidebarBar();
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
            [shortcuts.shortcutKeySearchWeb]: () => {
                // Menu-opening button
                const TOOL_MENU_BTN_SEL = 'button#system-hint-button[aria-haspopup="menu"]';
                // The unique SVG path for the "search the web" tool
                const SEARCH_SVG_PATH =
                    'div[role="menuitemradio"] svg path[d^="M10 2.125C14.3492"]';

                // Helper to open menu if not open
                const openMenuIfClosed = menuBtn => {
                    if (menuBtn.getAttribute('aria-expanded') !== 'true') {
                        menuBtn.focus();
                        ['keydown', 'keyup'].forEach(type =>
                            menuBtn.dispatchEvent(
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
                };

                const tryClickMenuItem = (root, attempt = 0) => {
                    // Find the svg path inside a menuitemradio
                    const path = root.querySelector(SEARCH_SVG_PATH);
                    if (path) {
                        // Find the ancestor div with role=menuitemradio
                        const item = path.closest('div[role="menuitemradio"]');
                        if (item) {
                            item.click();
                            return true;
                        }
                    }
                    // Retry up to 10x if not found (menu might not be open yet)
                    if (attempt < 10) setTimeout(() => tryClickMenuItem(root, attempt + 1), 50);
                    return false;
                };

                // Try inside unified composer first
                const composer = document.querySelector('form[data-type="unified-composer"]');
                if (composer) {
                    const menuBtn = composer.querySelector(TOOL_MENU_BTN_SEL);
                    if (menuBtn) {
                        openMenuIfClosed(menuBtn);
                        setTimeout(() => tryClickMenuItem(document), 200);
                        return;
                    }
                }

                // Fallback: global scope
                const menuBtn = document.querySelector(TOOL_MENU_BTN_SEL);
                if (menuBtn) {
                    openMenuIfClosed(menuBtn);
                    setTimeout(() => tryClickMenuItem(document), 200);
                }
            },
            [shortcuts.shortcutKeyPreviousThread]: () => {
                /* ---- 1. find every “previous‑response” button via multiple selectors ---- */
                const selectorList = [
                    'div.tabular-nums',
                    'button svg path[d^="M11.5292 3.7793"]'
                ];

                const buttons = selectorList.flatMap(sel => {
                    if (sel === 'div.tabular-nums') {
                        return Array.from(document.querySelectorAll(sel))
                            .map(el => el.previousElementSibling)
                            .filter(el => el?.tagName === 'BUTTON');
                    }
                    return Array.from(document.querySelectorAll(sel))
                        .map(el => el.closest('button'))
                        .filter(Boolean);
                });

                if (!buttons.length) return;

                /* ---- 2. choose the one farthest down‑page (latest turn) ---- */
                const target = buttons.reduce((a, b) =>
                    b.getBoundingClientRect().top > a.getBoundingClientRect().top ? b : a
                );

                /* ---- 3. ensure it’s interactable even when masked ---- */
                const wrapper = target.closest('[class*="group-hover"]');
                if (wrapper) {
                    wrapper.classList.add('force-hover');
                    ensureForceHoverStyle();
                    ['pointerover', 'pointerenter', 'mouseover']
                        .forEach(evt => wrapper.dispatchEvent(new MouseEvent(evt, { bubbles: true })));
                }

                /* ---- 4. click after one paint so the override is active ---- */
                requestAnimationFrame(() => target.click());
            },
            [shortcuts.shortcutKeyNextThread]: () => {
                /* ---- 1. find every “next‑response” button via multiple selectors ---- */
                const selectorList = [
                    'div.tabular-nums',
                    'button svg path[d^="M7.52925 3.7793"]'
                ];

                const buttons = selectorList.flatMap(sel => {
                    if (sel === 'div.tabular-nums') {
                        return Array.from(document.querySelectorAll(sel))
                            .map(el => el.nextElementSibling)
                            .filter(el => el?.tagName === 'BUTTON');
                    }
                    return Array.from(document.querySelectorAll(sel))
                        .map(el => el.closest('button'))
                        .filter(Boolean);
                });

                if (!buttons.length) return;

                /* ---- 2. dedupe ---- */
                const uniqueButtons = [...new Set(buttons)];

                /* ---- 3. choose the one farthest down‑page (latest turn) ---- */
                const target = uniqueButtons.reduce((a, b) =>
                    b.getBoundingClientRect().top > a.getBoundingClientRect().top ? b : a
                );

                /* ---- 4. ensure it’s interactable even when masked ---- */
                const wrapper = target.closest('[class*="group-hover"]');
                if (wrapper) {
                    wrapper.classList.add('force-hover');
                    ensureForceHoverStyle();
                    ['pointerover', 'pointerenter', 'mouseover']
                        .forEach(evt => wrapper.dispatchEvent(new MouseEvent(evt, { bubbles: true })));
                }

                /* ---- 5. click after one paint so the override takes effect ---- */
                requestAnimationFrame(() => target.click());
            },
            [shortcuts.selectThenCopy]: (() => {
                window.selectThenCopyState = window.selectThenCopyState || {
                    lastSelectedIndex: -1
                };

                const DEBUG = false;

                return () => {
                    setTimeout(() => {
                        try {
                            const onlySelectAssistant = window.onlySelectAssistantCheckbox || false;
                            const onlySelectUser = window.onlySelectUserCheckbox || false;
                            const disableCopyAfterSelect = window.disableCopyAfterSelectCheckbox || false;

                            const allConversationTurns = Array.from(document.querySelectorAll('[class*="conversation-turn"]'));

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

                                    if (isUser) {
                                        contentEl =
                                            turn.querySelector('[data-message-author-role="user"] .whitespace-pre-wrap') ||
                                            turn.querySelector('[data-message-author-role="user"]');
                                    } else {
                                        contentEl =
                                            turn.querySelector('[data-message-author-role="assistant"] .prose') ||
                                            turn.querySelector('[data-message-author-role="assistant"]') ||
                                            turn.querySelector('.prose');
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

                                    const range = document.createRange();
                                    range.selectNodeContents(el);
                                    selection.addRange(range);

                                    if (!disableCopyAfterSelect) {
                                        document.execCommand('copy');
                                    }
                                } catch (err) {
                                    if (DEBUG) console.debug('doSelectAndCopy failed:', err);
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

                // Utility: Is an element visible in the viewport?
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

                // Step 2: After a short delay, find all visible matching menu items, pick the lowest, and click it
                function clickLowestMenuItem(attempt = 0) {
                    const menuItemPaths = Array.from(document.querySelectorAll(MENUITEM_SELECTOR));
                    const visibleMenuItems = menuItemPaths
                        .map(path => path.closest('div[role="menuitem"]'))
                        .filter(item => item && isVisible(item));
                    if (visibleMenuItems.length) {
                        const lowestMenuItem = visibleMenuItems[visibleMenuItems.length - 1];
                        lowestMenuItem.click();
                        return;
                    }
                    // Retry for up to ~500ms if not found
                    if (attempt < 10) setTimeout(() => clickLowestMenuItem(attempt + 1), 50);
                }

                setTimeout(() => clickLowestMenuItem(), lowestMenuBtn.getAttribute('aria-expanded') === 'true' ? 0 : 200);
            },
        }; // Close keyFunctionMapping object


        // Assign the functions to the window object for global access
        window.toggleSidebar = keyFunctionMappingAlt[shortcuts.shortcutKeyToggleSidebar];
        window.newConversation = keyFunctionMappingAlt[shortcuts.shortcutKeyNewConversation];
        window.globalScrollToBottom = keyFunctionMappingAlt[shortcuts.shortcutKeyClickNativeScrollToBottom];


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

            // Determine the intended key in a layout-independent way using event.key
            // Canonical key: use layout-aware key for text, keep exact for special keys
            let keyIdentifier = event.key.length === 1
                ? event.key.toLowerCase()
                : event.key;

            // Handle Alt-based shortcuts (only if Alt is enabled for model switching or not a model-switch combo)
            if (isAltPressed && !isCtrlPressed) {

                // Always open menu for Alt+W (or whatever your toggle key is)
                if (keyIdentifier === modelToggleKey) {
                    event.preventDefault();
                    window.toggleModelSelector();
                    return;
                }

                // Only block Alt+1-5 if using Ctrl/Cmd for model switching
                if (window.useAltForModelSwitcherRadio === false) {
                    if (/^\d$/.test(keyIdentifier)) {
                        // Only block Alt+1 through Alt+5, but NOT the toggle key
                        return;
                    }
                }
                const altShortcut = keyFunctionMappingAlt[keyIdentifier];
                if (altShortcut) {
                    event.preventDefault();
                    altShortcut();
                }
            }

            // Handle Ctrl/Command‑based shortcuts (model‑menu **toggle** only)
            // Number‑key selection is left to the IIFE so we don’t duplicate logic.
            if (isCtrlPressed && !isAltPressed) {

                // If user chose Ctrl/Cmd for the model switcher, only intercept the toggle key (e.g. Ctrl + W).
                if (window.useControlForModelSwitcherRadio === true && keyIdentifier === modelToggleKey) {
                    event.preventDefault();
                    window.toggleModelSelector();   // open / close the menu
                    return;                         // allow Ctrl/Cmd + 1‑5 to fall through to the IIFE
                }

                // … everything else (Ctrl + Enter, Ctrl + Backspace, etc.) stays the same ↓
                if (keyIdentifier in keyFunctionMappingCtrl) {
                    if (isCtrlShortcutEnabled(keyIdentifier)) {
                        event.preventDefault();
                        keyFunctionMappingCtrl[keyIdentifier]();
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
        if (sticky) {
            gsap.set(sticky, {
                paddingTop: '0.2rem',
                paddingBottom: '0.2rem',
                overflow: 'visible',
                width: '100%',
                boxSizing: 'border-box'
            });

            gsap.fromTo(sticky, {
                y: -20,
                opacity: 0
            }, {
                y: 0,
                opacity: 1,
                duration: 0.2,
                ease: 'power1.out'
            });

            sticky.querySelectorAll('button, img, svg').forEach(el => {
                gsap.to(el, {
                    scale: 1,
                    transformOrigin: 'center',
                    duration: 0.2,
                    ease: 'sine.out'
                });
            });
        }

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
        document.querySelectorAll('.group\\/conversation-turn .absolute').forEach(el => {
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
                    if (n.matches('.group\\/conversation-turn .absolute')) {
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
    padding-bottom: 2px;
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



// =====================================
// Change Disclaimer Text Styling 
// =====================================

(function () {
    // Directly set the disclaimer text color to match the background color using --surface-secondary
    const disclaimer = document.querySelector('.px-2.py-2.text-center.text-xs');

    if (disclaimer) {
        disclaimer.style.color = 'var(--main-surface-primary)';
    }
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
                                    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

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
                    div#bottomBarRight { scale: 0.85; padding-right: 2em;}
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
                    .bg-token-bg-elevated-secondary.sticky.bottom-0 {
                        display: none !important;
                    }


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

            })();
        }
    );
})();



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

(() => {
    const containerSel = 'div.flex.h-full.w-full.flex-col.items-center.justify-center.gap-4';
    const btnSel = `${containerSel} button.btn-secondary`;

    // 1) Inject fade CSS
    const style = document.createElement('style');
    style.textContent = `
      ${containerSel} {
        opacity: 0;
        transition: opacity 200ms ease-in-out;
      }
      ${containerSel}.visible {
        opacity: 1;
      }
    `;
    document.head.append(style);

    // 2) Centralized click + fade logic
    let scheduled = false;
    const handleNode = (node) => {
        if (!(node instanceof HTMLElement) || !node.matches(containerSel)) return;
        node.classList.add('visible');   // fade in
        if (scheduled) return;
        scheduled = true;
        requestIdleCallback(() => {
            node.querySelector(btnSel)?.click();
            node.classList.remove('visible');  // fade out
            scheduled = false;
        });
    };

    // 3) Initial pass in case it’s already there
    document.querySelectorAll(containerSel).forEach(handleNode);

    // 4) Watch for new ones
    new MutationObserver(muts => {
        for (let { addedNodes } of muts) {
            addedNodes.forEach(handleNode);
        }
    }).observe(document.body, { childList: true, subtree: true });
})();



// =====================================
// @note Alt+1 to Alt+5 to select model
// =====================================

(() => {

    /* ────────────────────────────────────────────────────────────────
       1.  Alt/Option  or  Ctrl/Cmd  + 1 … 5   →   pick a model
       ──────────────────────────────────────────────────────────────── */
    (() => {
        // Hotkey model switching logic
        chrome.storage.sync.get(['useControlForModelSwitcherRadio'], ({ useControlForModelSwitcherRadio }) => {
            const IS_MAC = /Mac|iPad|iPhone|iPod/.test(navigator.platform);
            const USE_CTRL = !!useControlForModelSwitcherRadio;
            const MENU_BTN = 'button[data-testid="model-switcher-dropdown-button"]';
            const ITEM_SEL = 'div[role="menuitem"][data-radix-collection-item]';

            const modPressed = e =>
                USE_CTRL ? (IS_MAC ? e.metaKey : e.ctrlKey) : e.altKey;

            const synthClick = el => {
                if (el) {
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    el.focus?.();
                }
            };

            const clickItem = i => synthClick([...document.querySelectorAll(ITEM_SEL)][i]);

            const openAndSelect = i => {
                const btn = document.querySelector(MENU_BTN);
                if (!btn) return;

                if (btn.getAttribute('aria-expanded') === 'true') {
                    clickItem(i);
                    return;
                }

                btn.focus();
                ['keydown', 'keyup'].forEach(type =>
                    btn.dispatchEvent(
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

                {
                    const bottomBar = document.getElementById('bottomBarContainer');
                    if (bottomBar) {
                        // Use the same fade timing logic as original
                        clearTimeout(bottomBar._flashTimer);
                        clearTimeout(bottomBar._fadeT);
                        bottomBar.style.opacity = '1'; // show immediately

                        // Idle opacity function (from main IIFE)
                        const idleOpacity = () =>
                            bottomBar.style.opacity = (typeof window.popupBottomBarOpacityValue === 'number'
                                ? window.popupBottomBarOpacityValue : 0.6).toString();

                        // Use 4000ms or your desired duration
                        bottomBar._flashTimer = setTimeout(idleOpacity, 4000);
                    }
                }
                setTimeout(() => clickItem(i), 500);



            };



            window.addEventListener(
                'keydown',
                e => {
                    if (!modPressed(e) || !/^Digit[1-5]$/.test(e.code)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    openAndSelect(+e.code.slice(-1) - 1);
                },
                true
            );
        });
    })();




    /* ────────────────────────────────────────────────────────────────
       2.  Append tiny “Alt/Option+N” or “Ctrl/Cmd+N” labels
       ──────────────────────────────────────────────────────────────── */
    (() => {
        // Label rendering logic
        chrome.storage.sync.get(['useControlForModelSwitcherRadio'], ({ useControlForModelSwitcherRadio }) => {
            const IS_MAC = /Mac|iPad|iPhone|iPod/.test(navigator.platform);
            const USE_CTRL = !!useControlForModelSwitcherRadio;
            const MOD_LABEL = USE_CTRL
                ? (IS_MAC ? 'Command' : 'Ctrl')
                : (IS_MAC ? 'Option' : 'Alt');

            const MENU_BTN_SEL = 'button[data-testid="model-switcher-dropdown-button"]';
            const ITEM_SEL = 'div[role="menuitem"][data-radix-collection-item]';
            const MAX_DIGIT = 5;

            const style = document.createElement('style');
            style.textContent = `
                .alt-hint {
                    font-size: 10px;
                    opacity: .55;
                    margin-left: 6px;
                    user-select: none;
                    pointer-events: none;
                }
            `;
            document.head.appendChild(style);

            const addHints = () => {
                const btn = document.querySelector(MENU_BTN_SEL);
                if (!btn || btn.getAttribute('aria-expanded') !== 'true') return;

                const menu = document.getElementById(btn.getAttribute('aria-controls') || '');
                if (!menu) return;

                [...menu.querySelectorAll(ITEM_SEL)]
                    .slice(0, MAX_DIGIT)
                    .forEach((el, i) => {
                        if (el.querySelector('.alt-hint')) return;
                        const span = document.createElement('span');
                        span.className = 'alt-hint';
                        span.textContent = `${MOD_LABEL}+${i + 1}`;
                        (el.querySelector('.flex') || el).appendChild(span);
                    });
            };

            const isOnMenuBtn = e =>
                e.composedPath?.().some(n => n instanceof Element && n.matches(MENU_BTN_SEL));

            document.addEventListener('click', e => isOnMenuBtn(e) && requestAnimationFrame(addHints));
            document.addEventListener('keydown', e => {
                if (isOnMenuBtn(e) && (e.key === 'Enter' || e.key === ' ')) {
                    requestAnimationFrame(addHints);
                }
            });

            if (document.querySelector(MENU_BTN_SEL)?.getAttribute('aria-expanded') === 'true') {
                requestAnimationFrame(addHints);
            }
        });
    })();



    /* ────────────────────────────────────────────────────────────────
       3.  Alt + W   →   open / close the model menu
       ──────────────────────────────────────────────────────────────── */
    // Global function to toggle the model selector menu
    window.toggleModelSelector = function () {
        try {
            const MENU_BTN_SEL = 'button[data-testid="model-switcher-dropdown-button"]';
            const btn = document.querySelector(MENU_BTN_SEL);
            if (!btn) return;

            btn.focus();
            ['keydown', 'keyup'].forEach(type => {
                btn.dispatchEvent(
                    new KeyboardEvent(type, {
                        key: ' ',
                        code: 'Space',
                        keyCode: 32,
                        charCode: 32,
                        bubbles: true,
                        cancelable: true,
                        composed: true
                    })
                );
            });
        } catch (_) {
            // Fail silently
        }
    };




})();



// ====================================
//  rememberSidebarScrollPositionCheckbox
//  @note  Chat‑sidebar scroll restore – per‑tab & user‑toggleable
// ====================================

(function () {

    chrome.storage.sync.get(
        { rememberSidebarScrollPositionCheckbox: false },
        ({ rememberSidebarScrollPositionCheckbox: enabled }) => {
            if (!enabled) return;                          // feature disabled

            (function () {
                "use strict";

                /* ── constants ─────────────────────────── */
                const SELECTOR = 'nav[aria-label="Chat history"]';
                const BASE_KEY = '__chat_sidebar_scroll__';
                const SAVE_THROTTLE = 120;   // ms
                const BOTTOM_NUDGE = 3;     // px above bottom
                const LOOP_SLEEP = 100;   // ms between attempts
                const NO_GROWTH_MS = 1000;  // stop after this long w/o growth

                /* ── per‑tab ID ────────────────────────── */
                const TAB_ID_KEY = '__chat_sidebar_tab_id__';
                let tabId;
                try { tabId = sessionStorage.getItem(TAB_ID_KEY); } catch { }
                if (!tabId) {
                    tabId = typeof crypto?.randomUUID === "function"
                        ? crypto.randomUUID()
                        : Date.now().toString(36) + Math.random().toString(36).slice(2);
                    try { sessionStorage.setItem(TAB_ID_KEY, tabId); } catch { }
                }
                const STORAGE_KEY = `${BASE_KEY}_${tabId}`;

                /* ── storage wrappers (fail‑safe) ──────── */
                const getPos = () => new Promise(res => {
                    try {
                        const s = sessionStorage.getItem(STORAGE_KEY);
                        if (s !== null) return res(Number(s) || 0);
                    } catch { }
                    try {
                        chrome.storage.local.get([STORAGE_KEY], r =>
                            res(Number(r[STORAGE_KEY]) || 0)
                        );
                    } catch { res(0); }
                });

                const setPos = v => {
                    try { sessionStorage.setItem(STORAGE_KEY, v); } catch { }
                    try { chrome.storage.local.set({ [STORAGE_KEY]: v }); } catch { }
                };

                /* ── tiny helpers ──────────────────────── */
                const sleep = ms => new Promise(r => setTimeout(r, ms));
                const throttle = (fn, ms) => {
                    let last = 0, id = 0;
                    return (...a) => {
                        const now = Date.now();
                        const call = () => fn(...a);
                        if (now - last > ms) { last = now; call(); }
                        else if (!id) id = setTimeout(() => { id = 0; last = Date.now(); call(); },
                            ms - (now - last));
                    };
                };

                /* ── restore loop ──────────────────────── */
                async function restore(container, wanted) {
                    if (!wanted) return;
                    container.__restoring = true;

                    let abort = false;
                    const stop = () => { abort = true; };
                    container.addEventListener("wheel", stop, { passive: true });
                    container.addEventListener("touchstart", stop, { passive: true });

                    await sleep(150);                      // let layout settle
                    let lastH = container.scrollHeight;
                    let lastGrowth = performance.now();

                    while (!abort) {
                        const maxReach = container.scrollHeight - container.clientHeight;

                        if (maxReach >= wanted) {          // target reachable
                            container.scrollTop = wanted;
                            break;
                        }

                        container.scrollTop = Math.max(0, maxReach - BOTTOM_NUDGE);
                        await sleep(LOOP_SLEEP);

                        if (container.scrollHeight !== lastH) {
                            lastH = container.scrollHeight;
                            lastGrowth = performance.now();
                        } else if (performance.now() - lastGrowth > NO_GROWTH_MS) {
                            break;                          // stalled
                        }
                    }

                    container.removeEventListener("wheel", stop);
                    container.removeEventListener("touchstart", stop);
                    container.__restoring = false;
                }

                /* ── attach to one sidebar ─────────────── */
                function attach(container) {
                    if (container.__scrollSyncAttached) return;
                    container.__scrollSyncAttached = true;

                    getPos().then(pos => {
                        restore(container, pos);
                        setTimeout(() => restore(container, pos), 400); // after transitions
                    });

                    container.addEventListener(
                        "scroll",
                        throttle(() => {
                            if (!container.__restoring) setPos(container.scrollTop);
                        }, SAVE_THROTTLE),
                        { passive: true }
                    );
                }

                /* ── watch DOM for sidebars ────────────── */
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

                if (document.readyState === "loading")
                    document.addEventListener("DOMContentLoaded", init, { once: true });
                else
                    init();
            })();
        }
    );

})();



// ====================================
//  @note Make sidebar Day Headers sticky
//  This will ensure that the day headers in the sidebar remain visible
//  while scrolling through the chat history
// ====================================

(() => {
    const FLAG = '__stickyCssInjected';

    function init() {
        if (window[FLAG]) return;
        window[FLAG] = true;

        const container = document.querySelector('nav[aria-label="Chat history"]');
        if (!container) return;

        // Compute offset beneath the main sidebar header (if present)
        const sidebarHeader = container.querySelector('#sidebar-header');
        const offsetTop = sidebarHeader ? sidebarHeader.offsetHeight : 0;

        // 1. Inject sticky-header CSS
        const style = document.createElement('style');
        style.textContent = `
        nav[aria-label="Chat history"] h2.__menu-label {
            position: sticky !important;
            top: ${offsetTop}px !important;
            background-color: var(--sidebar-surface-primary) !important;
            z-index: 5 !important;
            margin: 0 !important;
            display: block !important;
            padding-top: 5px !important;
            padding-bottom: 3px !important;
        }

`;
        document.head.appendChild(style);

        // 2. Apply background-color inline to existing headers
        const applyBg = el => {
            el.style.backgroundColor = 'var(--sidebar-surface-primary)';
        };
        container.querySelectorAll('h2.__menu-label').forEach(applyBg);

        // 3. Observe only the sidebar container for future <h2.__menu-label> insertions
        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                m.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (node.matches && node.matches('h2.__menu-label')) {
                        applyBg(node);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('h2.__menu-label').forEach(applyBg);
                    }
                });
            }
        });
        observer.observe(container, { childList: true, subtree: true });
    }

    // If sidebar already exists, initialize immediately
    if (document.querySelector('nav[aria-label="Chat history"]')) {
        init();
    } else {
        // Otherwise, watch document.body until the sidebar is added
        const watcher = new MutationObserver((mutations, obs) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (
                        node.nodeType === 1 &&
                        (node.matches('nav[aria-label="Chat history"]') ||
                            (node.querySelector && node.querySelector('nav[aria-label="Chat history"]')))
                    ) {
                        obs.disconnect();
                        init();
                        return;
                    }
                }
            }
        });
        watcher.observe(document.body, { childList: true, subtree: true });
    }
})();



// ====================================
//  @note  SlimbarOpacity Fade IIFE
// ====================================

(function () {
    chrome.storage.sync.get(
        { fadeSlimSidebarEnabled: false },
        ({ fadeSlimSidebarEnabled: enabled }) => {
            if (!enabled) return;

            async function waitForElement(selector, timeout = 12000, poll = 200) {
                const start = Date.now();
                let el;
                while (!(el = document.querySelector(selector)) && (Date.now() - start < timeout)) {
                    await new Promise(r => setTimeout(r, poll));
                }
                return el;
            }

            // ========== (A) One-time storage fetch/cached promise style ==========
            let slimSidebarOpacityPromise;
            function ensureSlimSidebarOpacityReady() {
                if (slimSidebarOpacityPromise) return slimSidebarOpacityPromise;
                slimSidebarOpacityPromise = new Promise((resolve) => {
                    if (!chrome?.storage?.sync) {
                        window.popupSlimSidebarOpacityValue_slimbar = 0.6;
                        return resolve(window.popupSlimSidebarOpacityValue_slimbar);
                    }
                    try {
                        chrome.storage.sync.get({ popupSlimSidebarOpacityValue: 0.6 }, (res) => {
                            if (chrome.runtime.lastError) {
                                window.popupSlimSidebarOpacityValue_slimbar = 0.6;
                            } else {
                                window.popupSlimSidebarOpacityValue_slimbar =
                                    typeof res.popupSlimSidebarOpacityValue === 'number'
                                        ? res.popupSlimSidebarOpacityValue
                                        : 0.6;
                            }
                            resolve(window.popupSlimSidebarOpacityValue_slimbar);
                        });
                    } catch (e) {
                        window.popupSlimSidebarOpacityValue_slimbar = 0.6;
                        resolve(window.popupSlimSidebarOpacityValue_slimbar);
                    }
                });
                return slimSidebarOpacityPromise;
            }

            (async function main() {
                await ensureSlimSidebarOpacityReady();
                const bar = await waitForElement('div#stage-sidebar-tiny-bar');
                if (!bar) return;
                bar.style.transition = 'opacity 0.5s';



                let fadeT = null;
                let isHovered = false;

                function getIdleOpacity() {
                    return typeof window.popupSlimSidebarOpacityValue_slimbar === 'number'
                        ? window.popupSlimSidebarOpacityValue_slimbar
                        : 0.6;
                }

                // ----------------- OPEN/CLOSE DETECTION -----------------
                function isSidebarOpen() {
                    // The tiny bar itself tells us: when the big sidebar is open
                    // it acquires both 'pointer-events-none' class *and* an 'inert' attribute.
                    return bar.classList.contains('pointer-events-none') || bar.hasAttribute('inert');
                }


                function updateTinyBarVisibility() {
                    clearTimeout(fadeT);               // cancel any pending fade

                    if (isSidebarOpen()) {
                        bar.style.opacity = '0';       // hide while big sidebar open
                    } else if (!isHovered) {
                        // show bar for 2.5 s, then fade to idle
                        bar.style.opacity = '1';
                        fadeT = setTimeout(fadeToIdle, 2500);
                    }
                }

                // 2️⃣ keep fadeToIdle() simple:
                function fadeToIdle() {
                    if (!isHovered && !isSidebarOpen()) {
                        bar.style.opacity = getIdleOpacity().toString();
                    }
                }


                // Observe the sidebar for open/close changes
                const openCloseObserver = new MutationObserver(updateTinyBarVisibility);
                openCloseObserver.observe(bar, {
                    attributes: true,
                    attributeFilter: ['class', 'inert']
                });

                // Initial state
                updateTinyBarVisibility();
                // --------------------------------------------------------



                function fadeToIdle() {
                    if (!isHovered) {
                        bar.style.opacity = isSidebarOpen() ? '0' : getIdleOpacity().toString();
                    }
                }
                function fadeToVisible() {
                    bar.style.opacity = '1';
                }

                // Set initial state after delay (in case user never hovers)
                fadeT = setTimeout(fadeToIdle, 2500);

                // Hover logic
                bar.addEventListener('mouseenter', () => {
                    isHovered = true;
                    clearTimeout(fadeT);
                    fadeToVisible();
                });
                bar.addEventListener('mouseleave', () => {
                    isHovered = false;
                    clearTimeout(fadeT);
                    fadeT = setTimeout(fadeToIdle, 2500);
                });

                // Expose a method to "flash" the slim bar (simulate hover)
                // Expose a method to "flash" the slim bar (simulate hover)
                window.flashSlimSidebarBar = (() => {
                    let flashTimer = null;       // keeps overlapping flashes from colliding
                    return function flashSlimSidebarBar(duration = 200) {
                        if (!bar) return;

                        clearTimeout(flashTimer);   // cancel any in-flight flash
                        const prevHovered = isHovered;

                        // Make the bar fully visible immediately
                        isHovered = true;           // temporarily prevent idle fade
                        bar.style.opacity = '1';

                        flashTimer = setTimeout(() => {
                            isHovered = prevHovered;   // restore previous hover state
                            updateTinyBarVisibility(); // re-apply 0 or idle opacity as needed
                        }, duration);                 // default 200 ms; tweak as you like
                    };
                })();


                // Keep in sync with storage changes (slider move in popup)
                chrome.storage.onChanged.addListener((changes, area) => {
                    if (area !== 'sync') return;
                    if ('popupSlimSidebarOpacityValue' in changes) {
                        window.popupSlimSidebarOpacityValue_slimbar =
                            typeof changes.popupSlimSidebarOpacityValue.newValue === 'number'
                                ? changes.popupSlimSidebarOpacityValue.newValue
                                : 0.6;
                        // Only update opacity if not hovered
                        if (!isHovered) {
                            bar.style.opacity = isSidebarOpen() ? '0' : getIdleOpacity().toString();
                        }
                    }
                });
            })();
        }
    );
})();