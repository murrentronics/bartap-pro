/**
 * processProductImage.ts
 *
 * Full image pipeline — mirrors the Bartendaz Pro Bottle-Only Toolkit v3
 * but runs entirely in the browser (no server, no Python, no API key).
 *
 * Pipeline:
 *  1. Remove background (AI — @imgly/background-removal, WASM/WebGL)
 *  2. Crop to tight bounding box (trim transparent pixels)
 *  3. Scale subject to fit inside a square canvas with proportional padding
 *  4. Center the subject on the canvas
 *  5. Apply subtle unsharp-mask sharpening (replicates the Python "edge feather / quality enhance")
 *  6. Output a transparent PNG at MAX_PX × MAX_PX
 *
 * Canvas size: 500 × 500 px   (was 2000 × 1700 in the Python tool)
 * Padding:     10% of canvas  (proportional to Python's ~6% side / 5% bottom margins)
 *
 * Why 500px?
 *  Consistent with compressImageFile() — images serve fast on web and
 *  mobile without upscaling artefacts on any screen density ≤ 2× DPR.
 *
 * Usage:
 *   import { processProductImage } from "@/lib/processProductImage";
 *   const processed = await processProductImage(file);   // File → File (PNG)
 *
 *   // Skip background removal (image already has transparent BG):
 *   const processed = await processProductImage(file, { removeBg: false });
 */

import { removeBackground as imglyRemoveBg, type Config } from "@imgly/background-removal";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Output canvas is always square at this size (matches compressImageFile MAX_PX). */
const CANVAS_PX = 500;

/**
 * Fractional padding around the subject (same on all four sides).
 * 0.10 → 10 % of CANVAS_PX = 50 px each side at 500 px.
 * Python equivalent: side_margin=60/2000 ≈ 3 %, bottom_margin=100/1700 ≈ 6 %.
 * We use a uniform 10 % which looks clean for bottles/cans/packs.
 */
const PADDING_FRAC = 0.10;

/** Available area for the subject after padding is removed. */
const INNER_PX = CANVAS_PX * (1 - PADDING_FRAC * 2); // 400 px at 500 px canvas

// ─── Background removal config ────────────────────────────────────────────────

const BG_REMOVAL_CONFIG: Config = {
  model: "isnet",
  output: {
    format: "image/png",
    quality: 1,
  },
  debug: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Load an image from a File into an HTMLImageElement. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

/**
 * Find the tight bounding box of non-transparent pixels in an RGBA canvas.
 * Returns { x, y, w, h } or null if the image is fully transparent.
 */
function getTightBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 10) { // threshold — ignore near-transparent edge pixels
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  if (!found) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Unsharp-mask sharpening via a blur-subtract approach.
 *
 * Mimics the Python tool's "edge feather / AI extraction quality enhance":
 *   sharpened = original + amount * (original - blurred)
 *
 * amount = 0.4  →  subtle enhancement that pops the product without artefacts.
 * Only applied to fully-opaque pixels to avoid darkening transparent edges.
 */
function sharpenCanvas(src: HTMLCanvasElement, amount = 0.4): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;

  // Step 1 — draw original into an offscreen canvas and read pixels
  const orig = document.createElement("canvas");
  orig.width = w; orig.height = h;
  const origCtx = orig.getContext("2d")!;
  origCtx.drawImage(src, 0, 0);
  const origData = origCtx.getImageData(0, 0, w, h);

  // Step 2 — create a blurred version (simple box blur approximated by a stack blur
  // using a 3×3 convolution kernel — lightweight, no external library needed)
  const blurred = document.createElement("canvas");
  blurred.width = w; blurred.height = h;
  const blurCtx = blurred.getContext("2d")!;
  blurCtx.filter = "blur(1px)";
  blurCtx.drawImage(src, 0, 0);
  blurCtx.filter = "none";
  const blurData = blurCtx.getImageData(0, 0, w, h);

  // Step 3 — combine: sharpened[i] = clamp(orig[i] + amount * (orig[i] - blur[i]))
  const out = origCtx.createImageData(w, h);
  for (let i = 0; i < origData.data.length; i += 4) {
    const alpha = origData.data[i + 3];
    // Only sharpen pixels that have some opacity — leave transparent edges alone
    if (alpha < 10) {
      out.data[i]     = origData.data[i];
      out.data[i + 1] = origData.data[i + 1];
      out.data[i + 2] = origData.data[i + 2];
      out.data[i + 3] = alpha;
      continue;
    }
    for (let c = 0; c < 3; c++) {
      const o = origData.data[i + c];
      const b = blurData.data[i + c];
      out.data[i + c] = Math.min(255, Math.max(0, Math.round(o + amount * (o - b))));
    }
    out.data[i + 3] = alpha; // preserve original alpha exactly
  }
  origCtx.putImageData(out, 0, 0);
  return orig;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface ProcessOptions {
  /** Run AI background removal. Default: true. */
  removeBg?: boolean;
  /**
   * Output canvas size in px (square). Default: 500.
   * Keep at 500 to stay consistent with the rest of the app's image pipeline.
   */
  canvasPx?: number;
  /**
   * Fractional padding around the subject (0–0.5). Default: 0.10 (10 %).
   * 0.10 → 50 px padding on a 500 px canvas.
   */
  paddingFrac?: number;
  /** Sharpening amount (0 = off, 1 = very strong). Default: 0.4. */
  sharpenAmount?: number;
}

/**
 * Process a product image through the full Bartendaz pipeline:
 * remove BG → tight crop → scale + center → sharpen → output 500 × 500 PNG.
 *
 * Falls back to `compressImageFile` behaviour (resize only) if any step fails.
 */
export async function processProductImage(
  file: File,
  options: ProcessOptions = {},
): Promise<File> {
  const {
    removeBg    = true,
    canvasPx    = CANVAS_PX,
    paddingFrac = PADDING_FRAC,
    sharpenAmount = 0.4,
  } = options;

  const innerPx = canvasPx * (1 - paddingFrac * 2);
  const baseName = file.name.replace(/\.[^.]+$/, "");

  try {
    // ── Step 1: Background removal ──────────────────────────────────────────
    let workingFile: File = file;
    if (removeBg) {
      const blob = await imglyRemoveBg(file, BG_REMOVAL_CONFIG);
      workingFile = new File([blob], `${baseName}.png`, { type: "image/png" });
    }

    // ── Step 2: Load into canvas ─────────────────────────────────────────────
    const img = await loadImage(workingFile);

    // Draw to a working canvas at natural size
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width  = img.naturalWidth;
    srcCanvas.height = img.naturalHeight;
    const srcCtx = srcCanvas.getContext("2d")!;
    srcCtx.clearRect(0, 0, srcCanvas.width, srcCanvas.height);
    srcCtx.drawImage(img, 0, 0);

    // ── Step 3: Tight bounding box ───────────────────────────────────────────
    const bounds = getTightBounds(srcCtx, srcCanvas.width, srcCanvas.height);

    // If no non-transparent pixels found (fully blank), just compress
    if (!bounds) {
      return fallbackCompress(file, canvasPx, baseName);
    }

    // ── Step 4: Scale subject to fit inside inner area (preserving aspect) ──
    const scale = Math.min(innerPx / bounds.w, innerPx / bounds.h);
    const scaledW = Math.round(bounds.w * scale);
    const scaledH = Math.round(bounds.h * scale);

    // ── Step 5: Create output canvas and center subject ──────────────────────
    const outCanvas = document.createElement("canvas");
    outCanvas.width  = canvasPx;
    outCanvas.height = canvasPx;
    const outCtx = outCanvas.getContext("2d")!;
    outCtx.clearRect(0, 0, canvasPx, canvasPx);

    // Destination X/Y: centered in the canvas
    const destX = Math.round((canvasPx - scaledW) / 2);
    const destY = Math.round((canvasPx - scaledH) / 2);

    outCtx.drawImage(
      srcCanvas,
      bounds.x, bounds.y, bounds.w, bounds.h, // source: tight crop
      destX, destY, scaledW, scaledH,          // dest: scaled + centered
    );

    // ── Step 6: Sharpening ───────────────────────────────────────────────────
    const sharpened = sharpenAmount > 0 ? sharpenCanvas(outCanvas, sharpenAmount) : outCanvas;

    // ── Step 7: Output PNG File ──────────────────────────────────────────────
    return await new Promise<File>((resolve, reject) => {
      sharpened.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("toBlob failed")); return; }
          resolve(new File([blob], `${baseName}.png`, { type: "image/png" }));
        },
        "image/png",
      );
    });

  } catch (err) {
    console.warn("[processProductImage] pipeline error, falling back to compress-only:", err);
    return fallbackCompress(file, canvasPx, baseName);
  }
}

/**
 * Fallback: simple resize to canvasPx (no BG removal, no centering).
 * Mirrors the existing compressImageFile() behaviour so nothing regresses.
 */
function fallbackCompress(file: File, canvasPx: number, baseName: string): Promise<File> {
  const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w <= canvasPx && h <= canvasPx) { resolve(file); return; }
      const scale = canvasPx / Math.max(w, h);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d")!;
      if (isPng) ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const mimeType = isPng ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const ext = isPng ? "png" : "jpg";
          resolve(new File([blob], `${baseName}.${ext}`, { type: mimeType }));
        },
        mimeType,
        isPng ? undefined : 0.82,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
