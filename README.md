# Rustbelt Galaxy

A turn-based 4X game for the browser. You lead one of five species, colonize planets, research
technologies, trade, negotiate and fight. The game is single player against AI factions.

## Run

```
npm install
npm run dev        # development server on http://localhost:5173
npm run build      # type check and production build in dist/
npm run preview    # serves dist/
```

## Test

```
npm test           # unit tests of the game rules
npm run sim        # AI-only games, prints the result. Arguments: games turns galaxy [--quiet] [--check] [--log=major|minor|trace]
npm run smoke      # builds, plays 30 turns in a headless browser, writes screenshots/
```

`npm run smoke` needs a Chromium browser. It uses the Playwright cache, then `/usr/bin/google-chrome`.
Set `CHROME_PATH` to use a different browser.

## Art

The game draws placeholder art in code. Image files in `public/assets/hd` replace the placeholders. All images have one style: hand-drawn cartoon art with thick outlines. The menu can switch back to the placeholders.

```
npm run art:prompts                                   # writes art/prompts.json and docs/ART_PROMPTS.md
node scripts/generate-art.mjs --dry-run               # lists the missing images
node scripts/generate-art.mjs --parallel 3            # generates them with the Codex CLI, 3 at a time, into art/originals/hd
node scripts/generate-art.mjs --only units/ --force   # generates all units again
python3 scripts/art-resize.py                         # 512 px game images in public/assets/hd, and the manifest
```

Each Codex call gets three existing images as the style reference. `--output <folder>` writes a trial to another folder.
`art/pending.txt` lists the images that still have the old art. `node scripts/generate-art.mjs --list art/pending.txt --parallel 4` generates them and removes each finished image from the list.
`scripts/art-resize.py` needs Python 3 with Pillow.

## Phones

The game works on a phone or in a small window: one sheet or screen at a time, touch gestures on the map, and a full screen on Android. On iPhone, Add to Home Screen gives the full screen. `npm run smoke:mobile` runs the browser test on an iPhone sized window.

## Documents

- `docs/DESIGN.md`: the design decisions and the rules.
- `docs/ART_PROMPTS.md`: all image prompts.
- The in-game Encyclopedia describes all units, buildings, technologies and rules.
