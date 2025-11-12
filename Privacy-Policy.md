# Plain Language Privacy Statement
Effective: November 12, 2025

- We use your data only to save your extension settings and—if you turn on Cloud Sync—to back up those settings to your own Google Drive.
- We do not collect, sell, or share your information. No ads, analytics, or tracking.
- By default, nothing leaves your device. If you use Cloud Sync, your settings are saved only in a hidden app‑data file in your Google Drive (we never see it).
- Sign‑in uses a short‑lived token (i.e., a temporary digital key). A tiny helper service briefly exchanges a one‑time Google code for that token; it does not log or store tokens or your settings.
- We do not request or store your email.
- You can turn Cloud Sync off, log out to clear tokens, delete the hidden backup in Google Drive, or uninstall the extension at any time.

# Technical Details
- Local data: settings in Chrome storage; OAuth tokens in Chrome’s session storage (temporary; not synced; cleared on logout or full browser restart); an optional cached Drive file ID to speed up backup/restore.
- Cloud Sync scope: `drive.appdata` only, writing one JSON file (e.g., `extension_settings.json`) in your Google Drive’s appDataFolder. All requests use HTTPS and go directly from your browser to Google.
- Permissions (requested only when needed): `storage` (save settings) and `identity` (get a Google token). We do not request `identity.email`.
- Not collected: browsing history, page content, keystrokes, or analytics. Content scripts run only on listed sites to provide shortcuts/UI and do not transmit page content.
- Deletion: log out to clear tokens; delete the hidden backup via Google Drive settings (Manage apps → this extension → Delete hidden app data); uninstall to remove local data.

Contact: Use the Support link on the Chrome Web Store listing.