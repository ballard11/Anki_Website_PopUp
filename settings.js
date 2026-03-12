// Settings page logic

// blockedSites is now [{host, questions, minutes}]
let blockedSites = [];

// --- Anki connection ---

async function checkAnkiStatus() {
  const dot = document.getElementById("ankiDot");
  const text = document.getElementById("ankiStatusText");
  const select = document.getElementById("deckSelect");

  const running = await isAnkiRunning();

  if (running) {
    dot.className = "dot green";
    text.textContent = "Anki is running — AnkiConnect connected";
    await populateDeckList();
  } else {
    dot.className = "dot red";
    text.textContent = "Anki is not running. Open Anki to load decks.";
    select.innerHTML = '<option value="">— Anki not detected —</option>';
  }
}

async function populateDeckList() {
  const select = document.getElementById("deckSelect");
  try {
    const decks = await getDeckNames();
    const { activeDeck = "" } = await chrome.storage.sync.get("activeDeck");

    select.innerHTML = '<option value="">— select a deck —</option>';
    decks.sort().forEach((deck) => {
      const opt = document.createElement("option");
      opt.value = deck;
      opt.textContent = deck;
      if (deck === activeDeck) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (e) {
    select.innerHTML = '<option value="">— failed to load decks —</option>';
  }
}

// --- Blocked sites ---

function renderSiteList() {
  const list = document.getElementById("siteList");
  list.innerHTML = "";

  if (blockedSites.length === 0) {
    list.innerHTML =
      '<p style="color:#475569;font-size:0.85rem;">No sites blocked yet.</p>';
    return;
  }

  blockedSites.forEach((site, i) => {
    const item = document.createElement("div");
    item.className = "site-item";
    item.innerHTML = `
      <span class="site-host">${site.host}</span>
      <div class="site-params">
        <label>Q</label>
        <input type="number" class="site-questions" value="${site.questions}" min="1" max="20" title="Questions required to unlock" />
        <label>min</label>
        <input type="number" class="site-minutes" value="${site.minutes}" min="1" max="1440" title="Unlock duration in minutes" />
      </div>
      <button class="danger" data-index="${i}">Remove</button>
    `;
    item.querySelector(".site-questions").addEventListener("change", (e) => {
      blockedSites[i].questions = parseInt(e.target.value, 10) || 5;
    });
    item.querySelector(".site-minutes").addEventListener("change", (e) => {
      blockedSites[i].minutes = parseInt(e.target.value, 10) || 90;
    });
    item.querySelector("button").addEventListener("click", () => {
      blockedSites.splice(i, 1);
      renderSiteList();
    });
    list.appendChild(item);
  });
}

document.getElementById("addSite").addEventListener("click", () => {
  const input = document.getElementById("newSite");
  const val = input.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!val) return;
  if (blockedSites.some((s) => s.host === val)) {
    input.value = "";
    return;
  }
  const questions = parseInt(document.getElementById("questionsInput").value, 10) || 5;
  const minutes = parseInt(document.getElementById("minutesInput").value, 10) || 90;
  blockedSites.push({ host: val, questions, minutes });
  renderSiteList();
  input.value = "";
});

document.getElementById("newSite").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("addSite").click();
});

// --- Load saved settings ---

async function loadSettings() {
  const data = await chrome.storage.sync.get([
    "blockedSites",
    "questionsPerSession",
    "unlockMinutes",
    "blockAllSites",
  ]);

  const defaultQ = data.questionsPerSession ?? 5;
  const defaultMin = data.unlockMinutes ?? 90;

  // Migrate legacy string[] format to object[]
  blockedSites = (data.blockedSites ?? []).map((site) =>
    typeof site === "string"
      ? { host: site, questions: defaultQ, minutes: defaultMin }
      : site
  );

  document.getElementById("questionsInput").value = defaultQ;
  document.getElementById("minutesInput").value = defaultMin;
  document.getElementById("blockAllSites").checked = data.blockAllSites ?? false;
  renderSiteList();
}

// --- Save ---

document.getElementById("saveBtn").addEventListener("click", async () => {
  const activeDeck = document.getElementById("deckSelect").value;
  const questionsPerSession = parseInt(document.getElementById("questionsInput").value, 10);
  const unlockMinutes = parseInt(document.getElementById("minutesInput").value, 10);
  const blockAllSites = document.getElementById("blockAllSites").checked;

  await chrome.storage.sync.set({
    blockedSites,
    activeDeck,
    questionsPerSession: isNaN(questionsPerSession) ? 5 : questionsPerSession,
    unlockMinutes: isNaN(unlockMinutes) ? 90 : unlockMinutes,
    blockAllSites,
  });

  const toast = document.getElementById("toast");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
});

// --- Refresh button ---

document.getElementById("refreshAnki").addEventListener("click", checkAnkiStatus);

// --- Init ---

loadSettings();
checkAnkiStatus();
