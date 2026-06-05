const DEFAULT_KEYWORDS = [
  'agents', 'agent', 'agentic',
  'artificial intelligence', 'ai', 'llm',
  'בינה מלאכותית', 'סוכן',
];

let filterEnabled = true;
let keywords = [];
let patterns = [];
let sessionHits = {};   // resets on fullRescan / page load
let lifetimeHits = {};  // persisted, never reset (except on keyword remove)

function buildPatterns(kws) {
  keywords = kws;
  patterns = kws.map(kw => {
    const isAscii = /^[\x00-\x7F]+$/.test(kw);
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return isAscii ? new RegExp(`\\b${escaped}\\b`, 'i') : new RegExp(escaped);
  });
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

function getPostBodyText(postRoot) {
  const clone = postRoot.cloneNode(true);
  clone.querySelectorAll('section, [class*="comment"], [id*="comment"]').forEach(el => el.remove());
  return clone.textContent;
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
    const matchIdx = patterns.findIndex(p => p.test(text));
    if (matchIdx !== -1) {
      post.setAttribute('data-ai-hidden', '1');
      post.style.display = 'none';
      const kw = keywords[matchIdx];
      sessionHits[kw]  = (sessionHits[kw]  ?? 0) + 1;
      lifetimeHits[kw] = (lifetimeHits[kw] ?? 0) + 1;
      changed = true;
    }
  }
  if (changed) updateBadge();
}

function fullRescan() {
  // Reset session counts only; lifetime counts are preserved
  sessionHits = Object.fromEntries(keywords.map(kw => [kw, 0]));
  document.querySelectorAll('[data-ai-scanned]').forEach(p => {
    p.removeAttribute('data-ai-scanned');
    p.removeAttribute('data-ai-hidden');
    p.style.display = '';
  });
  scan();
  // Force flush so badge updates immediately on user-initiated changes
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

// Two observers: bootstrap watches body until the feed list mounts; once we have
// it, narrow the scope to the feed itself to avoid waking on chat/notification
// mutations elsewhere on the page.
let feedObserver = null;
let bootstrapObserver = null;

function setupFeedObserver() {
  const feed = findFeedList();
  if (!feed || feedObserver) return;
  feedObserver = new MutationObserver(scheduleScan);
  feedObserver.observe(feed, { childList: true });
  if (bootstrapObserver) { bootstrapObserver.disconnect(); bootstrapObserver = null; }
}

let scanScheduled = false;
function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  const cb = () => { scanScheduled = false; scan(); setupFeedObserver(); };
  if (window.requestIdleCallback) requestIdleCallback(cb, { timeout: 500 });
  else setTimeout(cb, 250);
}

bootstrapObserver = new MutationObserver(scheduleScan);
bootstrapObserver.observe(document.body, { childList: true, subtree: true });

chrome.storage.local.get(['keywords', 'lifetimeHits'], ({ keywords: kws, lifetimeHits: lt }) => {
  lifetimeHits = lt ?? {};
  buildPatterns(kws ?? DEFAULT_KEYWORDS);
  scan();
  setupFeedObserver();
});
