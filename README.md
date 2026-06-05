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
- [Roadmap Ideas](#roadmap-ideas)
- [Technical Decisions](#technical-decisions)

---

## Features

- Hides LinkedIn feed posts that match a configurable keyword list
- Default keywords cover English (`ai`, `llm`, `agentic`, etc.) and Hebrew (`בינה מלאכותית`, `סוכן`)
- Whole-word matching for ASCII, substring matching for non-ASCII (Hebrew)
- Per-keyword **session** and **lifetime** hit counters in the popup
- Search/filter the keyword list inside the popup
- One-click filter on/off — applies live, no page reload
- Badge on the extension icon shows hidden post count (toggleable)
- Light + dark modes (preference persists)

## Install (Developer Mode)

1. Clone the repo:
   ```bash
   git clone https://github.com/alegmal/ai-leh.git
   ```
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the cloned `ai-leh/` directory
5. Visit https://www.linkedin.com/feed/ — matching posts disappear

To pick up code changes, click the refresh icon on the extension card and reload the LinkedIn tab.

## Usage

Click the extension icon in the toolbar:

- **Filter toggle** — on/off, takes effect immediately on the open LinkedIn tab
- **Posts hidden** — count for the current page
- **Night mode** — light/dark popup theme
- **Show count on icon** — badge with the hidden count on the toolbar icon
- **Keywords** — list of active filters; remove with `×`, add via the input at the bottom
- **Legend** — totals across all keywords (`session` blue / `lifetime` grey)

Adding or removing a keyword triggers an instant re-scan of the loaded feed.

## Project Structure

```
ai-leh/
├── manifest.json         # MV3 manifest
├── content.js            # DOM scanner + filter logic, runs on linkedin.com
├── background.js         # Service worker — seeds defaults, manages icon badge
├── popup.html            # Popup UI markup + styles
├── popup.js              # Popup logic — keyword CRUD, theme, badge toggle
├── generate_icons.py     # PIL script that builds icons + Web Store promo tile
└── icons/                # Generated icons (16/32/48/128 + 440x280 promo)
```

## Build / Icon Generation

Icons are generated from `generate_icons.py` (requires Python + PIL/Pillow):

```bash
python3 generate_icons.py
```

Output goes to `icons/`:
- `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` — extension icons
- `promo440x280.png` — Chrome Web Store promo tile

To package for the Chrome Web Store, zip the repo root **excluding** `generate_icons.py` and `icons/promo440x280.png`:

```bash
zip -r ai-leh.zip . -x "*.git*" "generate_icons.py" "icons/promo*" "README.md"
```

## Permissions

Declared in `manifest.json`:

| Permission   | Why |
|--------------|-----|
| `activeTab`  | Allow popup to send messages to the active LinkedIn tab |
| `storage`    | Persist keywords, theme, badge preference, hit counts |
| `tabs`       | Query LinkedIn tabs to set per-tab badge text |

The extension only runs on `https://www.linkedin.com/*` (declared in `content_scripts.matches`).

## Default Keywords

Seeded on first install (only if storage is empty):

```
agents, agent, agentic
artificial intelligence, ai, llm
בינה מלאכותית, סוכן
```

ASCII keywords are matched as whole words (case-insensitive). Hebrew/non-ASCII are matched as substrings.

## Roadmap Ideas

- Multi-site support (Twitter/X, Reddit, Bluesky) via per-site DOM adapters
- Regex keyword mode for advanced users
- Export/import keyword lists
- Per-keyword enable/disable (without removing it)
- Optional logging of hidden post snippets for review

---

## Technical Decisions

### MV3 service worker, not persistent background
Manifest V3 deprecated persistent background pages. The service worker sleeps when idle, so the content script must not depend on it for hot-path messaging. We took the cost of writing to `chrome.storage.local` and let the background react via `storage.onChanged`.

### Storage for state, not message passing
Originally the content script `sendMessage`'d the background on every match to update the badge. Two problems:

1. Each call wakes the service worker — flood during fast scrolls
2. After the worker sleeps, in-flight calls reject with "Could not establish connection"

Switched to `chrome.storage.local.set({ hiddenCount, ... })`. The background subscribes via `storage.onChanged` and updates the badge. No connection state to manage; cross-context errors gone.

### Debounced storage writes (300ms)
Even with storage as the channel, writing on every match thrashed `storage.onChanged`. A 300ms debounce coalesces bursts of matches during fast scrolling into one write.

### Single combined regex for ASCII keywords
Originally each keyword was its own regex; we tested all of them on every post. Now ASCII keywords are merged into one alternation regex (sorted longest-first to prefer `agents` over `agent` inside the alternation). One regex pass per post regardless of keyword count.

Hebrew/non-ASCII keywords stay as separate `String.includes` calls — substring matching is much cheaper than regex.

### TreeWalker, not cloneNode for post text extraction
The original implementation cloned the post DOM, removed comments via `querySelectorAll`, and called `.textContent`. On rich posts (images, embeds, reactions) `cloneNode(true)` is slow. Replaced with a `TreeWalker` that walks text nodes and skips ancestors we want to exclude — no allocation, ~5–10× faster on heavy posts.

### `data-ai-scanned` and `data-ai-hidden` attributes
Marker attributes on each post:
- `data-ai-scanned` prevents re-scanning posts we've already evaluated
- `data-ai-hidden` lets the toggle restore visibility without re-running pattern matching

Storing scanned state on the DOM (rather than a `WeakSet` in JS) means it survives content script re-injection on SPA navigations.

### `MutationObserver` on `document.body` with `subtree: true`
We tried scoping the observer to the feed list once it mounted, but LinkedIn re-renders / re-mounts the feed on SPA navigation, leaving the narrowed observer attached to a detached node. The body-subtree observer is wider but cheap because all real work runs through `requestIdleCallback` — mutation noise just schedules an idle scan.

### `requestIdleCallback` for scans
Scans never block scrolling — they run during browser idle time with a 500ms timeout fallback. Combined with the scheduled-flag, mutation bursts coalesce into one scan per idle slot.

### Keywords matched against post structure, not class names
LinkedIn obfuscates class names (random letters per build). The script identifies the feed via structural traversal: `main > section > div` (the first `div` child with multiple children). Posts are immediate children of that container. This survives LinkedIn redeploys that would break class-based selectors.

### Hit count cleanup happens in two places
When a keyword is removed, both the popup (`popup.js#saveKeywords`) and the content script (`buildPatterns`) drop its hit counts. The popup must do this independently because the user may remove keywords while no LinkedIn tab is open.

### Lifetime totals stored in `chrome.storage.local`, not `sync`
We don't sync stats across devices. Local storage is enough and avoids quota concerns if the user adds many keywords.

### Icon: navy + red ban circle, programmatically generated
Icons are generated by `generate_icons.py` using PIL — bold "AI" text on LinkedIn-blue background with a red prohibition circle. Same script generates all four sizes plus the 440×280 Chrome Web Store promo tile, ensuring visual consistency.
