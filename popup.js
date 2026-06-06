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

const toggleInput  = document.getElementById('toggle');
const status       = document.getElementById('status');
const filteredList = document.getElementById('filtered-list');

// Must match DEFAULT_KEYWORDS in content.js.
const KEYWORDS = [
  'agents', 'agent', 'agentic',
  'artificial intelligence', 'ai', 'llm',
  'בינה מלאכותית',
];

let sessionHits = {};
let lifetimeHits = {};

function renderKeywords() {
  const sessionTotal  = Object.values(sessionHits).reduce((a, b) => a + b, 0);
  const lifetimeTotal = Object.values(lifetimeHits).reduce((a, b) => a + b, 0);
  document.getElementById('legend-session').textContent  = `session ${sessionTotal}`;
  document.getElementById('legend-lifetime').textContent = `lifetime ${lifetimeTotal}`;

  filteredList.innerHTML = '';
  for (const kw of KEYWORDS) {
    const pill = document.createElement('span');
    pill.className = 'pill';

    const txt = document.createElement('span');
    txt.textContent = kw;
    pill.appendChild(txt);

    const s = sessionHits[kw]  ?? 0;
    const l = lifetimeHits[kw] ?? 0;
    if (s > 0) {
      const c = document.createElement('span');
      c.className = 'kw-count session';
      c.title = 'This session';
      c.textContent = s;
      pill.appendChild(c);
    }
    if (l > 0) {
      const c = document.createElement('span');
      c.className = 'kw-count lifetime';
      c.title = 'All time';
      c.textContent = l;
      pill.appendChild(c);
    }
    filteredList.appendChild(pill);
  }
}

function renderState(state) {
  // Toggle means "stop hiding content" — checked = filter off
  const filtering = state.enabled !== false;
  toggleInput.checked = !filtering;
  status.textContent = filtering ? 'Filtering active' : 'Posts are visible';
}

function withActiveTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => cb(tabs[0]));
}

toggleInput.addEventListener('change', () => {
  withActiveTab(tab => {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' }, state => {
      if (state) renderState(state);
    });
  });
});

// Load initial state
chrome.storage.local.get(
  ['filterEnabled', 'sessionHits', 'lifetimeHits'],
  data => {
    sessionHits  = data.sessionHits  ?? {};
    lifetimeHits = data.lifetimeHits ?? {};
    renderState({ enabled: data.filterEnabled !== false });
    renderKeywords();

    // Confirm we're on a LinkedIn tab; if not, disable the toggle.
    withActiveTab(tab => {
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { action: 'getState' }, state => {
        if (chrome.runtime.lastError || !state) {
          status.textContent = 'Not on LinkedIn feed';
          toggleInput.disabled = true;
          return;
        }
        renderState(state);
      });
    });
  },
);
