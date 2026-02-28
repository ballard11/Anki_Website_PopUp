async function render() {
  const { blockedSites = [] } = await chrome.storage.sync.get("blockedSites");
  const list = document.getElementById("list");

  if (blockedSites.length === 0) {
    list.innerHTML = '<p class="empty">No sites configured.</p>';
    return;
  }

  const unlockData = await chrome.storage.session.get("unlocks");
  const unlocks = unlockData.unlocks ?? {};

  list.innerHTML = "";
  blockedSites.forEach((site) => {
    const expiry = unlocks[site];
    const now = Date.now();
    const unlocked = expiry && now < expiry;
    const minutesLeft = unlocked ? Math.ceil((expiry - now) / 60000) : 0;

    const row = document.createElement("div");
    row.className = "site-row";
    row.innerHTML = `
      <span>${site}</span>
      <span class="${unlocked ? "unlocked" : "locked"}">
        ${unlocked ? `unlocked (${minutesLeft}m)` : "locked"}
      </span>
    `;
    list.appendChild(row);
  });
}

document.getElementById("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
