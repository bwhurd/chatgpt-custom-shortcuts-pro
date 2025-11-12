# Plain Language Privacy Statement
Effective: November 12, 2025

- We use your data only to save your extension settings. If you turn on Cloud Sync, we back up those settings to your own Google Drive.
- We do not collect, sell, or share your information. There are no ads, analytics, or tracking.
- By default, nothing leaves your device.
- If you use Cloud Sync, your backup stays in a hidden app data file in your Google Drive. We do not see it.
- Sign in uses a short lived Google token. A helper service that we operate and host on Netlify exchanges a one time Google code for that token. It does not store tokens or settings.
- We do not request or store your email address.
- You can turn off Cloud Sync at any time. You can log out to clear tokens, delete the hidden backup in Google Drive, or uninstall the extension.

# Technical Details

- Local data includes settings in Chrome storage and Google access and refresh tokens in Chrome session storage. This storage is temporary and not synced. It is cleared when you log out or restart Chrome. A cached Drive file ID may be stored to speed up backup and restore.
- The cloud backup is one JSON file named extension_settings.json in your Google Drive appDataFolder. We access only this file.
- The Google scope used is https://www.googleapis.com/auth/drive.appdata which is limited to the appDataFolder.
- All Drive requests go directly from your browser to Google over HTTPS. The sign in helper is hosted on Netlify at https://profound-yeot-41eb0a.netlify.app. It exchanges the Google code for a token and does not store tokens or settings.
- Permissions are requested only when needed. The storage permission saves settings. The identity permission gets a Google token. The extension does not request identity.email.
- We do not collect browsing history, page content, keystrokes, or analytics. Content scripts run only on listed sites and do not transmit page content.
- To delete data, log out in the extension to clear tokens, remove the hidden backup in Google Drive under Manage apps, or uninstall the extension to remove local data.

Contact: Use the Support link on the Chrome Web Store listing.