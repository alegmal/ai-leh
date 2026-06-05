# Privacy Policy — AI Leh

_Last updated: 2026-06-05_

## Plain-English summary

**AI Leh does not collect, store, transmit, sell, share, or process any user data, anywhere, for any reason.**

The extension runs entirely inside your browser. Nothing leaves your machine. There is no server. There is no analytics. There is no telemetry. There is no advertising. There is no account. The author has no way of knowing whether you have it installed, how often you use it, or what keywords you configure.

It is free and open source. The complete source code is at [github.com/alegmal/ai-leh](https://github.com/alegmal/ai-leh) — feel free to read it.

---

## What the extension does

When you visit `https://www.linkedin.com/`, the extension's content script scans the text of posts in your feed in your browser, locally, and hides any post whose text matches a keyword from your configured keyword list.

Hiding is done with a CSS `display: none` — the post is not removed from the page, only hidden visually.

---

## What is stored, where

The extension uses Chrome's [`chrome.storage.local`](https://developer.chrome.com/docs/extensions/reference/api/storage) API to persist the following items, **on your local device only**:

| Item             | Purpose |
|------------------|---------|
| `keywords`       | Your keyword list |
| `theme`          | Your popup theme preference (light/dark) |
| `showBadge`      | Whether to show the hidden-post count on the toolbar icon |
| `sessionHits`    | Per-keyword hit counts since the page was last loaded |
| `lifetimeHits`   | Per-keyword hit counts across all your browsing sessions |
| `hiddenCount`    | The current count of hidden posts on the open tab |
| `filterEnabled`  | Whether the filter is currently on or off |

These values never leave your device. `chrome.storage.local` is sandboxed per extension; no other extension or website can read them. Uninstalling the extension deletes all of this data.

---

## What is NOT collected or transmitted

To be explicit:

- **No personal information** is collected — no name, no email, no phone, no address.
- **No browsing history** is collected. The extension only runs on `linkedin.com` (per its `host_permissions` declaration); it has no visibility into other sites.
- **No LinkedIn account information** is read or transmitted — no profile, no connections, no messages, no email, no name.
- **No post content is transmitted anywhere.** Post text is read in the browser, regex-tested against your keyword list, and discarded.
- **No analytics, telemetry, crash reporting, or usage statistics** are collected.
- **No cookies** are set by the extension.
- **No network requests are made by the extension.** It has no `fetch`, `XMLHttpRequest`, or WebSocket calls. There is no remote server. The extension has no `host_permissions` for any domain other than `linkedin.com`, and even there it does not initiate any network traffic of its own.

---

## Permissions, justified

The extension requests two permissions, both required for it to function:

- **`storage`** — to persist your keyword list and preferences locally on your device, as described above.
- **`host_permissions: https://www.linkedin.com/*`** — to inject the content script that scans LinkedIn feed posts and hides matches. Required by Chrome to read the DOM of pages on linkedin.com.

The extension does **not** request:

- `tabs` permission ("Read your browsing history")
- `activeTab` permission
- `cookies` permission
- `webRequest` / `webRequestBlocking` permissions
- Any other host permission

---

## Third-party services

There are none. The extension does not integrate with, send data to, or load resources from any third-party service.

---

## Data sharing

There is no data to share, and nothing is shared.

---

## Children's privacy

The extension does not target children, but since it does not collect any data from anyone of any age, this is moot.

---

## Changes to this policy

If this policy ever changes, the new version will appear at this URL with an updated `Last updated` date and the changes will be visible in the [git history](https://github.com/alegmal/ai-leh/commits/main/PRIVACY.md).

---

## Contact

If you have questions, open an issue at [github.com/alegmal/ai-leh/issues](https://github.com/alegmal/ai-leh/issues).
