const DEFAULT_KEYWORDS = [
  'agents', 'agent', 'agentic',
  'artificial intelligence', 'ai', 'llm',
  'בינה מלאכותית',
];

let filterEnabled = true;
let keywords = [];
let asciiKeywords = [];      // ASCII keywords in declaration order
let nonAsciiKeywords = [];   // Hebrew/etc. in declaration order
let asciiCombinedRegex = null;  // single regex for all ASCII, captures the matched word
let sessionHits = {};
let lifetimeHits = {};

// Inject the placeholder stylesheet once. We hide a post's children with
// display:none AND show a small ::after placeholder, which gives the post a
// non-zero height. This avoids the "super-scroll" pattern where many
// zero-height hides cause the user to immediately request the next batch
// of posts (a bot signature LinkedIn watches for).
function injectStyles() {
  if (document.getElementById('ai-leh-styles')) return;
  const style = document.createElement('style');
  style.id = 'ai-leh-styles';
  style.textContent = `
    body.ai-leh-filtering [data-ai-hidden]:not([data-ai-revealed]) > * {
      display: none !important;
    }
    body.ai-leh-filtering [data-ai-hidden]:not([data-ai-revealed]) {
      cursor: pointer;
    }
    body.ai-leh-filtering [data-ai-hidden]:not([data-ai-revealed])::after {
      content: "Hidden by AI Leh — '" attr(data-ai-keyword) "' — click to reveal";
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 320px;
      padding: 64px 48px;
      color: #666;
      font-size: 20px;
      font-weight: 600;
      background: rgba(0,0,0,0.03);
      border: 1px dashed rgba(0,0,0,0.15);
      border-radius: 8px;
      margin-bottom: 8px;
      text-align: center;
    }
    body.ai-leh-filtering [data-ai-hidden]:not([data-ai-revealed]):hover::after {
      background: rgba(10,102,194,0.08);
      border-color: rgba(10,102,194,0.4);
      color: #0a66c2;
    }
    mark.ai-leh-mark {
      background: #ffe066;
      color: inherit;
      padding: 0 2px;
      border-radius: 3px;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.05);
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function isAscii(s) { return /^[\x00-\x7F]+$/.test(s); }
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function buildPatterns(kws) {
  keywords = kws;
  asciiKeywords    = kws.filter(isAscii);
  nonAsciiKeywords = kws.filter(k => !isAscii(k));

  // Combine all ASCII keywords into one alternation regex with whole-word boundaries.
  // Sort by length desc so 'agents' matches before 'agent' inside the alternation.
  if (asciiKeywords.length) {
    const alts = [...asciiKeywords].sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
    asciiCombinedRegex = new RegExp(`\\b(${alts})\\b`, 'i');
  } else {
    asciiCombinedRegex = null;
  }
}

// Debounced storage writes — coalesces bursts of matches during fast scrolls.
// (Naming: kept "Badge" for diff churn; nothing actually updates an icon badge anymore.)
let pendingFlush = null;
function flushBadge() {
  pendingFlush = null;
  try {
    chrome.storage.local.set({
      filterEnabled,
      sessionHits,
      lifetimeHits,
    });
  } catch (_) {}
}
function updateBadge() {
  if (pendingFlush !== null) return;
  pendingFlush = setTimeout(flushBadge, 300);
}

// v1.0 finder — works without any class assumptions. Finds the feed list
// by structural traversal: <main><section><div with N children = feed list>.
function findFeedList() {
  const section = document.querySelector('main section');
  if (!section) return null;
  for (const child of section.children) {
    if (child.tagName === 'DIV' && child.children.length >= 2) return child;
  }
  return null;
}

// Degree-of-connection marker. The outer (sharer) actor block of every
// LinkedIn post contains one of these. They appear regardless of UI locale
// (LinkedIn renders them as visible glyph + ordinal). Hebrew variants are
// transliterated by LinkedIn — they still render as "1st/2nd/3rd" with
// the bullet glyph.
const DEGREE_RE = /•\s*(1st|2nd|3rd|3rd\+|Following|1°|2°|3°)/;

// Build the "skip set" — DOM subtrees whose text we must NOT scan.
// Includes:
//  - comments (any element with "comment" in class or id)
//  - sections (LinkedIn renders comments inside <section>)
//  - the outer author block (the post-sharer's name + headline). Identified
//    structurally as the first element containing a degree marker AND being
//    headline-sized (<600 chars). Climb to the smallest ancestor that still
//    fits, so we exclude the whole actor (avatar + name + headline + meta).
//
// Returns { skip: Set, foundOuterActor: boolean }. If no outer actor was
// identified, foundOuterActor=false and the caller should DECLINE to scan
// (return early) to avoid false positives on shares where the sharer's
// headline contains an AI keyword.
function buildSkipSet(post) {
  const skip = new Set();
  post.querySelectorAll('section, [class*="comment"], [id*="comment"]').forEach(el => skip.add(el));

  let foundOuterActor = false;
  for (const el of post.querySelectorAll('*')) {
    if (skip.has(el)) continue;
    const t = el.textContent;
    if (!DEGREE_RE.test(t)) continue;
    if (t.length > 600) continue;  // too big — wraps body content too
    // Climb to the smallest ancestor that's still under the size cap. That's
    // the actor block as a whole (avatar + name + degree + headline + time).
    let scope = el;
    while (
      scope.parentElement
      && scope.parentElement !== post
      && scope.parentElement.textContent.length <= 600
      && !skip.has(scope.parentElement)
    ) {
      scope = scope.parentElement;
    }
    skip.add(scope);
    foundOuterActor = true;
    break;  // only the FIRST (outer) actor — keep the inner reshared author intact
  }

  return { skip, foundOuterActor };
}

// Walk text nodes inside the post, applying the skip set.
function getPostText(post) {
  const { skip, foundOuterActor } = buildSkipSet(post);
  if (!foundOuterActor) return null;  // can't safely scope — caller skips post

  let text = '';
  const walker = document.createTreeWalker(post, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let p = node.parentNode; p && p !== post; p = p.parentNode) {
        if (skip.has(p)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) text += walker.currentNode.nodeValue + ' ';
  return text;
}

function debugEnabled() {
  try { return localStorage.getItem('aiLehDebug') === '1'; } catch (_) { return false; }
}

// Detect "Suggested" posts (LinkedIn's algorithmic recommendations). These
// often skip the normal actor DOM and are arguably a softer form of ad
// placement. We don't hide them — we leave them alone entirely.
const SUGGESTED_LABELS = new Set(['Suggested', 'Promoted', 'Sponsored', 'ממומן', 'מומלץ']);
function isSuggested(postRoot) {
  // Look at small leaf labels near the top of the post.
  const labels = postRoot.querySelectorAll('span, div');
  let i = 0;
  for (const el of labels) {
    if (i++ > 30) break;            // only check the first ~30 leaf-ish nodes
    if (el.children.length) continue;
    const t = el.textContent.trim();
    if (t.length > 12) continue;
    if (SUGGESTED_LABELS.has(t)) return true;
  }
  return false;
}

// Phrases that LOOK like AI keywords but should not trigger a hide.
// Stripped from text before keyword matching (and from highlights on reveal).
// Add new entries verbatim — case is normalized via the 'i' flag.
const EXCEPTIONS = [
  'Ex-AI Agent',
  'Ex AI Agent',
];
const EXCEPTIONS_RE = EXCEPTIONS.length
  ? new RegExp(EXCEPTIONS.map(escapeRegex).join('|'), 'gi')
  : null;

function scrubExceptions(text) {
  if (!EXCEPTIONS_RE || !text) return text;
  return text.replace(EXCEPTIONS_RE, ' ');
}

// Returns the matched keyword (string) or null
function matchKeyword(text) {
  if (asciiCombinedRegex) {
    const m = asciiCombinedRegex.exec(text);
    if (m) return asciiKeywords.find(k => k.toLowerCase() === m[1].toLowerCase()) ?? m[1];
  }
  for (const kw of nonAsciiKeywords) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

function scan() {
  if (!filterEnabled) return;
  const feedList = findFeedList();
  if (!feedList) return;

  let changed = false;
  for (const post of feedList.children) {
    if (post.hasAttribute('data-ai-scanned')) continue;
    post.setAttribute('data-ai-scanned', '1');

    // Skip Suggested/Promoted/Sponsored posts — leave LinkedIn's algorithmic
    // recommendations alone (TOS-safe, also their DOM differs).
    if (isSuggested(post)) continue;

    const text = getPostText(post);
    let decision = 'visible';

    if (text === null) {
      // Couldn't identify the outer author block — skip this post entirely
      // rather than risk false positives on the sharer's own headline.
      decision = 'skipped:no-outer-actor';
    } else {
      const scrubbed = scrubExceptions(text);
      const kw = matchKeyword(scrubbed);
      if (kw) {
        post.setAttribute('data-ai-hidden', '1');
        post.setAttribute('data-ai-keyword', kw);
        sessionHits[kw]  = (sessionHits[kw]  ?? 0) + 1;
        lifetimeHits[kw] = (lifetimeHits[kw] ?? 0) + 1;
        changed = true;
        decision = `hidden:${kw}`;
      }
    }

    if (debugEnabled()) {
      console.log('[AI Leh]', {
        decision,
        text: (text || '').slice(0, 200),
      });
    }
  }
  if (changed) updateBadge();
}

function fullRescan() {
  sessionHits = Object.fromEntries(keywords.map(kw => [kw, 0]));
  document.querySelectorAll('[data-ai-scanned]').forEach(p => {
    p.removeAttribute('data-ai-scanned');
    p.removeAttribute('data-ai-hidden');
    p.removeAttribute('data-ai-keyword');
    p.removeAttribute('data-ai-revealed');
    p.removeAttribute('data-ai-highlighted');
  });
  scan();
  if (pendingFlush !== null) { clearTimeout(pendingFlush); pendingFlush = null; }
  flushBadge();
}

function enable() {
  filterEnabled = true;
  document.body.classList.add('ai-leh-filtering');
  scan();
  flushBadge();
}

function disable() {
  filterEnabled = false;
  document.body.classList.remove('ai-leh-filtering');
  flushBadge();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'getState') {
    sendResponse({ enabled: filterEnabled });
  } else if (msg.action === 'toggle') {
    filterEnabled ? disable() : enable();
    sendResponse({ enabled: filterEnabled });
  }
  return true;
});

// Single body-subtree observer. SPA navigations and LinkedIn's re-renders can
// detach and re-mount the feed list, so we can't rely on a feed-scoped observer
// alone. Instead we observe the body but defer all real work to idle time, so
// mutation noise is cheap.
let scanScheduled = false;
function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  const cb = () => { scanScheduled = false; scan(); };
  if (window.requestIdleCallback) requestIdleCallback(cb, { timeout: 500 });
  else setTimeout(cb, 250);
}

new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });

// Highlight all keyword matches inside a revealed post. Walks text nodes once,
// collects matches first, then mutates — avoids modifying the tree mid-walk.
function highlightMatches(postRoot) {
  if (!keywords.length) return;
  if (postRoot.hasAttribute('data-ai-highlighted')) return;
  postRoot.setAttribute('data-ai-highlighted', '1');

  const buildAsciiRegexG = () => {
    if (!asciiKeywords.length) return null;
    const alts = [...asciiKeywords].sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
    return new RegExp(`\\b(${alts})\\b`, 'gi');
  };
  const asciiG = buildAsciiRegexG();

  const targets = [];
  const walker = document.createTreeWalker(postRoot, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentNode;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.tagName === 'MARK' && p.classList.contains('ai-leh-mark')) return NodeFilter.FILTER_REJECT;
      if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) targets.push(walker.currentNode);

  for (const node of targets) {
    const orig = node.nodeValue;
    if (!orig) continue;

    // Build merged match list: ASCII (regex) + non-ASCII (literal includes).
    const ranges = [];
    if (asciiG) {
      asciiG.lastIndex = 0;
      let m;
      while ((m = asciiG.exec(orig)) !== null) {
        ranges.push([m.index, m.index + m[0].length]);
      }
    }
    for (const kw of nonAsciiKeywords) {
      let from = 0;
      while (true) {
        const idx = orig.indexOf(kw, from);
        if (idx < 0) break;
        ranges.push([idx, idx + kw.length]);
        from = idx + kw.length;
      }
    }

    // Exclude matches that fall inside an exception phrase ("Ex-AI Agent" etc.).
    if (EXCEPTIONS_RE && ranges.length) {
      const exceptionRanges = [];
      EXCEPTIONS_RE.lastIndex = 0;
      let em;
      while ((em = EXCEPTIONS_RE.exec(orig)) !== null) {
        exceptionRanges.push([em.index, em.index + em[0].length]);
      }
      if (exceptionRanges.length) {
        const filtered = ranges.filter(([a, b]) =>
          !exceptionRanges.some(([ea, eb]) => a >= ea && b <= eb)
        );
        ranges.length = 0;
        ranges.push(...filtered);
      }
    }

    if (!ranges.length) continue;

    // Sort + merge overlapping ranges so we don't double-wrap.
    ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
      const last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
      else merged.push(ranges[i]);
    }

    // Replace the text node with a sequence of text + <mark> nodes.
    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const [a, b] of merged) {
      if (a > cursor) frag.appendChild(document.createTextNode(orig.slice(cursor, a)));
      const mark = document.createElement('mark');
      mark.className = 'ai-leh-mark';
      mark.textContent = orig.slice(a, b);
      frag.appendChild(mark);
      cursor = b;
    }
    if (cursor < orig.length) frag.appendChild(document.createTextNode(orig.slice(cursor)));
    node.parentNode.replaceChild(frag, node);
  }
}

// Click-to-reveal on the placeholder. Uses capture phase so we run before
// LinkedIn's own click handlers (which sit on the still-hidden children).
document.addEventListener('click', (e) => {
  if (!filterEnabled) return;
  const post = e.target.closest('[data-ai-hidden]');
  if (!post || post.hasAttribute('data-ai-revealed')) return;
  post.setAttribute('data-ai-revealed', '1');
  highlightMatches(post);
  e.stopPropagation();
  e.preventDefault();
}, true);

injectStyles();

chrome.storage.local.get(
  ['lifetimeHits', 'filterEnabled'],
  (data) => {
    lifetimeHits  = data.lifetimeHits ?? {};
    filterEnabled = data.filterEnabled !== false;
    if (filterEnabled) document.body.classList.add('ai-leh-filtering');
    buildPatterns(DEFAULT_KEYWORDS);
    scan();
  },
);

// Cleanup of legacy keys: user-editable keyword list, promoted/expert counters,
// badge keys, hide-experts toggle.
chrome.storage.local.remove([
  'keywords',
  'promotedSession', 'promotedLifetime',
  'expertSession', 'expertLifetime',
  'hideExperts',
  'showBadge', 'hiddenCount',
]);
