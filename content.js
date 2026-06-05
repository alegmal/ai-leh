const DEFAULT_KEYWORDS = [
  'agents', 'agent', 'agentic',
  'artificial intelligence', 'ai', 'llm',
  'בינה מלאכותית', 'סוכן',
];

let filterEnabled = true;
let keywords = [];
let patterns = [];
let sessionHits = {};   // resets on fullRescan / page load
let lifetimeHits = {};  // persisted, never reset

function buildPatterns(kws) {
  keywords = kws;
  patterns = kws.map(kw => {
    const isAscii = /^[\x00-\x7F]+$/.test(kw);
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return isAscii ? new RegExp(`\\b${escaped}\\b`, 'i') : new RegExp(escaped);
  });
  // Keep existing session/lifetime counts for keywords that still exist
  sessionHits  = Object.fromEntries(kws.map(kw => [kw, sessionHits[kw]  ?? 0]));
  lifetimeHits = Object.fromEntries(kws.map(kw => [kw, lifetimeHits[kw] ?? 0]));
}

function updateBadge() {
  try {
    chrome.storage.local.set({
      hiddenCount: document.querySelectorAll('[data-ai-hidden]').length,
      filterEnabled,
      sessionHits,
      lifetimeHits,
    });
  } catch (_) {}
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
  updateBadge();
}

function enable() {
  filterEnabled = true;
  document.querySelectorAll('[data-ai-hidden]').forEach(p => { p.style.display = 'none'; });
  scan();
  updateBadge();
}

function disable() {
  filterEnabled = false;
  document.querySelectorAll('[data-ai-hidden]').forEach(p => { p.style.display = ''; });
  updateBadge();
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

function debounce(fn, ms) {
  let timer;
  return () => { clearTimeout(timer); timer = setTimeout(fn, ms); };
}

new MutationObserver(debounce(scan, 250)).observe(document.body, { childList: true, subtree: true });

// Load keywords + lifetime hits from storage; session always starts at 0
chrome.storage.local.get(['keywords', 'lifetimeHits'], ({ keywords: kws, lifetimeHits: lt }) => {
  lifetimeHits = lt ?? {};
  buildPatterns(kws ?? DEFAULT_KEYWORDS);
  scan();
});
