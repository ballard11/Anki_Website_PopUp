// Background service worker — navigation interception + unlock state

const CHALLENGE_PAGE = chrome.runtime.getURL("challenge.html");

function getTodayString() {
  return new Date().toLocaleDateString("en-CA"); // "YYYY-MM-DD"
}

async function getBypassState() {
  const [syncData, sessionData] = await Promise.all([
    chrome.storage.sync.get("bypassUsedDate"),
    chrome.storage.session.get("bypassExpiry"),
  ]);
  const usedToday = syncData.bypassUsedDate === getTodayString();
  const expiry = sessionData.bypassExpiry ?? 0;
  const active = Date.now() < expiry;
  return { usedToday, active, expiry };
}

async function useBypassPass() {
  const { usedToday, active } = await getBypassState();
  if (usedToday && !active) return { ok: false, error: "already_used" };
  const expiry = Date.now() + 30 * 60 * 1000;
  await Promise.all([
    chrome.storage.sync.set({ bypassUsedDate: getTodayString() }),
    chrome.storage.session.set({ bypassExpiry: expiry }),
  ]);
  return { ok: true };
}

// --- Daily queue completion ---

async function isDailyDone(deckName) {
  if (!deckName) return false;
  const { dailyDone = {} } = await chrome.storage.session.get("dailyDone");
  return !!dailyDone[deckName];
}

async function markDailyDone(deckName) {
  const { dailyDone = {} } = await chrome.storage.session.get("dailyDone");
  dailyDone[deckName] = true;
  await chrome.storage.session.set({ dailyDone });
}

// Default settings (overridden by chrome.storage)
const DEFAULTS = {
  blockedSites: [],       // e.g. ["reddit.com", "x.com"]
  blockAllSites: false,   // if true, challenge on every site
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
  // Check global bypass first
  const { bypassExpiry = 0 } = await chrome.storage.session.get("bypassExpiry");
  if (Date.now() < bypassExpiry) return true;

  const unlocks = await getUnlocks();
  const expiry = unlocks[hostname];
  if (!expiry) return false;
  if (Date.now() > expiry) {
    delete unlocks[hostname];
    await setUnlocks(unlocks);
    return false;
  }
  return true;
}

// Called from challenge.html when the session is completed
async function unlockSite(hostname) {
  const { unlockMinutes = DEFAULTS.unlockMinutes, blockedSites = [] } =
    await chrome.storage.sync.get(["unlockMinutes", "blockedSites"]);
  const siteConfig = getSiteConfig(hostname, blockedSites);
  const minutes = siteConfig?.minutes ?? unlockMinutes;
  const unlocks = await getUnlocks();
  unlocks[hostname] = Date.now() + minutes * 60 * 1000;
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
// blockedSites may be string[] (legacy) or {host,questions,minutes}[]
function matchesBlockedSite(hostname, blockedSites) {
  return blockedSites.some((site) => {
    const pattern = (typeof site === "string" ? site : site.host).replace(/^www\./, "");
    return hostname === pattern || hostname.endsWith("." + pattern);
  });
}

// Find the per-site config object for a hostname (returns undefined for legacy string entries)
function getSiteConfig(hostname, blockedSites) {
  return blockedSites.find((site) => {
    if (typeof site === "string") return false;
    const pattern = site.host.replace(/^www\./, "");
    return hostname === pattern || hostname.endsWith("." + pattern);
  });
}

// Core interception logic
async function maybeBlock(tabId, url) {
  if (!url || url.startsWith("chrome") || url.startsWith(CHALLENGE_PAGE)) return;

  const { blockedSites = DEFAULTS.blockedSites, blockAllSites = false } =
    await chrome.storage.sync.get(["blockedSites", "blockAllSites"]);

  console.log("[AnkiGate] blockedSites:", blockedSites, "blockAllSites:", blockAllSites);

  const hostname = getHostname(url);
  console.log("[AnkiGate] hostname:", hostname);
  if (!hostname) return;

  const shouldBlock = blockAllSites || matchesBlockedSite(hostname, blockedSites);
  if (!shouldBlock) {
    console.log("[AnkiGate] not in blocked list, skipping");
    return;
  }
  if (await isSiteUnlocked(hostname)) {
    console.log("[AnkiGate] site is unlocked, skipping");
    return;
  }

  // If the user has completed today's full Anki daily queue, don't block at all
  const { activeDeck = "" } = await chrome.storage.sync.get("activeDeck");
  if (await isDailyDone(activeDeck)) {
    console.log("[AnkiGate] daily queue done, skipping");
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

// Fallback: webNavigation catches prerendered/cached navigations that tabs.onUpdated misses (e.g. Gemini)
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return; // main frame only
  console.log("[AnkiGate] webNavigation detected:", details.url);
  await maybeBlock(details.tabId, details.url);
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
      .then((data) => {
        const result = { ...DEFAULTS, ...data };
        if (message.hostname) {
          const siteConfig = getSiteConfig(message.hostname, result.blockedSites);
          if (siteConfig?.questions) result.questionsPerSession = siteConfig.questions;
          if (siteConfig?.minutes) result.unlockMinutes = siteConfig.minutes;
        }
        sendResponse(result);
      });
    return true;
  }

  if (message.type === "GET_UNLOCK_STATUS") {
    isSiteUnlocked(message.hostname).then((unlocked) =>
      sendResponse({ unlocked })
    );
    return true;
  }

  if (message.type === "GET_BYPASS_STATUS") {
    getBypassState().then(({ usedToday, active, expiry }) => {
      sendResponse({
        available: !usedToday || active,
        active,
        minutesLeft: active ? Math.ceil((expiry - Date.now()) / 60000) : 0,
      });
    });
    return true;
  }

  if (message.type === "USE_BYPASS_PASS") {
    useBypassPass().then(sendResponse);
    return true;
  }

  if (message.type === "MARK_DAILY_DONE") {
    markDailyDone(message.deckName).then(() => sendResponse({ ok: true }));
    return true;
  }
});
