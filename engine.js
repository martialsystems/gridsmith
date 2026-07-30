/**
 * Gridsmith engine — grid, quantize, SVG export
 * Copyright (c) 2026 Martial Systems LLC. All rights reserved.
 */

export const RETRO_PALETTE = Object.freeze([
  "#000000",
  "#1d2b53",
  "#7e2553",
  "#008751",
  "#ab5236",
  "#5f574f",
  "#c2c3c7",
  "#fff1e8",
  "#ff004d",
  "#ffa300",
  "#ffec27",
  "#00e436",
  "#29adff",
  "#83769c",
  "#ff77a8",
  "#ffccaa",
]);

export const DEFAULT_COLOR = "#ff004d";
export const GRID_PRESETS = Object.freeze([8, 12, 16, 24, 32, 48, 64, 128, 256]);
export const MAX_GRID_SIZE = 256;

export function hexToRgb(hex) {
  let h = String(hex).replace("#", "").toLowerCase();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function nearestPaletteColor(r, g, b, palette = RETRO_PALETTE) {
  let best = palette[0] ?? "#000000";
  let bestD = Infinity;
  for (const hex of palette) {
    const [pr, pg, pb] = hexToRgb(hex);
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = hex;
    }
  }
  return best;
}

export function emptyGrid(width, height) {
  return {
    width,
    height,
    pixels: Array.from({ length: width * height }, () => null),
  };
}

export function cloneGrid(grid) {
  return {
    width: grid.width,
    height: grid.height,
    pixels: grid.pixels.slice(),
  };
}

export function floodFill(grid, sx, sy, fillColor) {
  const { width: w, height: h, pixels } = grid;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return pixels.slice();

  const target = pixels[sy * w + sx] ?? null;
  if (target === fillColor) return pixels.slice();

  const next = pixels.slice();
  const stack = [sy * w + sx];
  const visited = new Uint8Array(w * h);

  while (stack.length) {
    const i = stack.pop();
    if (visited[i]) continue;
    const cur = next[i] ?? null;
    if (cur !== target) continue;
    visited[i] = 1;
    next[i] = fillColor;

    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }

  return next;
}

function colorKey(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

function keyToRgb(key) {
  return [(key >> 16) & 255, (key >> 8) & 255, key & 255];
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function dist2Hex(a, b) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return (ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2;
}

/** Weighted color entry for median-cut: { rgb: [r,g,b], count } */
function boxFromEntries(entries) {
  let count = 0;
  const sum = [0, 0, 0];
  for (const e of entries) {
    count += e.count;
    sum[0] += e.rgb[0] * e.count;
    sum[1] += e.rgb[1] * e.count;
    sum[2] += e.rgb[2] * e.count;
  }
  return { entries, count, sum };
}

/**
 * Largest channel range. Flat boxes (all range 0) get range 0 — never split.
 * Ties: prefer channel with larger secondary range, then G, then R, then B.
 */
function channelRangeWeighted(entries) {
  let minR = 255,
    minG = 255,
    minB = 255,
    maxR = 0,
    maxG = 0,
    maxB = 0;
  for (const { rgb } of entries) {
    const [r, g, b] = rgb;
    if (r < minR) minR = r;
    if (g < minG) minG = g;
    if (b < minB) minB = b;
    if (r > maxR) maxR = r;
    if (g > maxG) maxG = g;
    if (b > maxB) maxB = b;
  }
  const spans = [
    [0, maxR - minR],
    [1, maxG - minG],
    [2, maxB - minB],
  ];
  // Prefer largest span; ties: G (1) then R (0) then B (2)
  const tiePref = { 1: 0, 0: 1, 2: 2 };
  spans.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return tiePref[a[0]] - tiePref[b[0]];
  });
  return { channel: spans[0][0], range: spans[0][1] };
}

function averageHexWeighted(box) {
  const n = box.count || 1;
  return rgbToHex(box.sum[0] / n, box.sum[1] / n, box.sum[2] / n);
}

/**
 * Split box by median of cumulative population along channel.
 * Never splits flat boxes (range === 0).
 */
function splitBox(box) {
  const { channel, range } = channelRangeWeighted(box.entries);
  if (range === 0 || box.entries.length < 2) return null;

  const sorted = box.entries.slice().sort((a, b) => {
    const d = a.rgb[channel] - b.rgb[channel];
    if (d !== 0) return d;
    // secondary keys so same-channel values still separate stably
    const d1 = a.rgb[(channel + 1) % 3] - b.rgb[(channel + 1) % 3];
    if (d1 !== 0) return d1;
    return a.rgb[(channel + 2) % 3] - b.rgb[(channel + 2) % 3];
  });

  const total = box.count;
  const half = total / 2;
  let acc = 0;
  let mid = 1;
  for (let i = 0; i < sorted.length; i++) {
    acc += sorted[i].count;
    if (acc >= half) {
      mid = Math.max(1, Math.min(sorted.length - 1, i + 1));
      break;
    }
  }
  if (mid <= 0 || mid >= sorted.length) return null;

  const left = boxFromEntries(sorted.slice(0, mid));
  const right = boxFromEntries(sorted.slice(mid));
  if (!left.count || !right.count) return null;
  return [left, right];
}

/**
 * After median-cut, restore significant exact source colors that were lost.
 * Hard ceiling: never returns more than maxColors (replace-only when full).
 */
function fixupPaletteWithSourceColors(palette, entries, maxColors) {
  const cap = Math.max(2, Math.min(256, maxColors));
  const total = entries.reduce((s, e) => s + e.count, 0) || 1;
  const threshold = Math.max(4, Math.floor(total * 0.001));
  const significant = entries
    .filter((e) => e.count >= threshold)
    .sort((a, b) => b.count - a.count);

  // Start from palette, already capped
  let out = palette.map((h) => h.toLowerCase()).slice(0, cap);
  const NEAR = 9; // dist² ≤ 9 ≈ ±3/channel

  for (const e of significant) {
    if (out.length > cap) out = out.slice(0, cap);
    const hex = rgbToHex(e.rgb[0], e.rgb[1], e.rgb[2]).toLowerCase();
    if (out.some((p) => dist2Hex(p, hex) <= NEAR)) continue;

    if (out.length < cap) {
      out.push(hex);
      continue;
    }

    // At capacity: replace a non-significant slot (farthest from source colors)
    let worstIdx = -1;
    let worstMinDist = -1;
    for (let i = 0; i < out.length; i++) {
      const isSig = significant.some(
        (s) => rgbToHex(s.rgb[0], s.rgb[1], s.rgb[2]).toLowerCase() === out[i],
      );
      if (isSig) continue;
      let minD = Infinity;
      for (const s of significant) {
        const sh = rgbToHex(s.rgb[0], s.rgb[1], s.rgb[2]).toLowerCase();
        minD = Math.min(minD, dist2Hex(out[i], sh));
      }
      if (minD > worstMinDist) {
        worstMinDist = minD;
        worstIdx = i;
      }
    }
    if (worstIdx >= 0) out[worstIdx] = hex;
    // else: every slot is a significant exact color already — leave palette as-is
  }

  const seen = new Set();
  const uniq = [];
  for (const h of out) {
    if (uniq.length >= cap) break;
    const k = h.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(k);
  }
  uniq.sort((a, b) => luminance(a) - luminance(b));
  return uniq.length ? uniq : ["#000000", "#ffffff"];
}

/**
 * Palette extraction: pure function of (imageData, maxColors) → hex[].
 *
 * Semantics of maxColors: **upper bound ("up to N")**, never pad with invented
 * shades. If the image has 5 flat unique colors and maxColors is 8, returns
 * those 5 exact hexes (exact-passthrough). Only when unique colors exceed N
 * do we median-cut / fixup down to at most N.
 *
 * - Exact passthrough when unique ≤ maxColors (no averaging).
 * - Never splits perfectly flat clusters.
 * - Fixup restores significant source colors but never grows past maxColors.
 */
export function extractPaletteFromImageData(imageData, options = {}) {
  const maxColors = Math.max(2, Math.min(256, options.maxColors ?? 16));
  const alphaThreshold = options.alphaThreshold ?? 32;
  const maxSamples = options.maxSamples ?? 12000;

  const { data, width, height } = imageData;
  const total = width * height;
  // Prefer full scan for small images (sprites); step only for large photos
  const step =
    total <= maxSamples ? 1 : Math.max(1, Math.floor(total / maxSamples));

  /** @type {Map<number, number>} */
  const counts = new Map();
  for (let i = 0; i < total; i += step) {
    const si = i * 4;
    const a = data[si + 3];
    if (a < alphaThreshold) continue;
    const key = colorKey(data[si], data[si + 1], data[si + 2]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  if (counts.size === 0) return ["#000000", "#ffffff"];

  const entries = [];
  for (const [key, count] of counts) {
    entries.push({ rgb: keyToRgb(key), count });
  }

  // Exact passthrough: fewer unique colors than the cap → keep them exact.
  // Do NOT pad to maxColors with invented near-duplicates.
  if (entries.length <= maxColors) {
    return entries
      .map((e) => rgbToHex(e.rgb[0], e.rgb[1], e.rgb[2]).toLowerCase())
      .sort((a, b) => luminance(a) - luminance(b));
  }

  // More unique colors than allowed → weighted median-cut, then fixup ≤ maxColors
  let boxes = [boxFromEntries(entries)];

  while (boxes.length < maxColors) {
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.entries.length < 2) continue;
      const { range } = channelRangeWeighted(box.entries);
      if (range === 0) continue; // flat cluster — do not split
      const score = range * 1e6 + box.count;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break; // all remaining boxes flat → stop under maxColors

    const parts = splitBox(boxes[bestIdx]);
    if (!parts) break;
    boxes = [
      ...boxes.slice(0, bestIdx),
      parts[0],
      parts[1],
      ...boxes.slice(bestIdx + 1),
    ];
  }

  const seen = new Set();
  const palette = [];
  for (const box of boxes) {
    if (palette.length >= maxColors) break;
    const hex = averageHexWeighted(box).toLowerCase();
    if (!seen.has(hex)) {
      seen.add(hex);
      palette.push(hex);
    }
  }

  const fixed = fixupPaletteWithSourceColors(palette, entries, maxColors);
  // Final hard ceiling (invariant for tests / callers)
  return fixed.slice(0, maxColors);
}

export function quantizeImageData(imageData, options) {
  const { width: tw, height: th } = options;
  const alphaThreshold = options.alphaThreshold ?? 32;
  const palette = options.palette ?? RETRO_PALETTE;
  let fit = options.fit ?? "contain";
  if (fit === "cover" || fit === "contain" || fit === "stretch") {
    /* ok */
  } else {
    // unknown fit mode — do not silently stretch
    fit = "contain";
  }
  const sw = imageData.width;
  const sh = imageData.height;
  const src = imageData.data;
  const pixels = new Array(tw * th);

  // contain: letterbox inside dest
  // cover: scale to fill dest, crop overflow (CSS background-size: cover)
  // stretch: map full source to full dest
  let mode = fit;
  let srcX0 = 0;
  let srcY0 = 0;
  let srcW = sw;
  let srcH = sh;
  let destX = 0;
  let destY = 0;
  let destW = tw;
  let destH = th;

  if (sw > 0 && sh > 0 && mode === "contain") {
    const scale = Math.min(tw / sw, th / sh);
    destW = Math.max(1, Math.round(sw * scale));
    destH = Math.max(1, Math.round(sh * scale));
    destX = Math.floor((tw - destW) / 2);
    destY = Math.floor((th - destH) / 2);
  } else if (sw > 0 && sh > 0 && mode === "cover") {
    const scale = Math.max(tw / sw, th / sh);
    srcW = tw / scale;
    srcH = th / scale;
    srcX0 = (sw - srcW) / 2;
    srcY0 = (sh - srcH) / 2;
  }

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let sx;
      let sy;
      if (mode === "stretch") {
        sx = Math.min(sw - 1, Math.floor(((x + 0.5) / tw) * sw));
        sy = Math.min(sh - 1, Math.floor(((y + 0.5) / th) * sh));
      } else if (mode === "cover") {
        sx = Math.min(
          sw - 1,
          Math.max(0, Math.floor(srcX0 + ((x + 0.5) / tw) * srcW)),
        );
        sy = Math.min(
          sh - 1,
          Math.max(0, Math.floor(srcY0 + ((y + 0.5) / th) * srcH)),
        );
      } else {
        // contain
        if (x < destX || y < destY || x >= destX + destW || y >= destY + destH) {
          pixels[y * tw + x] = null;
          continue;
        }
        const u = (x - destX + 0.5) / destW;
        const v = (y - destY + 0.5) / destH;
        sx = Math.min(sw - 1, Math.floor(u * sw));
        sy = Math.min(sh - 1, Math.floor(v * sh));
      }
      const si = (sy * sw + sx) * 4;
      const r = src[si];
      const g = src[si + 1];
      const b = src[si + 2];
      const a = src[si + 3];
      if (a < alphaThreshold) {
        pixels[y * tw + x] = null;
      } else {
        pixels[y * tw + x] = nearestPaletteColor(r, g, b, palette);
      }
    }
  }

  return { width: tw, height: th, pixels };
}

async function loadImageData(source) {
  let img;
  let objectUrl = null;

  if (typeof source === "string") {
    const el = new Image();
    el.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("Failed to load image"));
      el.src = source;
    });
    img = el;
  } else if (source instanceof Blob) {
    objectUrl = URL.createObjectURL(source);
    const el = new Image();
    await new Promise((resolve, reject) => {
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("Failed to load image blob"));
      el.src = objectUrl;
    });
    img = el;
  } else {
    img = source;
  }

  const w =
    "naturalWidth" in img && img.naturalWidth
      ? img.naturalWidth
      : Number(img.width) || 1;
  const h =
    "naturalHeight" in img && img.naturalHeight
      ? img.naturalHeight
      : Number(img.height) || 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  return data;
}

export async function quantizeImageSource(source, options) {
  const data = await loadImageData(source);
  const extract = options.extractPalette !== false && !options.palette;
  let palette;
  let extracted = false;
  const maxColors = Math.min(256, Math.max(2, options.maxColors ?? 16));

  if (options.palette) {
    palette = [...options.palette];
  } else if (extract) {
    palette = extractPaletteFromImageData(data, {
      maxColors,
      alphaThreshold: options.alphaThreshold,
    });
    extracted = true;
  } else {
    palette = [...RETRO_PALETTE];
  }

  const grid = quantizeImageData(data, {
    ...options,
    palette,
    fit: options.fit ?? "contain",
  });

  return { grid, palette, extracted };
}

function escapeXml(s) {
  return String(s).replace(/[&<>"]/g, (ch) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    return map[ch] ?? ch;
  });
}

export function gridToSvg(grid, options = {}) {
  const unit = options.unit ?? 1;
  const mergeRuns = options.mergeRuns ?? true;
  const title = options.title ?? "gridsmith-sprite";
  const w = grid.width;
  const h = grid.height;
  const vw = w * unit;
  const vh = h * unit;
  const holder = options.copyright?.trim() || "";
  const year =
    options.copyrightYear != null && String(options.copyrightYear).trim()
      ? String(options.copyrightYear).trim()
      : holder
        ? String(new Date().getFullYear())
        : "";
  const license = options.license?.trim() || "";
  const copyrightUrl = options.copyrightUrl?.trim() || "";
  let copyrightLine = null;
  if (holder) {
    copyrightLine = `Copyright (c) ${year} ${holder}`;
    if (license) copyrightLine += `. ${license}`;
    if (copyrightUrl) copyrightLine += ` ${copyrightUrl}`;
  }

  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  if (copyrightLine) {
    parts.push(`<!-- ${copyrightLine.replace(/--/g, "- -")} -->`);
  }
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="0 0 ${vw} ${vh}" shape-rendering="crispEdges" data-pixel-grid="${w}x${h}">`,
    `  <title>${escapeXml(title)}</title>`,
    `  <desc>Pixel art ${w}x${h}. Opaque cells only. Transparent = empty.${copyrightLine ? " " + escapeXml(copyrightLine) : ""}</desc>`,
  );

  if (options.background) {
    parts.push(
      `  <rect x="0" y="0" width="${vw}" height="${vh}" fill="${escapeXml(options.background)}"/>`,
    );
  }

  const byColor = new Map();
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const i = y * w + x;
      const c = grid.pixels[i] ?? null;
      if (!c) {
        x++;
        continue;
      }
      let run = 1;
      if (mergeRuns) {
        while (x + run < w && grid.pixels[y * w + x + run] === c) run++;
      }
      const list = byColor.get(c) ?? [];
      list.push({ x, y, w: run, h: 1 });
      byColor.set(c, list);
      x += run;
    }
  }

  // Merge vertically stacked runs with same x/width (solid blocks → fewer rects)
  if (mergeRuns) {
    for (const [color, rects] of byColor) {
      rects.sort((a, b) => a.x - b.x || a.y - b.y);
      const merged = [];
      for (const r of rects) {
        const prev = merged[merged.length - 1];
        if (
          prev &&
          prev.x === r.x &&
          prev.w === r.w &&
          prev.y + prev.h === r.y
        ) {
          prev.h += r.h;
        } else {
          merged.push({ ...r });
        }
      }
      byColor.set(color, merged);
    }
  }

  for (const [color, rects] of byColor) {
    parts.push(`  <g fill="${escapeXml(color)}" data-color="${escapeXml(color)}">`);
    for (const r of rects) {
      parts.push(
        `    <rect x="${r.x * unit}" y="${r.y * unit}" width="${r.w * unit}" height="${r.h * unit}"/>`,
      );
    }
    parts.push(`  </g>`);
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

export function gridToJson(grid, pretty = false) {
  const body = {
    width: grid.width,
    height: grid.height,
    pixels: grid.pixels.map((p) => p ?? null),
    format: "pixel-studio-v1",
  };
  return pretty ? JSON.stringify(body, null, 2) : JSON.stringify(body);
}

const PIXEL_HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function normalizePixelColor(p) {
  if (p === null || p === undefined || p === "" || p === "transparent") return null;
  if (typeof p !== "string") throw new Error("Invalid pixel color (expected hex string or null)");
  const s = p.trim();
  if (s === "transparent") return null;
  if (!PIXEL_HEX_RE.test(s)) {
    throw new Error(`Invalid pixel color "${p}" (use #rgb, #rrggbb, or #rrggbbaa)`);
  }
  // normalize #rgb → #rrggbb lowercase for consistent SVG / palette
  let h = s.slice(1).toLowerCase();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length === 8) {
    // drop alpha for grid cells (opaque art); keep rgb only
    h = h.slice(0, 6);
  }
  return `#${h}`;
}

export function parseGridJson(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Invalid grid: expected object");
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Invalid grid: width/height must be positive integers");
  }
  if (width > MAX_GRID_SIZE || height > MAX_GRID_SIZE) {
    throw new Error(`Invalid grid: max ${MAX_GRID_SIZE}x${MAX_GRID_SIZE}`);
  }
  if (!Array.isArray(raw.pixels) || raw.pixels.length !== width * height) {
    throw new Error(`Invalid grid: pixels must be array of length ${width * height}`);
  }
  const pixels = raw.pixels.map((p) => normalizePixelColor(p));
  return { width, height, pixels };
}
