/**
 * Gridsmith UI — matches Pixel Studio port checklist
 * Copyright (c) 2026 Martial Systems LLC. All rights reserved.
 */

import {
  RETRO_PALETTE,
  DEFAULT_COLOR,
  GRID_PRESETS,
  emptyGrid,
  cloneGrid,
  floodFill,
  quantizeImageSource,
  gridToSvg,
  gridToJson,
} from "./engine.js";

const STORAGE_KEY = "gridsmith_v2";
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 12;
const ZOOM_STEP = 1.07;
const BASE_CELL = 16;

function createSampleHero() {
  const g = emptyGrid(16, 16);
  const p = (x, y, c) => {
    g.pixels[y * 16 + x] = c;
  };
  const O = "#1d2b53";
  const S = "#fff1e8";
  const H = "#ff004d";
  const B = "#29adff";
  const D = "#000000";
  for (let x = 5; x <= 10; x++) p(x, 2, H);
  for (let x = 4; x <= 11; x++) p(x, 3, H);
  for (let y = 4; y <= 7; y++) for (let x = 5; x <= 10; x++) p(x, y, S);
  p(6, 5, D);
  p(9, 5, D);
  p(7, 7, "#ff77a8");
  p(8, 7, "#ff77a8");
  for (let y = 8; y <= 11; y++) for (let x = 5; x <= 10; x++) p(x, y, B);
  p(3, 8, S);
  p(4, 8, S);
  p(4, 9, S);
  p(11, 8, S);
  p(12, 8, S);
  p(11, 9, S);
  p(6, 12, O);
  p(6, 13, O);
  p(6, 14, D);
  p(9, 12, O);
  p(9, 13, O);
  p(9, 14, D);
  return g;
}

const state = {
  grid: emptyGrid(16, 16),
  palette: [...RETRO_PALETTE],
  paletteSource: "retro",
  color: DEFAULT_COLOR,
  tool: "hand",
  brush: 1,
  showGrid: true,
  zoom: 1,
  maxColors: 16,
  title: "pixel-art",
  history: [],
  future: [],
  sourceDataUrl: null,
  sourceName: null,
  refitOnResize: true,
  autoUpdatePalette: true,
  isReprocessing: false,
};

const el = {
  canvas: document.getElementById("pixel-canvas"),
  scroll: document.getElementById("canvas-scroll"),
  swatches: document.getElementById("swatches"),
  status: document.getElementById("status"),
  presets: document.getElementById("grid-presets"),
  gridLabel: document.getElementById("grid-label"),
  maxColors: document.getElementById("max-colors"),
  maxColorsLabel: document.getElementById("max-colors-label"),
  title: document.getElementById("export-title"),
  copyright: document.getElementById("copyright"),
  copyrightYear: document.getElementById("copyright-year"),
  copyrightUrl: document.getElementById("copyright-url"),
  license: document.getElementById("license"),
  customLicense: document.getElementById("custom-license"),
  customLicenseWrap: document.getElementById("custom-license-wrap"),
  copyrightPreview: document.getElementById("copyright-preview"),
  file: document.getElementById("file-input"),
  colorPicker: document.getElementById("color-picker"),
  activeSwatch: document.getElementById("active-swatch"),
  activeHex: document.getElementById("active-hex"),
  paletteSource: document.getElementById("palette-source"),
  paletteNote: document.getElementById("palette-note"),
  zoomLabel: document.getElementById("zoom-label"),
  importLabel: document.getElementById("import-label"),
  linkedCard: document.getElementById("linked-card"),
  linkedThumb: document.getElementById("linked-thumb"),
  linkedName: document.getElementById("linked-name"),
  linkedBusy: document.getElementById("linked-busy"),
  toggleRefit: document.getElementById("toggle-refit"),
  toggleAutoPal: document.getElementById("toggle-auto-pal"),
};

const ctx = el.canvas.getContext("2d");
let maxColorsDebounce = null;

function cellPx() {
  return Math.max(1, Math.round(BASE_CELL * state.zoom));
}

function setStatus(msg, kind = "") {
  el.status.textContent = msg || "";
  el.status.className = "status" + (kind ? ` ${kind}` : "");
}

function pushHistory() {
  state.history.push(cloneGrid(state.grid));
  if (state.history.length > 48) state.history.shift();
  state.future = [];
  syncEditButtons();
}

function undo() {
  if (!state.history.length) return;
  state.future.unshift(cloneGrid(state.grid));
  if (state.future.length > 48) state.future.pop();
  state.grid = state.history.pop();
  draw();
  persist();
  syncEditButtons();
}

function redo() {
  if (!state.future.length) return;
  state.history.push(cloneGrid(state.grid));
  if (state.history.length > 48) state.history.shift();
  state.grid = state.future.shift();
  draw();
  persist();
  syncEditButtons();
}

function syncEditButtons() {
  document.getElementById("btn-undo").disabled = !state.history.length;
  document.getElementById("btn-redo").disabled = !state.future.length;
  document.getElementById("btn-grid").classList.toggle("active", state.showGrid);
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        width: state.grid.width,
        height: state.grid.height,
        pixels: state.grid.pixels,
        palette: state.palette,
        paletteSource: state.paletteSource,
        color: state.color,
        title: state.title,
        zoom: state.zoom,
        maxColors: state.maxColors,
        tool: state.tool,
        brush: state.brush,
        showGrid: state.showGrid,
        refitOnResize: state.refitOnResize,
        autoUpdatePalette: state.autoUpdatePalette,
      }),
    );
  } catch {
    /* ignore */
  }
}

function hydrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.width && data.height && Array.isArray(data.pixels)) {
      state.grid = {
        width: data.width,
        height: data.height,
        pixels: data.pixels.map((p) =>
          p === null || p === undefined || p === "" || p === "transparent" ? null : p,
        ),
      };
    }
    if (Array.isArray(data.palette) && data.palette.length) state.palette = data.palette;
    if (data.paletteSource === "image" || data.paletteSource === "retro") {
      state.paletteSource = data.paletteSource;
    }
    if (typeof data.color === "string") state.color = data.color;
    if (typeof data.title === "string") state.title = data.title;
    if (typeof data.zoom === "number") {
      state.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, data.zoom));
    }
    if (typeof data.maxColors === "number") state.maxColors = data.maxColors;
    if (typeof data.tool === "string") state.tool = data.tool;
    if (typeof data.brush === "number") state.brush = data.brush;
    if (typeof data.showGrid === "boolean") state.showGrid = data.showGrid;
    if (typeof data.refitOnResize === "boolean") state.refitOnResize = data.refitOnResize;
    if (typeof data.autoUpdatePalette === "boolean") {
      state.autoUpdatePalette = data.autoUpdatePalette;
    }
  } catch {
    /* ignore */
  }
}

function paintCell(gx, gy, color) {
  const { width: w, height: h } = state.grid;
  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    state.grid.pixels[y * w + x] = color;
  };
  if (state.brush === 1) {
    set(gx, gy);
  } else if (state.brush === 2) {
    set(gx, gy);
    set(gx + 1, gy);
    set(gx, gy + 1);
    set(gx + 1, gy + 1);
  } else {
    set(gx, gy);
    set(gx - 1, gy);
    set(gx + 1, gy);
    set(gx, gy - 1);
    set(gx, gy + 1);
  }
}

function eventToCell(e) {
  const rect = el.canvas.getBoundingClientRect();
  const c = cellPx();
  const scaleX = el.canvas.width / rect.width;
  const scaleY = el.canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  return { gx: Math.floor(x / c), gy: Math.floor(y / c) };
}

function draw() {
  const { width: w, height: h, pixels } = state.grid;
  const c = cellPx();
  el.canvas.width = w * c;
  el.canvas.height = h * c;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#1a1a1e" : "#121214";
      ctx.fillRect(x * c, y * c, c, c);
    }
  }

  // Pixel-perfect path for large grids
  if (c <= 2 || w * h >= 128 * 128) {
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d");
    const img = tctx.createImageData(w, h);
    const data = img.data;
    for (let i = 0; i < pixels.length; i++) {
      const col = pixels[i];
      if (!col) continue;
      const hex = col.charAt(0) === "#" ? col.slice(1) : col;
      const n = parseInt(
        hex.length === 3
          ? hex
              .split("")
              .map((ch) => ch + ch)
              .join("")
          : hex,
        16,
      );
      if (Number.isNaN(n)) continue;
      const o = i * 4;
      data[o] = (n >> 16) & 255;
      data[o + 1] = (n >> 8) & 255;
      data[o + 2] = n & 255;
      data[o + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, w * c, h * c);
  } else {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const col = pixels[y * w + x];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x * c, y * c, c, c);
      }
    }
  }

  if (state.showGrid && c >= 6) {
    ctx.strokeStyle = "rgba(244, 244, 245, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      ctx.moveTo(x * c + 0.5, 0);
      ctx.lineTo(x * c + 0.5, h * c);
    }
    for (let y = 0; y <= h; y++) {
      ctx.moveTo(0, y * c + 0.5);
      ctx.lineTo(w * c, y * c + 0.5);
    }
    ctx.stroke();
  }

  el.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  el.gridLabel.textContent =
    `${w}×${h}` + (w >= 128 ? " · large canvas" : "");
}

function updateActiveColorUi() {
  el.activeSwatch.style.background = state.color || "#000";
  el.activeHex.textContent = state.color || "transparent";
  if (state.color && state.color.startsWith("#")) {
    el.colorPicker.value = state.color;
  }
  el.paletteSource.textContent =
    state.paletteSource === "image"
      ? `image · ${state.palette.length}`
      : `retro · ${state.palette.length}`;
  if (state.paletteSource === "image") {
    el.paletteNote.textContent =
      "Colors extracted from your last import. Drawing uses this set.";
  } else {
    el.paletteNote.textContent =
      "Default is a 16-color PICO-8-style palette (hex list commonly treated as CC-0). Not an official Lexaloffle product.";
  }
}

function renderSwatches() {
  el.swatches.innerHTML = "";
  const cols = state.palette.length <= 8 ? 4 : 8;
  el.swatches.style.gridTemplateColumns = `repeat(${Math.min(4, cols)}, 1fr)`;
  for (const hex of state.palette) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.title = `Paint with ${hex}`;
    b.style.background = hex;
    if (state.color && state.color.toLowerCase() === hex.toLowerCase()) {
      b.classList.add("active");
    }
    b.addEventListener("click", () => {
      state.color = hex;
      setTool("pencil");
      updateActiveColorUi();
      renderSwatches();
    });
    el.swatches.appendChild(b);
  }
  updateActiveColorUi();
}

function cursorForTool() {
  if (spaceHeld || panning) return "grabbing";
  if (state.tool === "hand") return "grab";
  if (state.tool === "eyedropper" || state.tool === "fill") return "cell";
  return "crosshair";
}

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
  el.canvas.style.cursor = cursorForTool();
}

function setBrush(n) {
  state.brush = n;
  document.querySelectorAll("[data-brush]").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.brush) === n);
  });
  if (state.tool === "hand" || state.tool === "fill" || state.tool === "eyedropper") {
    setTool("pencil");
  }
}

function setZoom(z, { persistZoom = true } = {}) {
  state.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  draw();
  if (persistZoom) persist();
}

function zoomIn() {
  setZoom(state.zoom * ZOOM_STEP);
}
function zoomOut() {
  setZoom(state.zoom / ZOOM_STEP);
}
function zoomReset() {
  setZoom(1);
}

/** Center existing art when resizing (no linked re-fit). */
function resizeCentered(size) {
  pushHistory();
  const next = emptyGrid(size, size);
  const { width: ow, height: oh, pixels } = state.grid;
  const offsetX = Math.floor((size - ow) / 2);
  const offsetY = Math.floor((size - oh) / 2);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const nx = x + offsetX;
      const ny = y + offsetY;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      next.pixels[ny * size + nx] = pixels[y * ow + x] ?? null;
    }
  }
  state.grid = next;
  draw();
  persist();
  renderPresets();
  // Recenter scroll
  requestAnimationFrame(() => {
    el.scroll.scrollLeft = Math.max(0, (el.canvas.width - el.scroll.clientWidth) / 2);
    el.scroll.scrollTop = Math.max(0, (el.canvas.height - el.scroll.clientHeight) / 2);
  });
  setStatus(`${size}×${size} grid`);
}

async function reprocessSource({ size, forceExtract } = {}) {
  if (!state.sourceDataUrl) return;
  const width = size ?? state.grid.width;
  const height = size ?? state.grid.height;
  const extract = forceExtract ?? state.autoUpdatePalette;
  state.isReprocessing = true;
  el.linkedBusy.hidden = false;
  el.importLabel.textContent = "Updating…";
  try {
    const result = await quantizeImageSource(state.sourceDataUrl, {
      width,
      height,
      maxColors: state.maxColors,
      fit: "contain",
      extractPalette: extract,
      palette: extract ? undefined : state.palette,
    });
    if (size == null) pushHistory();
    state.grid = result.grid;
    if (extract || result.extracted) {
      state.palette = result.palette;
      state.paletteSource = "image";
      state.color =
        result.palette[Math.min(result.palette.length - 1, Math.floor(result.palette.length / 2))] ??
        DEFAULT_COLOR;
    }
    renderSwatches();
    draw();
    persist();
    renderPresets();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Reprocess failed", "err");
  } finally {
    state.isReprocessing = false;
    el.linkedBusy.hidden = true;
    el.importLabel.textContent = "Import image → analyze palette";
  }
}

function resizeGrid(size) {
  if (state.sourceDataUrl && state.refitOnResize) {
    pushHistory();
    state.grid = emptyGrid(size, size);
    draw();
    renderPresets();
    void reprocessSource({ size });
    setStatus(`${size}×${size} · re-fitting image…`);
    return;
  }
  resizeCentered(size);
}

function renderPresets() {
  el.presets.innerHTML = "";
  for (const s of GRID_PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = String(s);
    if (state.grid.width === s && state.grid.height === s) b.classList.add("active");
    b.addEventListener("click", () => resizeGrid(s));
    el.presets.appendChild(b);
  }
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(okMsg, "ok");
  } catch {
    setStatus("Clipboard blocked — use Download instead", "err");
  }
}

function licenseValue() {
  const v = el.license.value;
  if (v === "__custom__") return (el.customLicense.value || "").trim();
  return v;
}

function updateCopyrightPreview() {
  const name = (el.copyright.value || "").trim();
  if (!name) {
    el.copyrightPreview.textContent =
      "No copyright will be written into the SVG until you add a name.";
    return;
  }
  const year =
    (el.copyrightYear.value || "").trim() || String(new Date().getFullYear());
  const lic = licenseValue();
  const url = (el.copyrightUrl.value || "").trim();
  let line = `Copyright (c) ${year} ${name}`;
  if (lic) line += `. ${lic}`;
  if (url) line += ` ${url}`;
  el.copyrightPreview.textContent = line;
}

function exportOptions() {
  const title = (el.title.value || state.title || "pixel-art").trim() || "pixel-art";
  state.title = title;
  const copyright = (el.copyright.value || "").trim() || null;
  return {
    title,
    unit: 1,
    mergeRuns: true,
    copyright,
    copyrightYear: copyright
      ? (el.copyrightYear.value || "").trim() || String(new Date().getFullYear())
      : null,
    license: copyright ? licenseValue() || null : null,
    copyrightUrl: copyright ? (el.copyrightUrl.value || "").trim() || null : null,
  };
}

function safeName(title) {
  return title.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 64) || "pixel";
}

function exportSvg() {
  const opts = exportOptions();
  downloadText(`${safeName(opts.title)}.svg`, gridToSvg(state.grid, opts), "image/svg+xml");
  setStatus(
    opts.copyright ? "SVG downloaded with your copyright" : "SVG downloaded (no copyright)",
    "ok",
  );
  persist();
}

function exportJson() {
  const opts = exportOptions();
  downloadText(
    `${safeName(opts.title)}.json`,
    gridToJson(state.grid, true),
    "application/json",
  );
  setStatus("JSON grid downloaded", "ok");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function updateLinkedUi() {
  if (!state.sourceDataUrl) {
    el.linkedCard.hidden = true;
    return;
  }
  el.linkedCard.hidden = false;
  el.linkedThumb.src = state.sourceDataUrl;
  el.linkedName.textContent = state.sourceName || "Source image";
  el.linkedName.title = state.sourceName || "";
  syncToggle(el.toggleRefit, state.refitOnResize);
  syncToggle(el.toggleAutoPal, state.autoUpdatePalette);
}

function syncToggle(btn, on) {
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  const sw = btn.querySelector(".toggle-switch");
  if (sw) sw.classList.toggle("on", on);
}

async function importImage(file) {
  if (!file) return;
  el.importLabel.textContent = "Analyzing…";
  setStatus("Pixelating…");
  try {
    const dataUrl = await fileToDataUrl(file);
    state.sourceDataUrl = dataUrl;
    state.sourceName = file.name.slice(0, 80);
    updateLinkedUi();
    const { grid, palette, extracted } = await quantizeImageSource(dataUrl, {
      width: state.grid.width,
      height: state.grid.height,
      maxColors: state.maxColors,
      fit: "contain",
      extractPalette: true,
    });
    pushHistory();
    state.grid = grid;
    state.palette = palette;
    state.paletteSource = extracted ? "image" : "retro";
    state.color =
      palette[Math.min(palette.length - 1, Math.floor(palette.length / 2))] ?? DEFAULT_COLOR;
    renderSwatches();
    draw();
    persist();
    setStatus(
      `Linked image → ${palette.length}-color palette, ${grid.width}×${grid.height}`,
      "ok",
    );
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Import failed", "err");
  } finally {
    el.importLabel.textContent = "Import image → analyze palette";
  }
}

function clearSourceImage() {
  state.sourceDataUrl = null;
  state.sourceName = null;
  updateLinkedUi();
  setStatus("Source image unlinked");
}

// —— Pointer / pan / zoom ——
let drawing = false;
let strokeStarted = false;
let spaceHeld = false;
let panning = false;
let panLast = null;

function shouldPan(e) {
  return (
    spaceHeld ||
    state.tool === "hand" ||
    e.altKey ||
    e.button === 1 ||
    (e.buttons & 4) !== 0
  );
}

function onPointerDown(e) {
  if (e.button === 1) e.preventDefault();
  if (e.button != null && e.button !== 0 && e.button !== 1) return;
  if (shouldPan(e)) {
    panning = true;
    panLast = { x: e.clientX, y: e.clientY };
    el.canvas.style.cursor = "grabbing";
    el.scroll.setPointerCapture?.(e.pointerId);
    return;
  }
  el.canvas.setPointerCapture?.(e.pointerId);
  drawing = true;
  strokeStarted = false;
  const { gx, gy } = eventToCell(e);
  applyTool(gx, gy, true);
}

function onPointerMove(e) {
  if (panning && panLast) {
    const dx = e.clientX - panLast.x;
    const dy = e.clientY - panLast.y;
    el.scroll.scrollLeft -= dx;
    el.scroll.scrollTop -= dy;
    panLast = { x: e.clientX, y: e.clientY };
    return;
  }
  if (!drawing) return;
  const { gx, gy } = eventToCell(e);
  applyTool(gx, gy, false);
}

function onPointerUp() {
  if (drawing && strokeStarted) persist();
  drawing = false;
  strokeStarted = false;
  panning = false;
  panLast = null;
  el.canvas.style.cursor = cursorForTool();
}

function applyTool(gx, gy, isDown) {
  const { width: w, height: h } = state.grid;
  if (gx < 0 || gy < 0 || gx >= w || gy >= h) return;

  if (state.tool === "eyedropper") {
    if (!isDown) return;
    const c = state.grid.pixels[gy * w + gx] ?? null;
    if (c) {
      state.color = c;
      updateActiveColorUi();
      renderSwatches();
      setStatus(`Picked ${c}`);
    } else {
      setStatus("Picked transparent");
    }
    return;
  }

  if (state.tool === "hand") return;

  if (state.tool === "fill") {
    if (!isDown) return;
    pushHistory();
    state.grid.pixels = floodFill(state.grid, gx, gy, state.color);
    strokeStarted = true;
    draw();
    return;
  }

  if (!strokeStarted) {
    pushHistory();
    strokeStarted = true;
  }

  const color = state.tool === "eraser" ? null : state.color;
  paintCell(gx, gy, color);
  draw();
}

function clearGrid() {
  if (!confirm("Clear the entire canvas?")) return;
  pushHistory();
  state.grid = emptyGrid(state.grid.width, state.grid.height);
  draw();
  persist();
  setStatus("Cleared");
}

function resetRetroPalette() {
  state.palette = [...RETRO_PALETTE];
  state.paletteSource = "retro";
  state.color = DEFAULT_COLOR;
  renderSwatches();
  setStatus("Restored 16-color retro palette");
  persist();
}

function loadSample() {
  pushHistory();
  clearSourceImage();
  state.grid = createSampleHero();
  resetRetroPalette();
  renderPresets();
  draw();
  setStatus("Sample hero loaded", "ok");
}

function setMaxColors(n, { reprocess = true } = {}) {
  const v = Math.min(256, Math.max(2, Math.round(n)));
  state.maxColors = v;
  el.maxColors.value = String(v);
  el.maxColorsLabel.textContent = String(v);
  if (reprocess && state.sourceDataUrl && state.autoUpdatePalette) {
    if (maxColorsDebounce) clearTimeout(maxColorsDebounce);
    maxColorsDebounce = setTimeout(() => {
      void reprocessSource({ forceExtract: true });
    }, 280);
  }
}

function initUi() {
  el.title.value = state.title;
  el.maxColors.value = String(state.maxColors);
  el.maxColorsLabel.textContent = String(state.maxColors);
  if (state.color && state.color.startsWith("#")) {
    el.colorPicker.value = state.color;
  }

  el.maxColors.addEventListener("input", () => {
    setMaxColors(Number(el.maxColors.value));
  });

  document.querySelectorAll("[data-colors]").forEach((b) => {
    b.addEventListener("click", () => setMaxColors(Number(b.dataset.colors)));
  });

  el.colorPicker.addEventListener("input", () => {
    state.color = el.colorPicker.value;
    if (!state.palette.some((c) => c.toLowerCase() === state.color.toLowerCase())) {
      state.palette = [...state.palette, state.color];
      state.paletteSource = "image";
    }
    renderSwatches();
  });

  el.file.addEventListener("change", () => {
    const f = el.file.files?.[0];
    if (f) importImage(f);
    el.file.value = "";
  });

  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });
  document.querySelectorAll("[data-brush]").forEach((btn) => {
    btn.addEventListener("click", () => setBrush(Number(btn.dataset.brush)));
  });

  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-redo").addEventListener("click", redo);
  document.getElementById("btn-grid").addEventListener("click", () => {
    state.showGrid = !state.showGrid;
    draw();
    syncEditButtons();
  });
  document.getElementById("btn-clear").addEventListener("click", clearGrid);
  document.getElementById("btn-retro").addEventListener("click", resetRetroPalette);
  document.getElementById("btn-svg").addEventListener("click", exportSvg);
  document.getElementById("btn-json").addEventListener("click", exportJson);
  document.getElementById("btn-copy-svg").addEventListener("click", () => {
    copyText(gridToSvg(state.grid, exportOptions()), "SVG copied to clipboard");
  });
  document.getElementById("btn-copy-json").addEventListener("click", () => {
    copyText(gridToJson(state.grid, true), "Grid JSON copied");
  });
  document.getElementById("btn-sample").addEventListener("click", loadSample);
  document.getElementById("btn-unlink").addEventListener("click", clearSourceImage);

  el.toggleRefit.addEventListener("click", () => {
    state.refitOnResize = !state.refitOnResize;
    syncToggle(el.toggleRefit, state.refitOnResize);
    persist();
  });
  el.toggleAutoPal.addEventListener("click", () => {
    state.autoUpdatePalette = !state.autoUpdatePalette;
    syncToggle(el.toggleAutoPal, state.autoUpdatePalette);
    persist();
  });

  el.license.addEventListener("change", () => {
    el.customLicenseWrap.hidden = el.license.value !== "__custom__";
    updateCopyrightPreview();
  });
  for (const id of ["copyright", "copyright-year", "copyright-url", "custom-license"]) {
    document.getElementById(id).addEventListener("input", updateCopyrightPreview);
  }

  document.getElementById("btn-zoom-in").addEventListener("click", zoomIn);
  document.getElementById("btn-zoom-out").addEventListener("click", zoomOut);
  document.getElementById("btn-zoom-reset").addEventListener("click", zoomReset);

  el.scroll.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    },
    { passive: false },
  );

  el.scroll.addEventListener("dragover", (e) => e.preventDefault());
  el.scroll.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith("image/")) importImage(f);
  });

  el.canvas.addEventListener("pointerdown", onPointerDown);
  el.canvas.addEventListener("pointermove", onPointerMove);
  el.canvas.addEventListener("pointerup", onPointerUp);
  el.canvas.addEventListener("pointercancel", onPointerUp);
  el.scroll.addEventListener("pointermove", onPointerMove);
  el.scroll.addEventListener("pointerup", onPointerUp);
  el.canvas.addEventListener("auxclick", (e) => {
    if (e.button === 1) e.preventDefault();
  });
  el.canvas.addEventListener("contextmenu", (e) => {
    if (e.altKey) e.preventDefault();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat) {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) {
        return;
      }
      e.preventDefault();
      spaceHeld = true;
      el.canvas.style.cursor = "grab";
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceHeld = false;
      el.canvas.style.cursor = cursorForTool();
    }
  });

  window.addEventListener("keydown", (e) => {
    const t = e.target;
    if (
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable)
    ) {
      return;
    }
    const key = e.key.toLowerCase();
    const mod = e.metaKey || e.ctrlKey;

    if (mod && key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }
    if (key === "h" || key === "v") setTool("hand");
    if (key === "b") setTool("pencil");
    if (key === "e") setTool("eraser");
    if (key === "g" && !mod) setTool("fill");
    if (key === "i") setTool("eyedropper");
    if (key === "'" || key === ";") {
      state.showGrid = !state.showGrid;
      draw();
      syncEditButtons();
    }
    if (key === "1") setBrush(1);
    if (key === "2") setBrush(2);
    if (key === "3") setBrush(3);
  });

  setTool(state.tool);
  setBrush(state.brush);
  renderPresets();
  syncEditButtons();
  updateLinkedUi();
  updateCopyrightPreview();
}

// boot
hydrate();
initUi();
renderSwatches();
draw();
setStatus(`${state.grid.width}×${state.grid.height} · ready`);
