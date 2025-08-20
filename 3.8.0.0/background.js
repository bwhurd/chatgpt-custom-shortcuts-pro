// Import the chrome.runtime module
const { runtime } = chrome;

// Listen for keyboard shortcut command
chrome.commands.onCommand.addListener((command) => {
    if (command === "open-popup") {
        chrome.action.openPopup();
    }
});
