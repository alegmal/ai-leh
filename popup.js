// Night mode toggle
const themeToggle = document.getElementById('theme-toggle');
chrome.storage.local.get('theme', ({ theme }) => {
  const dark = theme === 'dark';
  document.body.className = dark ? 'dark' : 'light';
  themeToggle.checked = dark;
});
themeToggle.addEventListener('change', () => {
  const next = themeToggle.checked ? 'dark' : 'light';
  document.body.className = next;
  chrome.storage.local.set({ theme: next });
});

// Show count on icon toggle (default: on)
const badgeToggle = document.getElementById('badge-toggle');
chrome.storage.local.get('showBadge', ({ showBadge }) => {
  badgeToggle.checked = showBadge !== false;
});
badgeToggle.addEventListener('change', () => {
  chrome.storage.local.set({ showBadge: badgeToggle.checked });
});

const stat        = document.getElementById('stat');
const toggleInput = document.getElementById('toggle');
const status      = document.getElementById('status');
const kwList      = document.getElementById('keyword-list');
const newKwInput  = document.getElementById('new-keyword');
const addBtn      = document.getElementById('add-btn');
const searchInput = document.getElementById('search-keyword');

let allKeywords = [];
let sessionHits = {};
let lifetimeHits = {};

function makeCount(cls, value) {
  const s = document.createElement('span');
  s.className = `kw-count ${cls}${value > 0 ? ' has-hits' : ''}`;
  s.title = cls === 'session' ? 'This session' : 'All time';
  s.textContent = value;
  return s;
}

function sum(obj) { return Object.values(obj).reduce((a, b) => a + b, 0); }

function renderKeywords(kws) {
  allKeywords = kws;

  const sessionTotal  = sum(sessionHits);
  const lifetimeTotal = sum(lifetimeHits);
  document.getElementById('legend-session').textContent  = `session ${sessionTotal}`;
  document.getElementById('legend-lifetime').textContent = `lifetime ${lifetimeTotal}`;

  const q = searchInput.value.trim().toLowerCase();
  const visible = q ? kws.filter(k => k.toLowerCase().includes(q)) : kws;
  kwList.innerHTML = '';
  visible.forEach(kw => {
    const li  = document.createElement('li');
    const txt = document.createElement('span');
    txt.className = 'kw-text';
    txt.textContent = kw;
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.title = 'Remove';
    btn.addEventListener('click', () => removeKeyword(kw));
    li.append(txt, makeCount('session', sessionHits[kw] ?? 0), makeCount('lifetime', lifetimeHits[kw] ?? 0), btn);
    kwList.appendChild(li);
  });
}

function renderState(state) {
  stat.textContent = state.hiddenCount ?? 0;
  toggleInput.checked = state.enabled !== false;
  status.textContent = toggleInput.checked ? 'Filtering active' : 'Posts are visible';
}

function withActiveTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => cb(tabs[0]));
}

function saveKeywords(kws) {
  // Drop hit counts for removed keywords so they don't accumulate across edits
  const nextSession  = {};
  const nextLifetime = {};
  for (const k of kws) {
    nextSession[k]  = sessionHits[k]  ?? 0;
    nextLifetime[k] = lifetimeHits[k] ?? 0;
  }
  sessionHits  = nextSession;
  lifetimeHits = nextLifetime;

  chrome.storage.local.set(
    { keywords: kws, sessionHits, lifetimeHits },
    () => {
      // Notify the LinkedIn tab(s) so they rebuild patterns and rescan
      chrome.tabs.query({ url: 'https://www.linkedin.com/*' }, tabs => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { action: 'keywordsUpdated', keywords: kws }, () => {
            // Swallow lastError if no content script is present on that tab
            void chrome.runtime.lastError;
          });
        }
      });
    },
  );
}

function removeKeyword(kw) {
  chrome.storage.local.get('keywords', ({ keywords = [] }) => {
    const updated = keywords.filter(k => k !== kw);
    saveKeywords(updated);
    renderKeywords(updated);
  });
}

function addKeyword() {
  const kw = newKwInput.value.trim();
  if (!kw) return;
  chrome.storage.local.get('keywords', ({ keywords = [] }) => {
    if (keywords.includes(kw)) { newKwInput.value = ''; return; }
    const updated = [...keywords, kw];
    saveKeywords(updated);
    renderKeywords(updated);
    newKwInput.value = '';
  });
}

addBtn.addEventListener('click', addKeyword);
newKwInput.addEventListener('keydown', e => { if (e.key === 'Enter') addKeyword(); });
searchInput.addEventListener('input', () => renderKeywords(allKeywords));

toggleInput.addEventListener('change', () => {
  withActiveTab(tab => {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' }, state => {
      if (state) renderState(state);
    });
  });
});

// Load initial state
chrome.storage.local.get(['hiddenCount', 'filterEnabled', 'keywords', 'sessionHits', 'lifetimeHits'], data => {
  sessionHits  = data.sessionHits  ?? {};
  lifetimeHits = data.lifetimeHits ?? {};
  renderState({ hiddenCount: data.hiddenCount ?? 0, enabled: data.filterEnabled !== false });
  renderKeywords(data.keywords ?? []);

  if (data.hiddenCount === undefined) {
    withActiveTab(tab => {
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { action: 'getState' }, state => {
        if (chrome.runtime.lastError || !state) {
          status.textContent = 'Not on LinkedIn feed';
          stat.textContent = '—';
          toggleInput.disabled = true;
          return;
        }
        renderState(state);
      });
    });
  }
});
