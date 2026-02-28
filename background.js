// Background service worker — navigation interception + unlock state

const CHALLENGE_PAGE = chrome.runtime.getURL("challenge.html");

// Default settings (overridden by chrome.storage)
const DEFAULTS = {
  blockedSites: [],       // e.g. ["reddit.com", "x.com"]
  activeDeck: "",         // Anki deck name
  questionsPerSession: 5, // 3–5
  unlockMinutes: 90,
};

// In-memory unlock map: { "reddit.com": expiryTimestamp }
// We persist this in chrome.storage.session so it survives service worker restarts
// but clears when the browser closes.
async function getUnlocks() {
  const data = await chrome.storage.session.get("unlocks");
  return data.unlocks ?? {};
}

async function setUnlocks(unlocks) {
  await chrome.storage.session.set({ unlocks });
}

async function isSiteUnlocked(hostname) {
  const unlocks = await getUnlocks();
  const expiry = unlocks[hostname];
  if (!expiry) return false;
  if (Date.now() > expiry) {
    // Expired — clean up
    delete unlocks[hostname];
    await setUnlocks(unlocks);
    return false;
  }
  return true;
}

// Called from challenge.html when the session is completed
async function unlockSite(hostname) {
  const { unlockMinutes = DEFAULTS.unlockMinutes } =
    await chrome.storage.sync.get("unlockMinutes");
  const unlocks = await getUnlocks();
  unlocks[hostname] = Date.now() + unlockMinutes * 60 * 1000;
  await setUnlocks(unlocks);
}

// Normalise a URL to its hostname (strips www.)
function getHostname(url) {
  try {
    const h = new URL(url).hostname;
    return h.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Check if a hostname matches any blocked site pattern
function matchesBlockedSite(hostname, blockedSites) {
  return blockedSites.some((site) => {
    const pattern = site.replace(/^www\./, "");
    return hostname === pattern || hostname.endsWith("." + pattern);
  });
}

// Core interception logic
async function maybeBlock(tabId, url) {
  if (!url || url.startsWith("chrome") || url.startsWith(CHALLENGE_PAGE)) return;

  const { blockedSites = DEFAULTS.blockedSites } =
    await chrome.storage.sync.get("blockedSites");

  console.log("[AnkiGate] blockedSites:", blockedSites);

  if (blockedSites.length === 0) return;

  const hostname = getHostname(url);
  console.log("[AnkiGate] hostname:", hostname);
  if (!hostname) return;
  if (!matchesBlockedSite(hostname, blockedSites)) {
    console.log("[AnkiGate] not in blocked list, skipping");
    return;
  }
  if (await isSiteUnlocked(hostname)) {
    console.log("[AnkiGate] site is unlocked, skipping");
    return;
  }

  console.log("[AnkiGate] BLOCKING", hostname);
  const challengeUrl =
    CHALLENGE_PAGE + "?site=" + encodeURIComponent(hostname) +
    "&dest=" + encodeURIComponent(url);

  chrome.tabs.update(tabId, { url: challengeUrl });
}

// Listen for tab navigation — changeInfo.url fires exactly when the URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || (changeInfo.status === "loading" ? tab.url : null);
  if (!url) return;
  console.log("[AnkiGate] Navigation detected:", url);
  await maybeBlock(tabId, url);
});

// Handle messages from challenge.html
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "UNLOCK_SITE") {
    unlockSite(message.hostname).then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async response
  }

  if (message.type === "GET_SETTINGS") {
    chrome.storage.sync
      .get(["blockedSites", "activeDeck", "questionsPerSession", "unlockMinutes"])
      .then((data) => sendResponse({ ...DEFAULTS, ...data }));
    return true;
  }

  if (message.type === "GET_UNLOCK_STATUS") {
    isSiteUnlocked(message.hostname).then((unlocked) =>
      sendResponse({ unlocked })
    );
    return true;
  }
});
