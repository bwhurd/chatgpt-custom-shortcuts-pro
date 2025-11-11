# Privacy Policy
Effective date: November 11, 2025

We respect your privacy. This extension does not collect, store, or transmit any personal data to the developer or any third party. All features run locally in your browser. No ads, no tracking, no analytics.

## What the extension stores locally
- Extension settings and preferences are saved in Chrome’s storage (chrome.storage.sync/local).
- If you sign in for Cloud Sync, a short‑lived Google OAuth access token is stored in Chrome’s session storage (not synced) only to read/write your backup file. It is cleared when you log out.

## Optional Cloud Sync (Google Drive appDataFolder)
- Purpose: Back up/restore your extension settings between Chrome installs.
- Where data is stored: Your own Google Drive appDataFolder under a hidden file (e.g., extension_settings.json). The developer cannot access this file; no servers are involved.
- Access scope: Minimal Drive scope limited to appData (“https://www.googleapis.com/auth/drive.appdata”).
- When used: Only when you explicitly click “Continue with Google,” “Save to Cloud,” or “Restore from Cloud.”

## Permissions we may request and why
These prompts are shown by Chrome at the moment you use the relevant feature (not at install), and are required for the feature to work:
- storage: Save your extension settings locally.
- identity (optional): Obtain a Google OAuth token to access your appDataFolder for Cloud Sync.
- identity.email (optional): If you choose to display the signed‑in email in the UI; the email is not stored or sent anywhere.
- https://www.googleapis.com/* (optional host permission): Make API calls to Google Drive for backup/restore.
- https://accounts.google.com/* (optional host permission): Used only if you choose to revoke the token from Google during logout; not required for normal logout.
- Content script match (e.g., *.chatgpt.com): Needed for shortcut features on that site; no page content is collected or transmitted by the extension.

We do not:
- Read your browsing history.
- Collect keystrokes or message content.
- Send any data to developer servers or third parties.

## Data retention and deletion
- Your settings remain in Chrome’s storage until you remove the extension or clear browser data.
- Your cloud backup remains in your Google Drive appDataFolder until you delete it. You can:
  - Use the extension’s “Logout” to clear local tokens; and
  - Remove the hidden app data via Google Drive settings (Manage apps → locate the app → delete hidden app data).

## Security
- All Google API calls occur over HTTPS.
- Tokens are kept in Chrome’s session storage and cleared on logout. We do not persist refresh tokens or long‑term identifiers.

## Children’s privacy
This extension is not directed to children under 13 and does not knowingly collect personal information.

## Changes
If this policy changes (for example, to add optional, anonymized usage metrics), we will update this page before any change goes live.

## Contact
Questions? Use the “Support” link on the Chrome Web Store listing for this extension.

<!-- Previous draft retained for reference:
If we decide to track feature usage in the future, it would be optional and anonymized; no personal data would be collected, and details would be disclosed here before launch.
-->