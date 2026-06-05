const DEFAULT_KEYWORDS = [
  'agents', 'agent', 'agentic',
  'artificial intelligence', 'ai', 'llm',
  'בינה מלאכותית', 'סוכן',
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('keywords', ({ keywords }) => {
    if (!keywords) chrome.storage.local.set({ keywords: DEFAULT_KEYWORDS });
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !('hiddenCount' in changes)) return;
  const count = changes.hiddenCount.newValue ?? 0;
  const text = count > 0 ? String(count) : '';
  // Apply to all LinkedIn tabs
  chrome.tabs.query({ url: 'https://www.linkedin.com/*' }, tabs => {
    for (const tab of tabs) {
      chrome.action.setBadgeText({ text, tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#c00', tabId: tab.id });
    }
  });
});
