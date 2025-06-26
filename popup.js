document.addEventListener('DOMContentLoaded', function () {
    // Localize the title dynamically
    const titleElement = document.querySelector('title');
    const localizedTitle = chrome.i18n.getMessage('popup_title');
    if (titleElement && localizedTitle) {
        titleElement.textContent = localizedTitle;
    }

    // Detect if the platform is Mac
    // Detect if the platform is Mac
    const isMac = navigator.userAgent.includes('Mac');

    // Update tooltips for Mac and localization (fixed, prevents double attachment)
    document.querySelectorAll('[data-tooltip]').forEach(el => {
        if (el.dataset.tooltipAttached !== "true") {
            let updatedTooltip = el.getAttribute('data-tooltip');
            if (updatedTooltip) {
                if (updatedTooltip.startsWith('__MSG_') && updatedTooltip.endsWith('__')) {
                    const msgKey = updatedTooltip.replace(/^__MSG_/, '').replace(/__$/, '');
                    const msg = chrome.i18n.getMessage(msgKey);
                    if (msg) updatedTooltip = msg;
                }

                if (isMac) {
                    updatedTooltip = updatedTooltip
                        .replace(/Control/g, 'Command')
                        .replace(/Alt/g, 'Opt ⌥');
                }

                el.setAttribute('data-tooltip', updatedTooltip);
            }

            addTooltip(el);
            el.dataset.tooltipAttached = "true"; // prevent double attachment
        }
    });
    // Localize other elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const message = chrome.i18n.getMessage(key);
        if (message) el.textContent = message;
    });

    // Flash highlight animation for newFeatureHighlightFlash div
    const highlightDiv = document.getElementById('newFeatureHighlightFlash');
    if (highlightDiv) {
        highlightDiv.classList.add('flash-highlight');
        setTimeout(() => {
            highlightDiv.classList.remove('flash-highlight');
        }, 3000);
    }

    // Replace shortcut labels for Mac
    const altLabel = isMac ? "Opt ⌥" : "Alt +";
    const ctrlLabel = isMac ? "Command + " : "Control + ";
    document.querySelectorAll(".shortcut span, .key-text.platform-alt-label").forEach(span => {
        if (span.textContent.includes("Alt +")) {
            span.textContent = altLabel;
        }
        if (span.textContent.includes("Ctrl +")) {
            span.textContent = ctrlLabel;
        }
    });

    /**
     * Toast function (fully restored styling and cleanup)
     */
    let toastTimeout;

    function showToast(message) {
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            const existingToast = document.querySelector('#toast-container .toast');
            if (existingToast) existingToast.remove();

            let toastContainer = document.getElementById('toast-container');
            if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.id = 'toast-container';
                Object.assign(toastContainer.style, {
                    position: 'fixed',
                    top: '1em',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    zIndex: '10000',
                    pointerEvents: 'none'
                });
                document.body.appendChild(toastContainer);
            }

            const toast = document.createElement('div');
            toast.className = 'toast';
            Object.assign(toast.style, {
                background: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '5px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                maxWidth: '300px',
                width: 'auto',
                wordWrap: 'break-word',
                fontFamily: 'Arial, sans-serif',
                fontSize: '14px',
                textAlign: 'center',
                opacity: '0',
                transition: 'opacity 0.5s ease',
                pointerEvents: 'auto'
            });

            toast.innerHTML = message;
            toastContainer.appendChild(toast);
            requestAnimationFrame(() => toast.style.opacity = '1');

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.addEventListener('transitionend', () => {
                    toast.remove();
                    if (toastContainer.childElementCount === 0) {
                        toastContainer.remove();
                    }
                });
            }, 4000);
        }, 500);
    }

    /**
     * Tooltip functionality (fully restored with formatting and visibility logic)
     */
    const tooltipArea = document.querySelector('.tooltip-area');
    let tooltipShown = false;
    let fadeOutTimeout;

    function formatTooltipText(text, maxChars = 50) {
        if (text.length <= maxChars) return text;

        let words = text.split(" ");
        let halfwayPoint = Math.ceil(text.length / 2);
        let charCount = 0;
        let formattedText = "";
        let addedBreak = false;

        words.forEach(word => {
            if (charCount + word.length > halfwayPoint && !addedBreak) {
                formattedText += "<br>";
                addedBreak = true;
            }
            formattedText += word + " ";
            charCount += word.length + 1;
        });

        return formattedText.trim();
    }


    // If label forced on to two lines, balance the line break
    /* Balance any label that *actually* wraps */
    function balanceWrappedLabels() {
        const labels = document.querySelectorAll('.shortcut-label .i18n');

        labels.forEach(label => {
            const original = label.dataset.originalText || label.textContent.trim();

            // Restore pristine label
            label.innerHTML = original;
            label.dataset.originalText = original;

            const words = original.split(' ');
            if (words.length < 2) return;

            const forceBreak = label.classList.contains('force-balance-break');
            const wrapsNaturally = label.scrollWidth > label.clientWidth + 1;

            if (!wrapsNaturally && !forceBreak) return;

            // Smart word-boundary midpoint
            const cumLen = [];
            let sum = 0;
            words.forEach((w, i) => {
                sum += w.length + (i < words.length - 1 ? 1 : 0);
                cumLen.push(sum);
            });

            const half = original.length / 2;
            let breakIdx = cumLen.findIndex(len => len >= half);
            if (
                breakIdx > 0 &&
                Math.abs(cumLen[breakIdx - 1] - half) < Math.abs(cumLen[breakIdx] - half)
            ) {
                breakIdx -= 1;
            }

            const first = words.slice(0, breakIdx + 1).join(' ');
            const second = words.slice(breakIdx + 1).join(' ');
            label.innerHTML = `${first}<br>${second}`;
        });
    }





    function addTooltip(element) {
        element.addEventListener('mouseenter', () => {
            clearTimeout(fadeOutTimeout);
            const text = element.getAttribute('data-tooltip') || '';
            tooltipArea.innerHTML = formatTooltipText(text);

            if (!tooltipShown) {
                tooltipArea.style.display = 'block';
                tooltipArea.style.opacity = '1';
                tooltipShown = true;
            } else {
                tooltipArea.style.opacity = '1';
            }
        });

        element.addEventListener('mouseleave', () => {
            tooltipArea.innerHTML = ''; // (optional: clear text, or keep last tooltip)
        });
    }


    // Attach event handlers to all elements with .tooltip class
    const tooltipElements = document.querySelectorAll('.tooltip');
    tooltipElements.forEach(addTooltip);

    // End of Utility Functions

    /**
     * Initializes default settings if not present in Chrome storage.
     * Sets the radio button and checkbox states and stores them if they haven't been defined yet.
     */
    chrome.storage.sync.get(
        [
            'hideArrowButtonsCheckbox',
            'hideCornerButtonsCheckbox',
            'removeMarkdownOnCopyCheckbox',
            'moveTopBarToBottomCheckbox',
            'pageUpDownTakeover',
            'selectMessagesSentByUserOrChatGptCheckbox',
            'onlySelectUserCheckbox',
            'onlySelectAssistantCheckbox',
            'disableCopyAfterSelectCheckbox',
            'enableSendWithControlEnterCheckbox',
            'enableStopWithControlBackspaceCheckbox',
            'useAltForModelSwitcherRadio',
            'useControlForModelSwitcherRadio',
            'rememberSidebarScrollPositionCheckbox'
        ],
        function (data) {
            const defaults = {
                hideArrowButtonsCheckbox: data.hideArrowButtonsCheckbox !== undefined ? data.hideArrowButtonsCheckbox : true, // hide arrows by default
                hideCornerButtonsCheckbox: data.hideCornerButtonsCheckbox === undefined ? true : data.hideCornerButtonsCheckbox,
                removeMarkdownOnCopyCheckbox: data.removeMarkdownOnCopyCheckbox !== undefined ? data.removeMarkdownOnCopyCheckbox : true, // Default to true
                moveTopBarToBottomCheckbox: data.moveTopBarToBottomCheckbox !== undefined ? data.moveTopBarToBottomCheckbox : false, // Default to false
                pageUpDownTakeover: data.pageUpDownTakeover !== undefined ? data.pageUpDownTakeover : true, // Default to true
                selectMessagesSentByUserOrChatGptCheckbox: data.selectMessagesSentByUserOrChatGptCheckbox !== undefined ? data.selectMessagesSentByUserOrChatGptCheckbox : true, // Default to true
                onlySelectUserCheckbox: data.onlySelectUserCheckbox !== undefined ? data.onlySelectUserCheckbox : false, // Default to false
                onlySelectAssistantCheckbox: data.onlySelectAssistantCheckbox !== undefined ? data.onlySelectAssistantCheckbox : false, // Default to false
                disableCopyAfterSelectCheckbox: data.disableCopyAfterSelectCheckbox !== undefined ? data.disableCopyAfterSelectCheckbox : false, // Default to false
                enableSendWithControlEnterCheckbox: data.enableSendWithControlEnterCheckbox !== undefined ? data.enableSendWithControlEnterCheckbox : true, // Default to true
                enableStopWithControlBackspaceCheckbox: data.enableStopWithControlBackspaceCheckbox !== undefined ? data.enableStopWithControlBackspaceCheckbox : true, // Default to true
                useAltForModelSwitcherRadio: data.useAltForModelSwitcherRadio !== undefined ? data.useAltForModelSwitcherRadio : true, // Default to true
                useControlForModelSwitcherRadio: data.useControlForModelSwitcherRadio !== undefined ? data.useControlForModelSwitcherRadio : false, // Default to false
                rememberSidebarScrollPositionCheckbox: data.rememberSidebarScrollPositionCheckbox !== undefined ? data.rememberSidebarScrollPositionCheckbox : false, // Default to false
            };

            // Update the checkbox and radio button states in the popup based on stored or default values
            document.getElementById('hideArrowButtonsCheckbox').checked = defaults.hideArrowButtonsCheckbox;
            document.getElementById('hideCornerButtonsCheckbox').checked = defaults.hideCornerButtonsCheckbox;
            document.getElementById('removeMarkdownOnCopyCheckbox').checked = defaults.removeMarkdownOnCopyCheckbox;
            document.getElementById('moveTopBarToBottomCheckbox').checked = defaults.moveTopBarToBottomCheckbox;
            document.getElementById('pageUpDownTakeover').checked = defaults.pageUpDownTakeover;
            document.getElementById('selectMessagesSentByUserOrChatGptCheckbox').checked = defaults.selectMessagesSentByUserOrChatGptCheckbox;
            document.getElementById('onlySelectUserCheckbox').checked = defaults.onlySelectUserCheckbox;
            document.getElementById('onlySelectAssistantCheckbox').checked = defaults.onlySelectAssistantCheckbox;
            document.getElementById('disableCopyAfterSelectCheckbox').checked = defaults.disableCopyAfterSelectCheckbox;
            document.getElementById('enableSendWithControlEnterCheckbox').checked = defaults.enableSendWithControlEnterCheckbox;
            document.getElementById('enableStopWithControlBackspaceCheckbox').checked = defaults.enableStopWithControlBackspaceCheckbox;
            document.getElementById('useAltForModelSwitcherRadio').checked = defaults.useAltForModelSwitcherRadio;
            document.getElementById('useControlForModelSwitcherRadio').checked = defaults.useControlForModelSwitcherRadio;
            document.getElementById('rememberSidebarScrollPositionCheckbox').checked = defaults.rememberSidebarScrollPositionCheckbox;
            // Store the defaults if the values are missing
            chrome.storage.sync.set(defaults);
        }
    );

    /**
     * Handles checkbox or radio button state changes by saving to Chrome storage and showing a toast.
     * Prevents attaching multiple event listeners.
     * @param {string} elementId - The ID of the checkbox or radio button element.
     * @param {string} storageKey - The key to store the state in Chrome storage.
     */
    function handleStateChange(elementId, storageKey) {
        const element = document.getElementById(elementId);
        if (element && !element.dataset.listenerAttached) {
            element.addEventListener('change', function () {
                const isChecked = this.checked;
                let obj = {};

                if ([
                    'selectMessagesSentByUserOrChatGptCheckbox',
                    'onlySelectUserCheckbox',
                    'onlySelectAssistantCheckbox'
                ].includes(storageKey)) {
                    obj = {
                        selectMessagesSentByUserOrChatGptCheckbox: false,
                        onlySelectUserCheckbox: false,
                        onlySelectAssistantCheckbox: false
                    };
                    obj[storageKey] = isChecked;
                } else if ([
                    'useAltForModelSwitcherRadio',
                    'useControlForModelSwitcherRadio'
                ].includes(storageKey)) {
                    obj = {
                        useAltForModelSwitcherRadio: false,
                        useControlForModelSwitcherRadio: false
                    };
                    obj[storageKey] = isChecked;
                } else {
                    obj[storageKey] = isChecked;
                }


                chrome.storage.sync.set(obj, function () {
                    if (chrome.runtime.lastError) {
                        console.error(`Error saving "${storageKey}":`, chrome.runtime.lastError);
                        showToast(`Error saving option: ${chrome.runtime.lastError.message}`);
                        return;
                    }
                    console.log(`The value of "${storageKey}" is set to ` + isChecked);
                    showToast('Options saved. Reload page to apply changes.');
                });
            });
            element.dataset.listenerAttached = 'true';
        }
    }

    // Apply the handler to each checkbox and radio button
    handleStateChange('hideArrowButtonsCheckbox', 'hideArrowButtonsCheckbox');
    handleStateChange('hideCornerButtonsCheckbox', 'hideCornerButtonsCheckbox');
    handleStateChange('removeMarkdownOnCopyCheckbox', 'removeMarkdownOnCopyCheckbox');
    handleStateChange('moveTopBarToBottomCheckbox', 'moveTopBarToBottomCheckbox');
    handleStateChange('pageUpDownTakeover', 'pageUpDownTakeover');
    handleStateChange('selectMessagesSentByUserOrChatGptCheckbox', 'selectMessagesSentByUserOrChatGptCheckbox');
    handleStateChange('onlySelectUserCheckbox', 'onlySelectUserCheckbox');
    handleStateChange('onlySelectAssistantCheckbox', 'onlySelectAssistantCheckbox');
    handleStateChange('disableCopyAfterSelectCheckbox', 'disableCopyAfterSelectCheckbox');
    handleStateChange('enableSendWithControlEnterCheckbox', 'enableSendWithControlEnterCheckbox');
    handleStateChange('enableStopWithControlBackspaceCheckbox', 'enableStopWithControlBackspaceCheckbox');
    handleStateChange('useAltForModelSwitcherRadio', 'useAltForModelSwitcherRadio');
    handleStateChange('useControlForModelSwitcherRadio', 'useControlForModelSwitcherRadio');
    handleStateChange('rememberSidebarScrollPositionCheckbox', 'rememberSidebarScrollPositionCheckbox');

    const shortcutKeys = [
        'shortcutKeyScrollUpOneMessage',
        'shortcutKeyScrollDownOneMessage',
        'shortcutKeyCopyLowest',
        'shortcutKeyEdit',
        'shortcutKeySendEdit',
        'shortcutKeyCopyAllResponses',
        'shortcutKeyCopyAllCodeBlocks',
        'shortcutKeyNewConversation',
        'shortcutKeySearchConversationHistory',
        'shortcutKeyClickNativeScrollToBottom',
        'shortcutKeyToggleSidebar',
        'shortcutKeyActivateInput',
        'shortcutKeySearchWeb',
        'shortcutKeyScrollToTop',
        'shortcutKeyPreviousThread',
        'shortcutKeyNextThread',
        'selectThenCopy',
        'shortcutKeyToggleSidebarFoldersButton',
        'shortcutKeyToggleModelSelector',
        'shortcutKeyRegenerate',
    ];
    const shortcutKeyValues = {};

    // Get the stored shortcut keys from chrome storage
    chrome.storage.sync.get(shortcutKeys, function (data) {
        shortcutKeys.forEach(id => {
            const inputElement = document.getElementById(id);
            if (inputElement) {
                const storedValue = data[id]; // Value from storage
                const defaultValue = inputElement.getAttribute('value') || ''; // Default from HTML

                // Case 1: Use stored value if it exists
                // Case 2: Treat non-breaking space as blank
                // Case 3: Fallback to default value
                const value = storedValue === '\u00A0' ? '' : (storedValue !== undefined ? storedValue : defaultValue);

                inputElement.value = value; // Set input field
                shortcutKeyValues[id] = value; // Update in-memory map
                console.log(`Loaded ${id}: "${value}"`); // Debug log
            }
        });
    });


    shortcutKeys.forEach(id => {
        const inputElement = document.getElementById(id);
        if (inputElement) {
            inputElement.addEventListener('input', function () {
                let value = this.value.trim(); // Get trimmed input value

                // Case 1: Prevent duplicate keys
                if (value !== '' && Object.values(shortcutKeyValues).includes(value)) {
                    showToast('This key is already assigned to another shortcut.');
                    this.value = shortcutKeyValues[id]; // Reset to previous value
                    return;
                }

                // Case 2: Handle cleared value (save as non-breaking space)
                if (value === '') {
                    value = '\u00A0'; // Non-breaking space
                    shortcutKeyValues[id] = value;
                    let obj = {};
                    obj[id] = value;
                    chrome.storage.sync.set(obj, function () {
                        console.log(`Shortcut ${id} cleared and saved as non-breaking space.`);
                        showToast('Shortcut cleared. Reload page to apply changes.');
                    });
                    this.value = ''; // Show the field as blank for user experience
                    return;
                }

                // Case 3: Save the new value
                shortcutKeyValues[id] = value; // Update in-memory map
                let obj = {};
                obj[id] = value;
                chrome.storage.sync.set(obj, function () {
                    console.log(`Shortcut ${id} updated to: "${value}"`);
                    showToast('Options saved. Reload page to apply changes.');
                });
            });
        }
    });


    // Handling separator keys
    const separatorKeys = ['copyCode-userSeparator', 'copyAll-userSeparator'];

    // Get the stored values and set them in the inputs
    chrome.storage.sync.get(separatorKeys, function (data) {
        separatorKeys.forEach(id => {
            const value = data[id] !== undefined ? data[id] : document.getElementById(id).value;
            document.getElementById(id).value = value;
        });
    });

    // Save separators without trimming or alteration
    separatorKeys.forEach(id => {
        const inputField = document.getElementById(id);
        if (inputField && !inputField.dataset.listenerAttached) {
            inputField.addEventListener('blur', function () {
                const separatorValue = this.value; // Use exact user input
                chrome.storage.sync.set({ [id]: separatorValue }, function () {
                    showToast('Separator saved. Reload page to apply changes.');
                });
            });
            inputField.dataset.listenerAttached = 'true';
        }
    });

    const moveTopBarCheckbox = document.getElementById('moveTopBarToBottomCheckbox');
    const sliderWrapper = document.getElementById('opacity-slider-wrapper');
    const slider = document.getElementById('opacitySlider');
    const sliderValueDisplay = document.getElementById('opacityValue');
    const previewIcon = document.getElementById('opacityPreviewIcon');
    const tooltipContainer = document.getElementById('opacity-tooltip-container');


    chrome.storage.sync.get('popupBottomBarOpacityValue', ({ popupBottomBarOpacityValue }) => {
        const val = typeof popupBottomBarOpacityValue === 'number' ? popupBottomBarOpacityValue : 0.6;
        slider.value = val;
        sliderValueDisplay.textContent = val.toFixed(2);
        previewIcon.style.opacity = val;
    });

    function toggleOpacityUI(visible) {
        // Hide or show the entire tooltip + slider block (including pseudo-elements)
        tooltipContainer.style.display = visible ? 'flex' : 'none';
    }


    // Fix: Ensure opacity UI reflects checkbox state from storage
    function toggleOpacityUI(visible) {
        tooltipContainer.style.display = visible ? 'flex' : 'none';
    }

    // Update visibility initially and on change
    chrome.storage.sync.get('moveTopBarToBottomCheckbox', ({ moveTopBarToBottomCheckbox }) => {
        const isVisible = moveTopBarToBottomCheckbox !== undefined ? moveTopBarToBottomCheckbox : false;
        moveTopBarCheckbox.checked = isVisible;
        toggleOpacityUI(isVisible);
    });

    moveTopBarCheckbox.addEventListener('change', () => {
        const isChecked = moveTopBarCheckbox.checked;
        toggleOpacityUI(isChecked);
        chrome.storage.sync.set({ moveTopBarToBottomCheckbox: isChecked });
    });


    let sliderTimeout;
    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        sliderValueDisplay.textContent = val.toFixed(2);
        previewIcon.style.opacity = val;

        clearTimeout(sliderTimeout);
        sliderTimeout = setTimeout(() => {
            let numericVal = Number(slider.value);
            if (isNaN(numericVal)) numericVal = 0.6;

            chrome.storage.sync.set({ popupBottomBarOpacityValue: numericVal }, function () {
                if (chrome.runtime.lastError) {
                    console.error('Storage set error:', chrome.runtime.lastError);
                } else {
                    console.log('popupBottomBarOpacityValue set to', numericVal);
                    showToast('Opacity saved. Reload page to apply changes.');
                }
            });
        }, 500);
    });

    setTimeout(() => {
        balanceWrappedLabels();
    }, 50); // delay lets i18n/localization update labels first





    // ===================== Fade Slim Sidebar =====================

    const fadeSlimSidebarCheckbox = document.getElementById('FadeSlimSidebarCheckbox');
    const slimSidebarSliderWrapper = document.getElementById('slimSidebar-opacity-slider-wrapper');
    const slimSidebarSlider = document.getElementById('slimSidebarOpacitySlider');
    const slimSidebarSliderValueDisplay = document.getElementById('slimSidebarOpacityValue');
    const slimSidebarPreviewIcon = document.getElementById('slimSidebarOpacityPreviewIcon');
    const slimSidebarTooltipContainer = document.getElementById('slimSidebar-opacity-tooltip-container');

    // Get and set the slider value for popupSlimSidebarOpacityValue
    chrome.storage.sync.get('popupSlimSidebarOpacityValue', ({ popupSlimSidebarOpacityValue }) => {
        const val = typeof popupSlimSidebarOpacityValue === 'number' ? popupSlimSidebarOpacityValue : 0.6;
        slimSidebarSlider.value = val;
        slimSidebarSliderValueDisplay.textContent = val.toFixed(2);
        slimSidebarPreviewIcon.style.opacity = val;
    });

    // Show/hide slider UI
    function toggleSlimSidebarOpacityUI(visible) {
        slimSidebarTooltipContainer.style.display = visible ? 'flex' : 'none';
    }

    // Set UI on load from storage for checkbox
    chrome.storage.sync.get('fadeSlimSidebarEnabled', ({ fadeSlimSidebarEnabled }) => {
        const isVisible = fadeSlimSidebarEnabled !== undefined ? fadeSlimSidebarEnabled : false;
        fadeSlimSidebarCheckbox.checked = isVisible;
        toggleSlimSidebarOpacityUI(isVisible);
    });

    fadeSlimSidebarCheckbox.addEventListener('change', () => {
        const isChecked = fadeSlimSidebarCheckbox.checked;
        toggleSlimSidebarOpacityUI(isChecked);
        chrome.storage.sync.set({ fadeSlimSidebarEnabled: isChecked });
    });

    // Slider logic
    let slimSidebarSliderTimeout;
    slimSidebarSlider.addEventListener('input', () => {
        const val = parseFloat(slimSidebarSlider.value);
        slimSidebarSliderValueDisplay.textContent = val.toFixed(2);
        slimSidebarPreviewIcon.style.opacity = val;

        clearTimeout(slimSidebarSliderTimeout);
        slimSidebarSliderTimeout = setTimeout(() => {
            let numericVal = Number(slimSidebarSlider.value);
            if (isNaN(numericVal)) numericVal = 0.6;

            chrome.storage.sync.set({ popupSlimSidebarOpacityValue: numericVal }, function () {
                if (chrome.runtime.lastError) {
                    console.error('Storage set error:', chrome.runtime.lastError);
                } else {
                    showToast('Slim sidebar opacity saved. Reload page to apply changes.');
                }
            });
        }, 500);
    });

});


