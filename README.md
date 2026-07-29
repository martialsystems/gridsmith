# Gridsmith

**Retro pixel art → crisp, scalable SVG.**

Static browser editor + a small dependency-free JS library (`engine.js`) for
quantizing images onto a pixel grid and exporting SVG.

## Official hosted product (supported)

| | |
|---|---|
| **Editor** | https://martialgames.net/tools/gridsmith/ |
| **Tools** | https://martialgames.net/tools/ |
| **More games** | https://martialgames.net/#games |
| **Home** | https://martialgames.net/ |
| **API** | `POST https://martialgames.net/api/pixelate` |
| **API guide** | https://martialgames.net/tools/gridsmith/Gridsmith-API-Guide.pdf |

This GitHub repo is the **open frontend / library**. The production API and
Martial Games site remain under Martial Systems LLC / Martial Games hosting.
Self-hosted forks are welcome under MIT; they are **not** the official endpoint.

Play free games on [Martial Games](https://martialgames.net/) — Gridsmith is one
of the tools on that site.

## What’s in this repo

| File | Role |
|------|------|
| `index.html` / `app.css` / `app.js` | Editor UI |
| `engine.js` | Palette extract, quantize, flood fill, `gridToSvg` / `gridToJson` |
| `Gridsmith-API-Guide.pdf` | How to call the **hosted** API (same doc as production) |
| `LICENSE` | MIT |
| `NOTICE` | Product + PICO-8-style palette note |

**Not included:** Cloudflare Functions, site deploy, analytics, game clients.

## Quick start (local)

```bash
python3 -m http.server 8765 --bind 127.0.0.1
# http://127.0.0.1:8765/
```

Header links point at **martialgames.net** (Home · More games · Tools) so local
and forked builds still send people to the official games and tools hub.

## Library usage

```js
import {
  quantizeImageSource,
  gridToSvg,
  RETRO_PALETTE,
  emptyGrid,
} from "./engine.js";

const { grid, palette } = await quantizeImageSource(fileOrBlob, {
  width: 32,
  height: 32,
  maxColors: 16,
  extractPalette: true,
  fit: "contain",
});

const svg = gridToSvg(grid, { title: "sprite", unit: 1, mergeRuns: true });
```

Or build a grid yourself and POST JSON to the official API (see PDF).

## License

MIT — see `LICENSE`.  
© 2026 Martial Systems LLC. Martial Games: https://martialgames.net/
