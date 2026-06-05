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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  const countChanged = 'hiddenCount' in changes;
  const showChanged  = 'showBadge'   in changes;
  if (!countChanged && !showChanged) return;

  // Need both values to compute current badge state
  chrome.storage.local.get(['hiddenCount', 'showBadge'], data => {
    applyBadge(data.hiddenCount ?? 0, data.showBadge !== false);
  });
});
