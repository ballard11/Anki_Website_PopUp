# Anki Gate

A Chrome extension that blocks distracting websites until you complete a short Anki card session. Answer your flashcards, unlock the site for 90 minutes.

![Anki Gate challenge screen](docs/screenshot.png)

---

## Philosophy

Most distraction blockers just say no. Anki Gate says *not yet — do something useful first.*

The core idea: before you can visit a blocked site, you review a handful of cards from your actual Anki deck. Not a separate flashcard system you have to maintain alongside Anki — your real decks, your real cards, your real scheduling. Every review you do in Anki Gate is submitted back to Anki with proper ease ratings (Again / Hard / Good / Easy), updates your card intervals, and syncs to AnkiWeb exactly like a review done inside Anki itself.

This means the extension does two things at once: it adds friction to mindless browsing, and it keeps your Anki reviews from piling up. If you have a 500-card SQL deck you've been neglecting, every Reddit visit chips away at it.

It also means you can use any deck from [Anki's shared deck library](https://ankiweb.net/shared/decks) — thousands of community-made decks for data science, medicine, law, languages, and more — without creating a single card yourself.

---

## How it works

1. You try to visit a blocked site (Reddit, X, YouTube, etc.)
2. The extension intercepts the navigation and shows a challenge page
3. You review 3–5 cards from your chosen Anki deck using the standard **Again / Hard / Good / Easy** buttons
4. Your answers feed directly back into Anki's SRS scheduler — these are real reviews
5. Once all cards are cleared, the site unlocks for 90 minutes

---

## Features

- **Your actual Anki decks** — connects to Anki via AnkiConnect. Select any deck you already own, including community decks. No separate card management.
- **Real SRS feedback** — ease ratings go back to Anki and update card intervals. Reviews appear in your history and sync to AnkiWeb. These count.
- **Full card rendering** — images, audio, and card CSS render faithfully, including community decks with rich media
- **Standard ease buttons** — Again / Hard / Good / Easy, same as Anki's own interface. `Again` sends the card to the end of the session queue; you must clear it before unlocking.
- **Due + new cards** — pulls overdue reviews first, fills remaining slots with new cards
- **Per-site unlock timer** — each blocked site has its own 90-minute window (configurable)
- **Popup status** — see which sites are locked/unlocked and how much time remains
- **Keyboard shortcuts** — `Space` to show answer, `1` `2` `3` `4` for ease ratings

---

## Prerequisites

1. **[Anki](https://apps.ankiweb.net/)** — free, cross-platform flashcard app
2. **[AnkiConnect](https://ankiweb.net/shared/info/2055492159)** — Anki add-on that exposes a local API
   Install via Anki: `Tools → Add-ons → Get Add-ons → code: 2055492159`
3. **Anki must be running** while you use the browser — it can sit minimized in the taskbar

---

## Installation

### From source (developer mode)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Toggle **Developer mode** on (top right)
4. Click **Load unpacked** and select the repository folder
5. The Anki Gate icon will appear in your toolbar

### Chrome Web Store

*Coming soon.*

---

## Setup

1. Open Anki and make sure AnkiConnect is installed
2. Click the Anki Gate icon in Chrome's toolbar
3. Click **Settings**
4. Select your **Active Deck** from the dropdown (populated from your live Anki decks)
5. Add the sites you want to block (e.g. `reddit.com`, `x.com`, `youtube.com`)
6. Adjust **Questions per session** (default: 5) and **Unlock duration** (default: 90 min)
7. Click **Save Settings**

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` or `Enter` | Show answer |
| `1` | Again |
| `2` | Hard |
| `3` | Good |
| `4` | Easy |

---

## Configuration

All settings are stored in `chrome.storage.sync` and accessible from the Settings page.

| Setting | Default | Description |
|---------|---------|-------------|
| Active deck | — | Anki deck to pull cards from |
| Blocked sites | — | Hostnames to intercept (e.g. `reddit.com`) |
| Questions per session | 5 | Cards required to unlock a site |
| Unlock duration | 90 min | How long a site stays unlocked after completing a session |

---

## How answers affect Anki

When you answer a card in Anki Gate, the ease rating is submitted to AnkiConnect using the standard Anki ease values:

| Button | Ease | Anki behaviour |
|--------|------|----------------|
| Again | 1 | Card resets, shown again soon. Also returns to end of current session queue. |
| Hard | 2 | Interval reduced |
| Good | 3 | Normal interval increase |
| Easy | 4 | Larger interval increase |

These reviews appear in your Anki review history and sync to AnkiWeb exactly like reviews done inside Anki.

---

## Project structure

```
├── manifest.json       Chrome extension manifest (MV3)
├── background.js       Service worker — navigation interception, unlock state
├── anki.js             AnkiConnect API wrapper (cards, media, scheduling)
├── challenge.html/js   The quiz page shown when a site is blocked
├── settings.html/js    Extension settings page
├── popup.html/js       Toolbar popup showing lock/unlock status
└── icons/              Extension icons (16, 32, 48, 128px)
```

---

## Limitations

- **Anki must be open** — if Anki is closed, the challenge page will show an error. Add Anki to Windows startup to avoid this.
- **Chrome only** — Firefox support not currently planned
- **Soft blocking** — the extension can be disabled in Chrome settings. This tool is designed for habit reinforcement, not enforcement. For hard blocking, pair it with [Cold Turkey](https://getcoldturkey.com/).
- **Complex card types** — most card styles render correctly. Highly custom note types with external CSS dependencies may not look identical to Anki.

---

## Contributing

Pull requests welcome. Some ideas for contributions:

- Firefox port (WebExtensions API is largely compatible)
- Per-site deck assignment
- Session progress persistence across tab closes
- Snooze / temporary pause feature
- Anki startup helper for Windows

---

## License

MIT
