# Privacy Policy — FlightDeck

**Last updated:** 2025-05-07

FlightDeck is a browser extension that appends query-string parameters to URL navigations matching user-configured host patterns. This policy explains what data the extension accesses, stores, and transmits.

## Data Collection

FlightDeck does **not** collect, transmit, sell, or share any user data with the developer, third parties, or external servers. The extension contains no analytics, telemetry, advertising, or remote code execution.

## Data Stored Locally

FlightDeck stores the following data in your browser's local storage (`chrome.storage.local`):

- **Rule configurations** — preset and custom rules including host patterns, parameter key/value pairs, labels, group assignments, and enabled/disabled state
- **Host history** — a list of hostnames you have configured for autocomplete suggestions
- **Toggle snapshot** — a temporary list of enabled rule IDs used by the keyboard shortcut restore feature
- **Overlay preference** — whether the build-info overlay is enabled

This data never leaves your browser except through the browser vendor's built-in sync mechanism (see below).

## Browser Sync

If your browser has sync enabled, FlightDeck mirrors rule configurations to `chrome.storage.sync` so your settings are available across devices signed into the same browser profile. This sync is handled entirely by your browser vendor (Google for Chrome, Microsoft for Edge) — FlightDeck does not operate or control the sync infrastructure.

## URL Access and Permissions

| Permission | Purpose |
|---|---|
| `declarativeNetRequest` | Register redirect rules that append query parameters to matching navigations. The browser engine applies these rules — the extension does not intercept or read page content for this purpose. |
| `storage` | Persist rule configurations locally and via browser sync. |
| `host_permissions: <all_urls>` | Allow declarativeNetRequest rules to match any hostname the user configures. The extension does not read, modify, or exfiltrate page content through this permission. |
| Content script (`<all_urls>`) | The version-overlay content script reads HTML meta tags and comments on pages to display build/version information. It does not transmit this data anywhere. |

## Data Export and Import

Users can export their rule configurations as a JSON file and import configurations from JSON files. These operations are entirely user-initiated and local — no data is sent to external servers.

## Incognito Mode

FlightDeck uses `"incognito": "spanning"`, meaning it shares state with the normal browsing session. If you enable FlightDeck in incognito mode, it uses the same rules and storage as your regular profile. No additional data is collected in incognito mode.

## Third-Party Services

FlightDeck does not communicate with any third-party services, APIs, or servers.

## Changes to This Policy

Updates to this privacy policy will be reflected in the extension's repository at [https://github.com/kafkade/flightdeck](https://github.com/kafkade/flightdeck).

## Contact

If you have questions about this privacy policy, please [open an issue](https://github.com/kafkade/flightdeck/issues) on the project repository.
