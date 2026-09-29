# Batch 02 official documentation

Access date for all sources: 2026-09-29. Sources are official Chrome or Chrome Web Store documentation.

| Source | Rule used in the audit |
| --- | --- |
| [Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) | Extension-origin fetches to remote hosts need declared host permissions. |
| [Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) | Host permissions permit fetch from extension service workers and extension pages. Manifest content_scripts.matches and host_permissions are distinct fields. |
| [Permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions) | Runtime requests apply to declared optional permissions; optional host patterns must be declared before they can be requested. Content-script-associated origins are included in the host-origin permission model. |
| [Runtime API — add an image to a web page](https://developer.chrome.com/docs/extensions/reference/api/runtime) | A content script using runtime.getURL to add an extension resource to a web page must first declare that resource as web-accessible. |
| [Web accessible resources](https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources) | Extension resources are unavailable to web pages by default; manifest rules grant access only to selected origins. |
| [Action API](https://developer.chrome.com/docs/extensions/reference/api/action) | action.onClicked is not sent when the action specifies a popup. |
| [System Display API](https://developer.chrome.com/docs/extensions/reference/api/system/display) | chrome.system.display requires the system.display permission. |
| [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs) | URL filters in tabs.query are ignored unless the extension has tabs permission or host access to the matched page. |
| [Chrome Web Store User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) | Extensions requesting user data must show a Limited Use disclosure on the project homepage or a page one click away, such as a privacy policy. |
| [Chrome Web Store Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use) | The policy requires an affirmative statement on an extension website that Google API data use complies with the Chrome Web Store User Data Policy, including Limited Use. |

The audit did not inspect the extension's actual Chrome Web Store listing, developer dashboard, published privacy page, or generated release archive.
