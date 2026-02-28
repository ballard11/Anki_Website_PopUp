// Challenge page logic

const params = new URLSearchParams(location.search);
const blockedSite = params.get("site") || "";
const destUrl = params.get("dest") || ("https://" + blockedSite);

// Session state
let sessionQueue = [];   // cards yet to be answered correctly
let completedCount = 0;  // cards answered correctly this session
let totalRequired = 5;   // pulled from settings
let currentCard = null;

// --- UI helpers ---

function show(id) { document.getElementById(id).style.display = "flex"; }
function hide(id) { document.getElementById(id).style.display = "none"; }
function showBlock(id) { document.getElementById(id).style.display = "block"; }

function setScreen(name) {
  ["loadingScreen", "ankiErrorScreen", "noDeckScreen", "noCardsScreen", "quizUI", "doneScreen"]
    .forEach((id) => { document.getElementById(id).style.display = "none"; });

  if (name === "quizUI") {
    document.getElementById("quizUI").style.display = "flex";
    document.getElementById("quizUI").style.flexDirection = "column";
    document.getElementById("quizUI").style.alignItems = "center";
  } else {
    document.getElementById(name).style.display = name === "doneScreen" ? "block" : "flex";
    document.getElementById(name).style.flexDirection = "column";
    document.getElementById(name).style.alignItems = "center";
  }
}

function renderPips() {
  const container = document.getElementById("pips");
  container.innerHTML = "";
  for (let i = 0; i < totalRequired; i++) {
    const pip = document.createElement("div");
    pip.className =
      i < completedCount ? "pip done" :
      i === completedCount ? "pip current" :
      "pip";
    container.appendChild(pip);
  }
  document.getElementById("progressText").textContent =
    `${completedCount} / ${totalRequired}`;
}

function showQuestion(card) {
  currentCard = card;

  document.getElementById("questionContent").innerHTML = card.question;
  document.getElementById("answerContent").innerHTML = card.answer;

  // New card badge
  const badge = document.getElementById("newCardBadge");
  if (badge) badge.style.display = card.isNew ? "inline-block" : "none";

  // Inject card's own CSS scoped inside the card content areas
  let styleEl = document.getElementById("injectedCardStyle");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "injectedCardStyle";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = card.css
    ? card.css.split("}").map((rule) => {
        const trimmed = rule.trim();
        if (!trimmed) return "";
        return `.card-content ${trimmed}}`;
      }).join("\n")
    : "";

  // Reset answer visibility
  document.getElementById("answerSide").style.display = "none";
  document.getElementById("showAnswerBtn").style.display = "block";
  document.getElementById("answerActions").style.display = "none";

  renderPips();
}

function nextCard() {
  if (sessionQueue.length === 0) {
    finishSession();
    return;
  }
  showQuestion(sessionQueue[0]);
}

async function finishSession() {
  // Tell background to unlock the site
  await chrome.runtime.sendMessage({ type: "UNLOCK_SITE", hostname: blockedSite });

  setScreen("doneScreen");

  const { unlockMinutes = 90 } = await chrome.storage.sync.get("unlockMinutes");
  document.getElementById("doneMessage").textContent =
    `${blockedSite} is unlocked for ${unlockMinutes} minutes.`;

  document.getElementById("proceedBtn").addEventListener("click", () => {
    location.href = destUrl;
  });
}

// --- Answer buttons ---

document.getElementById("showAnswerBtn").addEventListener("click", () => {
  document.getElementById("answerSide").style.display = "block";
  document.getElementById("showAnswerBtn").style.display = "none";
  document.getElementById("answerActions").style.display = "flex";
});

async function handleAnswer(ease) {
  if (!currentCard) return;
  try { await answerCard(currentCard.id, ease); } catch { /* Anki closed mid-session */ }

  if (ease === 1) {
    // Again — move to end of session queue, must retry
    const card = sessionQueue.shift();
    sessionQueue.push(card);
  } else {
    // Hard / Good / Easy — counts as cleared
    sessionQueue.shift();
    completedCount++;
  }
  nextCard();
}

document.getElementById("againBtn").addEventListener("click", () => handleAnswer(1));
document.getElementById("hardBtn").addEventListener("click",  () => handleAnswer(2));
document.getElementById("goodBtn").addEventListener("click",  () => handleAnswer(3));
document.getElementById("easyBtn").addEventListener("click",  () => handleAnswer(4));

// --- Keyboard shortcuts ---
document.addEventListener("keydown", (e) => {
  // Don't fire if user is typing in an input
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  const answerVisible = document.getElementById("answerActions").style.display === "flex";

  if ((e.key === " " || e.key === "Enter") && !answerVisible) {
    e.preventDefault();
    document.getElementById("showAnswerBtn").click();
    return;
  }

  if (answerVisible) {
    if (e.key === "1") handleAnswer(1);
    if (e.key === "2") handleAnswer(2);
    if (e.key === "3") handleAnswer(3);
    if (e.key === "4") handleAnswer(4);
  }
});

// --- No-cards fallback ---

document.getElementById("noCardsProceedBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "UNLOCK_SITE", hostname: blockedSite });
  location.href = destUrl;
});

// --- Stats bar ---

async function renderStats(deckName) {
  try {
    const stats = await getDeckStats(deckName);
    if (!stats) return;
    document.getElementById("statsBar").innerHTML = `
      <div class="stat">New <span>${stats.new_count}</span></div>
      <div class="stat">Learning <span>${stats.learn_count}</span></div>
      <div class="stat">Review <span>${stats.review_count}</span></div>
      <div class="stat">Deck <span>${deckName}</span></div>
    `;
  } catch { /* stats are optional */ }
}

// --- Init ---

async function init() {
  setScreen("loadingScreen");

  document.getElementById("siteLabel").textContent = blockedSite;

  // Get settings from background
  const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  totalRequired = settings.questionsPerSession ?? 5;

  if (!settings.activeDeck) {
    setScreen("noDeckScreen");
    return;
  }

  const running = await isAnkiRunning();
  if (!running) {
    setScreen("ankiErrorScreen");
    return;
  }

  renderStats(settings.activeDeck);

  let cards;
  try {
    cards = await fetchChallengeCards(settings.activeDeck, totalRequired);
  } catch (e) {
    setScreen("ankiErrorScreen");
    return;
  }

  if (cards.length === 0) {
    setScreen("noCardsScreen");
    return;
  }

  // If fewer cards available than required, adjust total
  totalRequired = cards.length;
  sessionQueue = [...cards];

  setScreen("quizUI");
  document.getElementById("keyHint").style.display = "block";
  nextCard();
}

init();
