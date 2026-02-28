# Roadmap — Public Launch (Target: ~30 days)

The goal is a polished public release on the Chrome Web Store, accompanied by a Medium article and a post to r/Anki.

---

## Before launch checklist

### Stability (stress testing in progress)
- [ ] Verify "Again" cycling — card returns to end of queue, session only ends when all cleared
- [ ] Verify destination URL redirect after session (specific post URLs, not just homepage)
- [ ] Verify 90-minute timer expiry re-blocks correctly
- [ ] Test first-install experience with no settings configured
- [ ] Test Anki closing mid-session
- [ ] Test multiple blocked sites independently locking/unlocking
- [ ] Test service worker wake-up after long idle period

### Assets
- [ ] Generate and commit icons (run `generate_icons.html` in Chrome, move PNGs to `icons/`)
- [ ] Take a real screenshot of the challenge page for `docs/screenshot.png`
- [ ] Optional: short screen recording / GIF for README and Medium article

### Distribution
- [ ] Add Ko-fi or Buy Me a Coffee link to README and challenge done-screen
- [ ] Submit to Chrome Web Store ($5 one-time developer fee)
  - Requires: icons, screenshots, privacy policy blurb, description
- [ ] Chrome Web Store review typically takes 3–7 days

### Content
- [ ] Draft Medium article
  - Angle: "I built a Chrome extension that makes you do Anki flashcards before opening Reddit"
  - Cover: the problem, the idea, how AnkiConnect integration works, what makes it different from simpler approaches, lessons learned building with Claude Code
- [ ] Post to r/Anki with demo GIF

---

## Potential improvements to ship before launch

- [ ] Session progress persists if challenge tab is closed mid-session
- [ ] Snooze button ("not now, unlock for 10 min without cards") for genuine work needs
- [ ] Anki startup reminder if AnkiConnect not detected
- [ ] Firefox port (WebExtensions API is largely compatible)

## Potential improvements post-launch (based on feedback)

- Per-site deck assignment
- Tag filtering (only pull cards tagged `#sql` for certain sites)
- Stats page — reviews done via extension over time
- Mobile companion (long shot, different platform entirely)

---

## Notes

- Soft blocking is intentional — pairs with Cold Turkey for users who want enforcement
- The Medium article should be honest that Claude Code was the primary coding tool — this is part of the story, not something to hide
- r/Anki is the highest-leverage launch channel; the community will get it immediately
