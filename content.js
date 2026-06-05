const DEFAULT_KEYWORDS = [
  'agents', 'agent', 'agentic',
  'artificial intelligence', 'ai', 'llm',
  'בינה מלאכותית', 'סוכן',
];

let filterEnabled = true;
let keywords = [];
let asciiKeywords = [];      // ASCII keywords in declaration order
let nonAsciiKeywords = [];   // Hebrew/etc. in declaration order
let asciiCombinedRegex = null;  // single regex for all ASCII, captures the matched word
let sessionHits = {};
let lifetimeHits = {};

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

  // Drop counts for removed keywords; preserve counts for surviving ones
  const next = {};
  const nextLifetime = {};
  for (const kw of kws) {
    next[kw]         = sessionHits[kw]  ?? 0;
    nextLifetime[kw] = lifetimeHits[kw] ?? 0;
  }
  sessionHits  = next;
  lifetimeHits = nextLifetime;
}

// Debounced storage writes — coalesces bursts of matches during fast scrolls
let pendingFlush = null;
function flushBadge() {
  pendingFlush = null;
  try {
    chrome.storage.local.set({
      hiddenCount: document.querySelectorAll('[data-ai-hidden]').length,
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

function findFeedList() {
  const section = document.querySelector('main section');
  if (!section) return null;
  for (const child of section.children) {
    if (child.tagName === 'DIV' && child.children.length >= 2) return child;
  }
  return null;
}

// Walk text nodes inside the post, skipping subtrees that look like comments.
// Avoids cloneNode(true) which is expensive on rich posts (images, embeds, reactions).
function getPostBodyText(postRoot) {
  const skip = new Set();
  postRoot.querySelectorAll('section, [class*="comment"], [id*="comment"]').forEach(el => skip.add(el));

  let text = '';
  const walker = document.createTreeWalker(postRoot, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Reject text nodes whose ancestor (within the post) is a comments subtree
      for (let p = node.parentNode; p && p !== postRoot; p = p.parentNode) {
        if (skip.has(p)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) text += walker.currentNode.nodeValue + ' ';
  return text;
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

    const text = getPostBodyText(post);
    const kw = matchKeyword(text);
    if (kw) {
      post.setAttribute('data-ai-hidden', '1');
      post.style.display = 'none';
      sessionHits[kw]  = (sessionHits[kw]  ?? 0) + 1;
      lifetimeHits[kw] = (lifetimeHits[kw] ?? 0) + 1;
      changed = true;
    }
  }
  if (changed) updateBadge();
}

function fullRescan() {
  sessionHits = Object.fromEntries(keywords.map(kw => [kw, 0]));
  document.querySelectorAll('[data-ai-scanned]').forEach(p => {
    p.removeAttribute('data-ai-scanned');
    p.removeAttribute('data-ai-hidden');
    p.style.display = '';
  });
  scan();
  if (pendingFlush !== null) { clearTimeout(pendingFlush); pendingFlush = null; }
  flushBadge();
}

function enable() {
  filterEnabled = true;
  document.querySelectorAll('[data-ai-hidden]').forEach(p => { p.style.display = 'none'; });
  scan();
  flushBadge();
}

function disable() {
  filterEnabled = false;
  document.querySelectorAll('[data-ai-hidden]').forEach(p => { p.style.display = ''; });
  flushBadge();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'getState') {
    sendResponse({
      enabled: filterEnabled,
      hiddenCount: document.querySelectorAll('[data-ai-hidden]').length,
    });
  } else if (msg.action === 'toggle') {
    filterEnabled ? disable() : enable();
    sendResponse({
      enabled: filterEnabled,
      hiddenCount: document.querySelectorAll('[data-ai-hidden]').length,
    });
  } else if (msg.action === 'keywordsUpdated') {
    buildPatterns(msg.keywords);
    fullRescan();
    sendResponse({});
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

chrome.storage.local.get(['keywords', 'lifetimeHits'], ({ keywords: kws, lifetimeHits: lt }) => {
  lifetimeHits = lt ?? {};
  buildPatterns(kws ?? DEFAULT_KEYWORDS);
  scan();
});
