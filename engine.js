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

function boxFromColors(colors) {
  const sum = [0, 0, 0];
  for (const c of colors) {
    sum[0] += c[0];
    sum[1] += c[1];
    sum[2] += c[2];
  }
  return { colors, sum };
}

function channelRange(colors) {
  let minR = 255,
    minG = 255,
    minB = 255,
    maxR = 0,
    maxG = 0,
    maxB = 0;
  for (const [r, g, b] of colors) {
    if (r < minR) minR = r;
    if (g < minG) minG = g;
    if (b < minB) minB = b;
    if (r > maxR) maxR = r;
    if (g > maxG) maxG = g;
    if (b > maxB) maxB = b;
  }
  const ranges = [
    [0, maxR - minR],
    [1, maxG - minG],
    [2, maxB - minB],
  ];
  ranges.sort((a, b) => b[1] - a[1]);
  return { channel: ranges[0][0], range: ranges[0][1] };
}

function averageHex(box) {
  const n = box.colors.length || 1;
  return rgbToHex(box.sum[0] / n, box.sum[1] / n, box.sum[2] / n);
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function extractPaletteFromImageData(imageData, options = {}) {
  const maxColors = Math.max(2, Math.min(256, options.maxColors ?? 16));
  const alphaThreshold = options.alphaThreshold ?? 32;
  const maxSamples = options.maxSamples ?? 8000;

  const { data, width, height } = imageData;
  const total = width * height;
  const step = Math.max(1, Math.floor(total / maxSamples));
  const samples = [];

  for (let i = 0; i < total; i += step) {
    const si = i * 4;
    const a = data[si + 3];
    if (a < alphaThreshold) continue;
    samples.push([data[si], data[si + 1], data[si + 2]]);
  }

  if (samples.length === 0) return ["#000000", "#ffffff"];

  let boxes = [boxFromColors(samples)];

  while (boxes.length < maxColors) {
    let bestIdx = -1;
    let bestRange = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.colors.length < 2) continue;
      const { range } = channelRange(box.colors);
      const score = range * 1000 + box.colors.length;
      if (score > bestRange) {
        bestRange = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;

    const box = boxes[bestIdx];
    const { channel } = channelRange(box.colors);
    const sorted = box.colors.slice().sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(sorted.length / 2);
    if (mid === 0 || mid >= sorted.length) break;

    const left = boxFromColors(sorted.slice(0, mid));
    const right = boxFromColors(sorted.slice(mid));
    boxes = [...boxes.slice(0, bestIdx), left, right, ...boxes.slice(bestIdx + 1)];
  }

  const seen = new Set();
  const palette = [];
  for (const box of boxes) {
    const hex = averageHex(box);
    if (!seen.has(hex)) {
      seen.add(hex);
      palette.push(hex);
    }
  }

  palette.sort((a, b) => luminance(a) - luminance(b));
  if (palette.length === 0) return ["#000000", "#ffffff"];
  return palette;
}

export function quantizeImageData(imageData, options) {
  const { width: tw, height: th } = options;
  const alphaThreshold = options.alphaThreshold ?? 32;
  const palette = options.palette ?? RETRO_PALETTE;
  const fit = options.fit ?? "contain";
  const sw = imageData.width;
  const sh = imageData.height;
  const src = imageData.data;
  const pixels = new Array(tw * th);

  let destW = tw;
  let destH = th;
  let destX = 0;
  let destY = 0;
  if (fit === "contain" && sw > 0 && sh > 0) {
    const scale = Math.min(tw / sw, th / sh);
    destW = Math.max(1, Math.round(sw * scale));
    destH = Math.max(1, Math.round(sh * scale));
    destX = Math.floor((tw - destW) / 2);
    destY = Math.floor((th - destH) / 2);
  }

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let sx;
      let sy;
      if (fit === "stretch") {
        sx = Math.min(sw - 1, Math.floor(((x + 0.5) / tw) * sw));
        sy = Math.min(sh - 1, Math.floor(((y + 0.5) / th) * sh));
      } else {
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
      list.push({ x, y, w: run });
      byColor.set(c, list);
      x += run;
    }
  }

  for (const [color, rects] of byColor) {
    parts.push(`  <g fill="${escapeXml(color)}" data-color="${escapeXml(color)}">`);
    for (const r of rects) {
      parts.push(
        `    <rect x="${r.x * unit}" y="${r.y * unit}" width="${r.w * unit}" height="${unit}"/>`,
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
  const pixels = raw.pixels.map((p) => {
    if (p === null || p === undefined || p === "" || p === "transparent") return null;
    if (typeof p !== "string") throw new Error("Invalid pixel color");
    return p;
  });
  return { width, height, pixels };
}
