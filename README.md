# Gridsmith

**Retro pixel art → crisp, scalable SVG.**

Static browser editor + a small dependency-free JS library (`engine.js`) for
quantizing images onto a pixel grid and exporting SVG.

## Wiki

Full docs: **[Gridsmith Wiki](https://github.com/martialsystems/gridsmith/wiki)**  
(Getting started, editor guide, engine API, hosted pixelate endpoint, official vs forks.)

## Official hosted product (supported)

| | |
|---|---|
| **Editor** | https://martialgames.net/tools/gridsmith/ |
| **Tools** | https://martialgames.net/tools/ |
| **Games** | https://martialgames.net/#games |
| **Home** | https://martialgames.net/ |
| **API** | `POST https://martialgames.net/api/pixelate` |
| **API guide** | https://martialgames.net/tools/gridsmith/Gridsmith-API-Guide.pdf |
| **Wiki** | https://github.com/martialsystems/gridsmith/wiki |

This GitHub repo is the **open frontend / library**. The production API and
Martial Games site remain under Martial Systems LLC / Martial Games hosting.
Self-hosted forks are welcome under MIT; they are **not** the official endpoint.

Play free games on [Martial Games](https://martialgames.net/) — Gridsmith is one
of the tools on that site.

## Brand assets

| File | Role |
|------|------|
| `favicon.svg` | App icon — full-bleed 4×4 retro palette with forge hammer overlay |
| `icon.jpg` | 1024×1024 raster for apple-touch / social previews |
| `mark.svg` | Wordmark (icon + **Gridsmith** + “PIXEL GRID → CRISP SVG”) |

Use `favicon.svg` for tabs and in-app chrome; use `icon.jpg` where a bitmap is required.

## What’s in this repo

| File | Role |
|------|------|
| `index.html` / `app.css` / `app.js` | Editor UI |
| `engine.js` | Palette extract, quantize, flood fill, `gridToSvg` / `gridToJson` |
| `favicon.svg` / `icon.jpg` / `mark.svg` | Product mark |
| `Gridsmith-API-Guide.pdf` | How to call the **hosted** API (same doc as production) |
| `LICENSE` | MIT |
| `NOTICE` | Product + PICO-8-style palette note |

**Not included:** Cloudflare Functions, site deploy, analytics, game clients.

## Quick start (local)

```bash
python3 -m http.server 8765 --bind 127.0.0.1
# http://127.0.0.1:8765/
```

Header links point at **martialgames.net** (Home · Games · More tools) so local
and forked builds still send people to the official games and tools hub.

**Grid size** chips set the **long-edge** pixel count. Freehand stays square;
importing an image reshapes the canvas to the source aspect (e.g. 160×256 when
long edge is 256). Use `gridDimsForMaxEdge(srcW, srcH, maxEdge)` from `engine.js`
for the same math in scripts.

## Library usage

```js
import {
  quantizeImageSource,
  gridToSvg,
  extractPaletteFromImageData,
  RETRO_PALETTE,
  MIN_SPLIT_RANGE,
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

// Fine-tune palette extraction (optional):
// const palette = extractPaletteFromImageData(imageData, {
//   maxColors: 16,
//   minSplitRange: 16, // default MIN_SPLIT_RANGE; use 0 for classic median-cut
// });
```

Or build a grid yourself and POST JSON to the official API (see PDF).

### Palette extraction notes

- `maxColors` is an **upper bound** (up to N). Flat sprites with ≤ N exact colors
  pass through without averaging.
- Median-cut stops splitting near-flat boxes when channel range is below
  `minSplitRange` (default **16**) so noisy photos don’t fill the cap with
  near-duplicate shades. Pass `minSplitRange: 0` for classic behavior.

## License

MIT — see `LICENSE`.  
© 2026 Martial Systems LLC. Martial Games: https://martialgames.net/
