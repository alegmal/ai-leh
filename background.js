const DEFAULT_KEYWORDS = [
  'agents', 'agent', 'agentic',
  'artificial intelligence', 'ai', 'llm',
  'בינה מלאכותית', 'סוכן',
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['keywords', 'showBadge'], data => {
    const seed = {};
    if (!data.keywords)            seed.keywords  = DEFAULT_KEYWORDS;
    if (data.showBadge === undefined) seed.showBadge = true;
    if (Object.keys(seed).length) chrome.storage.local.set(seed);
  });
});

function applyBadge(count, show) {
  const text = show && count > 0 ? String(count) : '';
  chrome.tabs.query({ url: 'https://www.linkedin.com/*' }, tabs => {
    for (const tab of tabs) {
      chrome.action.setBadgeText({ text, tabId: tab.id });
      if (text) chrome.action.setBadgeBackgroundColor({ color: '#c00', tabId: tab.id });
    }
  });
}

function refreshBadge() {
  chrome.storage.local.get(['hiddenCount', 'showBadge'], data => {
    applyBadge(data.hiddenCount ?? 0, data.showBadge !== false);
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!('hiddenCount' in changes) && !('showBadge' in changes)) return;
  refreshBadge();
});

// The service worker can be killed at any time. Per-tab badge state is lost
// on worker restart, so re-apply it whenever the worker spins back up.
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);
// Also reapply when a LinkedIn tab finishes loading — the per-tab badge is
// reset to default when a navigation completes.
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.url && tab.url.startsWith('https://www.linkedin.com/')) {
    refreshBadge();
  }
});
