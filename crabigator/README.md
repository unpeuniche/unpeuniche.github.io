# Crabigator - WaniKani Reverse Flashcards

A minimal browser app for practising writing kanji and vocabulary from their English meanings (the reverse of WaniKani's default review direction).

## What it does

- Fetches your started kanji/vocabulary directly from the WaniKani API using your personal token.
- Displays a random meaning (primary + alternatives) on the front of a flip card.
- You write the Japanese offline, then click the card to reveal the answer: characters, readings, meanings, a looping kanji stroke-order animation, and a link to the WaniKani subject page.
- Evaluate each card with **O** (you knew it, remove from the list) or **X** (missed it, keep it for review), which also draws the next card.
- Supports a "no repeat until exhausted" cycle so every item is seen before anything repeats.

## Setup

### On GitHub Pages

Just open the app in your browser:
1. Go to the Crabigator page on GitHub Pages
2. Open the **Setup** panel (eye icon)
3. Paste your WaniKani v2 API token and click **Save Token**  
   Get your token at: https://www.wanikani.com/settings/personal_access_tokens
4. Saving your token starts a sync if needed (first load takes 10-30 s depending on your level). Results are cached locally. **Reload Deck** inside Setup lets you sync manually at any time.
5. Use **Reset List** inside Setup to restart only the currently filtered list without another API call.

The app checks for a daily sync when opened or brought back into view. If the cached deck is from a previous local calendar day, it fetches fresh WaniKani data. Syncing preserves completed and remaining items in every saved list, adds matching new items to the remaining queue, and removes unavailable items. Existing level filters and the current card are kept when possible. A failed sync leaves the cached deck and progress available; use **Reload Deck** to retry, or reopen the app. Automatic attempts are limited to once per day per page session.

### Locally

If you want to run this locally without GitHub Pages:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser and follow steps 2-5 above.

## Controls

| Action | How |
|---|---|
| Draw first card / show result | Click the card (or **Enter** when focused) |
| Evaluate & draw next card | **O** (remove from list) / **X** (keep for review) buttons |
| Close info popup | x button, click backdrop, or **Escape** |

## Filters (inside Setup)

| Filter | Effect |
|---|---|
| Item Type | Kanji only, Vocabulary only, or both |
| Jōyō Grade | All Grades by default, or Grades 1-6 or Grade 7+. Vocabulary uses its highest-grade Jōyō kanji; kana-only or non-Jōyō-only words have no grade and appear only under All Grades. |
| Level Range | Auto-capped to your current WaniKani level; adjustable |
| No repeat | Cycle through all items before repeating |
| Reset List | Reset the cycle counter for the current filters (no API call needed) |
| Reload Deck | Sync with WaniKani without restarting saved lists |

## Tests

Run the queue and daily-sync regression tests with Node.js:

```bash
node --test crabigator/app.test.cjs
```

## Card colours

Colours match the WaniKani palette:

| Colour | Type |
|---|---|
| Pink `#ff00aa` border | Kanji front |
| Purple `#aa00ff` border | Vocabulary front |
| Solid pink `#e2007d` back | Kanji answer |
| Solid purple `#8800cc` back | Vocabulary answer |

## Data & privacy

- Your API token is stored only in `localStorage` and sent only to `api.wanikani.com`.
- The deck is cached in `localStorage` under the key `wk_reverse_cache`.
- The "no repeat" review queue (which items are left before the cycle resets) is stored in `localStorage` under the key `wk_reverse_queues`.
- Jōyō grade assignments are bundled in `joyo-grades.json` from the current [grade-by-grade kanji allocation table](https://ja.wikipedia.org/wiki/%E5%AD%A6%E5%B9%B4%E5%88%A5%E6%BC%A2%E5%AD%97%E9%85%8D%E5%BD%93%E8%A1%A8) and [Jōyō kanji list](https://en.wikipedia.org/wiki/List_of_j%C5%8Dy%C5%8D_kanji). Character assignments were cross-checked against both tables. Grades 1-6 contain 1,026 kanji; Grade 7+ contains the remaining 1,110 Jōyō kanji. Non-Jōyō-only words have no grade and are included only under All Grades.
- Kanji and vocabulary reveals fetch matching public SVGs from the KanjiVG repository through jsDelivr; each request contains only a kanji's Unicode filename and never includes your token or deck.

Stroke path data is provided by [KanjiVG](https://kanjivg.tagaini.net/) under the Creative Commons Attribution-Share Alike 3.0 license.
---

**⚠️ AI disclosure:** I used Claude Sonnet to help me develop this small application. Part of me is ashamed, part of me is happy with the result. Idk, I let you judge. No WaniKani study content is reproduced, all subject data is fetched live from the official API using your personal token.
