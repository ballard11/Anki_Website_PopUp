// AnkiConnect API wrapper
// AnkiConnect listens on localhost:8765 when Anki is open.

const ANKI_URL = "http://localhost:8765";

async function ankiRequest(action, params = {}) {
  const response = await fetch(ANKI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

// Check if Anki is running and AnkiConnect is available
async function isAnkiRunning() {
  try {
    await ankiRequest("version");
    return true;
  } catch {
    return false;
  }
}

// Get all deck names
async function getDeckNames() {
  return ankiRequest("deckNames");
}

// Get stats for a deck: new, learning, review counts
async function getDeckStats(deckName) {
  const stats = await ankiRequest("getDeckStats", { decks: [deckName] });
  // stats is keyed by deck ID, find our deck
  return Object.values(stats)[0] ?? null;
}

// Find due + new card IDs in a deck
async function getDueCardIds(deckName, limit = 5) {
  // Pull due (reviews + learning) and new cards separately,
  // prioritise due cards then fill remaining slots with new ones.
  const [dueIds, newIds] = await Promise.all([
    ankiRequest("findCards", { query: `deck:"${deckName}" is:due` }),
    ankiRequest("findCards", { query: `deck:"${deckName}" is:new` }),
  ]);

  const shuffleDue = dueIds.sort(() => Math.random() - 0.5);
  const shuffleNew = newIds.sort(() => Math.random() - 0.5);

  const selected = shuffleDue.slice(0, limit);
  if (selected.length < limit) {
    selected.push(...shuffleNew.slice(0, limit - selected.length));
  }
  return selected;
}

// Get full card info (rendered HTML question/answer + modelName)
async function getCardsInfo(cardIds) {
  return ankiRequest("cardsInfo", { cards: cardIds });
}

// Get CSS for a note model (to render cards faithfully)
async function getModelStyling(modelName) {
  const result = await ankiRequest("modelStyling", { modelName });
  return result.css ?? "";
}

// Fetch a media file as a base64 string
async function retrieveMediaFile(filename) {
  return ankiRequest("retrieveMediaFile", { filename });
}

// Replace <img src="filename"> references with base64 data URIs
async function injectImages(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const images = doc.querySelectorAll("img");

  await Promise.all(
    Array.from(images).map(async (img) => {
      const src = img.getAttribute("src");
      // Skip external URLs and data URIs
      if (!src || src.startsWith("http") || src.startsWith("data:")) return;
      try {
        const base64 = await retrieveMediaFile(src);
        if (base64) {
          const ext = src.split(".").pop().toLowerCase();
          const mime = ext === "png" ? "image/png"
            : ext === "gif" ? "image/gif"
            : ext === "svg" ? "image/svg+xml"
            : "image/jpeg";
          img.setAttribute("src", `data:${mime};base64,${base64}`);
        }
      } catch {
        // Leave broken image rather than crash
      }
    })
  );

  return doc.body.innerHTML;
}

// Submit an answer back to Anki's SRS scheduler
// ease: 1 = Again (missed), 3 = Good (got it)
async function answerCard(cardId, ease) {
  return ankiRequest("answerCards", {
    answers: [{ cardId, ease }],
  });
}

// Replace [sound:filename] tags with an inline <audio> player
async function injectAudio(html) {
  const soundRegex = /\[sound:([^\]]+)\]/g;
  const matches = [...html.matchAll(soundRegex)];
  if (matches.length === 0) return html;

  let result = html;
  await Promise.all(
    matches.map(async ([tag, filename]) => {
      try {
        const base64 = await retrieveMediaFile(filename);
        if (!base64) return;
        const ext = filename.split(".").pop().toLowerCase();
        const mime = ext === "ogg" ? "audio/ogg"
          : ext === "wav" ? "audio/wav"
          : "audio/mpeg";
        const audioEl = `<audio controls style="margin-top:8px;width:100%">` +
          `<source src="data:${mime};base64,${base64}" type="${mime}">` +
          `</audio>`;
        result = result.replace(tag, audioEl);
      } catch {
        result = result.replace(tag, ""); // silently drop missing audio
      }
    })
  );
  return result;
}

// High-level: fetch N due/new cards with media injected, ready to display
async function fetchChallengeCards(deckName, count = 5) {
  const ids = await getDueCardIds(deckName, count);
  if (ids.length === 0) return [];

  const cards = await getCardsInfo(ids);

  const processed = await Promise.all(
    cards.map(async (card) => {
      const [question, answer, css] = await Promise.all([
        injectImages(card.question).then(injectAudio),
        injectImages(card.answer).then(injectAudio),
        getModelStyling(card.modelName),
      ]);
      return { id: card.cardId, question, answer, css, isNew: card.queue === 0 };
    })
  );

  return processed;
}
