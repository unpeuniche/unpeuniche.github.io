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
4. Click **Reload Deck** to fetch your items from the API (first load takes 10-30 s depending on your level). Results are cached locally.
5. Use **Reset List** to reset the cycle counter for the currently loaded deck without another API call.

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
| Level Range | Auto-capped to your current WaniKani level; adjustable |
| No repeat | Cycle through all items before repeating |
| Reset List | Reset the cycle counter for the current filters (no API call needed) |

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
- Kanji and vocabulary reveals fetch matching public SVGs from the KanjiVG repository through jsDelivr; each request contains only a kanji's Unicode filename and never includes your token or deck.

Stroke path data is provided by [KanjiVG](https://kanjivg.tagaini.net/) under the Creative Commons Attribution-Share Alike 3.0 license.

---

**⚠️ AI disclosure:** I used Claude Sonnet to help me develop this small application. Part of me is ashamed, part of me is happy with the result. Idk, I let you judge. No WaniKani study content is reproduced, all subject data is fetched live from the official API using your personal token.
