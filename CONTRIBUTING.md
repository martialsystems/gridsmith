# Contributing to Gridsmith

Thanks for taking a look. This is a **light** open-source project: the static
editor and pure JS converter library. We welcome useful fixes and small features.

## Official product

| | |
|---|---|
| **Hosted editor** | https://martialgames.net/tools/gridsmith/ |
| **Tools hub** | https://martialgames.net/tools/ |
| **More games** | https://martialgames.net/#games |
| **API** | https://martialgames.net/api/pixelate |
| **API guide (PDF)** | https://martialgames.net/tools/gridsmith/Gridsmith-API-Guide.pdf |

Forks and self-hosts are unofficial. The **supported** endpoint and UI are the
ones on **martialgames.net**. Production API/backend and the full Martial Games
site are **not** in this repo.

## How to run locally

Static files only — no build step:

```bash
cd gridsmith
python3 -m http.server 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765/
```

## What to contribute

**Good fits**

- Bug fixes (scroll, quantize, export, a11y)
- Clearer docs / samples
- Library-only improvements to `engine.js` that stay dependency-free

**Usually not a fit**

- Rewrites that drop Martial Games / martialgames.net links from the UI
- Pulling in a heavy framework for the ship editor
- Changing the public API contract without discussion
- Monetization / ads / tracking in the core editor

## Pull requests

1. Open an issue first for large changes (optional for tiny fixes).
2. Keep diffs focused.
3. Preserve the MIT license headers and NOTICE palette note.
4. Don’t commit secrets, `.env`, or deploy credentials (there shouldn’t be any).

## License

By contributing, you agree your contributions are licensed under the MIT License
in `LICENSE` (copyright Martial Systems LLC / as applicable to your contribution).
