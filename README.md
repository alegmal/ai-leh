# AI Leh

A Chrome extension that hides LinkedIn feed posts containing AI/agent keywords. Built for people whose feeds have become "AI agent" sludge.

The name is wordplay on Hebrew: **"AI לך"** ("ai-leh") roughly translates to *"AI, get out of here"*.

---

## Table of Contents

- [Features](#features)
- [Install (Developer Mode)](#install-developer-mode)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Build / Icon Generation](#build--icon-generation)
- [Permissions](#permissions)
- [Default Keywords](#default-keywords)
- [Exceptions](#exceptions)
- [Roadmap Ideas](#roadmap-ideas)
- [Technical Decisions](#technical-decisions)

---

## Features

- Hides LinkedIn feed posts that match a hardcoded keyword list (English + Hebrew)
- **Click-to-reveal placeholders** — hidden posts are replaced with a sized "click to reveal" placeholder, not deleted. Preserves natural scroll physics so LinkedIn's bot-detection doesn't see "super-scrolling".
- **Keyword highlighting on reveal** — when you click to reveal a hidden post, matched keywords get a yellow `<mark>` highlight so you can see exactly why it was caught.
- **Excludes the post-sharer's own headline** — when someone with "AI" in their headline shares an unrelated post, that share isn't hidden just because of who they are.
- **Skips Suggested / Promoted / Sponsored** — leaves LinkedIn's algorithmic recommendations and ads alone (TOS-safe).
- **Phrase exceptions** — lookalikes like `"Ex-AI Agent"` are stripped before matching so they don't trigger false hides.
- Per-keyword **session** and **lifetime** hit counters in the popup
- One-click filter on/off — applies live, no page reload
- Light + dark popup themes (preference persists)

## Install (Developer Mode)

1. Clone the repo:
   ```bash
   git clone https://github.com/alegmal/ai-leh.git
   ```
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the cloned `ai-leh/` directory
5. Visit https://www.linkedin.com/feed/ — matching posts are replaced with placeholders

To pick up code changes, click the refresh icon on the extension card and **open a new LinkedIn tab** — Chrome won't always re-inject the new content script into already-open tabs.

## Usage

Click the extension icon in the toolbar:

- **Stop hiding content** — toggle filtering off/on. Takes effect immediately on the open LinkedIn tab.
- **Following words are being filtered out** — the active keyword list. Each pill shows the word + a session count badge (blue) and lifetime count badge (grey) when the keyword has caught at least one post.
- **session / lifetime totals** — sums across all keywords.
- **Night mode** — light/dark popup theme.

To reveal a hidden post: click the placeholder. The original content appears with yellow highlights on the matched keywords.

### Debug mode

Set `localStorage.aiLehDebug = '1'` in DevTools on a LinkedIn tab and reload. Each scanned post logs `{decision, text}` to the console — useful when LinkedIn ships a DOM change and the extension stops working.

## Project Structure

```
ai-leh/
├── manifest.json         # MV3 manifest (no background script)
├── content.js            # DOM scanner + filter logic, runs on linkedin.com
├── popup.html            # Popup UI markup + styles
├── popup.js              # Popup logic — toggle, theme, keyword stats render
├── generate_icons.py     # PIL script that builds icons + Web Store promo tile
└── icons/                # Generated icons (16/32/48/128 + 440x280 promo)
```

There is no `background.js`. The extension is purely a content script + popup; all state lives in `chrome.storage.local`.

## Build / Icon Generation

Icons are generated from `generate_icons.py` (requires Python + PIL/Pillow):

```bash
python3 generate_icons.py
```

Output goes to `icons/`:
- `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` — extension icons
- `promo440x280.png` — Chrome Web Store promo tile

### Packaging for the Chrome Web Store

The `.zip` you upload must contain the runtime files only — not the build script, README, promo tile, or `.git`:

```bash
zip -r ai-leh-v1.0.zip . \
  -x "*.git*" "generate_icons.py" "icons/promo*" "README.md" "*.zip"
```

Resulting zip should contain: `manifest.json`, `content.js`, `popup.html`, `popup.js`, `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, `icons/icon128.png`.

## Permissions

Declared in `manifest.json`:

| Permission                                  | Why |
|---------------------------------------------|-----|
| `storage`                                   | Persist filter on/off, theme, hit counts |
| `host_permissions: https://www.linkedin.com/*` | Inject the content script and send messages to LinkedIn tabs from the popup |

The Chrome Web Store install prompt shows this as "Read and change your data on www.linkedin.com" — narrowly scoped to LinkedIn only. No `tabs` permission ("Read your browsing history") and no `activeTab`; both are unnecessary because `host_permissions` already covers what we need on LinkedIn.

## Default Keywords

The keyword list is hardcoded — there is no in-popup editor:

```
agents, agent, agentic
artificial intelligence, ai, llm
בינה מלאכותית
```

ASCII keywords are matched as whole words (case-insensitive). Hebrew/non-ASCII are matched as substrings.

To change the list, edit `DEFAULT_KEYWORDS` in `content.js` **and** the `KEYWORDS` constant in `popup.js` (must match — popup renders pills from its own copy).

## Exceptions

Some phrases look like AI keywords but should NOT trigger a hide. The `EXCEPTIONS` array in `content.js` lists them:

```js
const EXCEPTIONS = [
  'Ex-AI Agent',
  'Ex AI Agent',
];
```

Before keyword matching runs on a post, these phrases are scrubbed from the text. The same exclusion is applied to the highlight pass so they don't get yellow-highlighted on reveal. To add a new exception, append a string to that array.

## Roadmap Ideas

- Multi-site support (Twitter/X, Reddit, Bluesky) via per-site DOM adapters
- Optional logging of hidden post snippets for review
- Customizable placeholder text / styling

---

## Technical Decisions

### MV3, no service worker
The original implementation used a background service worker to maintain a per-tab badge counter on the extension icon. We removed both the badge and the service worker — the badge added no value once we switched to in-page placeholders (the user already sees how many posts were hidden, because the placeholders are visible). With no badge to maintain, the service worker had no work to do, so we deleted it entirely. Less code, less attack surface, simpler manifest.

### Click-to-reveal placeholders, not `display: none`
v1.0 hid posts with `style.display = 'none'`. That collapses the post to zero height — and when many AI-related posts are hidden in a row, the user scrolls fast through the empty space, which LinkedIn's bot detection treats as a "super-scrolling" signal. We now hide the post's children with CSS but render a sized `::after` placeholder ("Hidden by AI Leh — '<keyword>' — click to reveal") that occupies real space. Scroll physics stay natural.

The placeholder is per-post and clickable; clicking sets a `data-ai-revealed` attribute that turns off the children-hiding rule for that post and triggers the keyword highlighter.

### Debug log instead of brittle assumptions
`localStorage.aiLehDebug = '1'` enables structured per-post console logs. When LinkedIn ships a DOM change, this is the difference between "guess at selectors and hope" and "see exactly what's being scanned and fix the actual mismatch in one round".

### Outer-actor exclusion (the "don't hide the messenger" rule)
When someone with "AI" in their headline reposts a non-AI article with their own commentary, we don't want to hide the share just because of who they are. So we exclude the **outermost** author block from text scanning.

The outer block is identified structurally: the first element in the post DOM that contains a degree-of-connection marker (`• 1st`, `• 2nd`, `• 3rd`, `• Following`) and is "headline-sized" (under 600 chars). We climb to its smallest ancestor that's also under the size cap so we exclude the whole actor (avatar + name + headline + meta), then skip everything inside it during text scanning.

If no outer-actor element is found at all, the post is skipped entirely (left visible). False negatives over false positives — better to miss one AI-spam post than to hide a non-AI post by misidentifying the structure.

### Phrase exceptions (`Ex-AI Agent`, etc.)
Trivially extensible. Phrases in the `EXCEPTIONS` array are replaced with spaces before keyword matching — and excluded from highlight ranges on reveal so the reader sees clean context.

### Storage as the popup ↔ content channel
The popup never speaks to the content script for state — it reads `chrome.storage.local` directly and writes back when the user toggles. The content script writes hit counters and `filterEnabled` to the same store. `chrome.tabs.sendMessage` is only used for "trigger an immediate UI action" (toggle, getState) — never for shared state.

### Debounced storage writes (300ms)
Writing to `chrome.storage.local` on every match thrashes during fast scrolls. A 300ms debounce coalesces bursts of matches into one write.

### Single combined regex for ASCII keywords
ASCII keywords are merged into one alternation regex (sorted longest-first to prefer `agents` over `agent` inside the alternation). One regex pass per post regardless of keyword count. Hebrew/non-ASCII keywords stay as separate `String.includes` calls — substring matching is cheaper than regex.

### TreeWalker, not cloneNode for post text extraction
Cloning post DOM is slow on rich posts (images, embeds, reactions). A `TreeWalker` walks text nodes and skips ancestors marked in a `skip` set — no allocation, faster, and the skip set is exactly how we exclude comments and the outer author block.

### `data-ai-*` marker attributes
- `data-ai-scanned` — prevents re-evaluating a post we've already seen.
- `data-ai-hidden` — turns on the placeholder via CSS; toggling the filter just adds/removes a body class instead of re-running pattern matching.
- `data-ai-keyword` — the matched keyword, surfaced in the placeholder text via `attr()`.
- `data-ai-revealed` — flipped on click; turns off the placeholder for that post.
- `data-ai-highlighted` — set by the highlighter to make it idempotent.

Storing scanned/hidden state on the DOM (not in a JS `WeakSet`) means it survives content script re-injection on SPA navigations.

### `MutationObserver` on `document.body` with `subtree: true`
We tried scoping the observer to the feed list once mounted, but LinkedIn re-renders / re-mounts the feed on SPA navigation, leaving the narrowed observer attached to a detached node. The body-subtree observer is wider but cheap because all real work runs through `requestIdleCallback` — mutation noise just schedules an idle scan.

### `requestIdleCallback` for scans
Scans never block scrolling — they run during browser idle time with a 500ms timeout fallback. Combined with a scheduled-flag, mutation bursts coalesce into one scan per idle slot.

### Structural feed-list lookup, not class names
LinkedIn obfuscates class names (random hashes per build, e.g. `_1011cd94`). The script identifies the feed via structural traversal: `main > section > div` (the first `div` child with multiple children). Posts are immediate children of that container. This survives LinkedIn redeploys that would break class-based selectors — and was the architectural mistake of every patch round we ran trying to use class selectors instead.

### Lifetime totals stored in `chrome.storage.local`, not `sync`
We don't sync stats across devices. Local storage is enough and avoids quota concerns.

### `host_permissions` instead of `tabs` + `activeTab`
We need to inject a content script on LinkedIn (covered by `content_scripts.matches`) and send messages from the popup to LinkedIn tabs via `chrome.tabs.sendMessage`. The `tabs` permission is misleadingly named — it doesn't gate access to `chrome.tabs.*`; it gates four sensitive `Tab` properties (`url`, `pendingUrl`, `title`, `favIconUrl`) and surfaces on the install screen as "Read your browsing history" which scares users.

`host_permissions` for `https://www.linkedin.com/*` covers the same access scoped to LinkedIn only. Single concrete prompt: *"Read and change your data on www.linkedin.com"*. `activeTab` becomes unnecessary because `host_permissions` already grants messaging access to LinkedIn tabs.

### Icon: navy + red ban circle, programmatically generated
Icons are generated by `generate_icons.py` using PIL — bold "AI" text on LinkedIn-blue background with a red prohibition circle. Same script generates all four sizes plus the 440×280 Chrome Web Store promo tile, ensuring visual consistency.
