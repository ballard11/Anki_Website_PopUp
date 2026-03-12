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

function renderCardInFrame(container, html, css) {
  container.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "width:100%;border:none;display:block;";
  container.appendChild(iframe);

  // Strip inline scripts — blocked by extension CSP anyway
  const cleanHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  const doc = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <style>
      body { margin:0; padding:0; background:transparent; color:#e2e8f0;
             font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
             font-size:1.05rem; line-height:1.6; }
      img { max-width:100%; height:auto; }
      #image-occlusion-container {
        position:relative; display:inline-block; max-width:100%;
      }
      ${css ?? ""}
    </style>
  </head><body>${cleanHtml}</body></html>`;

  const url = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
  iframe.onload = () => {
    URL.revokeObjectURL(url);
    const iDoc = iframe.contentDocument;
    if (!iDoc) return;
    // Render IO occlusions using parent-frame JS — no CSP issues
    renderIOOcclusions(iDoc);
    iframe.style.height = iDoc.body.scrollHeight + "px";
  };
  iframe.src = url;
}

// Draw Image Occlusion rectangles directly onto the iframe's canvas.
// Called from the parent frame after load — avoids all CSP restrictions.
function renderIOOcclusions(iDoc) {
  const img    = iDoc.querySelector("#image-occlusion-container img");
  const canvas = iDoc.getElementById("image-occlusion-canvas");
  if (!img || !canvas) return;

  function draw() {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;

    canvas.width  = w;
    canvas.height = h;
    canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;";

    const container = iDoc.getElementById("image-occlusion-container");
    if (container) {
      container.style.position = "relative";
      container.style.display  = "inline-block";
    }

    const ctx = canvas.getContext("2d");

    // Gray rectangles for inactive occlusions that should stay covered
    iDoc.querySelectorAll(".cloze-inactive").forEach(el => {
      if (el.dataset.occludeinactive !== "1") return;
      paintIORect(ctx, el, "rgb(80,80,80)", w, h);
    });

    // Blue rectangle for the active occlusion being tested
    iDoc.querySelectorAll(".cloze").forEach(el => {
      paintIORect(ctx, el, "rgb(30,144,255)", w, h);
    });
  }

  if (img.complete && img.naturalWidth) {
    draw();
  } else {
    img.addEventListener("load", draw, { once: true });
  }
}

function paintIORect(ctx, el, color, imgW, imgH) {
  const left   = parseFloat(el.dataset.left)   * imgW;
  const top    = parseFloat(el.dataset.top)    * imgH;
  const width  = parseFloat(el.dataset.width)  * imgW;
  const height = parseFloat(el.dataset.height) * imgH;
  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, height);
}

function showQuestion(card) {
  currentCard = card;

  // Render question immediately (visible, so scrollHeight will be correct)
  renderCardInFrame(document.getElementById("questionContent"), card.question, card.css);

  // Clear answer content — rendered lazily when Show Answer is clicked
  document.getElementById("answerContent").innerHTML = "";

  // New card badge
  const badge = document.getElementById("newCardBadge");
  if (badge) badge.style.display = card.isNew ? "inline-block" : "none";

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

  const { unlockMinutes = 90 } = await chrome.runtime.sendMessage({ type: "GET_SETTINGS", hostname: blockedSite });
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
  // Render answer iframe now that the container is visible, so scrollHeight is correct
  if (currentCard) {
    renderCardInFrame(document.getElementById("answerContent"), currentCard.answer, currentCard.css);
  }
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

  // Get settings from background (hostname gets per-site overrides applied)
  const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS", hostname: blockedSite });
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
